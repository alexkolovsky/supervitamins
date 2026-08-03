import * as THREE from 'three';

export interface CalloutSystem {
  /** Re-project anchors and drive reveal state from master timeline progress. */
  update(progress: number): void;
  /** Static pose for reduced-motion / fallback rendering. */
  showStatic(): void;
  resize(): void;
  dispose(): void;
}

interface CalloutEntry {
  el: HTMLElement;
  line: SVGLineElement;
  anchor: THREE.Object3D;
  side: 'left' | 'right';
  reveal: [number, number];
  width: number;
}

/** Reveal windows on the master timeline (staggered, two per side). */
const REVEAL_WINDOWS: Array<[number, number]> = [
  [0.53, 0.6],
  [0.57, 0.64],
  [0.61, 0.68],
  [0.65, 0.72],
];
const FADE_OUT_START = 0.8;
const FADE_OUT_LENGTH = 0.05;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const smooth = (v: number): number => v * v * (3 - 2 * v);

export function createCallouts(camera: THREE.PerspectiveCamera, anchors: THREE.Object3D[]): CalloutSystem {
  const layer = document.getElementById('callout-layer');
  const svg = document.getElementById('callout-lines');
  const els = Array.from(document.querySelectorAll<HTMLElement>('.callout'));
  const mobileQuery = window.matchMedia('(max-width: 767px)');

  const entries: CalloutEntry[] = [];
  if (layer && svg) {
    els.forEach((el, i) => {
      const anchor = anchors[i];
      const reveal = REVEAL_WINDOWS[i];
      if (!anchor || !reveal) return;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('stroke-linecap', 'round');
      svg.appendChild(line);
      entries.push({
        el,
        line,
        anchor,
        side: el.dataset.side === 'right' ? 'right' : 'left',
        reveal,
        width: el.offsetWidth,
      });
    });
  }

  const worldPos = new THREE.Vector3();

  function revealState(progress: number, [start, end]: [number, number]): { line: number; text: number; fade: number } {
    const local = clamp01((progress - start) / (end - start));
    const fade = 1 - clamp01((progress - FADE_OUT_START) / FADE_OUT_LENGTH);
    return {
      line: smooth(clamp01(local / 0.6)),
      text: smooth(clamp01((local - 0.35) / 0.65)),
      fade,
    };
  }

  function update(progress: number): void {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gutter = Math.max(20, vw * 0.05);

    for (const entry of entries) {
      const { line, text, fade } = revealState(progress, entry.reveal);

      if (mobileQuery.matches) {
        // Stacked list layout — CSS positions it; JS only drives the reveal.
        entry.el.style.opacity = String(text * fade);
        continue;
      }

      entry.anchor.getWorldPosition(worldPos);
      worldPos.project(camera);
      const ax = (worldPos.x * 0.5 + 0.5) * vw;
      const ay = Math.min(vh - 60, Math.max(60, (-worldPos.y * 0.5 + 0.5) * vh));

      let textLeft: number;
      let textEdgeX: number;
      if (entry.side === 'left') {
        textLeft = gutter;
        textEdgeX = gutter + entry.width + 18;
      } else {
        textLeft = vw - gutter - entry.width;
        textEdgeX = textLeft - 18;
      }

      entry.el.style.left = `${textLeft}px`;
      entry.el.style.top = `${ay}px`;
      entry.el.style.transform = `translateY(calc(-50% + ${(1 - text) * 14}px))`;
      entry.el.style.opacity = String(text * fade);

      // Connector draws from the capsule outward toward the text
      const lineStartX = entry.side === 'left' ? ax - 14 : ax + 14;
      const lineEndX = lineStartX + (textEdgeX - lineStartX) * line;
      entry.line.setAttribute('x1', String(lineStartX));
      entry.line.setAttribute('y1', String(ay));
      entry.line.setAttribute('x2', String(lineEndX));
      entry.line.setAttribute('y2', String(ay));
      entry.line.style.opacity = String(line * fade * 0.9);
    }
  }

  function showStatic(): void {
    update(0.75);
  }

  function resize(): void {
    for (const entry of entries) {
      entry.width = entry.el.offsetWidth;
    }
  }

  function dispose(): void {
    for (const entry of entries) {
      entry.line.remove();
    }
  }

  return { update, showStatic, resize, dispose };
}
