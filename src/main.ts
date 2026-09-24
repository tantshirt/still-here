import './generated/tokens.css';
import './ui/fonts.css';
import './ui/threshold.css';
import './ui/scene.css';
import { createApp, selectApp } from './app';
import type { AppContext, AppEvent } from './app';
import { loadSelection, secondsInYear, selectionKey } from './app/selection-loader';
import { createAudio } from './audio';
import type { AudioPort } from './audio';
import { loadConstants, loadPlaces, loadReflections, loadWorld } from './data';
import type { ReflectionRecord } from './data';
import type { PlaceMetadata } from './data';
import { createInput } from './input';
import { createRenderer } from './render';
import type { FrameOutput, RenderPort } from './render';
import { createSession, createSimulation } from './sim';
import type { SimPort } from './sim';
import { tokens } from './generated/tokens';
import { createUi } from './ui';
import { captionVisible } from './ui/scene-a11y';
import type { UiPort } from './ui';
import { isStillCapture, STILL_CAPTURE_SEED } from './still-assets';

export interface FramePorts {
  readonly sim: SimPort;
  readonly app: { send(event: AppEvent): void; getSnapshot(): { readonly context: AppContext } };
  readonly render: RenderPort;
  readonly audio: AudioPort;
  readonly ui: UiPort;
}

/** One frame transaction: emitted app events settle before any view reads state. */
export function runFrame(ports: FramePorts, dt: number, previous: FrameOutput): FrameOutput {
  const state = ports.app.getSnapshot().context;
  const sceneActive = selectApp(state).sceneActive;
  ports.sim.setAttentionPaused(state.overlay !== 'none' || state.show === 'arrivals');
  const { snapshot, events } = ports.sim.step(dt, { fps: previous.fps, active: sceneActive });
  for (const event of events) ports.app.send(event);
  ports.sim.setCaptionEligible(
    captionVisible(state, snapshot) && (state.show === 'both' || state.show === 'departures'),
  );
  const stateAfter = ports.app.getSnapshot().context;
  if (stateAfter.keyChangeStartedAt !== null
    && snapshot.sceneT >= stateAfter.keyChangeStartedAt + tokens.motion['key-change'] / 1000) {
    ports.app.send({ type: 'KEY_CHANGE_FINISHED' });
  }
  const selectors = selectApp(ports.app.getSnapshot().context, snapshot);
  const output = ports.render.draw(snapshot, selectors, dt);
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
  if (isStillCapture(search)) return STILL_CAPTURE_SEED;
  const captured = new URLSearchParams(search).get('seed');
  if (captured !== null && /^\d+$/.test(captured)) {
    const value = Number(captured);
    if (Number.isSafeInteger(value) && value <= 0xffffffff) return value;
  }
  return random.getRandomValues(new Uint32Array(1))[0]!;
}

function boot(): void {
  const stillCapture = isStillCapture(window.location.search);
  if (stillCapture) document.documentElement.dataset.stillCapture = 'true';
  const session = createSession(chooseSeed(window.location.search, crypto));
  const sim = createSimulation(session);
  let lastSceneT = 0;
  const audio = createAudio();
  const app = createApp({
    session,
    sim,
    audio,
    nowYear: new Date().getUTCFullYear(),
    getSceneT: () => lastSceneT,
    captureStill: stillCapture,
  });
  app.start();
  if (stillCapture) app.send({ type: 'ENTER' });
  const root = document.getElementById('app');
  if (!root) throw new Error('Missing application root');

  let places: readonly PlaceMetadata[] = [];
  const reflectionRecords = new Map<string, ReflectionRecord>();
  const ui = createUi(root, {
    getPlaces: () => places,
    getReflections: () => reflectionRecords,
    getSceneT: () => lastSceneT,
    send: event => app.send(event),
    stillCapture,
  });
  ui.present(app.getSnapshot().context);
  void loadPlaces().then(loaded => {
    places = loaded;
    ui.present(app.getSnapshot().context);
  });

  const canvasHolder = document.createElement('div');
  canvasHolder.hidden = true;
  document.body.append(canvasHolder);
  const render = createRenderer({
    mount: () => root.querySelector('.scene-surface') ?? canvasHolder,
    sendAppEvent: event => app.send(event),
  });

  async function applyInitialSelection(): Promise<void> {
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
      constants.rmax,
    );
  }

  async function markStillCaptureReady(): Promise<void> {
    for (let i = 0; i < 8; i += 1) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    }
    document.documentElement.dataset.stillCaptureReady = 'true';
  }

  async function prepareScene(): Promise<void> {
    try {
      await applyInitialSelection();
    } catch (error) {
      console.error('STILL HERE: world data failed to load', error);
      app.send({ type: 'FALLBACK', reason: 'noWorldData' });
      return;
    }
    try {
      if (stillCapture) {
        while (app.getSnapshot().context.phase === 'opening' || app.getSnapshot().context.phase === 'cut') {
          await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        }
        const { session: _session, ...state } = app.getSnapshot().context;
        void _session;
        ui.present(state);
      } else {
        while (app.getSnapshot().context.phase === 'opening') {
          await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        }
      }
      await render.prepare();
      app.send({ type: 'SCENE_READY' });
      if (stillCapture) await markStillCaptureReady();
    } catch (error) {
      console.error('STILL HERE: scene failed to start', error);
      app.send({ type: 'FALLBACK', reason: 'noWebGL' });
    }
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => { void prepareScene(); });
  });

  let loadGeneration = 0;
  let trackedPending: string | null = null;

  async function runPendingLoad(pending: AppContext['pending']): Promise<void> {
    if (!pending) return;
    const generation = ++loadGeneration;
    const result = await loadSelection(pending, app.getSnapshot().context.nowYear);
    if (generation !== loadGeneration) return;
    if (!result) {
      app.send({ type: 'SELECTION_UNAVAILABLE' });
      return;
    }
    app.send({
      type: 'SELECTION_LOADED',
      rates: result.rates,
      population: result.population,
      pmax: result.pmax,
      rmax: result.rmax,
    });
  }

  let lastPhase = app.getSnapshot().context.phase;
  const subscription = app.subscribe(({ context }) => {
    const { session: _session, ...state } = context;
    void _session;
    if (context.pending) {
      const key = selectionKey(context.pending);
      if (key !== trackedPending) {
        trackedPending = key;
        void runPendingLoad(context.pending);
      }
    } else {
      trackedPending = null;
    }
    if (lastPhase === 'fallback' && context.phase === 'preparing') {
      void render.retry()
        .then(() => app.send({ type: 'SCENE_READY' }))
        .catch(error => {
          console.error('STILL HERE: scene retry failed', error);
          app.send({ type: 'FALLBACK', reason: 'noWebGL' });
        });
    }
    lastPhase = context.phase;
    ui.present(state);
  });

  const input = createInput(root, event => app.send(event), {
    reflectionExpanded: () => app.getSnapshot().context.reflection.kind === 'expanded',
    getSceneT: () => lastSceneT,
  });
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

  void loadReflections()
    .then(records => {
      sim.setReflectionCatalog(records.map(record => record.id));
      for (const record of records) reflectionRecords.set(record.id, record);
    })
    .catch(() => sim.setReflectionCatalog([]));

  const stop = startFrameLoop(
    {
      sim,
      app,
      audio,
      render,
      ui: {
        ...ui,
        update(snapshot, state, frame) {
          lastSceneT = snapshot.sceneT;
          ui.update(snapshot, state, frame);
        },
      },
    },
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
