import type { SessionSeed } from './rng';

export function shuffleReflectionBag(session: SessionSeed, catalog: readonly string[], excludeId: string | null): string[] {
  const ids = catalog.filter(id => id !== excludeId);
  if (!ids.length) return [...catalog];
  const bag = [...ids];
  const random = session.streams.reflection;
  for (let index = bag.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [bag[index], bag[swap]] = [bag[swap]!, bag[index]!];
  }
  return bag;
}

export function drawReflectionId(session: SessionSeed, catalog: readonly string[]): string | null {
  if (!catalog.length) return null;
  if (!session.reflectionBag.length) {
    session.reflectionBag = shuffleReflectionBag(session, catalog, session.lastReflectionId);
  }
  const next = session.reflectionBag.pop();
  if (next === undefined) return null;
  session.lastReflectionId = next;
  return next;
}
