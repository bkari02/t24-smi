import { CSSProperties, FormEvent, useEffect, useRef, useState } from 'react';
import MapPanel from './MapPanel';
import EventChat from './EventChat';
import ElevationProfile from './ElevationProfile';
import { EventState, Location, Phase, Round } from './types';
import { eventId, hasMemberSession, loadActiveViewerCount, loadCheerHourly, loadCheerSummary, loadCheerTimeline, loadLatestLocations, loadSharedState, mutateEvent, recordCheer, recordViewerHeartbeat, startMemberSession, supabase } from './supabase';
import { loadRouteProgress, RouteProgress } from './routeProgress';

const phases: { name: Phase; duration: number; distance: string }[] = [
  { name: 'Run 1', duration: 4, distance: '2.5 km' },
  { name: 'Bike', duration: 12, distance: '21 km' },
  { name: 'Run 2', duration: 8, distance: '4 km' },
];
const colors = ['#f26b4f', '#4cc9a4', '#f6c85f', '#91a7ff', '#d28cff'];
const participantImages: Record<string, string> = {
  p1: '/data/kieeesch.PNG',
  p2: '/data/lilli.PNG',
  p3: '/data/jule.PNG',
  p4: '/data/matze.PNG',
  p5: '/data/benni.PNG',
};

const participantProfiles = [
  { emoji: '🏊‍♀️', name: 'Lilli', title: 'Die menschliche Schwimmboje', strength: 'Schwimmen. Und zwar so viel, dass die anderen wahrscheinlich schon nach der ersten Runde vergessen, wie Wasser überhaupt aussieht.', weakness: 'Fahrrad fahren, insbesondere dann, wenn ein Reifen platzt. Während andere schon wieder auf der Strecke sind, führt Lilli vermutlich noch eine intensive Beziehung zu Reifenheber und Ersatzschlauch.', imageUrl: participantImages.p2 },
  { emoji: '🚴', name: 'Matze', title: 'Giro de Risiko', strength: 'Radfahren, dank Giro-Training. Matze hat vermutlich mehr Höhenmeter in den Beinen als wir gemeinsame Trainingseinheiten. Dazu kommt eine ausgeprägte Risikobereitschaft – eine Eigenschaft, die bei einem 24-Stunden-Rennen entweder Gold wert ist oder uns sehr früh einen Sanitäter beschert.', weakness: 'Sein geschwächtes Immunsystem. Während andere ihre Wattwerte optimieren, kämpft Matze mit der Frage, ob sein Körper überhaupt für den Wettkampf freigeschaltet ist.', imageUrl: participantImages.p4 },
  { emoji: '💻', name: 'Benni', title: 'Der Webmaster auf Knieschoner-Mission', strength: 'Webmaster und E-Scooter fahren. Wenn unsere Website nicht funktioniert, ist Benni der Mann. Wenn unsere Beine nicht mehr funktionieren, wäre ein E-Scooter zumindest konzeptionell schon mal vorhanden.', weakness: 'Das linke Knie. Ein Körperteil, das sich offenbar schon vor dem Start über die Teilnahmebedingungen beschweren möchte.', imageUrl: participantImages.p5 },
  { emoji: '⛰️', name: 'Kiesch', title: 'Der Bergziegen-Beauftragte', strength: 'Climbing hills. Während andere am Anstieg ihre Lebensentscheidungen hinterfragen, sieht Kiesch vermutlich nur eine weitere Gelegenheit, Höhenmeter zu sammeln.', weakness: 'Die Schulter. Ein kleines Detail, das beim Triathlon mit Schwimmen, Radfahren und allem, was man sonst noch mit seinem Körper anstellen muss, durchaus störend sein könnte.', imageUrl: participantImages.p1 },
  { emoji: '🌊', name: 'Jule', title: 'Der Seestern mit Rennrad-Ambitionen', strength: 'Radfahren. Hoffentlich. Wir setzen hier bewusst auf Optimismus, denn bei Team Smi ist Zuversicht oft die einzige Form der Vorbereitung.', weakness: 'Schwimmen wie ein Seestern. Und zwar nicht wie einer, der elegant durchs Meer gleitet, sondern eher wie einer, der vom Leben überrascht wurde und jetzt erstmal waagerecht im Wasser liegt.', imageUrl: participantImages.p3 },
  { emoji: '👑', name: 'Svenja', title: 'Teamchefin, Sprachgenie und Quetschie-Spezialistin', strength: 'Allrounderin, Managerin, Französisch auf muttersprachlichem Niveau – und sie kann Quetschies öffnen wie andere Menschen Excel-Tabellen. Ohne Svenja läuft bei uns nichts. Wirklich nichts. Wahrscheinlich würde ohne sie nicht einmal der Startschuss fallen, weil wir ihn sprachlich nicht verstehen würden.', weakness: 'Sie kann nicht Nein sagen. Außerdem wusste sie bis heute nicht, was sie mit ihrer Zusage eigentlich alles angenommen hat. Jetzt ist sie Managerin eines Teams, das 24 Stunden lang Sport machen soll, zu sechst gemeldet ist, zu fünft erscheint und sprachlich ungefähr auf dem Niveau eines verwirrten Touristen unterwegs ist.', imageUrl: '/data/svenja.PNG' },
];
const participantProfilesEn: Record<string, { title: string; strength: string; weakness: string }> = {
  Lilli: { title: 'The human swim buoy', strength: 'Swimming. So much that everyone else may forget what water looks like after the first lap.', weakness: 'Cycling, especially when a tire bursts. While everyone else is back on course, Lilli is probably having a deep relationship with tire levers and spare tubes.' },
  Matze: { title: 'Giro de Risiko', strength: 'Cycling, thanks to Giro training. Matze probably has more climbing in his legs than we have shared training sessions — plus enough risk tolerance to win gold or summon a medic early.', weakness: 'His weakened immune system. While others optimise watts, Matze wonders whether his body has even unlocked race mode.' },
  Benni: { title: 'The webmaster on a knee-pad mission', strength: 'Webmaster and e-scooter rider. If the website breaks, Benni is the man. If our legs break, at least an e-scooter exists conceptually.', weakness: 'The left knee, which seems to have filed a complaint about the race before the start.' },
  Kiesch: { title: 'The mountain-goat officer', strength: 'Climbing hills. While others question their life choices on the ascent, Kiesch sees another chance to collect elevation.', weakness: 'The shoulder — a small detail that can be surprisingly inconvenient in a triathlon.' },
  Jule: { title: 'The starfish with road-bike ambitions', strength: 'Cycling. Hopefully. We are deliberately choosing optimism, because confidence is often Team Smi’s only preparation.', weakness: 'Swimming like a starfish — not one gliding elegantly through the sea, but one surprised by life and currently lying horizontally in the water.' },
  Svenja: { title: 'Team boss, language genius and pouch specialist', strength: 'All-rounder, manager, native-level French speaker — and she can open fruit pouches like other people open spreadsheets. Without Svenja, nothing happens.', weakness: 'She cannot say no. She accepted management of a team that is registered six-deep, arrives five-strong, and speaks French like confused tourists.' },
};

const initialState: EventState = {
  eventStartedAt: new Date().toISOString(),
  phase: 'Run 1',
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

function formatCountdown(seconds: number) {
  const totalSeconds = Math.max(0, Math.ceil(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainder = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
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

type Language = 'en' | 'de';
type TranslationKey = keyof typeof translations.en;

const translations = {
  en: {
    language: 'Language', mode: 'Mode', fan: 'Fan', member: 'Team member', athlete: 'Athlete',
    cheerFor: 'Cheer for', lightMode: 'light mode', darkMode: 'dark mode', reset: 'Reset',
    fanView: 'Fan view', memberView: 'Team member view', athleteView: 'Athlete view',
    activeViewers: 'active viewers', elevationProfile: 'ELEVATION PROFILE', ascent: 'Ascent', lowest: 'Lowest', highest: 'Highest', lapDistance: 'Lap', onCourse: 'active athlete', totalDistance: 'covered by the team', welcome: 'WELCOME TO TEAM SMI', introTitle: '24 hours, three disciplines, one active team member',
    athleteAccess: 'ATHLETE ACCESS', chooseAthlete: 'Choose athlete', athletePassword: 'Password', athleteUnlock: 'Open athlete view', athletePasswordHint: 'Enter password', athleteLoginError: 'Wrong athlete password.', athleteCheers: 'YOUR CHEERS', cheersTotal: 'total cheers', cheerTimeline: 'CHEERS OVER TIME', noCheers: 'No cheers yet.',
    introP1: 'We are starting as a team of five in a 24-hour relay triathlon: first 4 hours of swimming, then 12 hours of cycling, and finally 8 hours of running.',
    introP2: 'Only one person is racing at a time. Follow us during the event, join the chat, and send us cheers. Click the “Cheer for ...” button to cheer.',
    officialTime: 'Official start: Saturday, 13:00 · Finish: Sunday, 13:00', dontShow: 'Do not show again',
    introClose: 'All clear – Allez Team Smi!', liveMap: 'LIVE MAP', allParticipants: 'All participants', coursePreview: 'Course preview',
    nowActive: 'Now active:', refresh: 'Refresh', refreshing: 'Refreshing…', updated: 'Updated', currentPhase: 'CURRENT PHASE',
    rounds: 'rounds', total: 'total', activeNow: 'ACTIVE NOW', cheersLastHour: 'CHEERS OVER LAST HOUR', recentCheers: 'recent cheers',
    elapsed: 'elapsed', waitingTransition: 'Waiting at transition', nextRound: 'Next: round', estimatedFinish: 'Estimated finish',
    basedOn: 'Based on', recentLaps: 'recent phase laps', csvEstimate: 'CSV estimate', yourTrack: 'YOUR TRACK POSITION', cancelledSwim: 'Swim cancelled · bad water quality',
    startCountdown: 'COUNTDOWN TO START', startsIn: 'Starts in', officialStart: 'Official start today at 13:00', raceChange: 'Swimming cancelled — Run 1 (2.5 km) instead', raceNotice: 'Swimming has been cancelled due to water quality issues. Another 4 hours of running are planned instead.',
    completed: 'completed', remaining: 'remaining', approxProgress: 'approx. progress', gpsNote: 'GPS route progress is approximate and based on the nearest course point.',
    finishRound: 'Finish round', startNext: 'Start next round', nextUp: 'Next up', handover: 'Handover', teamAccess: 'TEAM ACCESS',
    enterPassword: 'Enter team password', sharedPassword: 'Shared password', unlock: 'Unlock controls', loading: 'Loading shared race state…',
    activeNext: 'Active & next', restingOrder: 'Resting order', longestRest: 'Longest rest first', active: 'Active', ready: 'Ready',
    latestRounds: 'Latest rounds', noRounds: 'No rounds recorded yet. Start the first round when your swimmer enters the course.',
    plannedRelay: 'PLANNED RELAY', tuneIn: 'When to tune in', liveOverride: 'Live controls can override this plan',
    noSchedule: 'No upcoming schedule entries.', previous: 'Previous', page: 'Page', next: 'Next',
    meetTeam: 'MEET TEAM SMI', mission: 'Our mission: 24 hours of announced chaos', sharedState: 'Shared race state · OwnTracks locations',
    etaNote: 'Phase ETA uses the last 3 completed rounds', strength: 'Strength:', weakness: 'Weakness:',
  },
  de: {
    language: 'Sprache', mode: 'Modus', fan: 'Fan', member: 'Teammitglied', athlete: 'Athlet:in',
    cheerFor: 'Cheer for', lightMode: 'light mode', darkMode: 'dark mode', reset: 'Zurücksetzen',
    fanView: 'Fan-Ansicht', memberView: 'Teammitglied-Ansicht', athleteView: 'Athlet:innen-Ansicht',
    activeViewers: 'aktive Zuschauer:innen', elevationProfile: 'HÖHENPROFIL', ascent: 'Anstieg', lowest: 'Tiefster Punkt', highest: 'Höchster Punkt', lapDistance: 'Runde', onCourse: 'aktive:r Athlet:in', totalDistance: 'vom Team zurückgelegt', welcome: 'WILLKOMMEN BEI TEAM SMI', introTitle: '24 Stunden, drei Disziplinen, ein aktives Teammitglied',
    athleteAccess: 'ATHLETEN-ZUGANG', chooseAthlete: 'Athlet:in auswählen', athletePassword: 'Passwort', athleteUnlock: 'Athleten-Ansicht öffnen', athletePasswordHint: 'Passwort eingeben', athleteLoginError: 'Falsches Athleten-Passwort.', athleteCheers: 'DEINE CHEERS', cheersTotal: 'Cheers gesamt', cheerTimeline: 'CHEERS IM ZEITVERLAUF', noCheers: 'Noch keine Cheers.',
    introP1: 'Wir starten zu fünft bei einem 24-Stunden-Staffel-Triathlon: zuerst 4 Stunden Schwimmen, danach 12 Stunden Radfahren und zum Schluss 8 Stunden Laufen.',
    introP2: 'Es ist immer nur eine Person gleichzeitig im Rennen. Hier könnt ihr uns verfolgen, im Chat mitfiebern und uns anfeuern. Klickt dafür auf den „Cheer for ...“-Button.',
    officialTime: 'Offizieller Start: Samstag, 13:00 Uhr · Ende: Sonntag, 13:00 Uhr', dontShow: 'Nicht mehr anzeigen',
    introClose: 'Alles klar – Allez Team Smi!', liveMap: 'LIVE MAP', allParticipants: 'Alle Teilnehmer:innen', coursePreview: 'Streckenvorschau',
    nowActive: 'Aktiv:', refresh: 'Aktualisieren', refreshing: 'Aktualisiere…', updated: 'Aktualisiert', currentPhase: 'AKTUELLE PHASE',
    rounds: 'Runden', total: 'gesamt', activeNow: 'JETZT AKTIV', cheersLastHour: 'CHEERS DER LETZTEN STUNDE', recentCheers: 'aktuelle Cheers',
    elapsed: 'vergangen', waitingTransition: 'Warten am Wechsel', nextRound: 'Nächste Runde', estimatedFinish: 'Voraussichtliches Ende',
    basedOn: 'Basierend auf', recentLaps: 'aktuellen Runden', csvEstimate: 'CSV-Schätzung', yourTrack: 'DEINE STRECKENPOSITION', cancelledSwim: 'Schwimmen abgesagt · schlechte Wasserqualität',
    startCountdown: 'COUNTDOWN BIS ZUM START', startsIn: 'Start in', officialStart: 'Offizieller Start heute um 13:00 Uhr', raceChange: 'Schwimmen abgesagt — stattdessen Run 1 (2,5 km)', raceNotice: 'Das Schwimmen wurde wegen Problemen mit der Wasserqualität abgesagt. Stattdessen sind weitere 4 Stunden Laufen geplant.',
    completed: 'absolviert', remaining: 'verbleibend', approxProgress: 'ca. Fortschritt', gpsNote: 'Der GPS-Fortschritt ist eine Näherung anhand des nächstgelegenen Streckenpunkts.',
    finishRound: 'Runde beenden', startNext: 'Nächste Runde starten', nextUp: 'Als Nächstes geplant', handover: 'Wechsel', teamAccess: 'TEAMZUGANG',
    enterPassword: 'Team-Passwort eingeben', sharedPassword: 'Gemeinsames Passwort', unlock: 'Steuerung freischalten', loading: 'Gemeinsamen Rennstatus laden…',
    activeNext: 'Aktiv & als Nächstes', restingOrder: 'Pause / Im Camp', longestRest: 'Längste Pause zuerst', active: 'Aktiv', ready: 'Bereit',
    latestRounds: 'Letzte Runden', noRounds: 'Noch keine Runden aufgezeichnet. Startet die erste Runde, sobald die Schwimmerin ins Wasser geht.',
    plannedRelay: 'RELAY-PLAN', tuneIn: 'Wann einschalten', liveOverride: 'Live-Steuerung kann diesen Plan überschreiben',
    noSchedule: 'Keine kommenden Einträge.', previous: 'Zurück', page: 'Seite', next: 'Weiter',
    meetTeam: 'LERNT TEAM SMI KENNEN', mission: 'Unsere Mission: 24 Stunden Chaos mit Ansage', sharedState: 'Gemeinsamer Rennstatus · OwnTracks',
    etaNote: 'Phasen-ETA basiert auf den letzten 3 absolvierten Runden', strength: 'Stärke:', weakness: 'Schwäche:',
  },
} as const;

function parseSchedule(csv: string): ScheduleItem[] {
  return csv.trim().split(/\r?\n/).slice(1).map((row) => {
    const [discipline, loop, participant, start, end, duration] = row.split(',').map((value) => value.trim());
    const phase: Phase | undefined = discipline === 'Run 1' || discipline === 'Swimming'
      ? 'Run 1'
      : discipline === 'Bike' || discipline === 'Cycling'
        ? 'Bike'
        : discipline === 'Run 2' || discipline === 'Running'
          ? 'Run 2'
          : undefined;
    if (!phase || !start || !end) return undefined;
    return { phase, loop: Number(loop), participant, start: start.replace(' ', 'T'), end: end.replace(' ', 'T'), duration };
  }).filter((item): item is ScheduleItem => item !== undefined && Number.isFinite(item.loop) && Boolean(item.participant));
}

function scheduleClock(iso: string, language: Language) {
  return new Date(iso).toLocaleTimeString(language === 'de' ? 'de-DE' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
}

function scheduleDate(iso: string, language: Language) {
  return new Date(iso).toLocaleDateString(language === 'de' ? 'de-DE' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
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
  const [athletePassword, setAthletePassword] = useState('');
  const [athleteLoginError, setAthleteLoginError] = useState('');
  const [athleteAuthed, setAthleteAuthed] = useState(false);
  const [selectedAthleteId, setSelectedAthleteId] = useState(() => params.get('participant') ?? 'p1');
  const [viewerCount, setViewerCount] = useState<number>();
  const [cheers, setCheers] = useState<Record<string, number>>({});
  const [recentCheers, setRecentCheers] = useState<Record<string, number>>({});
  const [cheerGraph, setCheerGraph] = useState<{ bucket: string; total: number }[]>([]);
  const [athleteCheerTimeline, setAthleteCheerTimeline] = useState<{ bucket: string; total: number }[]>([]);
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
  const [roundsPage, setRoundsPage] = useState(0);
  const [language, setLanguage] = useState<Language>(() => window.localStorage.getItem('t24-language') === 'de' ? 'de' : 'en');
  const [showEventIntro, setShowEventIntro] = useState(() => !window.localStorage.getItem('t24-event-intro-dismissed'));
  const [dontShowEventIntroAgain, setDontShowEventIntroAgain] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light';
    window.localStorage.setItem('t24-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  useEffect(() => {
    window.localStorage.setItem('t24-language', language);
  }, [language]);

  const t = (key: TranslationKey) => translations[language][key];

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    const viewerId = window.localStorage.getItem('t24-viewer-id') ?? crypto.randomUUID();
    window.localStorage.setItem('t24-viewer-id', viewerId);
    const heartbeat = () => {
      void recordViewerHeartbeat(viewerId, view === 'athlete' && athleteAuthed ? selectedAthleteId : undefined)
        .then(() => loadActiveViewerCount()).then(setViewerCount).catch(() => undefined);
    };
    heartbeat();
    const timer = window.setInterval(heartbeat, 180000);
    return () => window.clearInterval(timer);
  }, [view, athleteAuthed, selectedAthleteId]);

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
          estimates[id] = { 'Run 1': Number(swim) * 60, Bike: Number(bike) * 60, 'Run 2': Number(run) * 60 };
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
  const athleteId = view === 'athlete' ? selectedAthleteId : active.id;
  const athlete = state.members.find((member) => member.id === athleteId) ?? active;
  const activeRound = [...state.rounds].reverse().find((round) => round.participantId === active.id && !round.finishedAt);
  const completedRounds = state.rounds.filter((round) => round.finishedAt);
  const phaseConfig = phases.find((phase) => phase.name === state.phase)!;
  const totalDistanceKm = completedRounds.reduce((sum, round) => sum + parseFloat(phases.find((item) => item.name === round.phase)?.distance ?? '0'), 0);
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
  const athleteAccess = view === 'athlete' && athleteAuthed;
  const activeRecentCheers = recentCheers[active.id] ?? 0;
  const recentCheerScale = Math.min(1.55, 1 + activeRecentCheers * 0.09);
  const recentCheerTone = activeRecentCheers >= 10 ? 'hot' : activeRecentCheers >= 4 ? 'warm' : 'cool';
  const maxGraphValue = Math.max(1, ...cheerGraph.map((item) => item.total));
  const maxAthleteCheer = Math.max(1, ...athleteCheerTimeline.map((item) => item.total));
  const todayStart = new Date(now);
  todayStart.setHours(13, 0, 0, 0);
  const secondsUntilTodayStart = (todayStart.getTime() - now) / 1000;
  const schedulePageSize = 8;
  const roundsPageSize = 6;
  const phaseOrder = phases.map((item) => item.name);
  const reversedRounds = [...completedRounds].sort((a, b) => phaseOrder.indexOf(b.phase) - phaseOrder.indexOf(a.phase) || b.number - a.number);
  const roundsPageCount = Math.max(1, Math.ceil(reversedRounds.length / roundsPageSize));
  const currentRoundsPage = Math.min(roundsPage, roundsPageCount - 1);
  const visibleRounds = reversedRounds.slice(currentRoundsPage * roundsPageSize, (currentRoundsPage + 1) * roundsPageSize);
  const remainingSchedule = schedule.filter((item) => new Date(item.end).getTime() >= now);
  const schedulePageCount = Math.max(1, Math.ceil(remainingSchedule.length / schedulePageSize));
  const visibleSchedule = remainingSchedule.slice(schedulePage * schedulePageSize, (schedulePage + 1) * schedulePageSize);

  useEffect(() => {
    if (view !== 'athlete') return;
    void loadRouteProgress(state.phase, athleteLocation).then(setRouteProgress).catch(() => setRouteProgress(undefined));
  }, [view, state.phase, athleteLocation]);

  useEffect(() => {
    if (view !== 'athlete' || !athleteAuthed || !supabase) return;
    void loadCheerTimeline(athleteId).then(setAthleteCheerTimeline).catch((error: Error) => setSyncMessage(`Cheer history unavailable: ${error.message}`));
  }, [view, athleteAuthed, athleteId]);

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

  function loginAthlete(event: FormEvent) {
    event.preventDefault();
    setAthleteLoginError('');
    const expected = `smi-${athlete.name.toLowerCase()}`;
    if (athletePassword.trim().toLowerCase() !== expected) {
      setAthleteAuthed(false);
      setAthleteLoginError(t('athleteLoginError'));
      return;
    }
    setAthleteAuthed(true);
    setAthletePassword('');
  }

  function focusParticipant(id: string) {
    setFocusedParticipantId(id);
    document.querySelector('.map-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function closeEventIntro() {
    if (dontShowEventIntroAgain) window.localStorage.setItem('t24-event-intro-dismissed', 'true');
    setShowEventIntro(false);
  }

  return (
    <main>
      {secondsUntilTodayStart > 0 && <div className="start-countdown-banner" role="status">
        <span className="eyebrow">{t('startCountdown')}</span>
        <strong>{t('startsIn')} {formatCountdown(secondsUntilTodayStart)}</strong>
        <span>{t('officialStart')} · {t('raceChange')}</span>
      </div>}
      <div className="race-change-banner" role="status">
        <span className="eyebrow">{t('raceChange')}</span>
        <strong>{t('raceNotice')}</strong>
      </div>
      {showEventIntro && <div className="event-intro-overlay" role="presentation">
        <section className="event-intro-dialog" role="dialog" aria-modal="true" aria-labelledby="event-intro-title">
          <button className="event-intro-close" onClick={closeEventIntro} aria-label="Close">×</button>
          <p className="eyebrow">{t('welcome')}</p>
          <h2 id="event-intro-title">{t('introTitle')}</h2>
          <p>{t('introP1')}</p>
          <p>{t('introP2')}</p>
          <p className="event-intro-time">{t('officialTime')}</p>
          <label className="event-intro-checkbox"><input type="checkbox" checked={dontShowEventIntroAgain} onChange={(event) => setDontShowEventIntroAgain(event.target.checked)} /> {t('dontShow')}</label>
          <button className="primary-button event-intro-action" onClick={closeEventIntro}>{t('introClose')}</button>
        </section>
      </div>}
      {cheerCelebration && <div className={`cheer-celebration intensity-${celebrationLevel}`} aria-hidden="true"><strong>KEEP IT SMI!</strong>{Array.from({ length: 48 + celebrationLevel * 18 }, (_, index) => <span key={index} style={{ '--i': index } as CSSProperties} />)}</div>}
      <header className="topbar">
        <div><label className="language-switcher">{t('language')} <select value={language} onChange={(event) => setLanguage(event.target.value as Language)}><option value="en">EN · English</option><option value="de">DE · Deutsch</option></select></label><p className="eyebrow">T24 XTREME TRIATHLON · SMIBOARD </p><h2>Never Schmu, always Smi!</h2><p className="total-distance"><strong>{totalDistanceKm.toFixed(1)} km</strong><span>{t('totalDistance')} · {completedRounds.length} {t('rounds')}</span></p></div>
        <div className="header-actions">
          <label className="mode-select">{t('mode')}
            <select value={view} onChange={(event) => {
              const nextView = event.target.value as 'fan' | 'member' | 'athlete';
              setView(nextView);
              if (nextView !== 'athlete') setAthleteAuthed(false);
            }}>
              <option value="fan">{t('fan')}</option>
              <option value="member">{t('member')}</option>
              <option value="athlete">{t('athlete')}</option>
            </select>
          </label>
          <button className="quiet-button cheer-button" onClick={cheer} disabled={cheerPending || !supabase}>{t('cheerFor')} {active.name} · {cheers[active.id] ?? 0}</button>
          <button className="quiet-button theme-toggle" onClick={() => setDarkMode((current) => !current)}>{darkMode ? t('lightMode') : t('darkMode')}</button>
          {canControl && <button className="quiet-button" onClick={reset}>{t('reset')}</button>}
        </div>
      </header>
      <div className="view-status"><span>{view === 'fan' ? t('fanView') : view === 'member' ? t('memberView') : `${t('athleteView')} · ${athlete.name}`}</span>{viewerCount !== undefined && <span>{viewerCount} {t('activeViewers')}</span>}</div>
      {view === 'member' && !memberAuthed && <form className="member-login" onSubmit={loginMember}><div><p className="eyebrow">{t('teamAccess')}</p><h2>{t('enterPassword')}</h2></div><input type="password" value={memberPassword} onChange={(event) => setMemberPassword(event.target.value)} placeholder={t('sharedPassword')} required /><button className="primary-button" type="submit">{t('unlock')}</button>{memberLoginError && <p className="sync-message">{memberLoginError}</p>}</form>}
      {view === 'athlete' && !athleteAuthed && <form className="member-login athlete-login" onSubmit={loginAthlete}><div><p className="eyebrow">{t('athleteAccess')}</p><h2>{t('athleteUnlock')}</h2></div><select value={selectedAthleteId} onChange={(event) => { setSelectedAthleteId(event.target.value); setAthleteAuthed(false); setAthleteLoginError(''); }} aria-label={t('chooseAthlete')}>{state.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select><input type="password" value={athletePassword} onChange={(event) => setAthletePassword(event.target.value)} placeholder={t('athletePasswordHint')} required /><button className="primary-button" type="submit">{t('athleteUnlock')}</button>{athleteLoginError && <p className="sync-message">{athleteLoginError}</p>}</form>}
      {sharedLoading && <p className="sync-message">{t('loading')}</p>}
      {syncMessage && <p className="sync-message">{syncMessage}</p>}
      <>
          <section className="panel map-panel map-priority"><div className="section-heading"><div><p className="eyebrow">{t('liveMap')}</p><h2>{Object.keys(state.locations).length ? t('allParticipants') : t('coursePreview')}</h2></div><div className="map-actions"><span className="map-live-indicator">{t('nowActive')} <span className="member-dot" style={{ background: active.color }} />{active.name} · {state.phase}</span><button className="refresh-button" onClick={() => loadLatestLocations().then((locations) => { update({ locations: Object.fromEntries(locations.map((location) => [location.participantId, location])) }); setLastLocationSync(new Date()); }).catch((error: Error) => setSyncMessage(`Location refresh failed: ${error.message}`))} disabled={locationSyncing}>{locationSyncing ? t('refreshing') : t('refresh')}</button>{lastLocationSync && <span className="status">{t('updated')} {Math.max(0, Math.round((now - lastLocationSync.getTime()) / 1000))}s ago</span>}</div></div><MapPanel locations={state.locations} members={state.members} activeParticipantId={active.id} phase={state.phase} focusedParticipantId={focusedParticipantId} /></section>
          <ElevationProfile currentPhase={state.phase} location={activeLocation} labels={{ title: t('elevationProfile'), ascent: t('ascent'), lowest: t('lowest'), highest: t('highest'), distance: t('lapDistance'), you: t('onCourse') }} />
          <section className="hero-grid">
            <div className="phase-card">
              <div className="section-heading"><div><p className="eyebrow">{t('currentPhase')}</p><h2>{state.phase}</h2></div><span className="phase-dot" /></div>
              <div className="countdown">{formatDuration(remaining)}</div>
              <div className="phase-meta"><span>{phaseConfig.distance} {t('rounds')}</span><span>{phaseConfig.duration}h {t('total')}</span></div>
            </div>
            <div className="active-card" style={{ borderColor: active.color }}>
              <div className="active-heading"><div><p className="eyebrow">{t('activeNow')}</p><h2>{active.name}</h2></div><div className="cheer-graph" aria-label={t('cheersLastHour')}><span>{t('cheersLastHour')}</span><div className="cheer-bars">{cheerGraph.map((item) => <i key={item.bucket} style={{ height: `${Math.max(8, (item.total / maxGraphValue) * 100)}%` }} title={`${item.total} cheers`} />)}</div></div></div>
              <div key={cheerBurst} className={`recent-cheers ${recentCheerTone}`} style={{ transform: `scale(${recentCheerScale})` }}>+{activeRecentCheers} <span>{t('recentCheers')}</span></div>
              <p className="active-time">{activeRound ? `${formatDurationWithSeconds(elapsed)} ${t('elapsed')}` : t('waitingTransition')}</p>
              <div className="round-pill">{activeRound ? `Round ${activeRound.number}` : `${t('nextRound')}: ${phaseRounds.length + 1}`}</div>
              {estimatedFinish && typicalDuration !== undefined && estimatedFinishIn !== undefined && <p className="estimate">{t('estimatedFinish')} {formatClock(estimatedFinish.toISOString(), true)}<span className="estimate-countdown">in {formatDurationWithSeconds(estimatedFinishIn)}</span><small>{t('basedOn')} · {estimateSource === 'CSV estimate' ? t('csvEstimate') : t('recentLaps')} · {formatDurationWithSeconds(typicalDuration)}</small></p>}
            </div>
          </section>
          {athleteAccess && <><section className="panel athlete-panel"><p className="eyebrow">{t('yourTrack')}</p><h2>{athlete.name}</h2><div className="athlete-stats"><strong>{routeProgress ? `${routeProgress.completedKm.toFixed(1)} km` : '—'}</strong><span>{t('completed')}</span><strong>{routeProgress ? `${routeProgress.remainingKm.toFixed(1)} km` : '—'}</strong><span>{t('remaining')}</span><strong>{routeProgress ? `${Math.round(routeProgress.percent)}%` : '—'}</strong><span>{t('approxProgress')}</span></div><p className="muted">{t('gpsNote')}</p></section><section className="panel athlete-cheers"><div className="section-heading"><div><p className="eyebrow">{t('athleteCheers')}</p><h2>{athlete.name}</h2></div><strong className="athlete-cheer-total">{cheers[athlete.id] ?? 0} {t('cheersTotal')}</strong></div>{athleteCheerTimeline.length === 0 ? <p className="empty">{t('noCheers')}</p> : <><p className="eyebrow">{t('cheerTimeline')}</p><div className="athlete-cheer-chart">{athleteCheerTimeline.map((item) => <div className="athlete-cheer-bar" key={item.bucket} title={`${formatClock(item.bucket)} · ${item.total}`}><i style={{ height: `${Math.max(8, (item.total / maxAthleteCheer) * 100)}%` }} /><span>{formatClock(item.bucket)}</span></div>)}</div></>}</section></>}
          {canControl && <section className="control-panel">
            <button className="primary-button" disabled={mutationPending || sharedLoading || !supabase} onClick={activeRound ? finishRound : startRound}>{activeRound ? t('finishRound') : t('startNext')}</button>
            <div className="handover-row"><label htmlFor="next">{t('nextUp')}</label><select id="next" value={state.nextParticipantId} onChange={(event) => setNext(event.target.value)} disabled={mutationPending}>{state.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select><button className="secondary-button" disabled={mutationPending || sharedLoading || !supabase} onClick={handover}>{t('handover')} {next.name}</button></div>
            <div className="phase-switcher"><span>Phase</span>{phases.map((phase) => <button key={phase.name} className={state.phase === phase.name ? 'selected' : ''} disabled={mutationPending} onClick={() => void performMutation('change_phase', undefined, phase.name)}>{phase.name}</button>)}</div>
          </section>}
          <EventChat />
          <section className="content-grid">
            <div className="rotation-grid">
              <div className="panel schedule"><div className="section-heading"><div><p className="eyebrow">TEAM ROTATION</p><h2>{t('activeNext')}</h2></div><span className="muted">{completedRounds.length} {t('rounds')}</span></div>
                <button className={`member-row featured ${focusedParticipantId === active.id ? 'focused' : ''}`} onClick={() => focusParticipant(active.id)}>{active.imageUrl ? <img className="participant-avatar" src={active.imageUrl} alt="" /> : <span className="member-dot" style={{ background: active.color }} />}<strong>{active.name}</strong><span className="member-stat">{t('active')}</span></button>
                <button className={`member-row featured ${focusedParticipantId === next.id ? 'focused' : ''}`} onClick={() => focusParticipant(next.id)}>{next.imageUrl ? <img className="participant-avatar" src={next.imageUrl} alt="" /> : <span className="member-dot" style={{ background: next.color }} />}<strong>{next.name}</strong><span className="member-stat">{t('nextUp')}</span><span className="next-tag">NEXT</span></button>
                <div className="next-estimate"><span>{t('estimatedFinish')}</span><strong>{activeRound && typicalDuration !== undefined ? formatClock(new Date(new Date(activeRound.startedAt).getTime() + typicalDuration * 1000).toISOString(), true) : '--:--'}</strong></div>
              </div>
              <div className="panel schedule"><div className="section-heading"><div><p className="eyebrow">TEAM ROTATION</p><h2>{t('restingOrder')}</h2></div><span className="muted">{t('longestRest')}</span></div>
                {state.members.filter((member) => member.id !== active.id && member.id !== next.id).sort((a, b) => {
                  const lastA = [...completedRounds].reverse().find((round) => round.participantId === a.id)?.finishedAt;
                  const lastB = [...completedRounds].reverse().find((round) => round.participantId === b.id)?.finishedAt;
                  if (!lastA && !lastB) return 0;
                  if (!lastA) return -1;
                  if (!lastB) return 1;
                  return new Date(lastA).getTime() - new Date(lastB).getTime();
                }).map((member) => {
                  const lastRound = [...completedRounds].reverse().find((round) => round.participantId === member.id);
                  return <button className={`member-row ${focusedParticipantId === member.id ? 'focused' : ''}`} key={member.id} onClick={() => focusParticipant(member.id)}>{member.imageUrl ? <img className="participant-avatar" src={member.imageUrl} alt="" /> : <span className="member-dot" style={{ background: member.color }} />}<strong>{member.name}</strong><span className="member-stat">{lastRound ? `Last ${formatClock(lastRound.finishedAt)}` : t('ready')}</span></button>;
                })}
              </div>
            </div>
          </section>
          <section className="panel planned-schedule"><div className="section-heading"><div><p className="eyebrow">{t('plannedRelay')}</p><h2>{t('tuneIn')}</h2></div><span className="muted">{t('liveOverride')}</span></div>{scheduleError && <p className="sync-message">{scheduleError}</p>}{remainingSchedule.length === 0 ? <p className="empty">{t('noSchedule')}</p> : <><div className="planned-list">{visibleSchedule.map((item) => { const member = state.members.find((candidate) => candidate.name.toLowerCase() === item.participant.toLowerCase()); const isCurrent = item.phase === state.phase && item.participant.toLowerCase() === active.name.toLowerCase(); return <div className={`planned-row ${isCurrent ? 'current' : ''}`} key={`${item.phase}-${item.loop}`}><span className="planned-phase">{item.phase}</span><span className="planned-loop">#{item.loop}</span>{member?.imageUrl ? <img className="participant-avatar" src={member.imageUrl} alt="" /> : <span className="member-dot" style={{ background: member?.color ?? '#999' }} />}<strong>{item.participant}</strong><span className="planned-time">{scheduleDate(item.start, language)} · {scheduleClock(item.start, language)}–{scheduleClock(item.end, language)}</span><b>{item.duration}</b></div>; })}</div><div className="schedule-pagination"><button className="refresh-button" onClick={() => setSchedulePage((page) => Math.max(0, page - 1))} disabled={schedulePage === 0}>{t('previous')}</button><span>{t('page')} {schedulePage + 1} / {schedulePageCount}</span><button className="refresh-button" onClick={() => setSchedulePage((page) => Math.min(schedulePageCount - 1, page + 1))} disabled={schedulePage >= schedulePageCount - 1}>{t('next')}</button></div></>}</section>
          <section className="panel history"><div className="section-heading"><div><p className="eyebrow">ROUND LOG</p><h2>{t('latestRounds')}</h2></div></div>{paceError && <p className="sync-message">{paceError}</p>}
            {completedRounds.length === 0 ? <p className="empty">{t('noRounds')}</p> : <><div className="round-list">{visibleRounds.map((round) => { const member = state.members.find((item) => item.id === round.participantId); const duration = (new Date(round.finishedAt!).getTime() - new Date(round.startedAt).getTime()) / 1000; return <div className="round-row" key={round.id}><span className="round-number">{round.number}</span><strong>{member?.name}<small className="round-phase">{round.phase} · {phases.find((item) => item.name === round.phase)?.distance}</small></strong><span>{formatClock(round.startedAt)} → {formatClock(round.finishedAt)}</span><b>{formatDurationWithSeconds(duration)}</b></div>; })}</div>{roundsPageCount > 1 && <div className="schedule-pagination"><button className="refresh-button" onClick={() => setRoundsPage(Math.max(0, currentRoundsPage - 1))} disabled={currentRoundsPage === 0}>{t('previous')}</button><span>{t('page')} {currentRoundsPage + 1} / {roundsPageCount}</span><button className="refresh-button" onClick={() => setRoundsPage(Math.min(roundsPageCount - 1, currentRoundsPage + 1))} disabled={currentRoundsPage >= roundsPageCount - 1}>{t('next')}</button></div>}</>}
          </section>
          <section className="panel team-introduction">
            <div className="team-intro-hero">
              <img className="team-photo" src="/data/team.JPEG" alt="Team Smi at the 24-hour triathlon" />
              <div className="team-intro-copy">
                <p className="eyebrow">{t('meetTeam')}</p>
                <h2>{language === 'de' ? '🇫🇷 Team Smi – 6 gemeldet, 5 am Start, 0 Ahnung' : '🇫🇷 Team Smi – 6 registered, 5 starting, 0 clue'}</h2>
                <p>{language === 'de' ? '24 Stunden. Ein Staffel-Triathlon. Südfrankreich. Fünf Athlet:innen, die für sechs gemeldet sind. Kaum Vorbereitung, null Sprachkenntnisse und ein Team, bei dem die größte sportliche Leistung vielleicht schon die Anreise ist. Bienvenue bei Team Smi! 🇫🇷🚴‍♀️🏊‍♂️🏃‍♂️' : '24 hours. A relay triathlon. Southern France. Five athletes registered as six. Barely any preparation, no French, and a team whose greatest athletic achievement may already be the journey here. Bienvenue Team Smi! 🇫🇷🚴‍♀️🏊‍♂️🏃‍♂️'}</p>
                <p>{language === 'de' ? 'Unser Plan? Gibt es nicht. Unser Training? Überschaubar. Unsere Französischkenntnisse? Reichen gerade so für Bonjour, Merci und im Notfall Croissant. Aber hey, wir sind hier, um 24 Stunden lang alles zu geben.' : 'Our plan? Non-existent. Our training? Modest. Our French? Enough for Bonjour, Merci and, in an emergency, Croissant. But hey, we are here to give everything for 24 hours.'}</p>
              </div>
            </div>
            <div className="profile-grid">
              {participantProfiles.map((profile) => <article className="profile-card" key={profile.name}>
                <div className="profile-heading">
                  {profile.imageUrl ? <img className="profile-avatar" src={profile.imageUrl} alt="" /> : <span className="profile-emoji">{profile.emoji}</span>}
                  <div><h3>{profile.emoji} {profile.name}</h3><p>{language === 'de' ? profile.title : participantProfilesEn[profile.name].title}</p></div>
                </div>
                <p><strong>{t('strength')}</strong> {language === 'de' ? profile.strength : participantProfilesEn[profile.name].strength}</p>
                <p><strong>{t('weakness')}</strong> {language === 'de' ? profile.weakness : participantProfilesEn[profile.name].weakness}</p>
              </article>)}
            </div>
            <div className="mission-copy">
              <h3>🏆 {t('mission')}</h3>
              <p>{language === 'de' ? 'Wir treten an, um zu beweisen, dass man für einen 24-Stunden-Staffel-Triathlon nicht zwingend monatelanges Training, perfekte Ausrüstung oder Sprachkenntnisse braucht.' : 'We are here to prove that a 24-hour relay triathlon does not require months of training, perfect equipment or language skills.'}</p>
              <p>{language === 'de' ? 'Man braucht:' : 'You need:'}</p>
              <ul>
                {language === 'de' ? <><li>eine Schwimmerin, die den Wasserstand persönlich senkt,</li><li>einen Radfahrer mit Giro-Erfahrung und einem Immunsystem auf Bewährung,</li><li>einen Webmaster mit Knieproblemen,</li><li>eine Bergziege mit Schulterbaustelle,</li><li>einen Seestern auf dem Weg zur Radkarriere,</li><li>und eine Managerin, die bis gestern noch ein normales Leben hatte.</li></> : <><li>a swimmer who personally lowers the water level,</li><li>a Giro-trained cyclist with an immune system on probation,</li><li>a webmaster with knee problems,</li><li>a mountain goat with a shoulder situation,</li><li>a starfish on the road to a cycling career,</li><li>and a manager who had a normal life until yesterday.</li></>}
              </ul>
              <p className="mission-finale">Allez, Team Smi! 🇫🇷🔥</p>
            </div>
          </section>
        </>
      <footer><span>{t('sharedState')}</span><span>{t('etaNote')}</span></footer>
    </main>
  );
}

export default App;
