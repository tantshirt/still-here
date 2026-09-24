import { tokens } from '../generated/tokens';

const clampSeconds = tokens.motion.cut / 4_000;

export interface ClockState {
  sceneT: number;
  scheduleT: number;
}

export function advanceClocks(
  state: ClockState,
  dt: number,
  speed: 0.25 | 1 | 4,
): ClockState {
  if (dt <= 0) return state;
  const clamped = Math.min(Math.max(dt, 0), clampSeconds);
  return {
    sceneT: state.sceneT + clamped,
    scheduleT: state.scheduleT + clamped * speed,
  };
}
