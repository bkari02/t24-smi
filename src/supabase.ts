import { createClient } from '@supabase/supabase-js';
import { Location } from './types';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const eventId = import.meta.env.VITE_T24_EVENT_ID ?? 'demo-event';

export const supabase = url && anonKey
  ? createClient(url, anonKey, {
      global: {
        headers: import.meta.env.VITE_T24_EVENT_TOKEN
          ? { 'x-t24-event-token': import.meta.env.VITE_T24_EVENT_TOKEN }
          : undefined,
      },
    })
  : null;

type LocationRow = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  recorded_at: string;
};

export function fromLocationRow(row: LocationRow): Location {
  return {
    latitude: row.latitude,
    longitude: row.longitude,
    accuracy: row.accuracy ?? undefined,
    recordedAt: row.recorded_at,
  };
}

export async function saveLocation(location: Location, participantId: string) {
  if (!supabase) return;
  const { error } = await supabase.from('locations').insert({
    event_id: eventId,
    participant_id: participantId,
    latitude: location.latitude,
    longitude: location.longitude,
    accuracy: location.accuracy ?? null,
    recorded_at: location.recordedAt,
    source: 'browser',
  });
  if (error) throw error;
}

export async function loadLatestLocation(): Promise<Location | undefined> {
  if (!supabase) return undefined;
  const { data, error } = await supabase
    .from('locations')
    .select('latitude, longitude, accuracy, recorded_at')
    .eq('event_id', eventId)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? fromLocationRow(data) : undefined;
}
