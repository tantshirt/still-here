import type { AppContext } from '../app';
import type { SimSnapshot } from '../sim';
import { thresholdCopy } from './copy';
// Structural presentation input is supplied by main; UI never imports render.
export interface UiFrame { readonly teaserAnchor: { readonly x: number; readonly y: number } | null; readonly fps: number }
export interface UiPort { update(snapshot: SimSnapshot, state: Omit<AppContext, 'session'>, frame: UiFrame): void; dispose(): void }
export function createUi(root: HTMLElement): UiPort {
  const column = document.createElement('div');
  column.className = 'threshold';
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  // Presentation is monotonic: once readable, a preference change cannot hide it.
  const revealForReducedMotion = (preference: Pick<MediaQueryListEvent, 'matches'>) => {
    if (preference.matches) column.classList.add('threshold--revealed');
  };
  revealForReducedMotion(motionPreference);
  motionPreference.addEventListener('change', revealForReducedMotion);
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
  enter.className = 'text-action threshold__enter';
  enter.textContent = thresholdCopy.enter;
  column.append(enter);
  root.append(column);
  return { update() {}, dispose() {
    motionPreference.removeEventListener('change', revealForReducedMotion);
    column.remove();
  } };
}
