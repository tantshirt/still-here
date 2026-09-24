import type { AppContext } from '../app';
import type { SimSnapshot } from '../sim';
import { sceneCopy, thresholdCopy } from './copy';
// Structural presentation input is supplied by main; UI never imports render.
export interface UiFrame { readonly teaserAnchor: { readonly x: number; readonly y: number } | null; readonly fps: number }
export interface UiPort { update(snapshot: SimSnapshot, state: Omit<AppContext, 'session'>, frame: UiFrame): void; dispose(): void }
export function createUi(root: HTMLElement): UiPort & { present(state: Omit<AppContext, 'session'>): void } {
  const column = document.createElement('div');
  column.className = 'threshold';
  for (const [index, lines] of thresholdCopy.groups.entries()) {
    const paragraph = document.createElement('p');
    paragraph.className = `threshold__group threshold__group--${index + 1}`;
    for (const [lineIndex, line] of lines.entries()) {
      if (lineIndex > 0) paragraph.append(document.createElement('br'));
      paragraph.append(document.createTextNode(line));
    }
    column.append(paragraph);
  }
  const enter = document.createElement('button');
  enter.type = 'button';
  enter.dataset.enter = '';
  enter.className = 'text-action threshold__enter';
  enter.textContent = thresholdCopy.enter;
  column.append(enter);
  root.append(column);
  let scene: HTMLElement | undefined;
  const present = (state: Omit<AppContext, 'session'>) => {
    root.ownerDocument.documentElement.dataset.reducedMotion = String(state.reducedMotion);
    // Once revealed, preference reversal cannot replay the opening animation.
    if (state.reducedMotion) column.classList.add('threshold--revealed');
    if (state.phase !== 'opening') column.remove();
    if (state.phase === 'preparing' && !scene) {
      scene = document.createElement('section');
      scene.className = 'scene-surface';
      scene.setAttribute('role', 'img');
      scene.setAttribute('aria-label', sceneCopy.label);
      scene.setAttribute('aria-description', sceneCopy.description);
      scene.tabIndex = -1;
      root.append(scene);
      scene.focus({ preventScroll: true });
    }
  };
  return { present, update(_snapshot, state) { present(state); }, dispose() {
    delete root.ownerDocument.documentElement.dataset.reducedMotion;
    column.remove();
    scene?.remove();
  } };
}
