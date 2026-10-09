import { Location, Phase } from './types';

type Point = [number, number];
const files: Record<Phase, string> = { Swim: 'swim.gpx', Bike: 'bike.gpx', Run: 'run.gpx' };

function distance(a: Point, b: Point) {
  const lat = ((a[0] + b[0]) / 2) * Math.PI / 180;
  const dLat = (b[0] - a[0]) * 111.32;
  const dLon = (b[1] - a[1]) * 111.32 * Math.cos(lat);
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

export type RouteProgress = { totalKm: number; completedKm: number; remainingKm: number; percent: number };

export async function loadRouteProgress(phase: Phase, location?: Location): Promise<RouteProgress | undefined> {
  const response = await fetch(`/courses/${files[phase]}`);
  if (!response.ok) throw new Error(`Could not load ${files[phase]} (${response.status})`);
  const xml = new DOMParser().parseFromString(await response.text(), 'application/xml');
  const points = [...xml.querySelectorAll('trkpt')].map((point) => [
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
