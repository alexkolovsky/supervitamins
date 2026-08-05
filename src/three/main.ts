import * as THREE from 'three';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import Snap from 'lenis/snap';
import { createScene, frameHero } from './scene';
import { createBottle } from './objects/bottle';
import { createCap } from './objects/cap';
import { createCapsule } from './objects/capsule';
import { createPowderParticles } from './objects/particles';
import {
  buildTimeline,
  CAPSULE_SHOWCASE,
  CAPSULE_SHOWCASE_SCALE,
  CAPSULE_SHOWCASE_TILT,
  type FloatState,
} from './timeline';
import { createCallouts } from './callouts';

function webglAvailable(): boolean {
  try {
    const probe = document.createElement('canvas');
    return Boolean(probe.getContext('webgl2') ?? probe.getContext('webgl'));
  } catch {
    return false;
  }
}

export function init(): void {
  const canvas = document.getElementById('webgl');
  if (!(canvas instanceof HTMLCanvasElement)) return;

  if (!webglAvailable()) {
    document.documentElement.classList.add('no-webgl');
    return;
  }

  const isMobile = window.innerWidth < 768;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const ctx = createScene(canvas, isMobile);
  const { renderer, scene, camera, cameraTarget, keyLight } = ctx;

  // ---- Object graph -------------------------------------------------------
  const bottle = createBottle();
  const cap = createCap();
  const capsule = createCapsule();
  const particles = createPowderParticles(capsule.seamLocal, isMobile ? 260 : 700);

  // heroFloat carries the idle bob/rotation for the bottle + cap together
  const heroFloat = new THREE.Group();
  heroFloat.name = 'heroFloat';
  bottle.group.position.y = -1.42;
  heroFloat.add(bottle.group);

  const capRoot = new THREE.Group();
  capRoot.name = 'capRoot';
  capRoot.position.set(0, bottle.neckTopY - 1.42, 0);
  capRoot.add(cap.group);
  heroFloat.add(capRoot);
  scene.add(heroFloat);

  // capsuleRig is timeline-driven; capsule.group carries idle bob + spin
  const capsuleRig = new THREE.Group();
  capsuleRig.name = 'capsuleRig';
  capsuleRig.position.set(0, 0.7, 0);
  capsuleRig.scale.setScalar(0.55);
  capsuleRig.add(capsule.group);
  // Anchors ride the rig (tilt + scale + position) but not the capsule's
  // Y-spin, so callout lines stay pinned to the silhouette while it rotates.
  for (const anchor of capsule.anchors) capsuleRig.add(anchor);
  scene.add(capsuleRig);
  capsule.setOpacity(0);

  capsule.group.add(particles.mesh);

  const shadowMesh = scene.getObjectByName('contactShadow');
  const shadowMaterial =
    shadowMesh instanceof THREE.Mesh && shadowMesh.material instanceof THREE.Material
      ? shadowMesh.material
      : new THREE.MeshBasicMaterial();

  const callouts = createCallouts(camera, capsule.anchors);
  const dimEl = document.getElementById('scene-dim');

  const floatState: FloatState = { hero: 1, capsule: 0 };

  function render(): void {
    camera.lookAt(cameraTarget);
    renderer.render(scene, camera);
  }

  // ---- Reduced motion: static showcase pose, native scroll ----------------
  if (reducedMotion) {
    document.documentElement.classList.add('reduced-motion');
    bottle.setOpacity(0);
    cap.setOpacity(0);
    shadowMaterial.opacity = 0;
    capsule.setOpacity(1);
    capsuleRig.position.copy(CAPSULE_SHOWCASE);
    capsuleRig.scale.setScalar(CAPSULE_SHOWCASE_SCALE);
    capsuleRig.rotation.z = CAPSULE_SHOWCASE_TILT;
    camera.position.set(0.15, 1.55, 4.4);
    cameraTarget.copy(CAPSULE_SHOWCASE);

    const renderStatic = (): void => {
      scene.updateMatrixWorld(true);
      callouts.showStatic();
      render();
    };
    renderStatic();
    ctx.environmentReady.then(renderStatic);
    window.addEventListener('resize', () => {
      ctx.resize(canvas.clientWidth, canvas.clientHeight);
      callouts.resize();
      renderStatic();
    });
    return;
  }

  // ---- Scroll pipeline: Lenis -> ScrollTrigger -> master timeline ---------
  gsap.registerPlugin(ScrollTrigger);
  const lenis = new Lenis({ smoothWheel: true, lerp: 0.1 });
  lenis.on('scroll', ScrollTrigger.update);
  // Exposed for QA tooling / debugging (harmless in production)
  const debugExpose: Record<string, unknown> = { __lenis: lenis };
  Object.assign(window, debugExpose);

  const timelineTargets = {
    camera,
    cameraTarget,
    heroFloat,
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
  };

  // Captured before any timeline mutation so a rebuild can restore them.
  const keyIntensity0 = keyLight.intensity;
  const envIntensity0 = scene.environmentIntensity;
  const shadowOpacity0 = shadowMaterial.opacity;

  // Everything the timeline mutates, back to its authored initial pose.
  // A freshly built scrubbed timeline re-applies state up to the current
  // scroll on its first render, so reset + rebuild is scrub-exact.
  function resetSceneState(): void {
    frameHero(camera, cameraTarget);
    capRoot.position.set(0, bottle.neckTopY - 1.42, 0);
    capRoot.rotation.set(0, 0, 0);
    cap.setOpacity(1);
    bottle.group.scale.setScalar(1);
    bottle.group.position.y = -1.42;
    bottle.setOpacity(1);
    shadowMaterial.opacity = shadowOpacity0;
    capsuleRig.position.set(0, 0.7, 0);
    capsuleRig.scale.setScalar(0.55);
    capsuleRig.rotation.set(0, 0, 0);
    capsule.group.rotation.y = 0;
    capsule.setSplit(0);
    capsule.setOpacity(0);
    particles.setProgress(0);
    floatState.hero = 1;
    floatState.capsule = 0;
    scene.environmentIntensity = envIntensity0;
    keyLight.intensity = keyIntensity0;
    // Drop the inline overrides GSAP wrote so the stylesheet defaults return
    for (const prop of ['--bg-a', '--bg-b', '--header-ink', '--header-scrim']) {
      document.body.style.removeProperty(prop);
    }
    const sparkles = document.getElementById('sparkle-field');
    if (sparkles) sparkles.style.opacity = '';
    if (dimEl) dimEl.style.opacity = '';
  }

  let timeline = buildTimeline(timelineTargets);

  // The timeline bakes aspect-dependent poses (portrait CTA framing) at build
  // time, so crossing the portrait boundary needs a rebuild, not just refresh.
  function rebuildTimeline(): void {
    timeline.scrollTrigger?.kill();
    timeline.kill();
    resetSceneState();
    timeline = buildTimeline(timelineTargets);
  }

  // ---- Chapter snapping: the page always settles on a composed pose -------
  // Element snaps track section tops through resizes; two extra value snaps
  // pin the full-callout infographic pose (master progress ~0.7) and the
  // document end (CTA + footer).
  // 'lock': direction-aware paging — a scroll gesture settles on the NEXT
  // stop in that direction (never pulls back to the nearest one), and input
  // is locked while the snap animation runs.
  const snap = new Snap(lenis, {
    type: 'lock',
    duration: 1.1,
    debounce: 400,
    // Effectively unlimited: every gesture settles on the next stop in its
    // direction, even across the tall infographic chapter.
    distanceThreshold: 100000,
    easing: (t: number) => 1 - Math.pow(1 - t, 4),
  });
  for (const sel of ['#hero', '#cap-off', '#dive', '#infographic', '#split']) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el) snap.addElement(el, { align: 'start' });
  }
  const footer = document.querySelector<HTMLElement>('footer');
  if (footer) snap.addElement(footer, { align: 'end' });
  const infoPose = (): number =>
    0.7 * (document.documentElement.scrollHeight - window.innerHeight);
  let removeInfoSnap = snap.add(infoPose());
  Object.assign(window, { __snap: snap });

  let rafId = 0;
  function frame(time: number): void {
    rafId = requestAnimationFrame(frame);
    lenis.raf(time);

    // Ambient, time-based idle motion weighted by scrubbed floatState —
    // continuous in both directions, so scrubbing never pops.
    heroFloat.position.y = Math.sin(time * 0.0011) * 0.06 * floatState.hero;
    heroFloat.rotation.y = Math.sin(time * 0.0004) * 0.12 * floatState.hero;
    capsule.group.position.y = Math.sin(time * 0.0012) * 0.035 * floatState.capsule;
    capsule.group.rotation.x = Math.sin(time * 0.0007) * 0.06 * floatState.capsule;

    callouts.update(timeline.progress());
    render();
  }
  rafId = requestAnimationFrame(frame);

  // Pause the loop when the tab is hidden. `destroyed` keeps a late
  // hidden→visible flip (bfcache-style navigations) from rescheduling a
  // frame against disposed GL resources; the unconditional cancel keeps a
  // visible event from ever double-scheduling the loop.
  let destroyed = false;
  document.addEventListener('visibilitychange', () => {
    cancelAnimationFrame(rafId);
    if (!document.hidden && !destroyed) {
      rafId = requestAnimationFrame(frame);
    }
  });

  // Resize: renderer + camera + callout re-projection + trigger refresh.
  // Canvas is 100vw × 100lvh, so mobile URL-bar show/hide is a no-op here —
  // bail early instead of refreshing triggers mid-scroll.
  let resizeTimer = 0;
  let lastW = canvas.clientWidth;
  let lastH = canvas.clientHeight;
  let wasPortrait = camera.aspect < 0.75;
  window.addEventListener('resize', () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === lastW && h === lastH) return;
    lastW = w;
    lastH = h;
    ctx.resize(w, h);
    callouts.resize();
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      if ((camera.aspect < 0.75) !== wasPortrait) {
        wasPortrait = camera.aspect < 0.75;
        rebuildTimeline();
      }
      ScrollTrigger.refresh();
      removeInfoSnap();
      removeInfoSnap = snap.add(infoPose());
    }, 200);
  });

  window.addEventListener('pagehide', () => {
    destroyed = true;
    cancelAnimationFrame(rafId);
    timeline.scrollTrigger?.kill();
    timeline.kill();
    snap.destroy();
    lenis.destroy();
    callouts.dispose();
    particles.dispose();
    capsule.dispose();
    cap.dispose();
    bottle.dispose();
    ctx.dispose();
  });
}
