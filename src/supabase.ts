import { createClient } from '@supabase/supabase-js';
import { EventState, Location, Phase, Round, SharedEvent, TeamMember } from './types';

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
  participant_id: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  recorded_at: string;
};

export function fromLocationRow(row: LocationRow): Location {
  return {
    participantId: row.participant_id,
    latitude: row.latitude,
    longitude: row.longitude,
    accuracy: row.accuracy ?? undefined,
    recordedAt: row.recorded_at,
  };
}

export async function loadLatestLocations(): Promise<Location[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('locations')
    .select('participant_id, latitude, longitude, accuracy, recorded_at')
    .eq('event_id', eventId)
    .order('recorded_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  const latestByParticipant = new Map<string, Location>();
  (data ?? []).forEach((row) => {
    if (!latestByParticipant.has(row.participant_id)) {
      latestByParticipant.set(row.participant_id, fromLocationRow(row));
    }
  });
  return [...latestByParticipant.values()];
}

function requireSupabase() {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase;
}

type EventRow = {
  id: string;
  event_started_at: string;
  current_phase: Phase;
  active_participant_id: string;
  next_participant_id: string;
};

type MemberRow = { participant_id: string; name: string; color: string; sort_order: number };
type RoundRow = { id: string; phase: Phase; participant_id: string; round_number: number; started_at: string; finished_at: string | null };

function fromEventRow(row: EventRow): SharedEvent {
  return {
    id: row.id, eventStartedAt: row.event_started_at, phase: row.current_phase,
    activeParticipantId: row.active_participant_id, nextParticipantId: row.next_participant_id,
  };
}

function fromRoundRow(row: RoundRow): Round {
  return {
    id: row.id, phase: row.phase, participantId: row.participant_id,
    number: row.round_number, startedAt: row.started_at, finishedAt: row.finished_at ?? undefined,
  };
}

export async function loadSharedState(): Promise<Pick<EventState, 'eventStartedAt' | 'phase' | 'activeParticipantId' | 'nextParticipantId' | 'members' | 'rounds'>> {
  const client = requireSupabase();
  const [{ data: event, error: eventError }, { data: members, error: memberError }, { data: rounds, error: roundError }] = await Promise.all([
    client.from('events').select('id,event_started_at,current_phase,active_participant_id,next_participant_id').eq('id', eventId).single(),
    client.from('team_members').select('participant_id,name,color,sort_order').eq('event_id', eventId).order('sort_order'),
    client.from('rounds').select('id,phase,participant_id,round_number,started_at,finished_at').eq('event_id', eventId).order('round_number'),
  ]);
  if (eventError) throw eventError;
  if (memberError) throw memberError;
  if (roundError) throw roundError;
  const sharedEvent = fromEventRow(event as EventRow);
  return {
    ...sharedEvent,
    members: (members as MemberRow[]).map((member) => ({ id: member.participant_id, name: member.name, color: member.color })),
    rounds: (rounds as RoundRow[]).map(fromRoundRow),
  };
}

export async function mutateEvent(action: 'start_round' | 'finish_round' | 'handover' | 'change_phase' | 'reset_event' | 'set_next_participant', nextParticipantId?: string, phase?: Phase) {
  const client = requireSupabase();
  const { error } = await client.rpc(action, {
    p_event_id: eventId,
    ...(nextParticipantId ? { p_next_participant_id: nextParticipantId } : {}),
    ...(phase ? { p_phase: phase } : {}),
  });
  if (error) throw error;
}
