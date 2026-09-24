import { describe, expect, it } from 'vitest';
import { tokens } from '../generated/tokens';
import { createAttention } from './attention';
import { createSession } from './rng';
import type { Actor } from './types';

const eventDuration = tokens.motion.event / 1000;
const catalog = ['postponement-01', 'postponement-02'];

function death(actorId: number, tStart: number): Actor {
  return {
    kind: 'death',
    id: actorId,
    actorId,
    actorSlot: 0,
    standingIndex: 2,
    tStart,
  };
}

function baseInput(sceneT: number, dt: number, started: Actor[] = []) {
  return {
    dt,
    active: true,
    attentionPaused: false,
    captionEligible: true,
    departuresVisible: true,
    deathsPerSecond: 1,
    catalogIds: catalog,
    sceneT,
    started,
    actors: started,
  };
}

describe('attention', () => {
  it('waits 6 visible seconds before noticing', () => {
    const attention = createAttention(createSession(1));
    let sceneT = 0;
    while (sceneT < 5.9) {
      sceneT += 0.1;
      attention.step(baseInput(sceneT, 0.1));
    }
    expect(attention.step(baseInput(sceneT, 0, [death(1, sceneT)])).some(event => event.type === 'REFLECTION_RESERVED')).toBe(false);
    sceneT += 0.1;
    expect(attention.step(baseInput(sceneT, 0.1, [death(2, sceneT)])).some(event => event.type === 'REFLECTION_RESERVED')).toBe(true);
  });

  it('keeps a 20s cooldown at fast speed', () => {
    const attention = createAttention(createSession(2));
    let sceneT = 0;
    for (let index = 0; index < 60; index += 1) {
      sceneT += 0.1;
      attention.step(baseInput(sceneT, 0.1));
    }
    sceneT += 0.1;
    expect(attention.step(baseInput(sceneT, 0.1, [death(1, sceneT)])).some(event => event.type === 'REFLECTION_RESERVED')).toBe(true);
    attention.release(sceneT);
    for (let index = 0; index < 199; index += 1) {
      sceneT += 0.1;
      attention.step(baseInput(sceneT, 0.1));
    }
    expect(attention.step(baseInput(sceneT, 0, [death(2, sceneT)]))).toEqual([]);
    sceneT += 0.1;
    attention.step(baseInput(sceneT, 0.1));
    sceneT += 0.1;
    expect(attention.step(baseInput(sceneT, 0.1, [death(3, sceneT)])).some(event => event.type === 'REFLECTION_RESERVED')).toBe(true);
  });

  it('emits REFLECTION_READY after the event duration', () => {
    const attention = createAttention(createSession(3));
    let sceneT = 0;
    for (let index = 0; index < 60; index += 1) {
      sceneT += 0.1;
      attention.step(baseInput(sceneT, 0.1));
    }
    sceneT += 0.1;
    attention.step(baseInput(sceneT, 0.1, [death(1, sceneT)]));
    sceneT += eventDuration;
    const ready = attention.step(baseInput(sceneT, eventDuration));
    expect(ready).toEqual([{ type: 'REFLECTION_READY', reflectionId: expect.any(String) }]);
  });
});
