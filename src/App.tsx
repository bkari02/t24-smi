import { CSSProperties, FormEvent, useEffect, useRef, useState } from 'react';
import MapPanel from './MapPanel';
import EventChat from './EventChat';
import { EventState, Location, Phase, Round } from './types';
import { eventId, hasMemberSession, loadActiveViewerCount, loadCheerHourly, loadCheerSummary, loadLatestLocations, loadSharedState, mutateEvent, recordCheer, recordViewerHeartbeat, startMemberSession, supabase } from './supabase';
import { loadRouteProgress, RouteProgress } from './routeProgress';

const phases: { name: Phase; duration: number; distance: string }[] = [
  { name: 'Swim', duration: 4, distance: '1 km' },
  { name: 'Bike', duration: 12, distance: '21 km' },
  { name: 'Run', duration: 8, distance: '4 km' },
];
const colors = ['#f26b4f', '#4cc9a4', '#f6c85f', '#91a7ff', '#d28cff'];
const participantImages: Record<string, string> = {
  p1: '/data/kieeesch.PNG',
  p2: '/data/lilli.PNG',
  p3: '/data/jule.PNG',
  p4: '/data/matze.PNG',
  p5: '/data/benni.PNG',
};

const initialState: EventState = {
  eventStartedAt: new Date().toISOString(),
  phase: 'Swim',
  activeParticipantId: 'p1',
  nextParticipantId: 'p2',
  members: ['Kieeesch', 'Lilli', 'Jule', 'Matze', 'Benni'].map((name, index) => ({
    id: `p${index + 1}`, name, color: colors[index], imageUrl: participantImages[`p${index + 1}`],
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

function formatClock(iso?: string, withSeconds = false) {
  return iso
    ? new Date(iso).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      ...(withSeconds ? { second: '2-digit' } : {}),
    })
    : '--:--';
}

type ScheduleItem = {
  phase: Phase;
  loop: number;
  participant: string;
  start: string;
  end: string;
  duration: string;
};

function parseSchedule(csv: string): ScheduleItem[] {
  return csv.trim().split(/\r?\n/).slice(1).map((row) => {
    const [discipline, loop, participant, start, end, duration] = row.split(',').map((value) => value.trim());
    const phase: Phase = discipline === 'Swimming' ? 'Swim' : discipline === 'Cycling' ? 'Bike' : 'Run';
    return { phase, loop: Number(loop), participant, start: start.replace(' ', 'T'), end: end.replace(' ', 'T'), duration };
  }).filter((item) => Number.isFinite(item.loop) && item.participant);
}

function scheduleClock(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function scheduleDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
}

function App() {
  const params = new URLSearchParams(window.location.search);
  const requestedView: 'fan' | 'member' | 'athlete' = params.get('view') === 'member'
    ? 'member'
    : params.get('view') === 'athlete' ? 'athlete' : 'fan';
  const [view, setView] = useState<'fan' | 'member' | 'athlete'>(requestedView);
  const [memberAuthed, setMemberAuthed] = useState(hasMemberSession());
  const [memberPassword, setMemberPassword] = useState('');
  const [memberLoginError, setMemberLoginError] = useState('');
  const [viewerCount, setViewerCount] = useState<number>();
  const [cheers, setCheers] = useState<Record<string, number>>({});
  const [recentCheers, setRecentCheers] = useState<Record<string, number>>({});
  const [cheerGraph, setCheerGraph] = useState<{ bucket: string; total: number }[]>([]);
  const [cheerBurst, setCheerBurst] = useState(0);
  const [cheerCelebration, setCheerCelebration] = useState(false);
  const [celebrationLevel, setCelebrationLevel] = useState(1);
  const cheerSummaryLoaded = useRef(false);
  const celebrationTimer = useRef<number>();
  const [cheerPending, setCheerPending] = useState(false);
  const [routeProgress, setRouteProgress] = useState<RouteProgress>();
  const [darkMode, setDarkMode] = useState(() => window.localStorage.getItem('t24-theme') === 'dark');
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
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [scheduleError, setScheduleError] = useState('');
  const [schedulePage, setSchedulePage] = useState(0);

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light';
    window.localStorage.setItem('t24-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    const viewerId = window.localStorage.getItem('t24-viewer-id') ?? crypto.randomUUID();
    window.localStorage.setItem('t24-viewer-id', viewerId);
    const heartbeat = () => {
      void recordViewerHeartbeat(viewerId, view === 'athlete' ? params.get('participant') ?? undefined : undefined)
        .then(() => loadActiveViewerCount()).then(setViewerCount).catch(() => undefined);
    };
    heartbeat();
    const timer = window.setInterval(heartbeat, 180000);
    return () => window.clearInterval(timer);
  }, [view]);

  useEffect(() => {
    if (!supabase) return;
    const refreshCheers = () => {
      void loadCheerSummary().then((rows) => {
        const nextTotals = Object.fromEntries(rows.map((row) => [row.participantId, row.total]));
        const nextRecent = Object.fromEntries(rows.map((row) => [row.participantId, row.recent]));
        setCheers((previous) => {
          const incoming = rows.reduce((sum, row) => sum + Math.max(0, row.total - (previous[row.participantId] ?? 0)), 0);
          if (cheerSummaryLoaded.current && incoming > 0) {
            setCheerBurst((current) => current + 1);
            setCelebrationLevel(1);
            setCelebrationLevel(Math.min(5, incoming));
            setCheerCelebration(true);
            if (celebrationTimer.current) window.clearTimeout(celebrationTimer.current);
            celebrationTimer.current = window.setTimeout(() => setCheerCelebration(false), 1600);
          }
          return nextTotals;
        });
        setRecentCheers(nextRecent);
        cheerSummaryLoaded.current = true;
      }).catch(() => undefined);
      void loadCheerHourly(state.activeParticipantId).then(setCheerGraph).catch(() => undefined);
    };
    refreshCheers();
    const timer = window.setInterval(refreshCheers, 30000);
    return () => window.clearInterval(timer);
  }, [state.activeParticipantId]);

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
    fetch('/data/schedule.csv')
      .then((response) => {
        if (!response.ok) throw new Error(`Could not load schedule (${response.status})`);
        return response.text();
      })
      .then((csv) => setSchedule(parseSchedule(csv)))
      .catch((error: Error) => setScheduleError(error.message));
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
  const athleteId = view === 'athlete' ? params.get('participant') ?? active.id : active.id;
  const athlete = state.members.find((member) => member.id === athleteId) ?? active;
  const activeRound = [...state.rounds].reverse().find((round) => round.participantId === active.id && !round.finishedAt);
  const completedRounds = state.rounds.filter((round) => round.finishedAt);
  const phaseConfig = phases.find((phase) => phase.name === state.phase)!;
  const phaseRounds = completedRounds.filter(
    (round) => round.phase === state.phase && round.participantId === active.id,
  );
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
  const athleteLocation = state.locations[athlete.id];
  const locationAge = activeLocation ? Math.round((now - new Date(activeLocation.recordedAt).getTime()) / 1000) : undefined;
  const startLabel = activeRound ? `Round ${activeRound.number} in progress` : 'Start next round';
  const estimatedFinish = activeRound && typicalDuration
    ? new Date(new Date(activeRound.startedAt).getTime() + typicalDuration * 1000)
    : undefined;
  const estimatedFinishIn = estimatedFinish
    ? Math.max(0, (estimatedFinish.getTime() - now) / 1000)
    : undefined;
  const estimateSource = recentDurations.length ? 'recent phase laps' : 'CSV estimate';
  const canControl = view === 'member' && memberAuthed;
  const activeRecentCheers = recentCheers[active.id] ?? 0;
  const recentCheerScale = Math.min(1.55, 1 + activeRecentCheers * 0.09);
  const recentCheerTone = activeRecentCheers >= 10 ? 'hot' : activeRecentCheers >= 4 ? 'warm' : 'cool';
  const maxGraphValue = Math.max(1, ...cheerGraph.map((item) => item.total));
  const schedulePageSize = 8;
  const remainingSchedule = schedule.filter((item) => new Date(item.end).getTime() >= now);
  const schedulePageCount = Math.max(1, Math.ceil(remainingSchedule.length / schedulePageSize));
  const visibleSchedule = remainingSchedule.slice(schedulePage * schedulePageSize, (schedulePage + 1) * schedulePageSize);

  useEffect(() => {
    if (view !== 'athlete') return;
    void loadRouteProgress(state.phase, athleteLocation).then(setRouteProgress).catch(() => setRouteProgress(undefined));
  }, [view, state.phase, athleteLocation]);

  function cheer() {
    setCheerPending(true);
    const nonce = crypto.randomUUID();
    void recordCheer(active.id, nonce)
      .then(() => loadCheerSummary())
      .then((rows) => {
        setCheers(Object.fromEntries(rows.map((row) => [row.participantId, row.total])));
        setRecentCheers(Object.fromEntries(rows.map((row) => [row.participantId, row.recent])));
        setCheerBurst((current) => current + 1);
        setCheerCelebration(true);
        if (celebrationTimer.current) window.clearTimeout(celebrationTimer.current);
        celebrationTimer.current = window.setTimeout(() => setCheerCelebration(false), 1600);
        return loadCheerHourly(active.id);
      })
      .then(setCheerGraph)
      .catch((error: Error) => setSyncMessage(`Cheer failed: ${error.message}`))
      .finally(() => setCheerPending(false));
  }

  function loginMember(event: FormEvent) {
    event.preventDefault();
    setMemberLoginError('');
    void startMemberSession(memberPassword)
      .then(() => { setMemberAuthed(true); setMemberPassword(''); })
      .catch((error: Error) => setMemberLoginError(error.message));
  }

  function focusParticipant(id: string) {
    setFocusedParticipantId(id);
    document.querySelector('.map-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  return (
    <main>
      {cheerCelebration && <div className={`cheer-celebration intensity-${celebrationLevel}`} aria-hidden="true"><strong>KEEP IT SMI!</strong>{Array.from({ length: 48 + celebrationLevel * 18 }, (_, index) => <span key={index} style={{ '--i': index } as CSSProperties} />)}</div>}
      <header className="topbar">
        <div><p className="eyebrow">T24 XTREME TRIATHLON · SMIBOARD </p><h2>Never Schmu, always Smi!</h2></div>
        <div className="header-actions">
          <label className="mode-select">Mode
            <select value={view} onChange={(event) => setView(event.target.value as 'fan' | 'member' | 'athlete')}>
              <option value="fan">Fan</option>
              <option value="member">Team member</option>
              <option value="athlete">Athlete</option>
            </select>
          </label>
          <button className="quiet-button cheer-button" onClick={cheer} disabled={cheerPending || !supabase}>Cheer for {active.name} · {cheers[active.id] ?? 0}</button>
          <button className="quiet-button theme-toggle" onClick={() => setDarkMode((current) => !current)}>{darkMode ? 'Light mode' : 'Dark mode'}</button>
          {canControl && <button className="quiet-button" onClick={reset}>Reset</button>}
        </div>
      </header>
      <div className="view-status"><span>{view === 'fan' ? 'Fan view' : view === 'member' ? 'Team member view' : `Athlete view · ${athlete.name}`}</span>{viewerCount !== undefined && <span>{viewerCount} active viewers</span>}</div>
      {view === 'member' && !memberAuthed && <form className="member-login" onSubmit={loginMember}><div><p className="eyebrow">TEAM ACCESS</p><h2>Enter team password</h2></div><input type="password" value={memberPassword} onChange={(event) => setMemberPassword(event.target.value)} placeholder="Shared password" required /><button className="primary-button" type="submit">Unlock controls</button>{memberLoginError && <p className="sync-message">{memberLoginError}</p>}</form>}
      {sharedLoading && <p className="sync-message">Loading shared race state…</p>}
      {syncMessage && <p className="sync-message">{syncMessage}</p>}
      <>
          <section className="panel map-panel map-priority"><div className="section-heading"><div><p className="eyebrow">LIVE MAP</p><h2>{Object.keys(state.locations).length ? 'All participants' : 'Course preview'}</h2></div><div className="map-actions"><span className="map-live-indicator"><span className="member-dot" style={{ background: active.color }} />{active.name} · {state.phase}</span><button className="refresh-button" onClick={() => loadLatestLocations().then((locations) => { update({ locations: Object.fromEntries(locations.map((location) => [location.participantId, location])) }); setLastLocationSync(new Date()); }).catch((error: Error) => setSyncMessage(`Location refresh failed: ${error.message}`))} disabled={locationSyncing}>{locationSyncing ? 'Refreshing…' : 'Refresh'}</button>{lastLocationSync && <span className="status">Updated {Math.max(0, Math.round((now - lastLocationSync.getTime()) / 1000))}s ago</span>}</div></div><MapPanel locations={state.locations} members={state.members} activeParticipantId={active.id} phase={state.phase} focusedParticipantId={focusedParticipantId} /></section>
          <section className="hero-grid">
            <div className="phase-card">
              <div className="section-heading"><div><p className="eyebrow">CURRENT PHASE</p><h2>{state.phase}</h2></div><span className="phase-dot" /></div>
              <div className="countdown">{formatDuration(remaining)}</div>
              <div className="phase-meta"><span>{phaseConfig.distance} rounds</span><span>{phaseConfig.duration}h total</span></div>
            </div>
            <div className="active-card" style={{ borderColor: active.color }}>
              <div className="active-heading"><div><p className="eyebrow">ACTIVE NOW</p><h2>{active.name}</h2></div><div className="cheer-graph" aria-label="Cheers received during the last hour"><span>CHEERS OVER LAST HOUR</span><div className="cheer-bars">{cheerGraph.map((item) => <i key={item.bucket} style={{ height: `${Math.max(8, (item.total / maxGraphValue) * 100)}%` }} title={`${item.total} cheers`} />)}</div></div></div>
              <div key={cheerBurst} className={`recent-cheers ${recentCheerTone}`} style={{ transform: `scale(${recentCheerScale})` }}>+{activeRecentCheers} <span>recent cheers</span></div>
              <p className="active-time">{activeRound ? `${formatDurationWithSeconds(elapsed)} elapsed` : 'Waiting at transition'}</p>
              <div className="round-pill">{activeRound ? `Round ${activeRound.number}` : `Next: round ${phaseRounds.length + 1}`}</div>
              {estimatedFinish && typicalDuration !== undefined && estimatedFinishIn !== undefined && <p className="estimate">Estimated finish {formatClock(estimatedFinish.toISOString(), true)}<span className="estimate-countdown">in {formatDurationWithSeconds(estimatedFinishIn)}</span><small>Based on {estimateSource} · {formatDurationWithSeconds(typicalDuration)}</small></p>}
            </div>
          </section>
          {view === 'athlete' && <section className="panel athlete-panel"><p className="eyebrow">YOUR TRACK POSITION</p><h2>{athlete.name}</h2><div className="athlete-stats"><strong>{routeProgress ? `${routeProgress.completedKm.toFixed(1)} km` : '—'}</strong><span>completed</span><strong>{routeProgress ? `${routeProgress.remainingKm.toFixed(1)} km` : '—'}</strong><span>remaining</span><strong>{routeProgress ? `${Math.round(routeProgress.percent)}%` : '—'}</strong><span>approx. progress</span></div><p className="muted">GPS route progress is approximate and based on the nearest course point.</p></section>}
          {canControl && <section className="control-panel">
            <button className="primary-button" disabled={mutationPending || sharedLoading || !supabase} onClick={activeRound ? finishRound : startRound}>{activeRound ? 'Finish round' : startLabel}</button>
            <div className="handover-row"><label htmlFor="next">Next up</label><select id="next" value={state.nextParticipantId} onChange={(event) => setNext(event.target.value)} disabled={mutationPending}>{state.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select><button className="secondary-button" disabled={mutationPending || sharedLoading || !supabase} onClick={handover}>Handover to {next.name}</button></div>
            <div className="phase-switcher"><span>Phase</span>{phases.map((phase) => <button key={phase.name} className={state.phase === phase.name ? 'selected' : ''} disabled={mutationPending} onClick={() => void performMutation('change_phase', undefined, phase.name)}>{phase.name}</button>)}</div>
          </section>}
          <section className="content-grid">
            <div className="rotation-grid">
              <div className="panel schedule"><div className="section-heading"><div><p className="eyebrow">TEAM ROTATION</p><h2>Active & next</h2></div><span className="muted">{completedRounds.length} rounds</span></div>
                <button className={`member-row featured ${focusedParticipantId === active.id ? 'focused' : ''}`} onClick={() => focusParticipant(active.id)}>{active.imageUrl ? <img className="participant-avatar" src={active.imageUrl} alt="" /> : <span className="member-dot" style={{ background: active.color }} />}<strong>{active.name}</strong><span className="member-stat">Active</span></button>
                <button className={`member-row featured ${focusedParticipantId === next.id ? 'focused' : ''}`} onClick={() => focusParticipant(next.id)}>{next.imageUrl ? <img className="participant-avatar" src={next.imageUrl} alt="" /> : <span className="member-dot" style={{ background: next.color }} />}<strong>{next.name}</strong><span className="member-stat">Next up</span><span className="next-tag">NEXT</span></button>
                <div className="next-estimate"><span>Estimated next handover</span><strong>{activeRound && typicalDuration !== undefined ? formatClock(new Date(new Date(activeRound.startedAt).getTime() + typicalDuration * 1000).toISOString(), true) : '--:--'}</strong></div>
              </div>
              <div className="panel schedule"><div className="section-heading"><div><p className="eyebrow">TEAM ROTATION</p><h2>Resting order</h2></div><span className="muted">Longest rest first</span></div>
                {state.members.filter((member) => member.id !== active.id && member.id !== next.id).sort((a, b) => {
                  const lastA = [...completedRounds].reverse().find((round) => round.participantId === a.id)?.finishedAt;
                  const lastB = [...completedRounds].reverse().find((round) => round.participantId === b.id)?.finishedAt;
                  if (!lastA && !lastB) return 0;
                  if (!lastA) return -1;
                  if (!lastB) return 1;
                  return new Date(lastA).getTime() - new Date(lastB).getTime();
                }).map((member) => {
                  const lastRound = [...completedRounds].reverse().find((round) => round.participantId === member.id);
                  return <button className={`member-row ${focusedParticipantId === member.id ? 'focused' : ''}`} key={member.id} onClick={() => focusParticipant(member.id)}>{member.imageUrl ? <img className="participant-avatar" src={member.imageUrl} alt="" /> : <span className="member-dot" style={{ background: member.color }} />}<strong>{member.name}</strong><span className="member-stat">{lastRound ? `Last ${formatClock(lastRound.finishedAt)}` : 'Ready'}</span></button>;
                })}
              </div>
            </div>
          </section>
          <EventChat />
          <section className="panel planned-schedule"><div className="section-heading"><div><p className="eyebrow">PLANNED RELAY</p><h2>When to tune in</h2></div><span className="muted">Live controls can override this plan</span></div>{scheduleError && <p className="sync-message">{scheduleError}</p>}{remainingSchedule.length === 0 ? <p className="empty">No upcoming schedule entries.</p> : <><div className="planned-list">{visibleSchedule.map((item) => { const member = state.members.find((candidate) => candidate.name.toLowerCase() === item.participant.toLowerCase()); const isCurrent = item.phase === state.phase && item.participant.toLowerCase() === active.name.toLowerCase(); return <div className={`planned-row ${isCurrent ? 'current' : ''}`} key={`${item.phase}-${item.loop}`}><span className="planned-phase">{item.phase}</span><span className="planned-loop">#{item.loop}</span>{member?.imageUrl ? <img className="participant-avatar" src={member.imageUrl} alt="" /> : <span className="member-dot" style={{ background: member?.color ?? '#999' }} />}<strong>{item.participant}</strong><span className="planned-time">{scheduleDate(item.start)} · {scheduleClock(item.start)}–{scheduleClock(item.end)}</span><b>{item.duration}</b></div>; })}</div><div className="schedule-pagination"><button className="refresh-button" onClick={() => setSchedulePage((page) => Math.max(0, page - 1))} disabled={schedulePage === 0}>Previous</button><span>Page {schedulePage + 1} / {schedulePageCount}</span><button className="refresh-button" onClick={() => setSchedulePage((page) => Math.min(schedulePageCount - 1, page + 1))} disabled={schedulePage >= schedulePageCount - 1}>Next</button></div></>}</section>
          <section className="panel history"><div className="section-heading"><div><p className="eyebrow">ROUND LOG</p><h2>Latest rounds</h2></div><span className="muted">{phaseConfig.distance} per round</span></div>{paceError && <p className="sync-message">{paceError}</p>}
            {completedRounds.length === 0 ? <p className="empty">No rounds recorded yet. Start the first round when your swimmer enters the course.</p> : <div className="round-list">{completedRounds.slice(-6).reverse().map((round) => { const member = state.members.find((item) => item.id === round.participantId); const duration = (new Date(round.finishedAt!).getTime() - new Date(round.startedAt).getTime()) / 1000; return <div className="round-row" key={round.id}><span className="round-number">{round.number}</span><strong>{member?.name}</strong><span>{formatClock(round.startedAt)} → {formatClock(round.finishedAt)}</span><b>{formatDurationWithSeconds(duration)}</b></div>; })}</div>}
          </section>
        </>
      <footer><span>Shared race state · OwnTracks locations</span><span>Phase ETA uses the last 3 completed rounds</span></footer>
    </main>
  );
}

export default App;
