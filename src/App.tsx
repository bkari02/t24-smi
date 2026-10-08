import { useEffect, useState } from 'react';
import MapPanel from './MapPanel';
import { EventState, Location, Phase, Round } from './types';
import { eventId, loadLatestLocations, loadSharedState, mutateEvent, supabase } from './supabase';

const phases: { name: Phase; duration: number; distance: string }[] = [
  { name: 'Swim', duration: 4, distance: '1 km' },
  { name: 'Bike', duration: 12, distance: '21 km' },
  { name: 'Run', duration: 8, distance: '4 km' },
];
const colors = ['#f26b4f', '#4cc9a4', '#f6c85f', '#91a7ff', '#d28cff'];

const initialState: EventState = {
  eventStartedAt: new Date().toISOString(),
  phase: 'Swim',
  activeParticipantId: 'p1',
  nextParticipantId: 'p2',
  members: ['Kieeesch', 'Lilli', 'Jule', 'Matze', 'Benni'].map((name, index) => ({
    id: `p${index + 1}`, name, color: colors[index],
  })),
  rounds: [],
  locations: {},
};

function formatDuration(seconds: number) {
  const minutes = Math.max(0, Math.round(seconds / 60));
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

function formatDurationWithSeconds(seconds: number) {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainder = totalSeconds % 60;
  return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(remainder).padStart(2, '0')}s`;
}

function formatClock(iso?: string) {
  return iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--';
}

function App() {
  const [state, setState] = useState<EventState>(initialState);
  const [now, setNow] = useState(Date.now());
  const [syncMessage, setSyncMessage] = useState('');
  const [sharedLoading, setSharedLoading] = useState(Boolean(supabase));
  const [mutationPending, setMutationPending] = useState(false);
  const [focusedParticipantId, setFocusedParticipantId] = useState<string>();
  const [lastLocationSync, setLastLocationSync] = useState<Date>();
  const [locationSyncing, setLocationSyncing] = useState(false);
  const [paceEstimates, setPaceEstimates] = useState<Record<string, Partial<Record<Phase, number>>>>({});
  const [paceError, setPaceError] = useState('');

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  function applySharedState(shared: Awaited<ReturnType<typeof loadSharedState>>) {
    setState((current) => ({ ...current, ...shared }));
  }

  useEffect(() => {
    const client = supabase;
    if (!client) {
      setSyncMessage('Supabase is not configured; shared race controls are unavailable.');
      return;
    }
    let cancelled = false;
    const refreshSharedState = () => loadSharedState()
      .then((shared) => { if (!cancelled) { applySharedState(shared); setSharedLoading(false); setSyncMessage(''); } })
      .catch((error: Error) => { if (!cancelled) { setSharedLoading(false); setSyncMessage(`Shared state unavailable: ${error.message}`); } });
    refreshSharedState();
    const refreshTimer = window.setInterval(refreshSharedState, 30000);
    const channel = client.channel(`event-state-${eventId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events', filter: `id=eq.${eventId}` }, refreshSharedState)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rounds', filter: `event_id=eq.${eventId}` }, refreshSharedState)
      .subscribe();
    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
      void client.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    fetch('/data/pace-estimates.csv')
      .then((response) => {
        if (!response.ok) throw new Error(`Could not load pace estimates (${response.status})`);
        return response.text();
      })
      .then((csv) => {
        const rows = csv.trim().split(/\r?\n/).slice(1);
        const estimates: Record<string, Partial<Record<Phase, number>>> = {};
        rows.forEach((row, index) => {
          const [id, , swim, bike, run] = row.split(',').map((value) => value.trim());
          if (!id || [swim, bike, run].some((value) => !Number.isFinite(Number(value)) || Number(value) <= 0)) {
            throw new Error(`Invalid pace estimate on CSV row ${index + 2}`);
          }
          estimates[id] = { Swim: Number(swim) * 60, Bike: Number(bike) * 60, Run: Number(run) * 60 };
        });
        setPaceEstimates(estimates);
      })
      .catch((error: Error) => setPaceError(error.message));
  }, []);

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let cancelled = false;
    const refreshLocations = () => {
      if (cancelled) return;
      setLocationSyncing(true);
      loadLatestLocations()
      .then((locations) => {
        if (!cancelled) {
          setState((current) => ({ ...current, locations: Object.fromEntries(locations.map((location) => [location.participantId, location])) }));
          setLastLocationSync(new Date());
          setSyncMessage('');
        }
      })
      .catch((error: Error) => {
        if (!cancelled) setSyncMessage(`Location sync unavailable: ${error.message}`);
      })
      .finally(() => setLocationSyncing(false));
    };
    refreshLocations();
    const refreshTimer = window.setInterval(refreshLocations, 30000);
    const channel = client
      .channel(`locations-${eventId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'locations',
        filter: `event_id=eq.${eventId}`,
      }, (payload) => {
        const row = payload.new as { participant_id: string; latitude: number; longitude: number; accuracy: number | null; recorded_at: string };
        const location = {
          participantId: row.participant_id,
          latitude: row.latitude, longitude: row.longitude,
          accuracy: row.accuracy ?? undefined, recordedAt: row.recorded_at,
        };
        setState((current) => ({ ...current, locations: { ...current.locations, [location.participantId]: location } }));
        setLastLocationSync(new Date());
      })
      .subscribe();
    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
      void client.removeChannel(channel);
    };
  }, []);

  const active = state.members.find((member) => member.id === state.activeParticipantId) ?? state.members[0];
  const next = state.members.find((member) => member.id === state.nextParticipantId) ?? state.members[1];
  const activeRound = [...state.rounds].reverse().find((round) => round.participantId === active.id && !round.finishedAt);
  const completedRounds = state.rounds.filter((round) => round.finishedAt);
  const phaseConfig = phases.find((phase) => phase.name === state.phase)!;
  const phaseRounds = completedRounds.filter((round) => round.phase === state.phase);
  const recentDurations = phaseRounds.slice(-3).map((round) =>
    (new Date(round.finishedAt!).getTime() - new Date(round.startedAt).getTime()) / 1000);
  const csvDuration = paceEstimates[active.id]?.[state.phase];
  const typicalDuration = recentDurations.length
    ? recentDurations.sort((a, b) => a - b)[Math.floor(recentDurations.length / 2)]
    : csvDuration;
  const elapsed = activeRound ? (now - new Date(activeRound.startedAt).getTime()) / 1000 : 0;
  const phaseEndsAt = new Date(state.eventStartedAt).getTime() + phases
    .slice(0, phases.findIndex((phase) => phase.name === state.phase) + 1)
    .reduce((sum, phase) => sum + phase.duration * 3600000, 0);
  const remaining = Math.max(0, (phaseEndsAt - now) / 1000);

  function update(patch: Partial<EventState>) {
    setState((current) => ({ ...current, ...patch }));
  }

  async function performMutation(action: Parameters<typeof mutateEvent>[0], nextParticipantId?: string, phase?: Phase) {
    if (!supabase) return;
    setMutationPending(true);
    try {
      await mutateEvent(action, nextParticipantId, phase);
      const shared = await loadSharedState();
      applySharedState(shared);
      setSyncMessage('');
    } catch (error) {
      setSyncMessage(`Action failed: ${(error as Error).message}`);
    } finally {
      setMutationPending(false);
    }
  }

  function startRound() { void performMutation('start_round'); }
  function finishRound() { void performMutation('finish_round'); }

  function setNext(id: string) {
    void performMutation('set_next_participant', id);
  }

  function handover() {
    void performMutation('handover', next.id);
  }

  function reset() {
    if (window.confirm('Reset this event and remove all recorded rounds?')) void performMutation('reset_event');
  }

  const activeLocation = state.locations[active.id];
  const locationAge = activeLocation ? Math.round((now - new Date(activeLocation.recordedAt).getTime()) / 1000) : undefined;
  const startLabel = activeRound ? `Round ${activeRound.number} in progress` : 'Start next round';
  const estimatedFinish = activeRound && typicalDuration
    ? new Date(new Date(activeRound.startedAt).getTime() + typicalDuration * 1000)
    : undefined;
  const estimatedFinishIn = estimatedFinish
    ? Math.max(0, (estimatedFinish.getTime() - now) / 1000)
    : undefined;
  const estimateSource = recentDurations.length ? 'recent phase laps' : 'CSV estimate';

  function focusParticipant(id: string) {
    setFocusedParticipantId(id);
    document.querySelector('.map-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  return (
    <main>
      <header className="topbar">
        <div><p className="eyebrow">T24 · TEAM DASHBOARD</p><h1>Keep moving.</h1></div>
        <button className="quiet-button" onClick={reset}>Reset</button>
      </header>
      {sharedLoading && <p className="sync-message">Loading shared race state…</p>}
      {syncMessage && <p className="sync-message">{syncMessage}</p>}
      <>
          <section className="hero-grid">
            <div className="phase-card">
              <div className="section-heading"><div><p className="eyebrow">CURRENT PHASE</p><h2>{state.phase}</h2></div><span className="phase-dot" /></div>
              <div className="countdown">{formatDuration(remaining)}</div>
              <div className="phase-meta"><span>{phaseConfig.distance} rounds</span><span>{phaseConfig.duration}h total</span></div>
            </div>
            <div className="active-card" style={{ borderColor: active.color }}>
              <p className="eyebrow">ACTIVE NOW</p><h2>{active.name}</h2>
              <p className="active-time">{activeRound ? `${formatDurationWithSeconds(elapsed)} elapsed` : 'Waiting at transition'}</p>
              <div className="round-pill">{activeRound ? `Round ${activeRound.number}` : `Next: round ${phaseRounds.length + 1}`}</div>
              {estimatedFinish && typicalDuration !== undefined && estimatedFinishIn !== undefined && <p className="estimate">Estimated finish {formatClock(estimatedFinish.toISOString())}<span className="estimate-countdown">in {formatDurationWithSeconds(estimatedFinishIn)}</span><small>Based on {estimateSource} · {formatDuration(typicalDuration)}</small></p>}
            </div>
          </section>
          <section className="control-panel">
            <button className="primary-button" disabled={mutationPending || sharedLoading || !supabase} onClick={activeRound ? finishRound : startRound}>{activeRound ? 'Finish round' : startLabel}</button>
            <div className="handover-row"><label htmlFor="next">Next up</label><select id="next" value={state.nextParticipantId} onChange={(event) => setNext(event.target.value)} disabled={mutationPending}>{state.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select><button className="secondary-button" disabled={mutationPending || sharedLoading || !supabase} onClick={handover}>Handover to {next.name}</button></div>
            <div className="phase-switcher"><span>Phase</span>{phases.map((phase) => <button key={phase.name} className={state.phase === phase.name ? 'selected' : ''} disabled={mutationPending} onClick={() => void performMutation('change_phase', undefined, phase.name)}>{phase.name}</button>)}</div>
          </section>
          <section className="content-grid">
            <div className="panel schedule"><div className="section-heading"><div><p className="eyebrow">TEAM ROTATION</p><h2>Who is resting</h2></div><span className="muted">{completedRounds.length} rounds</span></div>
              {state.members.map((member) => {
                const lastRound = [...completedRounds].reverse().find((round) => round.participantId === member.id);
                return <button className={`member-row ${focusedParticipantId === member.id ? 'focused' : ''}`} key={member.id} onClick={() => focusParticipant(member.id)}><span className="member-dot" style={{ background: member.color }} /><strong>{member.name}</strong><span className="member-stat">{member.id === active.id ? 'Active' : lastRound ? `Last ${formatClock(lastRound.finishedAt)}` : 'Ready'}</span>{member.id === next.id && <span className="next-tag">NEXT</span>}</button>;
              })}
              <div className="next-estimate"><span>Estimated next handover</span><strong>{activeRound && typicalDuration !== undefined ? formatClock(new Date(new Date(activeRound.startedAt).getTime() + typicalDuration * 1000).toISOString()) : '--:--'}</strong></div>
            </div>
            <div className="panel map-panel"><div className="section-heading"><div><p className="eyebrow">LIVE MAP</p><h2>{Object.keys(state.locations).length ? 'All participants' : 'Course preview'}</h2></div><div className="map-actions"><button className="refresh-button" onClick={() => loadLatestLocations().then((locations) => { update({ locations: Object.fromEntries(locations.map((location) => [location.participantId, location])) }); setLastLocationSync(new Date()); }).catch((error: Error) => setSyncMessage(`Location refresh failed: ${error.message}`))} disabled={locationSyncing}>{locationSyncing ? 'Refreshing…' : 'Refresh'}</button>{lastLocationSync && <span className="status">Updated {Math.max(0, Math.round((now - lastLocationSync.getTime()) / 1000))}s ago</span>}</div></div><MapPanel locations={state.locations} members={state.members} activeParticipantId={active.id} phase={state.phase} focusedParticipantId={focusedParticipantId} /></div>
          </section>
          <section className="panel history"><div className="section-heading"><div><p className="eyebrow">ROUND LOG</p><h2>Latest rounds</h2></div><span className="muted">{phaseConfig.distance} per round</span></div>{paceError && <p className="sync-message">{paceError}</p>}
            {completedRounds.length === 0 ? <p className="empty">No rounds recorded yet. Start the first round when your swimmer enters the course.</p> : <div className="round-list">{completedRounds.slice(-6).reverse().map((round) => { const member = state.members.find((item) => item.id === round.participantId); const duration = (new Date(round.finishedAt!).getTime() - new Date(round.startedAt).getTime()) / 1000; return <div className="round-row" key={round.id}><span className="round-number">{round.number}</span><strong>{member?.name}</strong><span>{formatClock(round.startedAt)} → {formatClock(round.finishedAt)}</span><b>{formatDuration(duration)}</b></div>; })}</div>}
          </section>
        </>
      <footer><span>Shared race state · OwnTracks locations</span><span>Phase ETA uses the last 3 completed rounds</span></footer>
    </main>
  );
}

export default App;
