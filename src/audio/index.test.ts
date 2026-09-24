import { afterEach, expect, it, vi } from 'vitest';
import { createAudio } from './index';
afterEach(() => vi.unstubAllGlobals());
it('constructs and resumes once on the calling stack, without playback', async () => {
  const resume = vi.fn().mockResolvedValue(undefined);
  const close = vi.fn().mockResolvedValue(undefined);
  const source = vi.fn();
  const Context = vi.fn(function () { return { state: 'suspended', resume, close, createBufferSource: source }; });
  vi.stubGlobal('AudioContext', Context);
  const audio = createAudio();
  audio.update([]); audio.setEnabled(true);
  expect(Context).not.toHaveBeenCalled();
  audio.unlock();
  expect(Context).toHaveBeenCalledTimes(1);
  expect(resume).toHaveBeenCalledTimes(1);
  audio.unlock(); audio.update([]);
  expect(Context).toHaveBeenCalledTimes(1);
  expect(source).not.toHaveBeenCalled();
  audio.dispose(); audio.dispose(); audio.unlock();
  expect(close).toHaveBeenCalledTimes(1);
  expect(Context).toHaveBeenCalledTimes(1);
});
it.each(['missing', 'constructor', 'resume', 'close', 'sync-resume', 'sync-close'])('tolerates %s failure silently', async failure => {
  const Context = vi.fn(function () {
    if (failure === 'constructor') throw new Error('unavailable');
    return { state: 'suspended',
      resume: () => { if (failure === 'sync-resume') throw new Error('resume'); return failure === 'resume' ? Promise.reject(new Error('resume')) : Promise.resolve(); },
      close: () => { if (failure === 'sync-close') throw new Error('close'); return failure === 'close' ? Promise.reject(new Error('close')) : Promise.resolve(); },
    };
  });
  vi.stubGlobal('AudioContext', failure === 'missing' ? undefined : Context);
  const audio = createAudio();
  expect(() => { audio.unlock(); audio.unlock(); audio.dispose(); }).not.toThrow();
  await Promise.resolve();
  if (failure !== 'missing') expect(Context).toHaveBeenCalledTimes(1);
});
it('does not create a context after disposal', () => {
  const Context = vi.fn(); vi.stubGlobal('AudioContext', Context);
  const audio = createAudio(); audio.dispose(); audio.unlock();
  expect(Context).not.toHaveBeenCalled();
});
