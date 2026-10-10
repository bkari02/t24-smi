export type Phase = 'Run 1' | 'Bike' | 'Run 2';

export type TeamMember = {
  id: string;
  name: string;
  color: string;
  imageUrl?: string;
};

export type Round = {
  id: string;
  phase: Phase;
  participantId: string;
  number: number;
  startedAt: string;
  finishedAt?: string;
};

export type Location = {
  participantId: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  recordedAt: string;
};

export type EventState = {
  eventStartedAt: string;
  members: TeamMember[];
  phase: Phase;
  activeParticipantId: string;
  nextParticipantId: string;
  rounds: Round[];
  locations: Record<string, Location>;
};

export type SharedEvent = {
  id: string;
  eventStartedAt: string;
  phase: Phase;
  activeParticipantId: string;
  nextParticipantId: string;
};
