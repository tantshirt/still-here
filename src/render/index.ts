import type { AppSelectors } from '../app';
import type { SimSnapshot } from '../sim';
import type { FrameOutput } from './frame-output';
export * from './frame-output';
export interface RenderPort { draw(snapshot: SimSnapshot, selectors: AppSelectors): FrameOutput; dispose(): void }
/** No WebGL scene is created until the renderer stories. */
export function createRenderer(): RenderPort {
  return { draw: () => ({ teaserAnchor: null, fps: 0 }), dispose() {} };
}
