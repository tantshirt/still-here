import './generated/tokens.css';
import './ui/fonts.css';
import './ui/threshold.css';
import { createApp, selectApp } from './app';
import type { AppContext, AppEvent } from './app';
import { createAudio } from './audio';
import type { AudioPort } from './audio';
import { createInput } from './input';
import { createRenderer } from './render';
import type { FrameOutput, RenderPort } from './render';
import { createSession, createSimulation } from './sim';
import type { SimPort } from './sim';
import { createUi } from './ui';
import type { UiPort } from './ui';
export interface FramePorts {
  readonly sim: SimPort;
  readonly app: { send(event: AppEvent): void; getSnapshot(): { readonly context: AppContext } };
  readonly render: RenderPort;
  readonly audio: AudioPort;
  readonly ui: UiPort;
}
/** One frame transaction: emitted app events settle before any view reads state. */
export function runFrame(ports: FramePorts, dt: number, previous: FrameOutput): FrameOutput {
  const { snapshot, events } = ports.sim.step(dt, { fps: previous.fps });
  for (const event of events) ports.app.send(event);
  const state = ports.app.getSnapshot().context;
  const output = ports.render.draw(snapshot, selectApp(state));
  ports.audio.update(snapshot.started);
  const { session, ...uiState } = state;
  void session; // Session mutation belongs to app/sim, never to views.
  ports.ui.update(snapshot, uiState, output);
  return output;
}
export interface FrameScheduler { request(callback: FrameRequestCallback): number; cancel(id: number): void }
/** Single owner of the rAF chain. stop() cancels the pending frame. */
export function startFrameLoop(ports: FramePorts, scheduler: FrameScheduler, onFirstFrame?: () => void): () => void {
  let previousTime: number | undefined;
  let previouslyActive = false;
  let firstFrame = true;
  let output: FrameOutput = { teaserAnchor: null, fps: 0 };
  let active = true;
  let frameId: number;
  const tick: FrameRequestCallback = time => {
    if (!active) return;
    const elapsed = previousTime === undefined ? 0 : Math.min(Math.max((time - previousTime) / 1000, 0), 0.1);
    previousTime = time;
    const sceneActive = selectApp(ports.app.getSnapshot().context).sceneActive;
    output = runFrame(ports, sceneActive && previouslyActive ? elapsed : 0, output);
    previouslyActive = sceneActive;
    if (firstFrame) { firstFrame = false; onFirstFrame?.(); }
    if (active) frameId = scheduler.request(tick);
  };
  frameId = scheduler.request(tick);
  return () => { active = false; scheduler.cancel(frameId); };
}
export function chooseSeed(search: string, random: Pick<Crypto, 'getRandomValues'>): number {
  const captured = new URLSearchParams(search).get('seed');
  if (captured !== null && /^\d+$/.test(captured)) {
    const value = Number(captured);
    if (Number.isSafeInteger(value) && value <= 0xffffffff) return value;
  }
  return random.getRandomValues(new Uint32Array(1))[0]!;
}
function boot(): void {
  const session = createSession(chooseSeed(window.location.search, crypto));
  const sim = createSimulation(session);
  const audio = createAudio();
  const app = createApp({ session, sim, audio, nowYear: new Date().getUTCFullYear() });
  app.start();
  const render = createRenderer();
  const root = document.getElementById('app');
  if (!root) throw new Error('Missing application root');
  const ui = createUi(root);
  // Settle presentation on the gesture stack, independent of the next frame.
  const subscription = app.subscribe(({ context }) => {
    const { session: _session, ...state } = context;
    void _session;
    ui.present(state);
  });
  const input = createInput(root, event => app.send(event));
  const stop = startFrameLoop(
    { sim, app, audio, render, ui },
    { request: callback => requestAnimationFrame(callback), cancel: id => cancelAnimationFrame(id) },
    () => { document.documentElement.dataset.appReady = 'true'; },
  );
  import.meta.hot?.dispose(() => {
    stop();
    input.dispose();
    subscription.unsubscribe();
    app.stop();
    render.dispose();
    audio.dispose();
    ui.dispose();
    delete document.documentElement.dataset.appReady;
  });
}
if (typeof document !== 'undefined') boot();
