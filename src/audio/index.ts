import type { SimEvent } from '../sim';

export interface AudioPort {
  unlock(): void;
  setEnabled(enabled: boolean): void;
  update(started: readonly SimEvent[]): void;
  dispose(): void;
}

const HUM_URL = '/audio/rig-hum.wav';
const CLICK_URL = '/audio/placement-click.wav';
const DROP_URL = '/audio/dull-drop.wav';

/** The accepted gesture creates a context; playback stays off until sound is enabled. */
export function createAudio(): AudioPort {
  let context: AudioContext | undefined;
  let attempted = false;
  let disposed = false;
  let enabled = false;
  let humSource: AudioBufferSourceNode | undefined;
  let humGain: GainNode | undefined;
  let output: GainNode | undefined;
  let reverb: ConvolverNode | undefined;
  let dryGain: GainNode | undefined;
  let wetGain: GainNode | undefined;
  const buffers = new Map<string, AudioBuffer>();
  let loading: Promise<void> | undefined;

  async function loadBuffers(): Promise<void> {
    if (!context || buffers.size === 3) return;
    const decode = async (url: string) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`audio fetch failed: ${url}`);
      const data = await response.arrayBuffer();
      return context!.decodeAudioData(data);
    };
    const [hum, click, drop] = await Promise.all([decode(HUM_URL), decode(CLICK_URL), decode(DROP_URL)]);
    buffers.set(HUM_URL, hum);
    buffers.set(CLICK_URL, click);
    buffers.set(DROP_URL, drop);
    if (!reverb) {
      const impulse = context.createBuffer(2, context.sampleRate * 1.2, context.sampleRate);
      for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
        const samples = impulse.getChannelData(channel);
        for (let i = 0; i < samples.length; i += 1) {
          samples[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / samples.length, 2.2) * 0.35;
        }
      }
      reverb = context.createConvolver();
      reverb.buffer = impulse;
      reverb.connect(wetGain!);
      wetGain!.connect(output!);
    }
  }

  function ensureGraph(): void {
    if (!context || output) return;
    output = context.createGain();
    dryGain = context.createGain();
    wetGain = context.createGain();
    dryGain.gain.value = 0.88;
    wetGain.gain.value = 0.12;
    dryGain.connect(output);
    wetGain!.connect(output);
    output.connect(context.destination);
    output.gain.value = enabled ? 1 : 0;
  }

  function stopHum(): void {
    try { humSource?.stop(); } catch { /* already stopped */ }
    humSource = undefined;
  }

  function startHum(): void {
    if (!context || !enabled || !buffers.has(HUM_URL) || humSource) return;
    ensureGraph();
    humGain = context.createGain();
    humGain.gain.value = 0.22;
    humSource = context.createBufferSource();
    humSource.buffer = buffers.get(HUM_URL)!;
    humSource.loop = true;
    humSource.connect(humGain);
    humGain.connect(dryGain!);
    humGain.connect(reverb!);
    humSource.start();
  }

  function playOneShot(url: string, gainValue: number): void {
    if (!context || !enabled || !buffers.has(url)) return;
    ensureGraph();
    const source = context.createBufferSource();
    source.buffer = buffers.get(url)!;
    const gain = context.createGain();
    gain.gain.value = gainValue;
    source.connect(gain);
    gain.connect(dryGain!);
    gain.connect(reverb!);
    source.start();
  }

  async function refreshPlayback(): Promise<void> {
    if (!context || disposed) return;
    if (context.state === 'suspended') {
      try { await context.resume(); } catch { /* optional */ }
    }
    if (!enabled) {
      stopHum();
      if (output) output.gain.value = 0;
      return;
    }
    if (output) output.gain.value = 1;
    if (!loading) loading = loadBuffers().catch(() => {});
    await loading;
    startHum();
  }

  return {
    unlock() {
      if (attempted || disposed) return;
      attempted = true;
      try {
        if (typeof globalThis.AudioContext !== 'function') return;
        context = new AudioContext();
        if (context.state === 'suspended') void context.resume().catch(() => {});
      } catch { /* Audio availability must never block entry. */ }
    },
    setEnabled(next) {
      enabled = next;
      void refreshPlayback();
    },
    update(started) {
      if (!enabled || !context || started.length === 0) return;
      for (const event of started) {
        if (event.kind === 'birth') playOneShot(CLICK_URL, 0.55);
        else playOneShot(DROP_URL, 0.7);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stopHum();
      try { if (context && context.state !== 'closed') void context.close().catch(() => {}); }
      catch { /* A failed or already closed context needs no further cleanup. */ }
      context = undefined;
      output = undefined;
    },
  };
}
