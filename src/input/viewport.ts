/** Keeps `--vvh` aligned with the visual viewport for overlay max-height. */
export function bindVisualViewport(doc: Document): () => void {
  const root = doc.documentElement;
  const view = doc.defaultView;
  if (!view) return () => {};
  const apply = () => {
    const vv = view.visualViewport;
    const height = vv?.height ?? view.innerHeight;
    root.style.setProperty('--vvh', `${height}px`);
  };
  apply();
  view.visualViewport?.addEventListener('resize', apply);
  view.visualViewport?.addEventListener('scroll', apply);
  view.addEventListener('resize', apply);
  return () => {
    view.visualViewport?.removeEventListener('resize', apply);
    view.visualViewport?.removeEventListener('scroll', apply);
    view.removeEventListener('resize', apply);
    root.style.removeProperty('--vvh');
  };
}
