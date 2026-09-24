let liveRegion: HTMLElement | undefined;
let lastMessage = '';

export function bindAnnounceRegion(root: HTMLElement): void {
  liveRegion = document.createElement('div');
  liveRegion.className = 'sr-live';
  liveRegion.setAttribute('aria-live', 'polite');
  liveRegion.setAttribute('aria-atomic', 'true');
  root.append(liveRegion);
}

export function announce(message: string): void {
  if (!liveRegion || message === lastMessage) return;
  lastMessage = message;
  liveRegion.textContent = '';
  requestAnimationFrame(() => {
    if (liveRegion) liveRegion.textContent = message;
  });
}

export function resetAnnounce(): void {
  lastMessage = '';
}
