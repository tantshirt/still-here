/** Standing crowd count from population, viewport budget and global Pmax (FR11). */
export function standingCount(population: number, budgetB: number, pmax: number): number {
  if (population <= 0 || pmax <= 0) return 0;
  const scaled = Math.ceil(budgetB * (population / pmax) ** 0.55);
  return Math.min(budgetB, Math.max(1, scaled));
}
