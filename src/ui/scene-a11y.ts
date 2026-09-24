import type { AppContext } from '../app';
import { selectApp } from '../app/selectors';
import type { SimSnapshot } from '../sim';
import { tokens } from '../generated/tokens';
import { cameraLabels, sceneCopy, showLabels, speedLabels } from './copy';

export function buildSceneDescription(state: Omit<AppContext, 'session'>): string {
  const selectors = selectApp(state as AppContext);
  const place = state.selection.place === '001' ? 'World' : state.selection.place;
  const when = state.selection.when.kind === 'now'
    ? 'Now'
    : String(state.selection.when.year);
  const parts = [
    place,
    when,
    selectors.isProjection ? sceneCopy.projection : null,
    speedLabels[state.speed],
    showLabels[state.show],
    cameraLabels[state.camera],
    state.pausedByUser ? sceneCopy.pause : sceneCopy.resume,
    sceneCopy.description,
    sceneCopy.wordsAvailable,
  ].filter(Boolean);
  return parts.join('. ');
}

export function buildCaption(state: Omit<AppContext, 'session'>): string {
  if (state.selection.place === '001' && state.selection.when.kind === 'now') return sceneCopy.captionWorldNow;
  const place = state.selection.place === '001' ? 'THE WORLD' : state.selection.place.toUpperCase();
  const when = state.selection.when.kind === 'now' ? 'NOW' : String(state.selection.when.year);
  return `${place} · ${when}`;
}

export function captionVisible(state: Omit<AppContext, 'session'>, snapshot: SimSnapshot): boolean {
  return state.phase === 'ready'
    && state.visible
    && !state.pausedByUser
    && state.fallback === null
    && snapshot.sceneT * 1000 >= tokens.motion['caption-delay'];
}
