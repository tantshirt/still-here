import { expect, it } from 'vitest';
import { advanceClocks } from './clock';

it('does not advance when dt is zero', () => {
  expect(advanceClocks({ sceneT: 2, scheduleT: 3 }, 0, 1)).toEqual({ sceneT: 2, scheduleT: 3 });
});

it('advances sceneT and scheduleT with speed', () => {
  expect(advanceClocks({ sceneT: 0, scheduleT: 0 }, 0.05, 4)).toEqual({ sceneT: 0.05, scheduleT: 0.2 });
});

it('clamps large dt to one tenth of a second', () => {
  expect(advanceClocks({ sceneT: 0, scheduleT: 0 }, 5, 1).sceneT).toBe(0.1);
});
