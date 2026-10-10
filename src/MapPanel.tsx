import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Location, Phase, TeamMember } from './types';

const swimRoute: L.LatLngExpression[] = [
  [43.12142, 6.36186], [43.120915, 6.3623], [43.12041, 6.36274],
  [43.11963, 6.362675], [43.11885, 6.36261], [43.11807, 6.362545],
  [43.11729, 6.36248], [43.11761, 6.361805], [43.11793, 6.36113],
  [43.11875, 6.361347], [43.11957, 6.361563], [43.12039, 6.36178],
  [43.12089, 6.361785], [43.12139, 6.36179],
];
const basecamp: L.LatLngExpression = [43.121795, 6.359774];

type Props = {
  locations: Record<string, Location>;
  members: TeamMember[];
  activeParticipantId: string;
  phase: Phase;
  focusedParticipantId?: string;
};

export default function MapPanel({ locations, members, activeParticipantId, phase, focusedParticipantId }: Props) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map>();
  const [mapReady, setMapReady] = useState(false);
  const markers = useRef<Record<string, L.Marker | L.CircleMarker>>({});
  const imageMarkerData = useRef<Record<string, { marker: L.Marker; imageUrl: string; active: boolean }>>({});
  const routeLayers = useRef<Partial<Record<Phase, L.Polyline>>>({});
  const startMarkers = useRef<Partial<Record<Phase, L.CircleMarker>>>({});
  const cancelledSwimLayer = useRef<L.Polyline>();
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const cancelledSwimStartMarker = useRef<L.CircleMarker>();

  useEffect(() => {
    if (!element.current || map.current) return;
    const instance = L.map(element.current).setView([43.1195, 6.362], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(instance);
    L.marker(basecamp, {
      icon: L.divIcon({
        className: 'basecamp-map-marker',
        html: '<svg aria-hidden="true" viewBox="0 0 24 24" role="img"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>',
        iconSize: [25, 25],
        iconAnchor: [12.5, 12.5],
      }),
      zIndexOffset: 800,
    }).bindTooltip('Team SMI Basecamp', { direction: 'top', offset: [0, -14] }).addTo(instance);
    cancelledSwimLayer.current = L.polyline(swimRoute, {
      color: '#8c8c8c', weight: 5, opacity: 0.45, dashArray: '8 8',
    }).addTo(instance);
    cancelledSwimStartMarker.current = L.circleMarker(swimRoute[0])
      .bindTooltip('Cancelled swim course')
      .addTo(instance);
    updateStartMarkerStyles(phase);
    map.current = instance;
    setMapReady(true);
    instance.on('zoomend', () => updateImageMarkerSizes(instance.getZoom()));
    let disposed = false;
    const courses: { phase: Phase; file: string; color: string }[] = [
      { phase: 'Bike', file: 'bike.gpx', color: '#f26b4f' },
      { phase: 'Run 2', file: 'run.gpx', color: '#91a7ff' },
    ];
    courses.forEach(({ phase: coursePhase, file, color }) => {
      void fetch(`/courses/${file}`)
        .then((response) => {
          if (!response.ok) throw new Error(`${file} request failed (${response.status})`);
          return response.text();
        })
        .then((gpx) => {
          if (disposed) return;
          const document = new DOMParser().parseFromString(gpx.trimStart(), 'application/xml');
          if (document.querySelector('parsererror')) {
            throw new Error(`${file} contains invalid GPX XML`);
          }
          const namespacedTrackPoints = [...document.getElementsByTagNameNS('*', 'trkpt')];
          const trackPoints = namespacedTrackPoints.length > 0
            ? namespacedTrackPoints
            : [...document.querySelectorAll('trkpt')];
          const points = trackPoints
            .map((point) => {
              const lat = Number(point.getAttribute('lat'));
              const lon = Number(point.getAttribute('lon'));
              return Number.isFinite(lat) && Number.isFinite(lon)
                ? [lat, lon] as L.LatLngExpression
                : undefined;
            })
            .filter((point): point is L.LatLngExpression => point !== undefined);
          if (points.length < 2) throw new Error(`${file} contains fewer than two valid track points`);
          const route = L.polyline(points, {
            color, weight: 4, opacity: 0.85,
          });
          const startMarker = L.circleMarker(points[0])
            .bindTooltip(`${coursePhase} start / handover`)
          routeLayers.current[coursePhase] = route;
          startMarkers.current[coursePhase] = startMarker;
          route.addTo(instance);
          startMarker.addTo(instance);
          updateStartMarkerStyles(phaseRef.current);
          updateRouteStyles(phaseRef.current);
        })
        .catch((error: unknown) => {
          console.error(`Could not load ${file}`, error);
        });
    });
    return () => {
      disposed = true;
      instance.remove();
      if (map.current === instance) map.current = undefined;
      routeLayers.current = {};
      startMarkers.current = {};
      cancelledSwimLayer.current = undefined;
      cancelledSwimStartMarker.current = undefined;
      markers.current = {};
      imageMarkerData.current = {};
    };
  }, []);

  function updateRouteStyles(currentPhase: Phase) {
    const colors: Record<Phase, string> = {
      'Run 1': '#ff1493',
      Bike: '#f26b4f',
      'Run 2': '#91a7ff',
    };
    Object.entries(routeLayers.current).forEach(([routePhase, layer]) => {
      if (!layer) return;
      const isCurrent = routePhase === currentPhase;
      layer.setStyle({
        color: isCurrent ? colors[routePhase as Phase] : '#87958f',
        opacity: isCurrent ? 0.95 : 0.35,
        weight: isCurrent ? 6 : 3,
        dashArray: undefined,
      });
      if (isCurrent) layer.bringToFront();
    });
    cancelledSwimLayer.current?.setStyle({ color: '#8c8c8c', opacity: 0.45, weight: 5, dashArray: '8 8' });
  }

  function updateStartMarkerStyles(currentPhase: Phase) {
    const colors: Record<Phase, string> = {
      'Run 1': '#ff1493',
      Bike: '#f26b4f',
      'Run 2': '#91a7ff',
    };
    Object.entries(startMarkers.current).forEach(([markerPhase, marker]) => {
      if (!marker) return;
      const isCurrent = markerPhase === currentPhase;
      marker.setStyle({
        radius: isCurrent ? 8 : 6,
        color: isCurrent ? '#10251f' : '#6d7b76',
        weight: isCurrent ? 2 : 1,
        fillColor: isCurrent ? colors[markerPhase as Phase] : '#a5b0ab',
        fillOpacity: isCurrent ? 1 : 0.55,
      });
    });
    cancelledSwimStartMarker.current?.setStyle({
      radius: 6, color: '#6d7b76', weight: 1, fillColor: '#a5b0ab', fillOpacity: 0.55,
    });
  }

  function updateImageMarkerSizes(zoom: number) {
    const scale = Math.min(1.35, Math.max(0.65, 2 ** ((zoom - 15) / 4)));
    Object.values(imageMarkerData.current).forEach(({ marker, imageUrl, active }) => {
      const size = Math.round((active ? 36 : 29) * scale);
      marker.setIcon(L.icon({
        iconUrl: imageUrl,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        className: `participant-map-marker${active ? ' active' : ''}`,
      }));
    });
  }

  useEffect(() => {
    updateRouteStyles(phase);
    updateStartMarkerStyles(phase);
  }, [phase]);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    Object.values(markers.current).forEach((marker) => marker.remove());
    markers.current = {};
    imageMarkerData.current = {};
    Object.entries(locations).forEach(([participantId, location]) => {
      const member = members.find((item) => item.id === participantId);
      if (!member) return;
      const isActive = participantId === activeParticipantId;
      const point: L.LatLngExpression = [location.latitude, location.longitude];
      const marker = member.imageUrl
        ? L.marker(point, {
          icon: L.icon({
            iconUrl: member.imageUrl,
            iconSize: [isActive ? 36 : 29, isActive ? 36 : 29],
            iconAnchor: [isActive ? 18 : 14.5, isActive ? 18 : 14.5],
            className: `participant-map-marker${isActive ? ' active' : ''}`,
          }),
          zIndexOffset: isActive ? 1000 : 0,
        })
        : L.circleMarker(point, {
          radius: isActive ? 12 : 7,
          color: isActive ? '#fff' : member.color,
          weight: isActive ? 4 : 2,
          fillColor: member.color,
          fillOpacity: isActive ? 1 : 0.8,
        });
      markers.current[participantId] = marker.bindTooltip(`${member.name}${isActive ? ' · active' : ''}`).addTo(instance);
      if (member.imageUrl && marker instanceof L.Marker) {
        imageMarkerData.current[participantId] = { marker, imageUrl: member.imageUrl, active: isActive };
      }
    });
    updateImageMarkerSizes(instance.getZoom());
    const activeLocation = locations[activeParticipantId];
    if (activeLocation) {
      instance.setView(
        [activeLocation.latitude, activeLocation.longitude],
        Math.max(instance.getZoom(), 15),
      );
    }
  }, [activeParticipantId, locations, members, mapReady]);

  useEffect(() => {
    const instance = map.current;
    const location = focusedParticipantId ? locations[focusedParticipantId] : undefined;
    if (!instance || !location) return;
    const marker = markers.current[focusedParticipantId!];
    instance.setView([location.latitude, location.longitude], Math.max(instance.getZoom(), 15));
    marker?.openTooltip();
  }, [focusedParticipantId, locations]);

  return <div className="map-shell"><div className="map" ref={element} /></div>;
}
