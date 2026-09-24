import { createActor, setup } from 'xstate';
import type { AudioPort } from '../audio';
import type { SessionSeed, SimPort } from '../sim';
import type { AppContext, AppEvent } from './context';
export * from './context';
export * from './selectors';
export interface AppInput { readonly session: SessionSeed; readonly nowYear: number; readonly sim: SimPort; readonly audio: AudioPort }
/** Only the inert scaffold state exists here. Lifecycle and selection transitions
 * are deliberately deferred to their stories; injected ports stay synchronous. */
const machine = setup({ types: { context: {} as AppContext, events: {} as AppEvent, input: {} as AppInput } }).createMachine({
  id: 'still-here', initial: 'scaffold',
  context: ({ input }) => ({
    session: input.session, selection: { place: '001', when: { kind: 'now' } },
    pending: null, unavailable: [], nowYear: input.nowYear >= 1950 && input.nowYear <= 2100 ? input.nowYear : null,
    ready: false, visible: true, pausedByUser: false, sound: false,
    reducedMotion: false, budgetB: 800, show: 'both', speed: 1,
    camera: 'under', overlay: 'none', reflection: { kind: 'none' }, fallback: null,
  }),
  states: { scaffold: {} },
});
export function createApp(input: AppInput) { return createActor(machine, { input }); }
