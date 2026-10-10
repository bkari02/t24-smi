import { Location, Phase } from './types';

type Point = [number, number];
const files: Partial<Record<Phase, string>> = { 'Run 1': 'run2_5km.gpx', Bike: 'bike.gpx', 'Run 2': 'run.gpx' };

function distance(a: Point, b: Point) {
  const lat = ((a[0] + b[0]) / 2) * Math.PI / 180;
  const dLat = (b[0] - a[0]) * 111.32;
  const dLon = (b[1] - a[1]) * 111.32 * Math.cos(lat);
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

export type RouteProgress = { totalKm: number; completedKm: number; remainingKm: number; percent: number };

export async function loadRouteProgress(phase: Phase, location?: Location): Promise<RouteProgress | undefined> {
  const file = files[phase];
  if (!file) return undefined;
  const response = await fetch(`/courses/${file}`);
  if (!response.ok) throw new Error(`Could not load ${file} (${response.status})`);
  const xml = new DOMParser().parseFromString((await response.text()).trimStart(), 'application/xml');
  if (xml.querySelector('parsererror')) throw new Error(`${file} contains invalid GPX XML`);
  const namespacedTrackPoints = [...xml.getElementsByTagNameNS('*', 'trkpt')];
  const trackPoints = namespacedTrackPoints.length > 0
    ? namespacedTrackPoints
    : [...xml.querySelectorAll('trkpt')];
  const points = trackPoints.map((point) => [
    Number(point.getAttribute('lat')), Number(point.getAttribute('lon')),
  ] as Point).filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon));
  if (points.length < 2) return undefined;
  const cumulative = [0];
  for (let index = 1; index < points.length; index += 1) cumulative.push(cumulative[index - 1] + distance(points[index - 1], points[index]));
  const totalKm = cumulative[cumulative.length - 1];
  if (!location) return { totalKm, completedKm: 0, remainingKm: totalKm, percent: 0 };
  const athlete: Point = [location.latitude, location.longitude];
  let nearest = 0;
  let nearestDistance = Infinity;
  points.forEach((point, index) => {
    const candidate = distance(athlete, point);
    if (candidate < nearestDistance) { nearestDistance = candidate; nearest = index; }
  });
  const completedKm = cumulative[nearest];
  return { totalKm, completedKm, remainingKm: Math.max(0, totalKm - completedKm), percent: totalKm ? (completedKm / totalKm) * 100 : 0 };
}
