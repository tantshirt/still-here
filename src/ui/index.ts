import type { AppContext, AppEvent } from '../app';
import type { PlaceMetadata } from '../data';
import type { SimSnapshot } from '../sim';
import { announce, bindAnnounceRegion, resetAnnounce } from './announce';
import { buildCaption, buildSceneDescription, captionVisible } from './scene-a11y';
import { stillPaths } from '../still-assets';
import { sceneCopy, thresholdCopy } from './copy';
import { createSceneChrome } from './controls';
import { bindVisualViewport } from '../input/viewport';
import type { ReflectionRecord } from '../data';
import { createReflectionUi, maybeAnnounceReflectionWords } from './reflection';

export interface UiFrame { readonly teaserAnchor: { readonly x: number; readonly y: number } | null; readonly fps: number }
export interface UiPort { update(snapshot: SimSnapshot, state: Omit<AppContext, 'session'>, frame: UiFrame): void; dispose(): void }

export interface UiOptions {
  readonly getPlaces: () => readonly PlaceMetadata[];
  readonly getReflections: () => ReadonlyMap<string, ReflectionRecord>;
  readonly getSceneT: () => number;
  readonly send: (event: AppEvent) => void;
  readonly stillCapture?: boolean;
}

export function createUi(root: HTMLElement, options: UiOptions): UiPort & { present(state: Omit<AppContext, 'session'>): void } {
  const unbindViewport = bindVisualViewport(root.ownerDocument);
  const stillCapture = options.stillCapture ?? false;
  let column: HTMLElement | undefined;
  if (!stillCapture) {
    column = document.createElement('div');
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
  }

  let scene: HTMLElement | undefined;
  let overlay: HTMLElement | undefined;
  let caption: HTMLElement | undefined;
  let status: HTMLElement | undefined;
  let statusMessage: HTMLParagraphElement | undefined;
  let statusRetry: HTMLButtonElement | undefined;
  let chrome: ReturnType<typeof createSceneChrome> | undefined;
  let reflection: ReturnType<typeof createReflectionUi> | undefined;
  let statusAnnounced: string | null = null;
  let captionShown = false;
  let lastCaption = '';
  let stillPicture: HTMLPictureElement | undefined;
  let stillVisible = false;

  function ensureScene(): HTMLElement {
    if (!scene) {
      scene = document.createElement('section');
      scene.className = 'scene-surface';
      scene.setAttribute('role', 'img');
      scene.tabIndex = -1;
      if (!stillCapture) {
        stillPicture = document.createElement('picture');
        stillPicture.className = 'scene-still';
        stillPicture.setAttribute('aria-hidden', 'true');
        stillPicture.hidden = true;
        const desktop = document.createElement('source');
        desktop.media = '(min-width: 768px)';
        desktop.srcset = stillPaths.fallbackDesktop;
        desktop.type = 'image/webp';
        const mobile = document.createElement('img');
        mobile.src = stillPaths.fallbackMobile;
        mobile.alt = '';
        mobile.decoding = 'async';
        mobile.addEventListener('error', () => {
          stillPicture?.remove();
          stillPicture = undefined;
          scene?.classList.add('scene-surface--still-missing');
        });
        stillPicture.append(desktop, mobile);
        scene.append(stillPicture);
      }
      if (!stillCapture) {
        overlay = document.createElement('div');
        overlay.className = 'scene-ui';
        caption = document.createElement('p');
        caption.className = 'scene-caption';
        caption.setAttribute('aria-hidden', 'true');
        status = document.createElement('div');
        status.className = 'scene-status';
        status.hidden = true;
        statusMessage = document.createElement('p');
        statusRetry = document.createElement('button');
        statusRetry.type = 'button';
        statusRetry.className = 'text-action scene-status__action';
        statusRetry.textContent = sceneCopy.retry;
        statusRetry.hidden = true;
        statusRetry.addEventListener('click', () => {
          document.dispatchEvent(new CustomEvent('still-here-retry'));
        });
        status.append(statusMessage, statusRetry);
        overlay.append(caption, status);
        chrome = createSceneChrome(overlay, options.send, options.getPlaces);
        reflection = createReflectionUi({
          host: overlay,
          send: options.send,
          getSceneT: options.getSceneT,
          getControlsButton: () => overlay?.querySelector('.scene-controls') as HTMLButtonElement | null,
        });
        scene.append(overlay);
      }
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
    if (column) {
      if (state.reducedMotion) column.classList.add('threshold--revealed');
      if (state.phase !== 'opening') column.remove();
    }
    if (state.phase === 'preparing' || state.phase === 'ready' || state.phase === 'fallback') {
      const surface = ensureScene();
      surface.setAttribute('aria-label', sceneCopy.label);
      surface.setAttribute('aria-description', buildSceneDescription(state, options.getPlaces()));
      if (state.phase === 'preparing' && !state.ready) {
        surface.focus({ preventScroll: true });
      }
    }
    chrome?.update(state);
  };

  return {
    present,
    update(snapshot, state, frame) {
      present(state);
      if (scene && state.phase === 'preparing' && !state.ready && document.activeElement !== scene) {
        scene.focus({ preventScroll: true });
      }
      if (!scene) return;
      scene.setAttribute('aria-description', buildSceneDescription(state, options.getPlaces()));
      const preparing = state.phase === 'preparing' && !state.ready;
      const fallback = state.phase === 'fallback';
      const showStill = !stillCapture && (preparing || fallback);
      scene.classList.toggle('scene-surface--live', state.phase === 'ready' && state.ready && !fallback);
      if (stillPicture && showStill !== stillVisible) {
        stillPicture.hidden = !showStill;
        stillVisible = showStill;
      }
      if (!caption || !status) return;
      const showCaption = captionVisible(state, snapshot);
      const nextCaption = buildCaption(state, options.getPlaces(), snapshot.sceneT);
      caption.textContent = nextCaption;
      caption.classList.toggle('scene-caption--visible', showCaption);
      const captionAnnounced = nextCaption !== sceneCopy.captionStillHere;
      if (showCaption && !captionShown && captionAnnounced) {
        captionShown = true;
        announce(nextCaption);
      } else if (nextCaption !== lastCaption && state.phase === 'ready' && showCaption && captionAnnounced) {
        announce(nextCaption);
      }
      lastCaption = nextCaption;
      if ((preparing || fallback) && statusMessage && statusRetry) {
        status.hidden = false;
        const message = preparing ? sceneCopy.preparing : sceneCopy.fallback;
        if (statusMessage.textContent !== message) statusMessage.textContent = message;
        statusRetry.hidden = !fallback;
        if (statusAnnounced !== message) {
          statusAnnounced = message;
          announce(message);
        }
      } else {
        status.hidden = true;
        statusAnnounced = null;
      }
      reflection?.update(state, frame.teaserAnchor, options.getReflections());
      if (maybeAnnounceReflectionWords(state)) {
        options.send({ type: 'MARK_REFLECTION_WORDS' });
      }
    },
    dispose() {
      unbindViewport();
      delete root.ownerDocument.documentElement.dataset.reducedMotion;
      column?.remove();
      chrome?.dispose();
      reflection?.dispose();
      scene?.remove();
      resetAnnounce();
    },
  };
}
