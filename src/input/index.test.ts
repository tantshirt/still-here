import { afterEach, expect, it, vi } from 'vitest';
import { createInput } from './index';

afterEach(() => vi.unstubAllGlobals());
it('disposes click, keyboard and preference listeners before recreation', () => {
  class ElementStub extends EventTarget {
    matches() { return false; }
    isContentEditable = false;
  }
  class ButtonStub extends ElementStub {
    disabled = false;
    hasAttribute(name: string) { return name === 'data-enter'; }
  }
  vi.stubGlobal('Element', ElementStub);
  vi.stubGlobal('HTMLElement', ElementStub);
  vi.stubGlobal('HTMLButtonElement', ButtonStub);
  const media = Object.assign(new EventTarget(), { matches: false });
  const view = Object.assign(new EventTarget(), { matchMedia: () => media });
  const button = new ButtonStub();
  const root = Object.assign(new EventTarget(), { ownerDocument: { defaultView: view }, contains: (element: unknown) => element === button });
  const send = vi.fn();
  const activate = () => {
    const click = new Event('click');
    Object.defineProperty(click, 'composedPath', { value: () => [button, root] });
    root.dispatchEvent(click);
    view.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Enter' }));
    media.dispatchEvent(Object.assign(new Event('change'), { matches: true }));
  };
  const first = createInput(root as unknown as HTMLElement, send);
  send.mockClear();
  activate();
  expect(send.mock.calls.map(([event]) => event)).toEqual([{ type: 'ENTER' }, { type: 'ENTER' }, { type: 'REDUCED_MOTION_CHANGED', enabled: true }]);
  first.dispose();
  send.mockClear();
  activate();
  expect(send).not.toHaveBeenCalled();
  const second = createInput(root as unknown as HTMLElement, send);
  send.mockClear();
  activate();
  expect(send.mock.calls.map(([event]) => event)).toEqual([{ type: 'ENTER' }, { type: 'ENTER' }, { type: 'REDUCED_MOTION_CHANGED', enabled: true }]);
  second.dispose();
  send.mockClear();
  activate();
  expect(send).not.toHaveBeenCalled();
});
