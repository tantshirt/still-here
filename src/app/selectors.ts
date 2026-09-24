import type { AppContext } from './context';
import type { SimSnapshot } from '../sim';

export interface AppSelectors {
  readonly effectiveYear: number | null;
  readonly isProjection: boolean;
  readonly sceneActive: boolean;
  readonly camera: AppContext['camera'];
  readonly reducedMotion: boolean;
  readonly cameraLocked: boolean;
  readonly cameraPaused: boolean;
  readonly attentionActorId: number | null;
  readonly reflectionAnchorIndex: number | null;
  readonly showReflectionLine: boolean;
}

export function selectApp(context: AppContext, snapshot?: SimSnapshot): AppSelectors {
  const reflection = snapshot?.reflection;
  const showLine = context.reflection.kind !== 'none';
  return {
    effectiveYear: context.selection.when.kind === 'now' ? context.nowYear : context.selection.when.year,
    isProjection: context.selection.when.kind === 'year' && context.selection.when.year >= 2024,
    sceneActive: context.phase === 'ready' && context.ready && context.visible && !context.pausedByUser && context.fallback === null,
    camera: context.camera,
    reducedMotion: context.reducedMotion,
    cameraLocked: context.reflection.kind === 'expanded',
    cameraPaused: context.pausedByUser || !context.visible,
    attentionActorId: reflection && reflection.phase !== 'idle' ? reflection.actorId : null,
    reflectionAnchorIndex: showLine && reflection?.standingIndex !== null && reflection?.standingIndex !== undefined
      ? reflection.standingIndex
      : null,
    showReflectionLine: showLine && context.reflection.kind === 'teaser',
  };
}
