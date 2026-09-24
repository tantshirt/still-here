export const streamNames = ['layout', 'birthPhase', 'deathPhase', 'sway', 'attention', 'reflection'] as const;
export type StreamName = typeof streamNames[number];
export type RandomStream = () => number;
export interface SessionSeed {
  readonly seed: number;
  readonly streams: Readonly<Record<StreamName, RandomStream>>;
  nextEventId: number;
  nextActorId: number;
  reflectionBag: string[];
  keyChangeSpent: boolean;
}
// Hash each name separately so consuming one stream cannot advance another.
export function createStream(seed: number, name: StreamName): RandomStream {
  let state = seed >>> 0;
  for (const character of name) state = Math.imul(state ^ character.charCodeAt(0), 16777619) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
export function createSession(seed: number): SessionSeed {
  return {
    seed: seed >>> 0,
    streams: Object.fromEntries(streamNames.map(name => [name, createStream(seed, name)])) as Record<StreamName, RandomStream>,
    nextEventId: 0, nextActorId: 0, reflectionBag: [], keyChangeSpent: false,
  };
}
