/** Page chrome: persistent header + chapter progress rail.
 *  Runs on native scroll state so it works with or without the WebGL timeline. */

interface LenisLike {
  scrollTo(target: number | HTMLElement, opts?: Record<string, unknown>): void;
}

export function initUi(): void {
  const header = document.getElementById('site-header');
  const railFill = document.querySelector<HTMLElement>('.rail-fill');
  const ticks = Array.from(document.querySelectorAll<HTMLAnchorElement>('.rail-tick'));

  // rAF-driven (not scroll events): Lenis owns the scroll, and a per-frame
  // read is the one signal that never goes stale. Writes are skipped when
  // the value hasn't changed.
  let lastP = -1;
  function update(): void {
    requestAnimationFrame(update);
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const p = max > 0 ? window.scrollY / max : 0;
    if (Math.abs(p - lastP) < 0.0005) return;
    lastP = p;
    if (railFill) railFill.style.height = `${(p * 100).toFixed(2)}%`;
    header?.classList.toggle('is-visible', p > 0.18);
  }
  requestAnimationFrame(update);

  // Route rail/header anchors through Lenis when it's driving the scroll,
  // so the timeline scrubs through chapters instead of jumping.
  for (const tick of ticks) {
    tick.addEventListener('click', (e) => {
      const lenis = (window as { __lenis?: LenisLike }).__lenis;
      const target = document.querySelector<HTMLElement>(tick.getAttribute('href') ?? '');
      if (lenis && target) {
        e.preventDefault();
        lenis.scrollTo(target, { duration: 1.6 });
      }
    });
  }
}
