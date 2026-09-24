import type { AppEvent } from '../app';
export interface InputPort { dispose(): void }
/** Native controls keep their key behavior; only otherwise unowned Enter advances. */
export function createInput(root: HTMLElement, send: (event: AppEvent) => void): InputPort {
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
    if (event.key !== 'Enter' || event.defaultPrevented || event.isComposing || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const owned = event.composedPath().some(node => node instanceof Element && (
      node.matches('a[href], button, input, select, textarea, summary, audio[controls], video[controls], [role=button], [role=link], [role=checkbox], [role=radio], [role=switch], [role=tab], [role=menuitem], [role=option], [role=combobox], [role=textbox], [role=searchbox], [role=slider], [role=spinbutton], [role=treeitem]') ||
      (node instanceof HTMLElement && node.isContentEditable)
    ));
    if (owned) return;
    send({ type: 'ENTER' });
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
