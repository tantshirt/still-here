import { loadConstants, loadPlace } from '../data';
import type { Selection } from './context';
import type { SelectionRates } from '../sim';

export interface SelectionLoadResult {
  readonly rates: SelectionRates;
  readonly population: number;
  readonly pmax: number;
  readonly rmax: number;
}

export function secondsInYear(year: number): number {
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return (leap ? 366 : 365) * 86_400;
}

export function resolveSelectionYear(selection: Selection, nowYear: number | null): number | null {
  if (selection.when.kind === 'year') return selection.when.year;
  return nowYear;
}

export async function loadSelection(
  selection: Selection,
  nowYear: number | null,
): Promise<SelectionLoadResult | null> {
  const year = resolveSelectionYear(selection, nowYear);
  if (year === null || year < 1950 || year > 2100) return null;
  const [constants, series] = await Promise.all([loadConstants(), loadPlace(selection.place)]);
  const entry = series.years[String(year)];
  if (entry === null || entry === undefined) return null;
  const seconds = secondsInYear(year);
  return {
    rates: {
      birthsPerSecond: entry.births / seconds,
      deathsPerSecond: entry.deaths / seconds,
    },
    population: entry.population,
    pmax: constants.Pmax,
    rmax: constants.rmax,
  };
}

export function selectionKey(selection: Selection): string {
  const when = selection.when.kind === 'now' ? 'now' : String(selection.when.year);
  return `${selection.place}:${when}`;
}
