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

// Real "size 0" capsule proportions: length/diameter ≈ 2.9, cap ≈ 45% of length
const BODY_RADIUS = 0.22;
// Cap half slides OVER the body: ~5% larger diameter
const CAP_RADIUS = 0.232;
const CAP_STRAIGHT = 0.35; // straight cylindrical section of the cap half
const BODY_STRAIGHT = 0.75; // straight section of the body half below its rim
const WALL = 0.01;
const SEAM_Y = 0.1; // world-local Y of the cap's open rim when closed
// Body rim tucks up under the cap's dome when closed
const BODY_REST_Y = SEAM_Y + CAP_STRAIGHT - 0.02;

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

/** Quarter-circle dome points from pole to equator (or reversed for a bottom dome). */
function domePoints(radius: number, centerY: number, up: boolean, steps = 14): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * (Math.PI / 2);
    pts.push(new THREE.Vector2(radius * Math.sin(a), centerY + (up ? radius * Math.cos(a) : -radius * Math.cos(a))));
  }
  return pts;
}

/**
 * Cap half: hemispherical dome + LONG straight cylinder + clean open rim with
 * wall thickness, plus a subtle locking-ring ridge near the rim (the thin ring
 * line visible on real two-piece capsules). Origin at the rim, dome up.
 */
function createCapHalfGeometry(): THREE.LatheGeometry {
  const r = CAP_RADIUS;
  const points: THREE.Vector2[] = [
    ...domePoints(r, CAP_STRAIGHT, true),
    // Straight side down, with a subtle locking-ring ridge near the rim
    new THREE.Vector2(r, 0.11),
    new THREE.Vector2(r + 0.004, 0.085),
    new THREE.Vector2(r + 0.004, 0.065),
    new THREE.Vector2(r, 0.04),
    // Rim edge, wall thickness, inner wall back up
    new THREE.Vector2(r, 0),
    new THREE.Vector2(r - WALL, 0),
    new THREE.Vector2(r - WALL, 0.3),
  ];
  return new THREE.LatheGeometry(points, 72);
}

/**
 * Body half: long straight cylinder + hemispherical bottom, open top rim with
 * wall thickness, and its own faint locking ring below the rim.
 * Origin at the open rim, dome down.
 */
function createBodyHalfGeometry(): THREE.LatheGeometry {
  const r = BODY_RADIUS;
  const points: THREE.Vector2[] = [
    ...domePoints(r, -BODY_STRAIGHT, false),
    // Straight side up with locking-ring ridge
    new THREE.Vector2(r, -0.5),
    new THREE.Vector2(r + 0.003, -0.47),
    new THREE.Vector2(r + 0.003, -0.455),
    new THREE.Vector2(r, -0.43),
    // Up to the open rim
    new THREE.Vector2(r, 0),
    new THREE.Vector2(r - WALL, 0),
    new THREE.Vector2(r - WALL, -0.25),
  ];
  return new THREE.LatheGeometry(points, 72);
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

  // Satin gelatin: mostly opaque with soft depth, long glossy highlights
  const gelatin = {
    transmission: 0.22,
    thickness: 0.04,
    attenuationColor: new THREE.Color(0xf3e6cf),
    attenuationDistance: 0.35,
    roughness: 0.18,
    ior: 1.45,
    clearcoat: 0.55,
    clearcoatRoughness: 0.3,
    metalness: 0,
    envMapIntensity: 1.5,
    transparent: true,
    side: THREE.DoubleSide,
  } as const;

  const shellBodyMaterial = new THREE.MeshPhysicalMaterial({
    ...gelatin,
    color: 0xf8f3e9,
  });
  const shellCapMaterial = new THREE.MeshPhysicalMaterial({
    ...gelatin,
    color: 0xf4ded3,
  });
  const powderMaterial = new THREE.MeshStandardMaterial({
    color: 0xe4d5b6,
    roughness: 1,
    metalness: 0,
    bumpMap: powderGrain,
    bumpScale: 0.9,
    envMapIntensity: 0.5,
    transparent: true,
  });

  // Lower (body) half — long open cup, rim tucked under the cap dome
  const bodyGeometry = createBodyHalfGeometry();
  const bodyHalf = new THREE.Group();
  const bodyShell = new THREE.Mesh(bodyGeometry, shellBodyMaterial);
  bodyHalf.add(bodyShell);

  // Powder fill: opaque core whose domed top surface sits just below the open
  // rim, so the opened body half visibly reads as a cup full of powder.
  const powderRadius = BODY_RADIUS * 0.93;
  const powderGeometry = new THREE.CapsuleGeometry(powderRadius, 0.4, 12, 48);
  const powder = new THREE.Mesh(powderGeometry, powderMaterial);
  // Fill right up to the open rim so the cup clearly reads as full of powder
  const powderRestY = 0.005 - 0.2 - powderRadius;
  powder.position.y = powderRestY;
  bodyHalf.add(powder);

  // Granular crust on the powder surface at the mouth — tiny grains scattered
  // over the exposed dome so the fill unmistakably reads as powder, not shell.
  const grainGeometry = new THREE.IcosahedronGeometry(0.014, 0);
  const grainMaterial = new THREE.MeshStandardMaterial({
    color: 0xe3d2ae,
    roughness: 1,
    metalness: 0,
  });
  const grainCount = 110;
  const crust = new THREE.InstancedMesh(grainGeometry, grainMaterial, grainCount);
  {
    let seed = 424242;
    const rnd = (): number => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const dummy = new THREE.Object3D();
    const domeCenterY = 0.2; // powder-local Y of the top dome's center
    for (let i = 0; i < grainCount; i++) {
      // Points on the exposed dome cap (within ~55° of the pole)
      const polar = Math.sqrt(rnd()) * 0.96;
      const azimuth = rnd() * Math.PI * 2;
      const sin = polar;
      const cos = Math.sqrt(1 - sin * sin);
      dummy.position.set(
        Math.cos(azimuth) * sin * powderRadius,
        domeCenterY + cos * powderRadius + (rnd() - 0.3) * 0.012,
        Math.sin(azimuth) * sin * powderRadius,
      );
      dummy.rotation.set(rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI);
      dummy.scale.setScalar(0.5 + rnd() * 1.1);
      dummy.updateMatrix();
      crust.setMatrixAt(i, dummy.matrix);
    }
    crust.instanceMatrix.needsUpdate = true;
  }
  powder.add(crust);

  bodyHalf.position.y = BODY_REST_Y;
  group.add(bodyHalf);

  // Upper (cap) half
  const capGeometry = createCapHalfGeometry();
  const capHalf = new THREE.Group();
  const capShell = new THREE.Mesh(capGeometry, shellCapMaterial);
  capHalf.add(capShell);
  capHalf.position.y = SEAM_Y;
  group.add(capHalf);

  const seamLocal = new THREE.Vector3(0, SEAM_Y, CAP_RADIUS);

  // Callout anchor points, hugging the capsule silhouette
  const anchorOffsets: Array<[number, number, number]> = [
    [-0.38, 0.45, 0.05],
    [-0.42, -0.3, 0.05],
    [0.42, 0.32, 0.05],
    [0.38, -0.45, 0.05],
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
    bodyHalf.position.y = bodyRestY - t * 0.6;
    capHalf.position.y = capRestY + t * 0.6;
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
    grainGeometry.dispose();
    grainMaterial.dispose();
    crust.dispose();
    shellBodyMaterial.dispose();
    shellCapMaterial.dispose();
    powderMaterial.dispose();
    powderGrain.dispose();
  }

  return { group, seamLocal, anchors, setSplit, setOpacity, dispose };
}
