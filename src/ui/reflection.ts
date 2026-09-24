import type { AppContext, AppEvent } from '../app';
import type { ReflectionRecord } from '../data';
import { tokens } from '../generated/tokens';
import { sceneCopy } from './copy';
import { announce } from './announce';

export interface ReflectionUi {
  update(
    state: Omit<AppContext, 'session'>,
    anchor: { readonly x: number; readonly y: number } | null,
    records: ReadonlyMap<string, ReflectionRecord>,
  ): void;
  dispose(): void;
}

export interface ReflectionUiOptions {
  readonly host: HTMLElement;
  readonly send: (event: AppEvent) => void;
  readonly getSceneT: () => number;
  readonly getControlsButton: () => HTMLButtonElement | null;
}

function clampAnchor(
  anchor: { readonly x: number; readonly y: number },
  host: HTMLElement,
  width: number,
): { x: number; y: number } {
  const rect = host.getBoundingClientRect();
  const gutter = window.matchMedia(`(min-width: ${tokens.layout.breakpoint})`).matches
    ? Number.parseFloat(tokens.spacing['gutter-desktop'])
    : Number.parseFloat(tokens.spacing['gutter-mobile']);
  const minX = gutter;
  const maxX = Math.max(minX, rect.width - width - gutter);
  const minY = gutter + 48;
  const maxY = Math.max(minY, rect.height - gutter - 88);
  return {
    x: Math.min(Math.max(anchor.x, minX), maxX),
    y: Math.min(Math.max(anchor.y, minY), maxY),
  };
}

export function createReflectionUi(options: ReflectionUiOptions): ReflectionUi {
  const line = document.createElement('div');
  line.className = 'reflection-line';
  line.hidden = true;
  const panel = document.createElement('div');
  panel.className = 'reflection-panel';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  options.host.append(line, panel);

  let lastId: string | null = null;

  const dismiss = () => {
    options.send({ type: 'DISMISS_REFLECTION', sceneT: options.getSceneT() });
    const controls = options.getControlsButton();
    if (line.contains(document.activeElement) || panel.contains(document.activeElement)) {
      controls?.focus({ preventScroll: true });
    }
  };

  const buildLine = (teaser: string) => {
    line.replaceChildren();
    const text = document.createElement('span');
    text.className = 'reflection-line__text';
    text.textContent = teaser;
    const read = document.createElement('button');
    read.type = 'button';
    read.className = 'text-action reflection-line__read';
    read.textContent = 'read';
    read.addEventListener('click', () => options.send({ type: 'OPEN_REFLECTION' }));
    const sep = document.createElement('span');
    sep.className = 'reflection-line__sep';
    sep.setAttribute('aria-hidden', 'true');
    sep.textContent = ' · ';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'text-action reflection-line__dismiss';
    close.textContent = '×';
    close.setAttribute('aria-label', 'Dismiss');
    close.addEventListener('click', dismiss);
    line.append(text, sep, read, sep.cloneNode(true), close);
  };

  const buildPanel = (record: ReflectionRecord) => {
    panel.replaceChildren();
    const header = document.createElement('div');
    header.className = 'reflection-panel__header';
    const heading = document.createElement('h2');
    heading.className = 'reflection-panel__heading';
    heading.textContent = sceneCopy.imaginedLife;
    heading.tabIndex = -1;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'text-action reflection-panel__close';
    close.textContent = sceneCopy.close;
    close.addEventListener('click', dismiss);
    header.append(heading, close);
    const body = document.createElement('div');
    body.className = 'reflection-panel__body';
    const prose = document.createElement('p');
    prose.className = 'reflection-panel__prose';
    prose.textContent = record.reflection;
    const note = document.createElement('p');
    note.className = 'reflection-panel__note';
    note.textContent = sceneCopy.imaginedLife;
    body.append(prose, note);
    panel.append(header, body);
    heading.focus({ preventScroll: true });
  };

  panel.addEventListener('click', event => {
    if (event.target === panel) dismiss();
  });

  return {
    update(state, anchor, records) {
      const id = state.reflection.kind === 'none' ? null : state.reflection.id;
      if (state.reflection.kind === 'teaser' && id) {
        const record = records.get(id);
        if (!record) {
          line.hidden = true;
          return;
        }
        if (id !== lastId) {
          buildLine(record.teaser);
          lastId = id;
          line.classList.remove('reflection-line--settled');
          void line.offsetWidth;
          line.classList.add('reflection-line--visible');
          requestAnimationFrame(() => line.classList.add('reflection-line--settled'));
        }
        if (anchor) {
          const maxWidth = Number.parseFloat(tokens.components['reflection-line'].maxWidth) || 320;
          const width = Math.min(maxWidth, options.host.clientWidth - 40);
          const clamped = clampAnchor(anchor, options.host, width);
          line.style.left = `${clamped.x}px`;
          line.style.top = `${clamped.y}px`;
        }
        line.hidden = false;
        panel.hidden = true;
      } else if (state.reflection.kind === 'expanded' && id) {
        const record = records.get(id);
        line.hidden = true;
        if (!record) {
          panel.hidden = true;
          return;
        }
        if (id !== lastId || panel.hidden) buildPanel(record);
        lastId = id;
        panel.hidden = false;
        options.host.dataset.inert = 'true';
        panel.querySelectorAll('button, a, input, select, textarea').forEach(node => node.removeAttribute('tabindex'));
      } else {
        line.hidden = true;
        panel.hidden = true;
        lastId = null;
        line.classList.remove('reflection-line--visible', 'reflection-line--settled');
        delete options.host.dataset.inert;
      }
    },
    dispose() {
      line.remove();
      panel.remove();
      delete options.host.dataset.inert;
    },
  };
}

export function maybeAnnounceReflectionWords(state: Omit<AppContext, 'session'>): boolean {
  if (state.reflection.kind !== 'teaser' || state.reflectionWordsAnnounced) return false;
  announce(sceneCopy.wordsAvailable);
  return true;
}
