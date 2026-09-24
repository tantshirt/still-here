import { tokens } from '../generated/tokens';

const lowFpsThreshold = tokens.motion.event / 120;
const lowWindowSeconds = tokens.motion.event * 4 + tokens.motion.cut;

/** Measures sustained low fps while the scene is active; emits LOW_PERF once. */
export class QualityGovernor {
  private elapsed = 0;
  private latched = false;

  reset(): void {
    this.elapsed = 0;
    this.latched = false;
  }

  step(dt: number, fps: number, sceneActive: boolean): boolean {
    if (!sceneActive || this.latched || dt <= 0) return false;
    if (fps < lowFpsThreshold) this.elapsed += dt;
    else this.elapsed = 0;
    if (this.elapsed >= lowWindowSeconds / 1000) {
      this.latched = true;
      return true;
    }
    return false;
  }
}

export const qualityTiers = {
  high: { pixelRatioCap: 2, bloomLevels: 8, hazePath: 'raymarch' as const, hazeSamples: 48 },
  medium: { pixelRatioCap: 1.25, bloomLevels: 6, hazePath: 'raymarch' as const, hazeSamples: 28 },
  low: { pixelRatioCap: 0.75, bloomLevels: 4, hazePath: 'screen-space-shafts' as const, hazeSamples: 8 },
};

export type QualityTier = keyof typeof qualityTiers;
