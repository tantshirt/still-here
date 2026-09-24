import { assign, createActor, setup } from 'xstate';
import { tokens } from '../generated/tokens';
import type { AudioPort } from '../audio';
import type { SessionSeed, SimPort } from '../sim';
import type { AppContext, AppEvent } from './context';
export * from './context';
export * from './selectors';
export interface AppInput { readonly session: SessionSeed; readonly nowYear: number; readonly sim: SimPort; readonly audio: AudioPort }
function createMachine(input: AppInput) { return setup({
  types: { context: {} as AppContext, events: {} as AppEvent },
  delays: { cut: tokens.motion.cut },
  actions: {
    unlock: () => input.audio.unlock(),
    presentation: ({ context }) => input.sim.setPresentation({ reducedMotion: context.reducedMotion, budgetB: context.budgetB }),
  },
}).createMachine({
  id: 'still-here', initial: 'opening',
  context: () => ({
    phase: 'opening',
    session: input.session, selection: { place: '001', when: { kind: 'now' } },
    pending: null, unavailable: [], nowYear: input.nowYear >= 1950 && input.nowYear <= 2100 ? input.nowYear : null,
    ready: false, visible: true, pausedByUser: false, sound: false,
    reducedMotion: false, budgetB: 800, show: 'both', speed: 1,
    camera: 'under', overlay: 'none', reflection: { kind: 'none' }, fallback: null,
  }),
  entry: 'presentation',
  on: {
    REDUCED_MOTION_CHANGED: {
      actions: [assign({ reducedMotion: ({ event }) => event.enabled }), 'presentation'],
    },
  },
  states: {
    opening: { on: { ENTER: { target: 'cut', actions: 'unlock' } } },
    cut: { entry: assign({ phase: 'cut' }), after: { cut: 'preparing' } },
    preparing: { entry: assign({ phase: 'preparing' }) },
  },
}); }
export function createApp(input: AppInput) { return createActor(createMachine(input)); }
