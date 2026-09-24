import type { AppEvent } from '../app';

export interface InputPort { dispose(): void }

function sceneKeyboardAllowed(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  if (target.matches('input, select, textarea, [contenteditable=""], [contenteditable="true"]')) return false;
  if (target instanceof HTMLElement && target.isContentEditable) return false;
  return true;
}

/** Native controls keep their key behavior; only otherwise unowned Enter advances. */
export interface InputOptions {
  readonly reflectionExpanded?: () => boolean;
  readonly getSceneT?: () => number;
}

export function createInput(root: HTMLElement, send: (event: AppEvent) => void, options: InputOptions = {}): InputPort {
  const owner = root.ownerDocument;
  const view = owner.defaultView!;
  const preference = view.matchMedia('(prefers-reduced-motion: reduce)');
  const changed = (event: MediaQueryListEvent) => send({ type: 'REDUCED_MOTION_CHANGED', enabled: event.matches });
  const click = (event: MouseEvent) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const button = event.composedPath().find(node => node instanceof HTMLButtonElement && node.hasAttribute('data-enter'));
    if (button instanceof HTMLButtonElement && root.contains(button) && !button.disabled) send({ type: 'ENTER' });
  };
  const keydown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (!sceneKeyboardAllowed(event.target)) return;
    if (event.key === 'Enter') {
      const owned = event.composedPath().some(node => node instanceof Element && (
        node.matches('a[href], button, input, select, textarea, summary, audio[controls], video[controls], [role=button], [role=link], [role=checkbox], [role=radio], [role=switch], [role=tab], [role=menuitem], [role=option], [role=combobox], [role=textbox], [role=searchbox], [role=slider], [role=spinbutton], [role=treeitem]') ||
        (node instanceof HTMLElement && node.isContentEditable)
      ));
      if (owned) return;
      send({ type: 'ENTER' });
      return;
    }
    if (event.key === ' ' || event.key === 'Spacebar') {
      const enterButton = event.composedPath().find(node => node instanceof HTMLButtonElement && node.hasAttribute('data-enter'));
      if (enterButton instanceof HTMLButtonElement) return;
      event.preventDefault();
      send({ type: 'TOGGLE_PAUSE' });
      return;
    }
    if (event.key === 'm' || event.key === 'M') send({ type: 'TOGGLE_SOUND' });
    if (event.key === 'Escape') {
      if (options.reflectionExpanded?.() && options.getSceneT) {
        send({ type: 'DISMISS_REFLECTION', sceneT: options.getSceneT() });
        return;
      }
      send({ type: 'CLOSE_OVERLAY' });
    }
  };
  preference.addEventListener('change', changed);
  send({ type: 'REDUCED_MOTION_CHANGED', enabled: preference.matches });
  root.addEventListener('click', click);
  view.addEventListener('keydown', keydown);
  return { dispose() {
    root.removeEventListener('click', click);
    view.removeEventListener('keydown', keydown);
    preference.removeEventListener('change', changed);
  } };
}
