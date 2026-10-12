import { Phase, Round } from './types';

export type PerformancePhase = {
  phase: Phase;
  rounds: number;
  distanceKm: number;
  measuredSeconds: number;
  averageValue?: number;
};

export type AthletePerformance = {
  rounds: Round[];
  measuredRounds: Round[];
  totalDistanceKm: number;
  totalSeconds: number;
  measuredSeconds: number;
  phases: PerformancePhase[];
  fastestMeasuredRound?: Round;
};

const phaseDistances: Record<Phase, number> = {
  'Run 1': 2.5,
  Bike: 21,
  'Run 2': 4,
};

export function isSharedRound(round: Round) {
  return round.participantIds.length > 1;
}

export function buildAthletePerformance(rounds: Round[], athleteId: string): AthletePerformance {
  const athleteRounds = rounds
    .filter((round) => round.finishedAt && (round.participantIds.includes(athleteId) || round.participantId === athleteId))
    .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
  const measuredRounds = athleteRounds.filter((round) => !isSharedRound(round));
  const durationOf = (round: Round) => (new Date(round.finishedAt!).getTime() - new Date(round.startedAt).getTime()) / 1000;
  const phases = (Object.keys(phaseDistances) as Phase[]).map((phase) => {
    const phaseRounds = athleteRounds.filter((round) => round.phase === phase);
    const measuredPhaseRounds = measuredRounds.filter((round) => round.phase === phase);
    const distanceKm = phaseRounds.length * phaseDistances[phase];
    const measuredDistanceKm = measuredPhaseRounds.length * phaseDistances[phase];
    const measuredSeconds = measuredPhaseRounds.reduce((sum, round) => sum + durationOf(round), 0);
    return {
      phase,
      rounds: phaseRounds.length,
      distanceKm,
      measuredSeconds,
      averageValue: measuredDistanceKm > 0 && measuredSeconds > 0
        ? phase === 'Bike' ? (measuredDistanceKm / measuredSeconds) * 3600 : measuredSeconds / 60 / measuredDistanceKm
        : undefined,
    };
  });
  const fastestMeasuredRound = measuredRounds.reduce<Round | undefined>((fastest, round) => {
    if (!fastest) return round;
    const roundValue = phaseDistances[round.phase] / durationOf(round);
    const fastestValue = phaseDistances[fastest.phase] / durationOf(fastest);
    return roundValue > fastestValue ? round : fastest;
  }, undefined);
  return {
    rounds: athleteRounds,
    measuredRounds,
    totalDistanceKm: athleteRounds.reduce((sum, round) => sum + phaseDistances[round.phase], 0),
    totalSeconds: athleteRounds.reduce((sum, round) => sum + durationOf(round), 0),
    measuredSeconds: measuredRounds.reduce((sum, round) => sum + durationOf(round), 0),
    phases,
    fastestMeasuredRound,
  };
}

export function distanceForPhase(phase: Phase) {
  return phaseDistances[phase];
}
