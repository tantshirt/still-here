import { expect, it, vi } from 'vitest';
import { createApp, selectApp } from './app';
import type { AppContext } from './app';
import { createAudio } from './audio';
import { createSession, createSimulation } from './sim';
import type { SimEvent } from './sim';
import { STILL_CAPTURE_SEED } from './still-assets';
import { chooseSeed, runFrame, startFrameLoop } from './main';
import type { FramePorts } from './main';
function fixture() {
  const session = createSession(42);
  const sim = createSimulation(session);
  const audio = createAudio();
  const app = createApp({ session, sim, audio, nowYear: 2026, getSceneT: () => 0 });
  app.start();
  return { sim, audio, app };
}
it('settles application events before render, edge audio and UI', () => {
  const base = fixture();
  const order: string[] = [];
  const started: readonly SimEvent[] = [{ kind: 'death', id: 1, actorSlot: 2, standingIndex: 3, tStart: 0 }];
    let context: AppContext = { ...base.app.getSnapshot().context, ready: true, phase: 'ready' };
  const snapshot = { ...base.sim.step(0, { fps: 60 }).snapshot, started };
  const output = { fps: 60, teaserAnchor: { x: 4, y: 5 } };
  const ports: FramePorts = {
    sim: {
      ...base.sim,
      step: () => { order.push('step'); return { snapshot, events: [{ type: 'FIRST_FALL_SEEN', sceneT: 0 }] }; },
      setAttentionPaused: () => {},
      setCaptionEligible: () => {},
    },
    app: { send: () => { order.push('app'); context = { ...context, ready: true, phase: 'ready' }; }, getSnapshot: () => ({ context }) },
    render: { draw: (_received, selectors, dt) => { order.push('render'); expect(selectors.sceneActive).toBe(true); expect(dt).toBeGreaterThan(0); return output; }, dispose() {}, prepare: async () => {}, retry: async () => {} },
    audio: { ...base.audio, update: received => { order.push('audio'); expect(received).toBe(started); } },
    ui: { update: (received, state, frame) => { order.push('ui'); expect(frame).toBe(output); expect(received).toBe(snapshot); expect(state.ready).toBe(true); expect(state).not.toHaveProperty('session'); }, dispose() {} },
  };
  expect(runFrame(ports, 0.016, { fps: 0, teaserAnchor: null })).toBe(output);
  expect(order).toEqual(['step', 'app', 'render', 'audio', 'ui']);
});
it('owns exactly one cancellable frame chain and clamps elapsed time', () => {
  const base = fixture();
  const callbacks = new Map<number, FrameRequestCallback>();
  let id = 0;
  const step = vi.spyOn(base.sim, 'step');
  const ports: FramePorts = { ...base,
    app: { send() {}, getSnapshot: () => ({ context: { ...base.app.getSnapshot().context, ready: true, phase: 'ready' } }) },
    render: { draw: () => ({ fps: 60, teaserAnchor: null }), dispose() {}, prepare: async () => {}, retry: async () => {} },
    ui: { update() {}, dispose() {} },
  };
  const stop = startFrameLoop(ports, { request: callback => { callbacks.set(++id, callback); return id; }, cancel: key => { callbacks.delete(key); } });
  function fire(time: number) {
    expect(callbacks.size).toBe(1);
    const [key, callback] = [...callbacks][0]!;
    callbacks.delete(key); callback(time);
    expect(callbacks.size).toBe(1);
  }
  fire(0); fire(1000);
  expect(step.mock.calls.map(call => call[0])).toEqual([0, 0.1]);
  stop(); expect(callbacks.size).toBe(0);
});
it('preserves Now semantics and bounded boot year', () => {
  const { app } = fixture();
  const context = app.getSnapshot().context;
  expect(selectApp(context)).toMatchObject({ effectiveYear: 2026, isProjection: false });
  const historical: AppContext = { ...context, selection: { place: '001', when: { kind: 'year', year: 2026 } } };
  expect(selectApp(historical)).toMatchObject({ effectiveYear: 2026, isProjection: true });
  expect(selectApp({ ...context, nowYear: null }).effectiveYear).toBeNull();
});
it('uses valid capture seeds and cryptographic randomness otherwise', () => {
  const getRandomValues = vi.fn((array: Uint32Array) => { array[0] = 123; return array; }) as unknown as Crypto['getRandomValues'];
  expect(chooseSeed('?still&seed=999', { getRandomValues })).toBe(STILL_CAPTURE_SEED);
  expect(chooseSeed('?seed=0', { getRandomValues })).toBe(0);
  expect(chooseSeed('?seed=4294967295', { getRandomValues })).toBe(4294967295);
  for (const query of ['', '?seed=-1', '?seed=4294967296', '?seed=NaN']) expect(chooseSeed(query, { getRandomValues })).toBe(123);
  expect(getRandomValues).toHaveBeenCalledTimes(4);
});

it.each([
  ['not ready', { ready: false }],
  ['hidden', { visible: false }],
  ['paused', { pausedByUser: true }],
  ['fallback', { fallback: 'noWebGL' }],
] as const)('gates %s time and resumes without catch-up', (_name, inactive) => {
  const base = fixture();
  const active = { ...base.app.getSnapshot().context, ready: true, phase: 'ready' as const };
  let context: AppContext = active;
  let callback: FrameRequestCallback;
  const step = vi.spyOn(base.sim, 'step');
  const onFirstFrame = vi.fn();
  const ports: FramePorts = { ...base,
    app: { send() {}, getSnapshot: () => ({ context }) },
    render: { draw: () => ({ fps: 60, teaserAnchor: null }), dispose() {}, prepare: async () => {}, retry: async () => {} },
    ui: { update() {}, dispose() {} },
  };
  const stop = startFrameLoop(ports, { request: next => { callback = next; return 1; }, cancel() {} }, onFirstFrame);
  callback!(0);
  callback!(16);
  context = { ...active, ...inactive };
  callback!(32);
  callback!(1000);
  context = active;
  callback!(5000);
  callback!(5016);
  expect(step.mock.calls.map(call => call[0])).toEqual([0, 0.016, 0, 0, 0, 0.016]);
  expect(onFirstFrame).toHaveBeenCalledTimes(1);
  stop();
});
