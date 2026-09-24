import { tokens } from '../generated/tokens';
import type { SessionSeed } from './rng';
import { drawReflectionId } from './reflections';
import type { Actor, SimAppEvent } from './types';

export type ReflectionSlotPhase = 'idle' | 'reserved' | 'ready';

export interface AttentionSnapshot {
  readonly phase: ReflectionSlotPhase;
  readonly actorId: number | null;
  readonly standingIndex: number | null;
  readonly reflectionId: string | null;
}

export interface AttentionStepInput {
  readonly dt: number;
  readonly active: boolean;
  readonly attentionPaused: boolean;
  readonly captionEligible: boolean;
  readonly departuresVisible: boolean;
  readonly deathsPerSecond: number;
  readonly catalogIds: readonly string[];
  readonly sceneT: number;
  readonly started: readonly Actor[];
  readonly actors: readonly Actor[];
}

const gateSeconds = 6;
const cooldownSeconds = 20;
const eventDuration = tokens.motion.event / 1000;

export function createAttention(session: SessionSeed) {
  let phase: ReflectionSlotPhase = 'idle';
  let actorId: number | null = null;
  let standingIndex: number | null = null;
  let reflectionId: string | null = null;
  let cooldownUntil = 0;
  let visibleUnpausedSeconds = 0;
  let armed = false;
  let firstFallSeen = false;
  let reservedAt: number | null = null;

  function snapshot(): AttentionSnapshot {
    return { phase, actorId, standingIndex, reflectionId };
  }

  function release(sceneT: number): void {
    if (phase === 'idle') return;
    phase = 'idle';
    actorId = null;
    standingIndex = null;
    reflectionId = null;
    reservedAt = null;
    cooldownUntil = sceneT + cooldownSeconds;
  }

  function restore(slot: AttentionSnapshot): void {
    phase = slot.phase;
    actorId = slot.actorId;
    standingIndex = slot.standingIndex;
    reflectionId = slot.reflectionId;
    reservedAt = slot.phase === 'ready' ? 0 : null;
  }

  function resetTiming(): void {
    visibleUnpausedSeconds = 0;
    armed = false;
  }

  function canNotice(input: AttentionStepInput): boolean {
    return input.active
      && !input.attentionPaused
      && input.departuresVisible
      && input.deathsPerSecond > 0
      && input.catalogIds.length > 0
      && phase === 'idle'
      && input.sceneT >= cooldownUntil
      && armed;
  }

  function step(input: AttentionStepInput): readonly SimAppEvent[] {
    const events: SimAppEvent[] = [];
    if (input.active && !input.attentionPaused) {
      visibleUnpausedSeconds += input.dt;
      if (!armed && visibleUnpausedSeconds >= gateSeconds) armed = true;
    }

    for (const event of input.started) {
      if (event.kind !== 'death') continue;
      if (!firstFallSeen && input.captionEligible && input.departuresVisible && input.active && !input.attentionPaused) {
        firstFallSeen = true;
        events.push({ type: 'FIRST_FALL_SEEN', sceneT: input.sceneT });
      }
      if (!canNotice(input)) continue;
      const id = drawReflectionId(session, input.catalogIds);
      if (!id) continue;
      phase = 'reserved';
      actorId = event.actorId;
      standingIndex = event.standingIndex;
      reflectionId = id;
      reservedAt = event.tStart;
      events.push({ type: 'REFLECTION_RESERVED', reflectionId: id, actorId: event.actorId });
    }

    if (phase === 'reserved' && reflectionId && reservedAt !== null && input.sceneT >= reservedAt + eventDuration) {
      phase = 'ready';
      events.push({ type: 'REFLECTION_READY', reflectionId });
    }

    return events;
  }

  return { snapshot, release, restore, resetTiming, step };
}
