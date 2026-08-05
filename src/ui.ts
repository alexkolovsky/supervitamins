/** Page chrome: persistent header + chapter progress rail.
 *  Runs on native scroll state so it works with or without the WebGL timeline. */

interface LenisLike {
  scrollTo(target: number | HTMLElement, opts?: Record<string, unknown>): void;
}

export function initUi(): void {
  const header = document.getElementById('site-header');
  const railFill = document.querySelector<HTMLElement>('.rail-fill');

  // rAF-driven (not scroll events): Lenis owns the scroll, and a per-frame
  // read is the one signal that never goes stale. Writes are skipped when
  // the value hasn't changed.
  let lastP = -1;
  function update(): void {
    requestAnimationFrame(update);
    if (document.hidden) return;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const p = max > 0 ? window.scrollY / max : 0;
    if (Math.abs(p - lastP) < 0.0005) return;
    lastP = p;
    if (railFill) railFill.style.height = `${(p * 100).toFixed(2)}%`;
    header?.classList.toggle('is-visible', p > 0.18);
  }
  requestAnimationFrame(update);

  // Route every in-page anchor through Lenis when it's driving the scroll,
  // so the timeline scrubs through chapters instead of jumping. Some chapters
  // compose at a timeline position, not at their section's top:
  //  - #infographic: the full-callout pose sits at master progress 0.7
  //  - #cta: the settled finale (dim + pulled-back camera) is the document end
  const poseFor = (hash: string): number | HTMLElement | null => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (hash === '#infographic') return max * 0.7;
    if (hash === '#cta') return max;
    return document.querySelector<HTMLElement>(hash);
  };

  for (const link of document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')) {
    link.addEventListener('click', (e) => {
      const lenis = (window as { __lenis?: LenisLike }).__lenis;
      const dest = poseFor(link.getAttribute('href') ?? '');
      if (lenis && dest !== null) {
        e.preventDefault();
        lenis.scrollTo(dest, { duration: 1.6 });
      }
    });
  }
}
