import './generated/tokens.css';
import './ui/fonts.css';
import './ui/threshold.css';
import './ui/scene.css';
import { createApp, selectApp } from './app';
import type { AppContext, AppEvent } from './app';
import { createAudio } from './audio';
import type { AudioPort } from './audio';
import { loadConstants, loadWorld } from './data';
import { createInput } from './input';
import { createRenderer } from './render';
import type { FrameOutput, RenderPort } from './render';
import { createSession, createSimulation } from './sim';
import type { SimPort } from './sim';
import { tokens } from './generated/tokens';
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
  const output = ports.render.draw(snapshot, selectApp(state), dt);
  ports.audio.update(snapshot.started);
  const { session, ...uiState } = state;
  void session;
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

function secondsInYear(year: number): number {
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return (leap ? 366 : 365) * 86_400;
}

function boot(): void {
  const session = createSession(chooseSeed(window.location.search, crypto));
  const sim = createSimulation(session);
  const audio = createAudio();
  const app = createApp({ session, sim, audio, nowYear: new Date().getUTCFullYear() });
  app.start();
  const root = document.getElementById('app');
  if (!root) throw new Error('Missing application root');
  const ui = createUi(root);
  const canvasHolder = document.createElement('div');
  canvasHolder.hidden = true;
  document.body.append(canvasHolder);
  const render = createRenderer({
    mount: () => root.querySelector('.scene-surface') ?? canvasHolder,
    sendAppEvent: event => app.send(event),
  });

  async function prepareScene(): Promise<void> {
    try {
      const constants = await loadConstants();
      const world = await loadWorld();
      const { nowYear, selection } = app.getSnapshot().context;
      const year = selection.when.kind === 'now' ? nowYear : selection.when.year;
      if (year === null) throw new Error('missing year');
      const entry = world.years[String(year)];
      if (entry === null || entry === undefined) throw new Error('missing world year');
      const seconds = secondsInYear(year);
      sim.applySelection(
        { birthsPerSecond: entry.births / seconds, deathsPerSecond: entry.deaths / seconds },
        entry.population,
        constants.Pmax,
      );
      while (app.getSnapshot().context.phase === 'opening') {
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      }
      await render.prepare();
      app.send({ type: 'SCENE_READY' });
    } catch {
      app.send({ type: 'FALLBACK', reason: 'noWorldData' });
    }
  }

  // Defer heavy WebGL prep until after the first paint so threshold CSS animations stay smooth.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => { void prepareScene(); });
  });

  let lastPhase = app.getSnapshot().context.phase;
  const subscription = app.subscribe(({ context }) => {
    const { session: _session, ...state } = context;
    void _session;
    if (lastPhase === 'fallback' && context.phase === 'preparing') {
      void render.retry()
        .then(() => app.send({ type: 'SCENE_READY' }))
        .catch(() => app.send({ type: 'FALLBACK', reason: 'initTimeout' }));
    }
    lastPhase = context.phase;
    ui.present(state);
  });

  const input = createInput(root, event => app.send(event));
  document.addEventListener('still-here-retry', () => app.send({ type: 'RETRY' }));
  const viewportQuery = window.matchMedia(`(min-width: ${tokens.layout.breakpoint})`);
  let viewportScheduled = false;
  const flushViewport = () => {
    viewportScheduled = false;
    app.send({ type: 'VIEWPORT_CLASS', value: viewportQuery.matches ? 'wide' : 'compact' });
  };
  const scheduleViewport = () => {
    if (viewportScheduled) return;
    viewportScheduled = true;
    requestAnimationFrame(flushViewport);
  };
  scheduleViewport();
  viewportQuery.addEventListener('change', scheduleViewport);
  window.addEventListener('resize', scheduleViewport);
  document.addEventListener('visibilitychange', () => {
    app.send({ type: 'VISIBILITY', visible: document.visibilityState === 'visible' });
  });

  const stop = startFrameLoop(
    { sim, app, audio, render, ui },
    { request: callback => requestAnimationFrame(callback), cancel: id => cancelAnimationFrame(id) },
    () => { document.documentElement.dataset.appReady = 'true'; },
  );

  import.meta.hot?.dispose(() => {
    stop();
    input.dispose();
    subscription.unsubscribe();
    viewportQuery.removeEventListener('change', scheduleViewport);
    window.removeEventListener('resize', scheduleViewport);
    app.stop();
    render.dispose();
    audio.dispose();
    ui.dispose();
    canvasHolder.remove();
    delete document.documentElement.dataset.appReady;
  });
}

if (typeof document !== 'undefined') boot();
