import * as THREE from 'three';

export interface Capsule {
  group: THREE.Group;
  /** Local-space point on the seam where powder spawns. */
  seamLocal: THREE.Vector3;
  /** Empty objects riding the capsule; callouts project from these. */
  anchors: THREE.Object3D[];
  /** 0 = closed, 1 = fully split apart. */
  setSplit(t: number): void;
  setOpacity(opacity: number): void;
  dispose(): void;
}

const BODY_RADIUS = 0.27;
// Cap half slides OVER the body: ~4.5% larger diameter
const CAP_RADIUS = 0.283;
const CAP_DOME_HEIGHT = 0.45;
const SEAM_Y = 0.1;

function createGrainTexture(scale: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, size, size);
    // Deterministic speckle noise (LCG so rebuilds look identical)
    let seed = 1337;
    const rand = (): number => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let i = 0; i < 42000; i++) {
      const v = 96 + Math.floor(rand() * 96);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      const s = rand() < 0.85 ? 1 : 2;
      ctx.fillRect(Math.floor(rand() * size), Math.floor(rand() * size), s, s);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(scale, scale);
  return texture;
}

const WALL = 0.012;
const BODY_DEPTH = 0.55; // straight side below the body rim

/**
 * Cap half as a lathe: dome top, straight overlap ring, and a sharp open rim
 * with a short inner wall — the rim edge is what catches the seam highlight,
 * and the visible wall thickness sells it as a real shell when open.
 * Local origin sits at the rim (y = 0), dome pointing +Y.
 */
function createCapHalfGeometry(): THREE.LatheGeometry {
  const r = CAP_RADIUS;
  const domeCenterY = CAP_DOME_HEIGHT - r;
  const points: THREE.Vector2[] = [];
  // Dome from pole to equator
  const domeSteps = 14;
  for (let i = 0; i <= domeSteps; i++) {
    const a = (i / domeSteps) * (Math.PI / 2);
    points.push(new THREE.Vector2(r * Math.sin(a), domeCenterY + r * Math.cos(a)));
  }
  // Straight overlap ring down to the rim
  points.push(new THREE.Vector2(r, 0.015));
  // Rim edge, wall thickness, then inner wall running back up
  points.push(new THREE.Vector2(r, 0));
  points.push(new THREE.Vector2(r - WALL, 0));
  points.push(new THREE.Vector2(r - WALL, 0.16));
  return new THREE.LatheGeometry(points, 64);
}

/**
 * Body half as a lathe: hemispherical bottom, straight side, and an OPEN top
 * rim with visible wall thickness — this is the cup the powder sits in.
 * Local origin sits at the open rim (y = 0), dome pointing -Y.
 */
function createBodyHalfGeometry(): THREE.LatheGeometry {
  const r = BODY_RADIUS;
  const points: THREE.Vector2[] = [];
  // Bottom dome from pole to equator
  const domeSteps = 14;
  for (let i = 0; i <= domeSteps; i++) {
    const a = (i / domeSteps) * (Math.PI / 2);
    points.push(new THREE.Vector2(r * Math.sin(a), -BODY_DEPTH - r * Math.cos(a)));
  }
  // Straight side up to the open rim
  points.push(new THREE.Vector2(r, 0));
  // Rim edge, wall thickness, short inner wall back down (powder hides the rest)
  points.push(new THREE.Vector2(r - WALL, 0));
  points.push(new THREE.Vector2(r - WALL, -0.14));
  return new THREE.LatheGeometry(points, 64);
}

/**
 * Procedural two-piece gelatin capsule with a powder core.
 * Swap point for a real GLTF: keep the two-halves structure (bodyHalf/capHalf
 * pulling apart along local Y) and the seam/anchor conventions.
 */
export function createCapsule(): Capsule {
  const group = new THREE.Group();
  group.name = 'capsule';
  // Seam a few degrees off horizontal in the showcase pose — perfectly level reads as CGI
  group.rotation.z = 0.07;

  const powderGrain = createGrainTexture(8);

  const gelatin = {
    transmission: 0.62,
    thickness: 0.05,
    attenuationColor: new THREE.Color(0xf0dcbe),
    attenuationDistance: 0.28,
    roughness: 0.16,
    ior: 1.45,
    clearcoat: 0.4,
    clearcoatRoughness: 0.35,
    metalness: 0,
    envMapIntensity: 1.5,
    transparent: true,
  } as const;

  const shellBodyMaterial = new THREE.MeshPhysicalMaterial({
    ...gelatin,
    color: 0xf7f0e3,
  });
  const shellCapMaterial = new THREE.MeshPhysicalMaterial({
    ...gelatin,
    color: 0xf2cfc0,
  });
  const powderMaterial = new THREE.MeshStandardMaterial({
    color: 0xefe0c4,
    roughness: 1,
    metalness: 0,
    bumpMap: powderGrain,
    bumpScale: 0.45,
    transparent: true,
  });

  // Lower (body) half — open cup, rim tucked inside the cap's overlap ring
  const bodyGeometry = createBodyHalfGeometry();
  const bodyHalf = new THREE.Group();
  const bodyShell = new THREE.Mesh(bodyGeometry, shellBodyMaterial);
  bodyHalf.add(bodyShell);

  // Powder fill: opaque core whose domed top surface sits just below the open
  // rim, so the opened body half visibly reads as a cup full of powder.
  const powderGeometry = new THREE.CapsuleGeometry(BODY_RADIUS * 0.9, 0.28, 12, 48);
  const powder = new THREE.Mesh(powderGeometry, powderMaterial);
  const powderRestY = -0.03 - 0.14 - BODY_RADIUS * 0.9;
  powder.position.y = powderRestY;
  bodyHalf.add(powder);

  // Rim rides just under the cap's interior dome, so the overlap ring always
  // has body shell beneath it when closed — no milky empty band at the seam.
  bodyHalf.position.y = 0.24;
  group.add(bodyHalf);

  // Upper (cap) half — lathe with straight overlap ring and rim lip
  const capGeometry = createCapHalfGeometry();
  const capHalf = new THREE.Group();
  const capShell = new THREE.Mesh(capGeometry, shellCapMaterial);
  capHalf.add(capShell);
  capHalf.position.y = SEAM_Y;
  group.add(capHalf);

  const seamLocal = new THREE.Vector3(0, SEAM_Y, CAP_RADIUS);

  // Callout anchor points, hugging the capsule silhouette
  const anchorOffsets: Array<[number, number, number]> = [
    [-0.42, 0.42, 0.05],
    [-0.46, -0.28, 0.05],
    [0.46, 0.3, 0.05],
    [0.42, -0.42, 0.05],
  ];
  const anchors = anchorOffsets.map(([x, y, z], i) => {
    const anchor = new THREE.Object3D();
    anchor.name = `calloutAnchor${i}`;
    anchor.position.set(x, y, z);
    group.add(anchor);
    return anchor;
  });

  const bodyRestY = bodyHalf.position.y;
  const capRestY = capHalf.position.y;

  function setSplit(t: number): void {
    bodyHalf.position.y = bodyRestY - t * 0.55;
    capHalf.position.y = capRestY + t * 0.55;
    // The powder level sinks slightly as it spills, but the cup stays filled
    powder.position.y = powderRestY - t * 0.03;
    powderMaterial.opacity = 1 - t * 0.15;
  }

  function setOpacity(opacity: number): void {
    shellBodyMaterial.opacity = opacity;
    shellCapMaterial.opacity = opacity;
    powderMaterial.opacity = Math.min(powderMaterial.opacity, opacity);
    group.visible = opacity > 0.001;
  }

  function dispose(): void {
    bodyGeometry.dispose();
    capGeometry.dispose();
    powderGeometry.dispose();
    shellBodyMaterial.dispose();
    shellCapMaterial.dispose();
    powderMaterial.dispose();
    powderGrain.dispose();
  }

  return { group, seamLocal, anchors, setSplit, setOpacity, dispose };
}
