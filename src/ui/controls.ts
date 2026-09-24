import type { AppContext, AppEvent, Camera } from '../app';
import { selectionKey } from '../app/selection-loader';
import { selectApp } from '../app/selectors';
import { createPlaceSearch } from '../data/places-search';
import type { PlaceMetadata } from '../data';
import { cameraLabels, colophonCopy, sceneCopy, showLabels, speedLabels } from './copy';
import { trapFocus } from './focus-trap';

export interface ControlsSend { (event: AppEvent): void }

export interface SceneChrome {
  update(state: Omit<AppContext, 'session'>): void;
  dispose(): void;
}

function textAction(label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'text-action';
  button.textContent = label;
  return button;
}

function fieldLabel(text: string): HTMLLabelElement {
  const label = document.createElement('label');
  label.className = 'control-field__label';
  label.textContent = text;
  return label;
}

function isWholeYear(value: string): value is `${number}` {
  return /^\d{4}$/.test(value);
}

function yearValid(year: number): boolean {
  return Number.isInteger(year) && year >= 1950 && year <= 2100;
}

export function createSceneChrome(
  overlay: HTMLElement,
  send: ControlsSend,
  getPlaces: () => readonly PlaceMetadata[],
): SceneChrome {
  let search = createPlaceSearch(getPlaces());
  const placeMaps = () => {
    const places = getPlaces();
    return {
      places,
      byId: new Map(places.map(place => [place.id, place])),
      byIso: new Map(places.filter(place => place.iso2).map(place => [place.iso2!, place])),
    };
  };

  const controlsOpen = textAction(sceneCopy.controls);
  controlsOpen.classList.add('scene-controls');
  controlsOpen.setAttribute('aria-haspopup', 'dialog');

  const returnToNow = textAction(sceneCopy.returnToNow);
  returnToNow.classList.add('scene-return-to-now');
  returnToNow.hidden = true;

  const projection = document.createElement('p');
  projection.className = 'scene-projection';
  projection.textContent = sceneCopy.projection;
  projection.hidden = true;

  const panelHost = document.createElement('div');
  panelHost.className = 'controls-host';
  panelHost.hidden = true;

  const panel = document.createElement('div');
  panel.className = 'controls-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');

  const colophon = document.createElement('div');
  colophon.className = 'colophon-panel';
  colophon.setAttribute('role', 'dialog');
  colophon.setAttribute('aria-modal', 'true');
  colophon.hidden = true;

  overlay.append(controlsOpen, returnToNow, projection, panelHost);

  let controlsTrigger: HTMLElement | null = null;
  let geoFetched = false;
  let geoCountry: string | null = null;
  let yearDraft = '';
  let yearError = '';
  let placeQuery = '';
  let lastSelectionKey = '';
  let previousPendingKey: string | null = null;
  let previousSelectionKey = '';
  let showRatesUnavailable = false;
  let aboutButton: HTMLButtonElement | undefined;
  let previousOverlay: AppContext['overlay'] = 'none';

  const unavailableMessage = document.createElement('p');
  unavailableMessage.className = 'controls-panel__message';
  unavailableMessage.hidden = true;

  const audioMessage = document.createElement('p');
  audioMessage.className = 'controls-panel__message';
  audioMessage.hidden = true;

  function buildControlsPanel(): {
    shell: HTMLElement;
    heading: HTMLHeadingElement;
    refresh: (state: Omit<AppContext, 'session'>) => void;
  } {
    const shell = document.createElement('div');
    shell.className = 'controls-panel__inner';
    const header = document.createElement('div');
    header.className = 'controls-panel__header';
    const heading = document.createElement('h2');
    heading.className = 'controls-panel__heading';
    heading.textContent = sceneCopy.controlsHeading;
    heading.tabIndex = -1;
    const close = textAction(sceneCopy.close);
    close.className = 'text-action controls-panel__close';
    close.addEventListener('click', () => send({ type: 'CLOSE_OVERLAY' }));
    header.append(heading, close);

    const body = document.createElement('div');
    body.className = 'controls-panel__body';

    const placeField = document.createElement('div');
    placeField.className = 'control-field';
    placeField.append(fieldLabel(sceneCopy.fieldPlace));
    const placeSearchInput = document.createElement('input');
    placeSearchInput.type = 'search';
    placeSearchInput.className = 'control-field__input';
    placeSearchInput.autocomplete = 'off';
    placeSearchInput.setAttribute('aria-controls', 'place-list');
    const placeList = document.createElement('ul');
    placeList.id = 'place-list';
    placeList.className = 'control-field__list';
    placeField.append(placeSearchInput, placeList);

    const yourCountry = document.createElement('div');
    yourCountry.className = 'control-field__suggestion';
    yourCountry.hidden = true;

    const whenField = document.createElement('div');
    whenField.className = 'control-field';
    whenField.append(fieldLabel(sceneCopy.fieldWhen));
    const yearInput = document.createElement('input');
    yearInput.type = 'text';
    yearInput.inputMode = 'numeric';
    yearInput.className = 'control-field__input';
    yearInput.placeholder = sceneCopy.whenNow;
    const yearErrorEl = document.createElement('p');
    yearErrorEl.className = 'control-field__error';
    yearErrorEl.hidden = true;
    whenField.append(yearInput, yearErrorEl);

    const showField = document.createElement('fieldset');
    showField.className = 'control-field';
    const showLegend = document.createElement('legend');
    showLegend.textContent = sceneCopy.fieldShow;
    showField.append(showLegend);
    const showGroup = document.createElement('div');
    showGroup.className = 'control-field__radios';
    showField.append(showGroup);

    const speedField = document.createElement('fieldset');
    speedField.className = 'control-field';
    const speedLegend = document.createElement('legend');
    speedLegend.textContent = sceneCopy.fieldSpeed;
    speedField.append(speedLegend);
    const speedGroup = document.createElement('div');
    speedGroup.className = 'control-field__radios';
    speedField.append(speedGroup);

    const cameraField = document.createElement('fieldset');
    cameraField.className = 'control-field';
    const cameraLegend = document.createElement('legend');
    cameraLegend.textContent = sceneCopy.fieldCamera;
    cameraField.append(cameraLegend);
    const cameraGroup = document.createElement('div');
    cameraGroup.className = 'control-field__radios';
    cameraField.append(cameraGroup);

    const soundToggle = textAction(sceneCopy.soundOn);
    soundToggle.classList.add('controls-panel__toggle');
    const pauseToggle = textAction(sceneCopy.pause);
    pauseToggle.classList.add('controls-panel__toggle');

    const about = textAction(sceneCopy.aboutThisPiece);
    about.className = 'text-action controls-panel__about';
    aboutButton = about;

    body.append(
      unavailableMessage,
      audioMessage,
      placeField,
      yourCountry,
      whenField,
      showField,
      speedField,
      cameraField,
      soundToggle,
      pauseToggle,
      about,
    );
    shell.append(header, body);

    const renderPlaces = (state: Omit<AppContext, 'session'>) => {
      const { places } = placeMaps();
      if (places.length) search = createPlaceSearch(places);
      placeList.replaceChildren();
      const results = search(placeQuery);
      for (const place of results) {
        const item = document.createElement('li');
        const button = textAction(place.name);
        button.className = 'control-field__choice';
        const disabled = state.unavailable.some(
          entry => selectionKey({ place: place.id, when: state.selection.when }) === selectionKey(entry),
        );
        if (disabled) button.disabled = true;
        if (place.id === state.selection.place) button.classList.add('control-field__choice--selected');
        button.addEventListener('click', () => send({ type: 'SELECT_PLACE', place: place.id }));
        item.append(button);
        placeList.append(item);
      }
      if (placeQuery.trim() && !results.length) {
        const empty = document.createElement('li');
        empty.className = 'control-field__empty';
        empty.textContent = sceneCopy.searchEmpty;
        placeList.append(empty);
      }
    };

    const renderSuggestion = () => {
      yourCountry.replaceChildren();
      if (!geoCountry) {
        yourCountry.hidden = true;
        return;
      }
      const match = placeMaps().byIso.get(geoCountry);
      if (!match) {
        yourCountry.hidden = true;
        return;
      }
      yourCountry.hidden = false;
      const label = document.createElement('p');
      label.className = 'control-field__suggestion-label';
      label.textContent = sceneCopy.yourCountry;
      const button = textAction(match.name);
      button.addEventListener('click', () => send({ type: 'SELECT_PLACE', place: match.id }));
      yourCountry.append(label, button);
    };

    const renderRadios = <T extends string>(
      group: HTMLElement,
      name: string,
      options: readonly { value: T; label: string }[],
      current: T,
      onPick: (value: T) => void,
      disabled = false,
    ) => {
      group.replaceChildren();
      for (const option of options) {
        const id = `${name}-${option.value}`;
        const wrap = document.createElement('label');
        wrap.className = 'control-field__radio';
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = name;
        input.id = id;
        input.value = option.value;
        input.checked = option.value === current;
        input.disabled = disabled;
        input.addEventListener('change', () => onPick(option.value));
        const text = document.createElement('span');
        text.textContent = option.label;
        if (option.value === current) text.classList.add('control-field__radio--selected');
        wrap.append(input, text);
        group.append(wrap);
      }
    };

    placeSearchInput.addEventListener('input', () => {
      placeQuery = placeSearchInput.value;
      renderPlaces(latestState);
    });

    yearInput.addEventListener('blur', () => commitYear());
    yearInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitYear();
      }
    });

    function commitYear(): void {
      yearDraft = yearInput.value.trim();
      if (!yearDraft || yearDraft.toLowerCase() === 'now') {
        yearError = '';
        yearErrorEl.hidden = true;
        send({ type: 'RETURN_TO_NOW' });
        return;
      }
      if (!isWholeYear(yearDraft)) {
        yearError = sceneCopy.yearInvalid;
        yearErrorEl.hidden = false;
        yearErrorEl.textContent = yearError;
        return;
      }
      const year = Number(yearDraft);
      if (!yearValid(year)) {
        yearError = sceneCopy.yearInvalid;
        yearErrorEl.hidden = false;
        yearErrorEl.textContent = yearError;
        return;
      }
      yearError = '';
      yearErrorEl.hidden = true;
      send({ type: 'SELECT_YEAR', year });
    }

    soundToggle.addEventListener('click', () => send({ type: 'TOGGLE_SOUND' }));
    pauseToggle.addEventListener('click', () => send({ type: 'TOGGLE_PAUSE' }));
    about.addEventListener('click', () => send({ type: 'OPEN_ABOUT' }));

    panel.addEventListener('keydown', event => trapFocus(panel, event));

    let latestState = {} as Omit<AppContext, 'session'>;

    const refresh = (state: Omit<AppContext, 'session'>) => {
      latestState = state;
      const selectors = selectApp(state as AppContext);
      placeSearchInput.value = placeQuery || placeMaps().byId.get(state.selection.place)?.name || '';
      if (state.selection.when.kind === 'now') {
        yearInput.value = '';
        yearInput.placeholder = sceneCopy.whenNow;
      } else {
        yearInput.value = String(state.selection.when.year);
      }
      yearErrorEl.hidden = !yearError;
      yearErrorEl.textContent = yearError;
      unavailableMessage.hidden = !showRatesUnavailable;
      unavailableMessage.textContent = sceneCopy.ratesUnavailable;
      audioMessage.hidden = !state.audioUnavailable;
      audioMessage.textContent = sceneCopy.audioUnavailable;
      soundToggle.textContent = state.sound ? sceneCopy.soundOn : sceneCopy.soundOff;
      soundToggle.setAttribute('aria-pressed', String(state.sound));
      pauseToggle.textContent = state.pausedByUser ? sceneCopy.resume : sceneCopy.pause;
      pauseToggle.setAttribute('aria-pressed', String(state.pausedByUser));
      renderPlaces(state);
      renderSuggestion();
      renderRadios(showGroup, 'show', [
        { value: 'both', label: showLabels.both },
        { value: 'arrivals', label: showLabels.arrivals },
        { value: 'departures', label: showLabels.departures },
      ], state.show, value => send({ type: 'SELECT_SHOW', show: value }));
      renderRadios(speedGroup, 'speed', [
        { value: '0.25', label: speedLabels[0.25] },
        { value: '1', label: speedLabels[1] },
        { value: '4', label: speedLabels[4] },
      ], String(state.speed), value => send({ type: 'SELECT_SPEED', speed: Number(value) as 0.25 | 1 | 4 }));
      renderRadios(cameraGroup, 'camera', [
        { value: 'under', label: cameraLabels.under },
        { value: 'level', label: cameraLabels.level },
        { value: 'above', label: cameraLabels.above },
      ], state.camera, value => send({ type: 'SELECT_CAMERA', camera: value as Camera }), selectors.cameraLocked);
    };

    return { shell, heading, refresh };
  }

  const controlsUi = buildControlsPanel();
  panel.append(controlsUi.shell);
  panelHost.append(panel);

  const colophonHeading = document.createElement('h2');
  colophonHeading.className = 'colophon-panel__heading';
  colophonHeading.textContent = sceneCopy.aboutThisPiece;
  colophonHeading.tabIndex = -1;
  const colophonClose = textAction(sceneCopy.close);
  colophonClose.addEventListener('click', () => send({ type: 'CLOSE_OVERLAY' }));
  const colophonBody = document.createElement('div');
  colophonBody.className = 'colophon-panel__body';
  for (const paragraph of colophonCopy.paragraphs) {
    const p = document.createElement('p');
    p.textContent = paragraph;
    colophonBody.append(p);
  }
  const links = document.createElement('p');
  const unLink = document.createElement('a');
  unLink.href = colophonCopy.unDataUrl;
  unLink.textContent = colophonCopy.unDataLabel;
  const licenceLink = document.createElement('a');
  licenceLink.href = colophonCopy.licenceUrl;
  licenceLink.textContent = colophonCopy.licenceLabel;
  links.append(unLink, ' · ', licenceLink);
  colophonBody.append(links);
  colophon.append(colophonHeading, colophonClose, colophonBody);
  colophon.addEventListener('keydown', event => trapFocus(colophon, event));
  panelHost.append(colophon);

  controlsOpen.addEventListener('click', () => send({ type: 'OPEN_CONTROLS' }));
  returnToNow.addEventListener('click', () => send({ type: 'RETURN_TO_NOW' }));

  const onDocClick = (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (panelHost.hidden) return;
    if (panel.contains(target) || colophon.contains(target) || controlsOpen.contains(target)) return;
    send({ type: 'CLOSE_OVERLAY' });
  };
  document.addEventListener('click', onDocClick);

  const onKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || panelHost.hidden) return;
    event.preventDefault();
    send({ type: 'CLOSE_OVERLAY' });
  };
  document.addEventListener('keydown', onKeydown);

  async function fetchGeoOnce(): Promise<void> {
    if (geoFetched) return;
    geoFetched = true;
    try {
      const response = await fetch('/api/geo');
      if (!response.ok) return;
      const payload = (await response.json()) as { country?: string | null };
      geoCountry = typeof payload.country === 'string' ? payload.country : null;
      controlsUi.refresh(latestState);
    } catch {
      geoCountry = null;
    }
  }

  let latestState = {} as Omit<AppContext, 'session'>;

  return {
    update(state) {
      latestState = state;
      const selKey = selectionKey(state.selection);
      const pendingKey = state.pending ? selectionKey(state.pending) : null;
      if (previousPendingKey && !pendingKey && selKey === previousSelectionKey) {
        showRatesUnavailable = true;
      }
      if (pendingKey) showRatesUnavailable = false;
      previousPendingKey = pendingKey;
      previousSelectionKey = selKey;
      const selectors = selectApp(state as AppContext);
      returnToNow.hidden = state.selection.when.kind === 'now';
      projection.hidden = !selectors.isProjection;
      controlsOpen.hidden = state.phase !== 'ready' && state.phase !== 'fallback';
      const captionKey = `${state.selection.place}:${state.selection.when.kind === 'now' ? 'now' : state.selection.when.year}`;
      if (captionKey !== lastSelectionKey && state.phase === 'ready') {
        lastSelectionKey = captionKey;
        const surface = overlay.closest('.scene-surface');
        if (surface instanceof HTMLElement) {
          surface.classList.remove('scene-surface--selection');
          void surface.offsetWidth;
          surface.classList.add('scene-surface--selection');
        }
      }

      if (state.overlay === 'controls') {
        panelHost.hidden = false;
        panel.hidden = false;
        colophon.hidden = true;
        void fetchGeoOnce();
        controlsUi.refresh(state);
        if (!panelHost.dataset.open) {
          panelHost.dataset.open = 'true';
          controlsTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : controlsOpen;
          controlsUi.heading.focus();
        }
      } else if (state.overlay === 'about') {
        panelHost.hidden = false;
        panel.hidden = true;
        colophon.hidden = false;
        if (!panelHost.dataset.about) {
          panelHost.dataset.about = 'true';
          colophonHeading.focus();
        }
      } else {
        panelHost.hidden = true;
        delete panelHost.dataset.open;
        delete panelHost.dataset.about;
        if (previousOverlay !== 'none' && controlsTrigger) {
          controlsTrigger.focus();
          controlsTrigger = null;
        }
      }
      if (previousOverlay === 'about' && state.overlay === 'controls') {
        aboutButton?.focus();
      }
      previousOverlay = state.overlay;
      controlsUi.refresh(state);
    },
    dispose() {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKeydown);
      controlsOpen.remove();
      returnToNow.remove();
      projection.remove();
      panelHost.remove();
    },
  };
}
