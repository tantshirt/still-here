import type { AppContext } from '../app';
import { selectApp } from '../app/selectors';
import type { PlaceMetadata } from '../data';
import type { SimSnapshot } from '../sim';
import { tokens } from '../generated/tokens';
import { cameraLabels, sceneCopy, speedLabels } from './copy';

const showDescriptions = {
  both: 'Both born and gone events shown',
  arrivals: 'Born events shown',
  departures: 'Gone events shown',
} as const;

function placeLabel(selection: AppContext['selection'], places: readonly PlaceMetadata[]): string {
  if (selection.place === '001') return 'World';
  return places.find(place => place.id === selection.place)?.name ?? selection.place;
}

export function buildSceneDescription(state: Omit<AppContext, 'session'>, places: readonly PlaceMetadata[]): string {
  const selectors = selectApp(state as AppContext);
  const place = placeLabel(state.selection, places);
  const when = state.selection.when.kind === 'now'
    ? 'Now'
    : String(state.selection.when.year);
  const parts = [
    place,
    when,
    selectors.isProjection ? sceneCopy.projection : null,
    speedLabels[state.speed],
    showDescriptions[state.show],
    cameraLabels[state.camera],
    state.pausedByUser ? sceneCopy.pause : sceneCopy.resume,
    sceneCopy.description,
    sceneCopy.wordsAvailable,
  ].filter(Boolean);
  return parts.join('. ');
}

export function buildCaption(
  state: Omit<AppContext, 'session'>,
  places: readonly PlaceMetadata[],
  sceneT: number,
): string {
  if (state.keyChangeStartedAt !== null && sceneT < state.keyChangeStartedAt + tokens.motion['key-change'] / 1000) {
    return sceneCopy.captionStillHere;
  }
  if (state.selection.place === '001' && state.selection.when.kind === 'now') return sceneCopy.captionWorldNow;
  const place = state.selection.place === '001' ? 'THE WORLD' : placeLabel(state.selection, places).toUpperCase();
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
