import { assign, createActor, raise, setup } from 'xstate';
import { tokens } from '../generated/tokens';
import type { AudioPort } from '../audio';
import type { SessionSeed, SimPort } from '../sim';
import type { AppContext, AppEvent, Selection } from './context';
import { createSessionPreferences } from './session-preferences';
import { selectionKey } from './selection-loader';
export * from './context';
export * from './selectors';

export interface AppInput {
  readonly session: SessionSeed;
  readonly nowYear: number;
  readonly sim: SimPort;
  readonly audio: AudioPort;
  readonly getSceneT: () => number;
  readonly captureStill?: boolean;
}

function keyChangeEligible(context: AppContext): boolean {
  return context.selection.when.kind === 'now' && context.overlay === 'none';
}

function applyKeyChange(context: AppContext, sceneT: number, session: SessionSeed): Partial<AppContext> {
  if (session.keyChangeSpent) return {};
  if (!keyChangeEligible(context)) return { keyChangePending: true };
  session.keyChangeSpent = true;
  return { keyChangeStartedAt: sceneT, keyChangePending: false };
}

const preferences = createSessionPreferences();

function isUnavailable(context: AppContext, selection: Selection): boolean {
  const key = selectionKey(selection);
  return context.unavailable.some(item => selectionKey(item) === key);
}

function createMachine(input: AppInput) {
  const initTimeoutMs = input.captureStill ? 600_000 : tokens.motion.event * 4 + tokens.motion.cut;
  return setup({
    types: { context: {} as AppContext, events: {} as AppEvent },
    delays: { cut: tokens.motion.cut, initTimeout: initTimeoutMs },
    actions: {
      unlockAudio: () => input.audio.unlock(),
      unlockPreferences: assign({
        sound: () => preferences.read('sh.sound', true),
      }),
      applySound: ({ context }) => input.audio.setEnabled(context.sound),
      presentation: ({ context }) => input.sim.setPresentation({ reducedMotion: context.reducedMotion, budgetB: context.budgetB }),
      markReady: assign({ ready: true, phase: 'ready', fallback: null }),
      markFallback: assign(({ event }) => ({
        phase: 'fallback',
        ready: false,
        fallback: event.type === 'FALLBACK' ? event.reason : 'lowPerf',
      })),
      clearReady: assign({ ready: false, phase: 'preparing', fallback: null }),
      viewportBudget: assign({
        budgetB: ({ event }) => (event.type === 'VIEWPORT_CLASS' && event.value === 'wide' ? 1600 : 800),
      }),
      togglePause: assign({
        pausedByUser: ({ context }) => {
          const next = !context.pausedByUser;
          preferences.write('sh.pausedByUser', next);
          return next;
        },
      }),
      toggleSound: assign({
        sound: ({ context }) => {
          const next = !context.sound;
          preferences.write('sh.sound', next);
          return next;
        },
      }),
      retryScene: () => input.sim.retry(),
      openControls: assign({ overlay: 'controls' }),
      openAbout: assign({ overlay: 'about' }),
      closeOverlay: assign({
        overlay: ({ context }) => (context.overlay === 'about' ? 'controls' : 'none'),
      }),
      markAudioUnavailable: assign({ audioUnavailable: true }),
      queuePlace: assign({
        pending: ({ context, event }) => (
          event.type === 'SELECT_PLACE'
            ? { place: event.place, when: context.selection.when }
            : context.pending
        ),
      }),
      queueYear: assign({
        pending: ({ context, event }) => (
          event.type === 'SELECT_YEAR'
            ? { place: context.selection.place, when: { kind: 'year', year: event.year } }
            : context.pending
        ),
      }),
      queueNow: assign({
        pending: ({ context }) => ({ place: context.selection.place, when: { kind: 'now' } }),
      }),
      commitSelection: assign({
        selection: ({ context }) => context.pending ?? context.selection,
        pending: null,
      }),
      recordUnavailable: assign({
        pending: null,
        unavailable: ({ context }) => {
          if (!context.pending) return context.unavailable;
          const key = selectionKey(context.pending);
          if (context.unavailable.some(item => selectionKey(item) === key)) return context.unavailable;
          return [...context.unavailable, context.pending];
        },
      }),
      applyShow: assign({
        show: ({ event }) => (event.type === 'SELECT_SHOW' ? event.show : 'both'),
      }),
      applySpeed: assign({
        speed: ({ event }) => (event.type === 'SELECT_SPEED' ? event.speed : 1),
      }),
      applyCamera: assign({
        camera: ({ event }) => (event.type === 'SELECT_CAMERA' ? event.camera : 'under'),
      }),
      releaseReflectionPort: ({ context, event }) => {
        if (context.reflection.kind === 'none') return;
        const reason = event.type === 'DISMISS_REFLECTION' ? 'dismissed' : 'selection';
        input.sim.releaseReflection(reason);
      },
      clearReflectionState: assign(({ context, event }) => {
        const hadReflection = context.reflection.kind !== 'none';
        const sceneT = event.type === 'DISMISS_REFLECTION' ? event.sceneT : input.getSceneT();
        return {
          reflection: { kind: 'none' as const },
          ...(hadReflection ? applyKeyChange(context, sceneT, input.session) : {}),
        };
      }),
      openReflection: assign({
        reflection: ({ context }) => (
          context.reflection.kind === 'teaser'
            ? { kind: 'expanded' as const, id: context.reflection.id }
            : context.reflection
        ),
      }),
      showReflectionTeaser: assign({
        reflection: ({ event }) => (
          event.type === 'REFLECTION_READY'
            ? { kind: 'teaser' as const, id: event.reflectionId }
            : { kind: 'none' as const }
        ),
      }),
      markReflectionWordsAnnounced: assign({ reflectionWordsAnnounced: true }),
      tryPendingKeyChange: assign(({ context }) => {
        if (!context.keyChangePending || context.session.keyChangeSpent || !keyChangeEligible(context)) return {};
        context.session.keyChangeSpent = true;
        return { keyChangeStartedAt: input.getSceneT(), keyChangePending: false };
      }),
      noteFirstFall: assign(({ context, event }) => (
        event.type === 'FIRST_FALL_SEEN' ? applyKeyChange(context, event.sceneT, input.session) : {}
      )),
      finishKeyChange: assign({ keyChangeStartedAt: null }),
      simShow: ({ event }) => {
        if (event.type === 'SELECT_SHOW') input.sim.setShow(event.show);
      },
      simSpeed: ({ event }) => {
        if (event.type === 'SELECT_SPEED') input.sim.setSpeed(event.speed);
      },
      simSelectionLoaded: ({ event }) => {
        if (event.type !== 'SELECTION_LOADED') return;
        input.sim.applySelection(event.rates, event.population, event.pmax, event.rmax);
      },
      raiseSelectionChanged: raise({ type: 'SELECTION_CHANGED' }),
    },
    guards: {
      cameraUnlocked: ({ context }) => context.reflection.kind !== 'expanded',
      canQueuePlace: ({ context, event }) => event.type === 'SELECT_PLACE' && !isUnavailable(context, { place: event.place, when: context.selection.when }),
      canQueueYear: ({ context, event }) => {
        if (event.type !== 'SELECT_YEAR') return false;
        return !isUnavailable(context, { place: context.selection.place, when: { kind: 'year', year: event.year } });
      },
    },
  }).createMachine({
    id: 'still-here',
    initial: 'opening',
    context: () => ({
      phase: 'opening',
      session: input.session,
      selection: { place: '001', when: { kind: 'now' } },
      pending: null,
      unavailable: [],
      nowYear: input.nowYear >= 1950 && input.nowYear <= 2100 ? input.nowYear : null,
      ready: false,
      visible: true,
      pausedByUser: preferences.read('sh.pausedByUser', false),
      sound: preferences.read('sh.sound', true),
      reducedMotion: false,
      budgetB: 800,
      show: 'both',
      speed: 1,
      camera: 'under',
      overlay: 'none',
      reflection: { kind: 'none' },
      keyChangeStartedAt: null,
      keyChangePending: false,
      reflectionWordsAnnounced: false,
      fallback: null,
      audioUnavailable: false,
    }),
    entry: ['presentation', 'applySound'],
    on: {
      SCENE_READY: { actions: assign({ ready: true }) },
      FALLBACK: { target: '#still-here.fallback', actions: 'markFallback' },
      REDUCED_MOTION_CHANGED: {
        actions: [assign({ reducedMotion: ({ event }) => event.enabled }), 'presentation'],
      },
      VIEWPORT_CLASS: { actions: ['viewportBudget', 'presentation'] },
      VISIBILITY: { actions: assign({ visible: ({ event }) => event.visible }) },
      AUDIO_UNAVAILABLE: { actions: 'markAudioUnavailable' },
      OPEN_CONTROLS: { actions: 'openControls' },
      OPEN_ABOUT: { actions: 'openAbout' },
      CLOSE_OVERLAY: { actions: ['closeOverlay', 'tryPendingKeyChange'] },
      REFLECTION_READY: { actions: 'showReflectionTeaser' },
      FIRST_FALL_SEEN: { actions: 'noteFirstFall' },
      KEY_CHANGE_FINISHED: { actions: 'finishKeyChange' },
      DISMISS_REFLECTION: { actions: ['releaseReflectionPort', 'clearReflectionState'] },
      OPEN_REFLECTION: { actions: 'openReflection' },
      MARK_REFLECTION_WORDS: { actions: 'markReflectionWordsAnnounced' },
      SELECTION_CHANGED: {},
      TOGGLE_PAUSE: {
        guard: ({ context }) => context.phase !== 'opening' && context.phase !== 'cut',
        actions: 'togglePause',
      },
      TOGGLE_SOUND: {
        guard: ({ context }) => context.phase !== 'opening' && context.phase !== 'cut',
        actions: ['toggleSound', 'applySound'],
      },
      SELECT_PLACE: {
        guard: 'canQueuePlace',
        actions: ['releaseReflectionPort', 'clearReflectionState', 'queuePlace'],
      },
      SELECT_YEAR: {
        guard: 'canQueueYear',
        actions: ['releaseReflectionPort', 'clearReflectionState', 'queueYear'],
      },
      RETURN_TO_NOW: {
        guard: ({ context }) => context.selection.when.kind !== 'now'
          && !isUnavailable(context, { place: context.selection.place, when: { kind: 'now' } }),
        actions: ['releaseReflectionPort', 'clearReflectionState', 'queueNow'],
      },
      SELECTION_LOADED: {
        guard: ({ context }) => context.pending !== null,
        actions: [
          'releaseReflectionPort',
          'clearReflectionState',
          'commitSelection',
          'simSelectionLoaded',
          'raiseSelectionChanged',
        ],
      },
      SELECTION_UNAVAILABLE: { actions: 'recordUnavailable' },
      SELECT_SHOW: {
        actions: [
          'releaseReflectionPort',
          'clearReflectionState',
          'applyShow',
          'simShow',
          'raiseSelectionChanged',
        ],
      },
      SELECT_SPEED: { actions: ['applySpeed', 'simSpeed'] },
      SELECT_CAMERA: {
        guard: 'cameraUnlocked',
        actions: 'applyCamera',
      },
    },
    states: {
      opening: { on: { ENTER: { target: 'cut', actions: ['unlockAudio', 'unlockPreferences', 'applySound'] } } },
      cut: { entry: assign({ phase: 'cut' }), after: { cut: '#still-here.preparing' } },
      preparing: {
        entry: assign({ phase: 'preparing', fallback: null }),
        always: { target: '#still-here.ready', guard: ({ context }) => context.ready, actions: assign({ phase: 'ready' }) },
        after: { initTimeout: { target: '#still-here.fallback', actions: assign({ phase: 'fallback', ready: false, fallback: 'initTimeout' }) } },
        on: {
          SCENE_READY: { target: '#still-here.ready', actions: 'markReady' },
          FALLBACK: { target: '#still-here.fallback', actions: 'markFallback' },
        },
      },
      ready: {
        entry: assign({ phase: 'ready' }),
        on: {
          FALLBACK: { target: '#still-here.fallback', actions: 'markFallback' },
          LOW_PERF: { target: '#still-here.fallback', actions: assign({ phase: 'fallback', ready: false, fallback: 'lowPerf' }) },
        },
      },
      fallback: {
        entry: assign({ phase: 'fallback', ready: false }),
        on: {
          RETRY: { target: '#still-here.preparing', actions: ['clearReady', 'retryScene'] },
          // A slow download can outlast the init timeout; the scene still wins once it is built.
          SCENE_READY: {
            target: '#still-here.ready',
            guard: ({ context }) => context.fallback === 'initTimeout',
            actions: 'markReady',
          },
          FALLBACK: { actions: assign({ fallback: ({ event }) => event.reason }) },
        },
      },
    },
  });
}

export function createApp(input: AppInput) { return createActor(createMachine(input)); }
