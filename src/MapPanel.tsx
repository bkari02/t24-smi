import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { Location, Phase, TeamMember } from './types';

const swimRoute: L.LatLngExpression[] = [
  [43.12142, 6.36186], [43.120915, 6.3623], [43.12041, 6.36274],
  [43.11963, 6.362675], [43.11885, 6.36261], [43.11807, 6.362545],
  [43.11729, 6.36248], [43.11761, 6.361805], [43.11793, 6.36113],
  [43.11875, 6.361347], [43.11957, 6.361563], [43.12039, 6.36178],
  [43.12089, 6.361785], [43.12139, 6.36179],
];

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
  const markers = useRef<Record<string, L.CircleMarker>>({});
  const routeLayers = useRef<Partial<Record<Phase, L.Polyline>>>({});
  const startMarkers = useRef<Partial<Record<Phase, L.CircleMarker>>>({});

  useEffect(() => {
    if (!element.current || map.current) return;
    const instance = L.map(element.current).setView([43.1195, 6.362], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(instance);
    routeLayers.current.Swim = L.polyline(swimRoute, {
      color: '#f6c85f', weight: 5, opacity: 0.9,
    }).addTo(instance);
    startMarkers.current.Swim = L.circleMarker(swimRoute[0])
      .bindTooltip('Swim start / handover')
      .addTo(instance);
    updateStartMarkerStyles(phase);
    map.current = instance;
    const courses: { phase: Phase; file: string; color: string }[] = [
      { phase: 'Bike', file: 'bike.gpx', color: '#f26b4f' },
      { phase: 'Run', file: 'run.gpx', color: '#91a7ff' },
    ];
    courses.forEach(({ phase: coursePhase, file, color }) => {
      void fetch(`/courses/${file}`)
        .then((response) => {
          if (!response.ok) throw new Error(`${file} request failed (${response.status})`);
          return response.text();
        })
        .then((gpx) => {
          const document = new DOMParser().parseFromString(gpx, 'application/xml');
          const points = [...document.querySelectorAll('trkpt')]
            .map((point) => {
              const lat = Number(point.getAttribute('lat'));
              const lon = Number(point.getAttribute('lon'));
              return Number.isFinite(lat) && Number.isFinite(lon)
                ? [lat, lon] as L.LatLngExpression
                : undefined;
            })
            .filter((point): point is L.LatLngExpression => point !== undefined);
          if (points.length < 2) throw new Error(`${file} contains fewer than two valid track points`);
          routeLayers.current[coursePhase] = L.polyline(points, {
            color, weight: 4, opacity: 0.85,
          }).addTo(instance);
          startMarkers.current[coursePhase] = L.circleMarker(points[0])
            .bindTooltip(`${coursePhase} start / handover`)
            .addTo(instance);
          updateStartMarkerStyles(phase);
          updateRouteStyles(phase);
        })
        .catch((error: unknown) => {
          console.error(`Could not load ${file}`, error);
        });
    });
    return () => {
      instance.remove();
    };
  }, []);

  function updateRouteStyles(currentPhase: Phase) {
    const colors: Record<Phase, string> = {
      Swim: '#f6c85f',
      Bike: '#f26b4f',
      Run: '#91a7ff',
    };
    Object.entries(routeLayers.current).forEach(([routePhase, layer]) => {
      if (!layer) return;
      const isCurrent = routePhase === currentPhase;
      layer.setStyle({
        color: isCurrent ? colors[routePhase as Phase] : '#87958f',
        opacity: isCurrent ? 0.9 : 0.35,
        weight: isCurrent ? 5 : 3,
      });
    });
  }

  function updateStartMarkerStyles(currentPhase: Phase) {
    const colors: Record<Phase, string> = {
      Swim: '#f6c85f',
      Bike: '#f26b4f',
      Run: '#91a7ff',
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
    Object.entries(locations).forEach(([participantId, location]) => {
      const member = members.find((item) => item.id === participantId);
      if (!member) return;
      const isActive = participantId === activeParticipantId;
      const point: L.LatLngExpression = [location.latitude, location.longitude];
      markers.current[participantId] = L.circleMarker(point, {
        radius: isActive ? 12 : 7,
        color: isActive ? '#fff' : member.color,
        weight: isActive ? 4 : 2,
        fillColor: member.color,
        fillOpacity: isActive ? 1 : 0.8,
      }).bindTooltip(`${member.name}${isActive ? ' · active' : ''}`).addTo(instance);
    });
    const activeLocation = locations[activeParticipantId];
    if (activeLocation) {
      instance.setView(
        [activeLocation.latitude, activeLocation.longitude],
        Math.max(instance.getZoom(), 15),
      );
    }
  }, [activeParticipantId, locations, members]);

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
