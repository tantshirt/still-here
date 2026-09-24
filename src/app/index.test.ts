import { afterEach, expect, it, vi } from 'vitest';
import { createApp, selectApp } from './index';
import { createAudio } from '../audio';
import { createSession, createSimulation } from '../sim';
function fixture() {
  const session = createSession(42);
  const sim = createSimulation(session);
  const audio = createAudio();
  const unlock = vi.spyOn(audio, 'unlock');
  const presentation = vi.spyOn(sim, 'setPresentation');
  const app = createApp({ session, sim, audio, nowYear: 2026, getSceneT: () => 0, captureStill: false });
  app.start();
  return { app, unlock, presentation };
}
afterEach(() => vi.useRealTimers());
it('accepts entry synchronously once and holds exactly 400ms without restarting', () => {
  vi.useFakeTimers();
  const { app, unlock } = fixture();
  expect(app.getSnapshot().value).toBe('opening');
  expect(unlock).not.toHaveBeenCalled();
  app.send({ type: 'ENTER' });
  expect(unlock).toHaveBeenCalledTimes(1);
  expect(app.getSnapshot().context.phase).toBe('cut');
  vi.advanceTimersByTime(200);
  app.send({ type: 'ENTER' });
  vi.advanceTimersByTime(199);
  expect(app.getSnapshot().value).toBe('cut');
  vi.advanceTimersByTime(1);
  expect(app.getSnapshot().value).toBe('preparing');
  expect(selectApp(app.getSnapshot().context).sceneActive).toBe(false);
  app.send({ type: 'ENTER' });
  expect(app.getSnapshot().context.phase).toBe('preparing');
  expect(unlock).toHaveBeenCalledTimes(1);
  app.stop();
});
it('owns initial and live simulation presentation in every lifecycle phase', () => {
  vi.useFakeTimers();
  const { app, presentation } = fixture();
  expect(presentation).toHaveBeenLastCalledWith({ reducedMotion: false, budgetB: 800 });
  for (const enabled of [true, false]) {
    app.send({ type: 'REDUCED_MOTION_CHANGED', enabled });
    expect(app.getSnapshot().context.reducedMotion).toBe(enabled);
    expect(presentation).toHaveBeenLastCalledWith({ reducedMotion: enabled, budgetB: 800 });
  }
  app.send({ type: 'ENTER' });
  app.send({ type: 'REDUCED_MOTION_CHANGED', enabled: true });
  expect(presentation).toHaveBeenLastCalledWith({ reducedMotion: true, budgetB: 800 });
  vi.advanceTimersByTime(400);
  app.send({ type: 'REDUCED_MOTION_CHANGED', enabled: false });
  expect(presentation).toHaveBeenLastCalledWith({ reducedMotion: false, budgetB: 800 });
  app.stop();
});
it('cancels the cut timer on disposal', () => {
  vi.useFakeTimers();
  const { app } = fixture();
  app.send({ type: 'ENTER' });
  app.stop();
  vi.advanceTimersByTime(400);
  expect(app.getSnapshot().context.phase).toBe('cut');
});
it('recovers from an init timeout when the scene finishes building late', () => {
  vi.useFakeTimers();
  const { app } = fixture();
  app.send({ type: 'ENTER' });
  vi.advanceTimersByTime(400);
  vi.advanceTimersByTime(10_000);
  expect(app.getSnapshot().context).toMatchObject({ phase: 'fallback', fallback: 'initTimeout' });
  app.send({ type: 'SCENE_READY' });
  expect(app.getSnapshot().context).toMatchObject({ phase: 'ready', ready: true, fallback: null });
  app.stop();
});
it('stays in fallback when a late ready follows a real scene failure', () => {
  vi.useFakeTimers();
  const { app } = fixture();
  app.send({ type: 'ENTER' });
  vi.advanceTimersByTime(400);
  app.send({ type: 'FALLBACK', reason: 'noWebGL' });
  app.send({ type: 'SCENE_READY' });
  expect(app.getSnapshot().context.phase).toBe('fallback');
  app.stop();
});
