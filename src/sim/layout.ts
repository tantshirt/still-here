import { tokens } from '../generated/tokens';
import type { RandomStream } from './rng';
import type { StandingSlot } from './types';

export interface LayoutInput {
  readonly count: number;
  readonly budgetB: number;
  readonly layout: RandomStream;
  readonly sway: RandomStream;
}

function slabExtents() {
  const [aspectW, aspectH] = tokens.render['slab-aspect'].split('/').map(part => Number(part.trim())) as [number, number];
  const shortEdge = 1 / Number(tokens.render['figure-height-ratio']);
  const longEdge = shortEdge * aspectW / aspectH;
  return { longEdge, shortEdge, edgeZ: shortEdge / 2 };
}

/** Seeded standing layout: tier-two stagger, wheelchairs mixed through the crowd. */
export function buildStandingLayout(input: LayoutInput): readonly StandingSlot[] {
  const { count, budgetB, layout, sway } = input;
  if (count <= 0) return [];
  const { longEdge, shortEdge, edgeZ } = slabExtents();
  const cols = 62;
  const rows = 26;
  const candidates: { x: number; z: number; key: number }[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = -longEdge / 2 + 0.6 + (longEdge - 1.2) * (col + 0.5) / cols + (layout() - 0.5) * 0.3;
      const z = -edgeZ + 0.7 + (shortEdge - 1.4) * (row + 0.5) / rows + (layout() - 0.5) * 0.3;
      candidates.push({ x, z, key: layout() });
    }
  }
  candidates.sort((a, b) => a.key - b.key || a.x - b.x || a.z - b.z);
  const picked = candidates.slice(0, count);
  const tierBudget = Math.ceil(budgetB * 0.15);
  const wheelchairTarget = Math.max(1, Math.round(count * 0.05));
  const variantOrder = picked.map((_, index) => ({ index, key: layout() }));
  variantOrder.sort((a, b) => a.key - b.key);
  const wheelchairIndices = new Set(variantOrder.slice(0, Math.min(wheelchairTarget, count)).map(item => item.index));
  return picked.map((slot, index) => {
    const tier = index < tierBudget ? 1 : 0;
    const stagger = tier ? (layout() - 0.5) * 0.12 : 0;
    return Object.freeze({
      index,
      x: slot.x,
      z: slot.z + stagger,
      seed: (layout() * 0xffffffff) >>> 0,
      occupied: true,
      tier,
      wheelchair: wheelchairIndices.has(index),
      swayPhase: sway() * tokens.motion.drift / 1000,
    });
  });
}
