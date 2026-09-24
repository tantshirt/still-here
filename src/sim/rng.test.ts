import { describe, expect, it } from 'vitest';
import { createSession, createSimulation, createStream, streamNames } from './index';
describe('session randomness', () => {
  it('reproduces every named stream with bounded values', () => {
    for (const name of streamNames) {
      const first = createStream(4294967295, name);
      const second = createStream(4294967295, name);
      for (let index = 0; index < 1000; index++) {
        const value = first();
        expect(value).toBe(second());
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    }
  });
  it('keeps all other streams independent from layout consumption', () => {
    const first = createSession(42);
    const second = createSession(42);
    for (let index = 0; index < 1000; index++) first.streams.layout();
    for (const name of streamNames.filter(name => name !== 'layout')) {
      expect(first.streams[name]()).toBe(second.streams[name]());
    }
    expect(new Set(streamNames.map(name => createStream(42, name)())).size).toBe(streamNames.length);
  });
  it('retains counters, bag, caption one-shot and stream progress across simulation recreation', () => {
    const session = createSession(12);
    const reference = createSession(12);
    const first = createSimulation(session);
    for (let index = 0; index < 7; index++) {
      session.streams.reflection();
      reference.streams.reflection();
    }
    session.nextEventId = 41; session.nextActorId = 19;
    session.reflectionBag.push('r7'); session.keyChangeSpent = true;
    const second = createSimulation(session);
    expect(second.session).toBe(first.session);
    expect(second.session.streams.reflection()).toBe(reference.streams.reflection());
    expect(second.session).toMatchObject({ seed: 12, nextEventId: 41, nextActorId: 19, reflectionBag: ['r7'], keyChangeSpent: true });
    expect(second.step(0, { fps: 60 }).snapshot).toMatchObject({ standing: { count: 0, slots: [] }, actors: [], started: [] });
  });
});
