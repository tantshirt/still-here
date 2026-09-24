import { assign, createActor, setup } from 'xstate';
import { tokens } from '../generated/tokens';
import type { AudioPort } from '../audio';
import type { SessionSeed, SimPort } from '../sim';
import type { AppContext, AppEvent } from './context';
import { createSessionPreferences } from './session-preferences';
export * from './context';
export * from './selectors';
export interface AppInput { readonly session: SessionSeed; readonly nowYear: number; readonly sim: SimPort; readonly audio: AudioPort }

const initTimeoutMs = tokens.motion.event * 4 + tokens.motion.cut;
const preferences = createSessionPreferences();

function createMachine(input: AppInput) { return setup({
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
  },
}).createMachine({
  id: 'still-here', initial: 'opening',
  context: () => ({
    phase: 'opening',
    session: input.session, selection: { place: '001', when: { kind: 'now' } },
    pending: null, unavailable: [], nowYear: input.nowYear >= 1950 && input.nowYear <= 2100 ? input.nowYear : null,
    ready: false, visible: true,
    pausedByUser: preferences.read('sh.pausedByUser', false),
    sound: preferences.read('sh.sound', true),
    reducedMotion: false, budgetB: 800, show: 'both', speed: 1,
    camera: 'under', overlay: 'none', reflection: { kind: 'none' }, fallback: null,
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
    TOGGLE_PAUSE: {
      guard: ({ context }) => context.phase !== 'opening' && context.phase !== 'cut' && context.overlay === 'none',
      actions: 'togglePause',
    },
    TOGGLE_SOUND: {
      guard: ({ context }) => context.phase !== 'opening' && context.phase !== 'cut',
      actions: ['toggleSound', 'applySound'],
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
        FALLBACK: { actions: assign({ fallback: ({ event }) => event.reason }) },
      },
    },
  },
}); }
export function createApp(input: AppInput) { return createActor(createMachine(input)); }
