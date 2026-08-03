import * as THREE from 'three';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { createScene } from './scene';
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
  const { renderer, scene, camera, cameraTarget } = ctx;

  // ---- Object graph -------------------------------------------------------
  const bottle = createBottle();
  const cap = createCap();
  const capsule = createCapsule();
  const particles = createPowderParticles(capsule.seamLocal, isMobile ? 120 : 300);

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
    window.addEventListener('resize', () => {
      ctx.resize(window.innerWidth, window.innerHeight);
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
  Object.assign(window, { __lenis: lenis });

  const timeline = buildTimeline({
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
  });

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

  // Pause the loop when the tab is hidden
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(rafId);
    } else {
      rafId = requestAnimationFrame(frame);
    }
  });

  // Resize: renderer + camera + callout re-projection + trigger refresh
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    ctx.resize(window.innerWidth, window.innerHeight);
    callouts.resize();
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => ScrollTrigger.refresh(), 200);
  });

  window.addEventListener('pagehide', () => {
    cancelAnimationFrame(rafId);
    timeline.scrollTrigger?.kill();
    timeline.kill();
    lenis.destroy();
    callouts.dispose();
    particles.dispose();
    capsule.dispose();
    cap.dispose();
    bottle.dispose();
    ctx.dispose();
  });
}
