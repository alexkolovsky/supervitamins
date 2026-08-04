import * as THREE from 'three';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type { Bottle } from './objects/bottle';
import type { Cap } from './objects/cap';
import type { Capsule } from './objects/capsule';
import type { PowderParticles } from './objects/particles';

gsap.registerPlugin(ScrollTrigger);

export interface FloatState {
  /** Weight of the bottle idle float (1 in hero, eased to 0 while the cap unscrews). */
  hero: number;
  /** Weight of the capsule idle bob (0 until the reveal completes). */
  capsule: number;
}

export interface TimelineTargets {
  camera: THREE.PerspectiveCamera;
  cameraTarget: THREE.Vector3;
  heroFloat: THREE.Group;
  capRoot: THREE.Group;
  capsuleRig: THREE.Group;
  bottle: Bottle;
  cap: Cap;
  capsule: Capsule;
  particles: PowderParticles;
  shadowMaterial: THREE.Material;
  floatState: FloatState;
  dimEl: HTMLElement | null;
  /** Scene + key light for chapter-matched exposure grading. */
  scene: THREE.Scene;
  keyLight: THREE.DirectionalLight;
}

/** Where the capsule ends up for the infographic showcase. */
export const CAPSULE_SHOWCASE = new THREE.Vector3(0, 1.5, 1.0);
export const CAPSULE_SHOWCASE_SCALE = 1.12;
export const CAPSULE_SHOWCASE_TILT = -0.85;

// Master-progress boundaries (fractions of total scroll)
const CAP_START = 0.167;
const CAP_UNSCREW_END = 0.285;
const CAP_GONE = 0.333;
const DIVE_START = 0.333;
const RISE_START = 0.36;
const INFO_START = 0.5;
const INFO_END = 0.78;
const SPLIT_START = 0.78;
const SPLIT_END = 0.92;

export function buildTimeline(t: TimelineTargets): gsap.core.Timeline {
  const {
    camera,
    cameraTarget,
    capRoot,
    capsuleRig,
    bottle,
    cap,
    capsule,
    particles,
    shadowMaterial,
    floatState,
    dimEl,
    scene,
    keyLight,
  } = t;

  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: {
      trigger: '#scroll-root',
      start: 'top top',
      end: 'bottom bottom',
      scrub: true,
    },
  });

  // No-op spanning the full duration so position fractions map 1:1 to progress.
  tl.to({ p: 0 }, { p: 1, duration: 1 }, 0);

  // ---- Cap-off (0.167 – 0.333) -------------------------------------------
  // Rotation and lift share one eased tween so it reads as unscrewing.
  const unscrewDur = CAP_UNSCREW_END - CAP_START;
  tl.to(
    capRoot.rotation,
    { y: -Math.PI * 4, duration: unscrewDur, ease: 'power1.inOut' },
    CAP_START,
  );
  tl.to(
    capRoot.position,
    { y: capRoot.position.y + 0.38, duration: unscrewDur, ease: 'power1.inOut' },
    CAP_START,
  );

  // Then drift up-left and fade out
  const driftDur = CAP_GONE - CAP_UNSCREW_END;
  tl.to(
    capRoot.position,
    { y: capRoot.position.y + 1.7, x: -1.25, duration: driftDur, ease: 'power1.in' },
    CAP_UNSCREW_END,
  );
  tl.to(capRoot.rotation, { z: -0.55, duration: driftDur }, CAP_UNSCREW_END);
  const capFade = { o: 1 };
  tl.to(
    capFade,
    { o: 0, duration: driftDur, onUpdate: () => cap.setOpacity(capFade.o) },
    CAP_UNSCREW_END,
  );

  // Bottle idle float hands off to the choreography
  tl.to(floatState, { hero: 0, duration: unscrewDur, ease: 'power1.out' }, CAP_START);

  // Camera: slow dolly-in during cap-off
  tl.to(camera.position, { x: 0, y: 1.1, z: 5.6, duration: CAP_GONE - CAP_START, ease: 'power1.inOut' }, CAP_START);
  tl.to(cameraTarget, { x: 0, y: 0.9, z: 0, duration: CAP_GONE - CAP_START, ease: 'power1.inOut' }, CAP_START);

  // ---- Dive & reveal (0.333 – 0.5) ---------------------------------------
  // Camera dives toward the bottle mouth...
  tl.to(camera.position, { x: 0, y: 2.0, z: 3.7, duration: 0.09, ease: 'power1.inOut' }, DIVE_START);
  tl.to(cameraTarget, { x: 0, y: 1.35, z: 0.35, duration: 0.09, ease: 'power1.inOut' }, DIVE_START);
  // ...then pulls back to frame the risen capsule
  tl.to(camera.position, { x: 0, y: 1.5, z: 4.5, duration: 0.077, ease: 'power1.inOut' }, DIVE_START + 0.09);
  tl.to(
    cameraTarget,
    { x: CAPSULE_SHOWCASE.x, y: CAPSULE_SHOWCASE.y, z: CAPSULE_SHOWCASE.z, duration: 0.077, ease: 'power1.inOut' },
    DIVE_START + 0.09,
  );

  // Capsule rises out of the neck along a curved path
  const risePath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.7, 0),
    new THREE.Vector3(0.05, 1.75, 0.15),
    new THREE.Vector3(-0.28, 2.45, 0.85),
    new THREE.Vector3(0.12, 2.05, 1.3),
    CAPSULE_SHOWCASE.clone(),
  ]);
  const rise = { t: 0 };
  const risePoint = new THREE.Vector3();
  tl.to(
    rise,
    {
      t: 1,
      duration: INFO_START - RISE_START,
      ease: 'power1.inOut',
      onUpdate: () => {
        risePath.getPoint(rise.t, risePoint);
        capsuleRig.position.copy(risePoint);
      },
    },
    RISE_START,
  );
  // Scale up only after the capsule has cleared the bottle neck
  tl.to(
    capsuleRig.scale,
    {
      x: CAPSULE_SHOWCASE_SCALE,
      y: CAPSULE_SHOWCASE_SCALE,
      z: CAPSULE_SHOWCASE_SCALE,
      duration: INFO_START - (RISE_START + 0.05),
      ease: 'power1.in',
    },
    RISE_START + 0.05,
  );
  tl.to(capsuleRig.rotation, { z: CAPSULE_SHOWCASE_TILT, duration: INFO_START - RISE_START, ease: 'power1.inOut' }, RISE_START);

  const capsuleFade = { o: 0 };
  tl.to(
    capsuleFade,
    { o: 1, duration: 0.05, onUpdate: () => capsule.setOpacity(capsuleFade.o) },
    RISE_START,
  );

  // Bottle recedes and fades (fake defocus)
  const bottleFade = { o: 1 };
  tl.to(
    bottleFade,
    { o: 0, duration: 0.12, ease: 'power1.in', onUpdate: () => bottle.setOpacity(bottleFade.o) },
    RISE_START + 0.02,
  );
  tl.to(bottle.group.scale, { x: 0.85, y: 0.85, z: 0.85, duration: 0.14 }, RISE_START);
  tl.to(bottle.group.position, { y: '-=0.35', duration: 0.14 }, RISE_START);
  tl.to(shadowMaterial, { opacity: 0, duration: 0.1 }, RISE_START);

  // Capsule idle bob takes over
  tl.to(floatState, { capsule: 1, duration: 0.08, ease: 'power1.out' }, INFO_START - 0.04);

  // ---- Infographic (0.5 – 0.78): slow scrubbed spin ----------------------
  tl.to(capsule.group.rotation, { y: 2.3, duration: INFO_END - INFO_START }, INFO_START);
  tl.to(camera.position, { x: 0.15, y: 1.55, z: 4.4, duration: INFO_END - INFO_START, ease: 'power1.inOut' }, INFO_START);

  // ---- Split (0.78 – 0.92) ------------------------------------------------
  // Drift left as the halves separate, keeping the right lane clear for copy
  tl.to(capsuleRig.position, { x: -0.55, duration: SPLIT_END - SPLIT_START, ease: 'power1.inOut' }, SPLIT_START);

  const split = { t: 0 };
  tl.to(
    split,
    {
      t: 1,
      duration: SPLIT_END - SPLIT_START,
      ease: 'power1.inOut',
      onUpdate: () => capsule.setSplit(split.t),
    },
    SPLIT_START,
  );
  const spill = { t: 0 };
  tl.to(
    spill,
    { t: 1, duration: 1 - SPLIT_START, onUpdate: () => particles.setProgress(spill.t) },
    SPLIT_START,
  );
  tl.to(capsule.group.rotation, { y: 2.9, duration: 1 - SPLIT_START }, SPLIT_START);

  // ---- Chapter color grade -------------------------------------------------
  // The page backdrop is a fixed gradient on <body> driven by --bg-a/--bg-b.
  // Each chapter gets its own field; lighting eases in the same segments so
  // the object sits *in* the scene instead of floating over it.
  const tok = (name: string): string =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const body = document.body;
  const sparkles = document.getElementById('sparkle-field');

  const grade = (
    pos: number,
    dur: number,
    a: string,
    b: string,
    headerInk: string,
    scrim: number,
    env: number,
    key: number,
  ): void => {
    tl.to(
      body,
      { '--bg-a': tok(a), '--bg-b': tok(b), duration: dur, ease: 'sine.inOut' },
      pos,
    );
    // Ink + scrim flip faster than the field so the header never lingers
    // in the low-contrast middle of the crossfade.
    tl.to(
      body,
      {
        '--header-ink': tok(headerInk),
        '--header-scrim': scrim,
        duration: Math.min(dur, 0.05),
        ease: 'sine.inOut',
      },
      pos,
    );
    tl.to(scene, { environmentIntensity: env, duration: dur, ease: 'sine.inOut' }, pos);
    tl.to(keyLight, { intensity: key, duration: dur, ease: 'sine.inOut' }, pos);
  };

  // Cap-off / dive: sink into the bottle — deep coral
  grade(0.14, 0.14, '--coral-500', '--coral-700', '--ivory', 1, 0.85, 1.35);
  // Infographic: lift back up so the ivory lines and capsule pop
  grade(0.4, 0.1, '--coral-300', '--coral-500', '--berry-900', 0, 1.0, 1.6);
  // Split: warmest, most saturated moment
  grade(0.74, 0.06, '--coral-500', '--coral-700', '--ivory', 1, 0.92, 1.45);
  // CTA: near-berry dusk close
  grade(0.9, 0.08, '--dusk-a', '--dusk-b', '--ivory', 1, 0.78, 1.15);

  // Sparkles belong to the airy hero — gone once the dive begins.
  if (sparkles) {
    tl.to(sparkles, { opacity: 0, duration: 0.08 }, CAP_START);
  }

  // ---- CTA settle (0.92 – 1) ----------------------------------------------
  // Portrait: pull further back so the split halves frame the CTA copy
  // instead of crossing it on narrow screens.
  const portrait = camera.aspect < 0.75;
  tl.to(
    camera.position,
    { x: 0, y: 1.65, z: portrait ? 7.0 : 5.3, duration: 1 - SPLIT_END, ease: 'power1.inOut' },
    SPLIT_END,
  );
  tl.to(
    capsuleRig.position,
    { y: CAPSULE_SHOWCASE.y + (portrait ? 0.55 : 0.25), duration: 1 - SPLIT_END, ease: 'power1.inOut' },
    SPLIT_END,
  );
  if (dimEl) {
    tl.to(dimEl, { opacity: 0.85, duration: 1 - SPLIT_END }, SPLIT_END);
  }

  return tl;
}
