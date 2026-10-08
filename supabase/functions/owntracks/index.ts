import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

type OwnTracksPayload = {
  _type?: string;
  lat?: number;
  lon?: number;
  acc?: number;
  tst?: number;
  tid?: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function participantForDevice(tid: string, token: string) {
  const raw = Deno.env.get('OWNTRACKS_DEVICES') ?? '{}';
  let devices: Record<string, { participantId: string; token: string }>;
  try {
    devices = JSON.parse(raw) as Record<string, { participantId: string; token: string }>;
  } catch {
    throw new Error('OWNTRACKS_DEVICES is not valid JSON');
  }
  const device = devices[tid];
  return device && device.token === token ? device.participantId : undefined;
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'POST required' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const eventId = Deno.env.get('T24_EVENT_ID');
  if (!supabaseUrl || !serviceRoleKey || !eventId) {
    return json({
      error: 'Function secrets are incomplete',
      missing: [
        !supabaseUrl ? 'SUPABASE_URL' : null,
        !serviceRoleKey ? 'SUPABASE_SERVICE_ROLE_KEY' : null,
        !eventId ? 'T24_EVENT_ID' : null,
      ].filter(Boolean),
    }, 500);
  }
  const supabase: SupabaseClient = createClient(supabaseUrl, serviceRoleKey);

  const authorization = request.headers.get('authorization') ?? '';
  if (!authorization.startsWith('Basic ')) return json({ error: 'Basic authentication required' }, 401);
  let decoded: string;
  try {
    decoded = atob(authorization.slice(6));
  } catch {
    return json({ error: 'Invalid Basic authentication encoding' }, 401);
  }
  const separator = decoded.indexOf(':');
  if (separator < 1) return json({ error: 'Invalid Basic authentication' }, 401);
  const tid = decoded.slice(0, separator);
  const token = decoded.slice(separator + 1);

  let payload: OwnTracksPayload;
  try {
    payload = await request.json() as OwnTracksPayload;
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  if (payload._type !== 'location' || typeof payload.lat !== 'number' || typeof payload.lon !== 'number') {
    return json({ error: 'Expected an OwnTracks location payload' }, 400);
  }
  if (payload.lat < -90 || payload.lat > 90 || payload.lon < -180 || payload.lon > 180) {
    return json({ error: 'Invalid coordinates' }, 400);
  }
  let participantId: string | undefined;
  try {
    participantId = participantForDevice(tid, token);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Invalid device configuration' }, 500);
  }
  if (!participantId) return json({ error: 'Unknown device' }, 401);

  const recordedAt = typeof payload.tst === 'number'
    ? new Date(payload.tst * 1000).toISOString()
    : new Date().toISOString();

  const { error } = await supabase.from('locations').insert({
    event_id: eventId,
    participant_id: participantId,
    latitude: payload.lat,
    longitude: payload.lon,
    accuracy: typeof payload.acc === 'number' ? payload.acc : null,
    recorded_at: recordedAt,
    source: 'owntracks',
  });
  if (error) return json({ error: 'Could not store location' }, 500);
  return json({ ok: true });
});
