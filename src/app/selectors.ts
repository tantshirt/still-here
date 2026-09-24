import type { AppContext } from './context';
export interface AppSelectors {
  readonly effectiveYear: number | null;
  readonly isProjection: boolean;
  readonly sceneActive: boolean;
  readonly camera: AppContext['camera'];
  readonly reducedMotion: boolean;
}
export function selectApp(context: AppContext): AppSelectors {
  return {
    effectiveYear: context.selection.when.kind === 'now' ? context.nowYear : context.selection.when.year,
    isProjection: context.selection.when.kind === 'year' && context.selection.when.year >= 2024,
    sceneActive: context.ready && context.visible && !context.pausedByUser && context.fallback === null,
    camera: context.camera, reducedMotion: context.reducedMotion,
  };
}
