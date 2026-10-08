import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { Location } from './types';

const swimRoute: L.LatLngExpression[] = [
  [43.12142, 6.36186], [43.120915, 6.3623], [43.12041, 6.36274],
  [43.11963, 6.362675], [43.11885, 6.36261], [43.11807, 6.362545],
  [43.11729, 6.36248], [43.11761, 6.361805], [43.11793, 6.36113],
  [43.11875, 6.361347], [43.11957, 6.361563], [43.12039, 6.36178],
  [43.12089, 6.361785], [43.12139, 6.36179],
];

type Props = { location?: Location };

export default function MapPanel({ location }: Props) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map>();
  const marker = useRef<L.CircleMarker>();

  useEffect(() => {
    if (!element.current || map.current) return;
    const instance = L.map(element.current).setView([43.1195, 6.362], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(instance);
    L.polyline(swimRoute, { color: '#f26b4f', weight: 5, opacity: 0.9 }).addTo(instance);
    L.circleMarker(swimRoute[0], { radius: 7, color: '#10251f', fillColor: '#f6c85f', fillOpacity: 1 })
      .bindTooltip('Swim start / handover')
      .addTo(instance);
    map.current = instance;
    return () => {
      instance.remove();
    };
  }, []);

  useEffect(() => {
    if (!map.current || !location) return;
    const point: L.LatLngExpression = [location.latitude, location.longitude];
    marker.current?.remove();
    marker.current = L.circleMarker(point, {
      radius: 9, color: '#fff', weight: 3, fillColor: '#4cc9a4', fillOpacity: 1,
    }).bindTooltip('Active participant').addTo(map.current);
    map.current.setView(point, Math.max(map.current.getZoom(), 15));
  }, [location]);

  return <div className="map-shell"><div className="map" ref={element} /></div>;
}
