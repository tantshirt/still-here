import type { AppContext } from '../app';
import type { SimSnapshot } from '../sim';
import { announce, bindAnnounceRegion, resetAnnounce } from './announce';
import { buildCaption, buildSceneDescription, captionVisible } from './scene-a11y';
import { sceneCopy, thresholdCopy } from './copy';

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
  bindAnnounceRegion(root);

  let scene: HTMLElement | undefined;
  let overlay: HTMLElement | undefined;
  let caption: HTMLElement | undefined;
  let status: HTMLElement | undefined;
  let statusAnnounced = false;
  let captionShown = false;

  function ensureScene(): HTMLElement {
    if (!scene) {
      scene = document.createElement('section');
      scene.className = 'scene-surface';
      scene.setAttribute('role', 'img');
      scene.tabIndex = -1;
      overlay = document.createElement('div');
      overlay.className = 'scene-ui';
      caption = document.createElement('p');
      caption.className = 'scene-caption';
      caption.setAttribute('aria-hidden', 'true');
      status = document.createElement('div');
      status.className = 'scene-status';
      status.hidden = true;
      overlay.append(caption, status);
      scene.append(overlay);
      const canvas = document.querySelector('.scene-canvas');
      if (canvas instanceof HTMLCanvasElement && !scene.contains(canvas)) {
        scene.prepend(canvas);
      }
      root.append(scene);
    }
    return scene;
  }

  const present = (state: Omit<AppContext, 'session'>) => {
    root.ownerDocument.documentElement.dataset.reducedMotion = String(state.reducedMotion);
    if (state.reducedMotion) column.classList.add('threshold--revealed');
    if (state.phase !== 'opening') column.remove();
    if (state.phase === 'preparing' || state.phase === 'ready' || state.phase === 'fallback') {
      const surface = ensureScene();
      surface.setAttribute('aria-label', sceneCopy.label);
      surface.setAttribute('aria-description', buildSceneDescription(state));
      if (state.phase === 'preparing' && !state.ready) {
        surface.focus({ preventScroll: true });
      }
    }
  };

  return {
    present,
    update(snapshot, state) {
      present(state);
      if (!scene || !caption || !status) return;
      scene.setAttribute('aria-description', buildSceneDescription(state));
      const showCaption = captionVisible(state, snapshot);
      caption.textContent = buildCaption(state);
      caption.classList.toggle('scene-caption--visible', showCaption);
      if (showCaption && !captionShown) {
        captionShown = true;
        announce(buildCaption(state));
      }
      const preparing = state.phase === 'preparing' && !state.ready;
      const fallback = state.phase === 'fallback';
      if (preparing || fallback) {
        status.hidden = false;
        status.replaceChildren();
        const message = document.createElement('p');
        message.textContent = preparing ? sceneCopy.preparing : sceneCopy.fallback;
        status.append(message);
        if (fallback) {
          const retry = document.createElement('button');
          retry.type = 'button';
          retry.className = 'text-action scene-status__action';
          retry.textContent = sceneCopy.retry;
          retry.addEventListener('click', () => {
            document.dispatchEvent(new CustomEvent('still-here-retry'));
          });
          status.append(retry);
        }
        if (!statusAnnounced) {
          statusAnnounced = true;
          announce(message.textContent ?? '');
        }
      } else {
        status.hidden = true;
        statusAnnounced = false;
      }
    },
    dispose() {
      delete root.ownerDocument.documentElement.dataset.reducedMotion;
      column.remove();
      scene?.remove();
      resetAnnounce();
    },
  };
}
