import { useEffect, useMemo, useState } from 'react';
import { Location, Phase } from './types';

type Sample = { km: number; ele: number; lat: number; lon: number };

type Labels = {
  title: string;
  ascent: string;
  lowest: string;
  highest: string;
  distance: string;
  you: string;
};

type Props = {
  currentPhase: Phase;
  location?: Location;
  labels: Labels;
};

const files: Partial<Record<Phase, string>> = { Bike: 'bike.gpx', 'Run 2': 'run.gpx' };
const phaseOptions: Phase[] = ['Bike', 'Run 2'];
const width = 600;
const height = 180;

function kmBetween(a: Sample, b: Sample) {
  const lat = ((a.lat + b.lat) / 2) * Math.PI / 180;
  const dLat = (b.lat - a.lat) * 111.32;
  const dLon = (b.lon - a.lon) * 111.32 * Math.cos(lat);
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

function parseProfile(gpx: string): Sample[] {
  const xml = new DOMParser().parseFromString(gpx.trimStart(), 'application/xml');
  const namespaced = [...xml.getElementsByTagNameNS('*', 'trkpt')];
  const nodes = namespaced.length > 0 ? namespaced : [...xml.querySelectorAll('trkpt')];
  const raw = nodes
    .map((node) => ({
      lat: Number(node.getAttribute('lat')),
      lon: Number(node.getAttribute('lon')),
      ele: Number(node.getElementsByTagNameNS('*', 'ele')[0]?.textContent ?? node.querySelector('ele')?.textContent),
    }))
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon) && Number.isFinite(point.ele));
  const samples: Sample[] = [];
  raw.forEach((point, index) => {
    // Moving average over 5 points to suppress GPS/elevation noise
    const window = raw.slice(Math.max(0, index - 2), index + 3);
    const ele = window.reduce((sum, item) => sum + item.ele, 0) / window.length;
    const sample = { km: 0, ele, lat: point.lat, lon: point.lon };
    if (samples.length) sample.km = samples[samples.length - 1].km + kmBetween(samples[samples.length - 1], sample);
    samples.push(sample);
  });
  return samples;
}

export default function ElevationProfile({ currentPhase, location, labels }: Props) {
  const [selected, setSelected] = useState<Phase>('Bike');
  const [samples, setSamples] = useState<Sample[]>([]);
  const [error, setError] = useState('');
  const [hover, setHover] = useState<number>();

  useEffect(() => {
    let cancelled = false;
    setError('');
    setHover(undefined);
    void fetch(`/courses/${files[selected]}`)
      .then((response) => {
        if (!response.ok) throw new Error(`Could not load ${files[selected]} (${response.status})`);
        return response.text();
      })
      .then((gpx) => {
        if (cancelled) return;
        const profile = parseProfile(gpx);
        if (profile.length < 2) throw new Error('No elevation data in route');
        setSamples(profile);
      })
      .catch((err: Error) => {
        if (!cancelled) { setSamples([]); setError(err.message); }
      });
    return () => { cancelled = true; };
  }, [selected]);

  const stats = useMemo(() => {
    if (samples.length < 2) return undefined;
    const eles = samples.map((sample) => sample.ele);
    const min = Math.min(...eles);
    const max = Math.max(...eles);
    const totalKm = samples[samples.length - 1].km;
    let ascent = 0;
    for (let index = 1; index < samples.length; index += 1) ascent += Math.max(0, samples[index].ele - samples[index - 1].ele);
    const range = Math.max(1, max - min);
    const x = (km: number) => (totalKm ? (km / totalKm) * width : 0);
    const y = (ele: number) => height - ((ele - min) / range) * (height - 16) - 8;
    const line = samples.map((sample, index) => `${index ? 'L' : 'M'}${x(sample.km).toFixed(1)} ${y(sample.ele).toFixed(1)}`).join(' ');
    return { min, max, totalKm, ascent, line, area: `${line} L${width} ${height} L0 ${height} Z`, x, y };
  }, [samples]);

  const position = useMemo(() => {
    if (!location || selected !== currentPhase || samples.length < 2) return undefined;
    let nearest = 0;
    let best = Infinity;
    samples.forEach((sample, index) => {
      const distance = kmBetween({ ...sample, lat: location.latitude, lon: location.longitude }, sample);
      if (distance < best) { best = distance; nearest = index; }
    });
    return best < 0.3 ? nearest : undefined;
  }, [location, selected, currentPhase, samples]);

  function onMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!stats) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const km = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)) * stats.totalKm;
    let nearest = 0;
    samples.forEach((sample, index) => { if (Math.abs(sample.km - km) < Math.abs(samples[nearest].km - km)) nearest = index; });
    setHover(nearest);
  }

  const marker = hover ?? position;
  const markerSample = marker === undefined ? undefined : samples[marker];

  return (
    <section className="panel elevation-panel">
      <div className="section-heading">
        <div><p className="eyebrow">{labels.title}</p><h2>{selected}</h2></div>
        <div className="elevation-tabs">
          {phaseOptions.map((option) => (
            <button key={option} className={`refresh-button${option === selected ? ' selected' : ''}`} onClick={() => setSelected(option)}>{option}</button>
          ))}
        </div>
      </div>
      {error && <p className="sync-message">{error}</p>}
      {stats && (
        <>
          <div className="elevation-chart" onPointerMove={onMove} onPointerLeave={() => setHover(undefined)}>
            <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={labels.title}>
              <path className="elevation-area" d={stats.area} />
              <path className="elevation-line" d={stats.line} vectorEffect="non-scaling-stroke" />
            </svg>
            <span className="elevation-axis top">{Math.round(stats.max)} m</span>
            <span className="elevation-axis bottom">{Math.round(stats.min)} m</span>
            {markerSample && (
              <>
                <i className="elevation-cursor" style={{ left: `${(stats.x(markerSample.km) / width) * 100}%` }} />
                <b className="elevation-dot" style={{ left: `${(stats.x(markerSample.km) / width) * 100}%`, top: `${(stats.y(markerSample.ele) / height) * 100}%` }} />
              </>
            )}
          </div>
          <div className="elevation-stats">
            <span>{markerSample ? `${markerSample.km.toFixed(1)} km · ${Math.round(markerSample.ele)} m${hover === undefined ? ` · ${labels.you}` : ''}` : `${labels.distance}: ${stats.totalKm.toFixed(1)} km`}</span>
            <span>{labels.ascent}: +{Math.round(stats.ascent)} m</span>
            <span>{labels.lowest}: {Math.round(stats.min)} m</span>
            <span>{labels.highest}: {Math.round(stats.max)} m</span>
          </div>
        </>
      )}
    </section>
  );
}
