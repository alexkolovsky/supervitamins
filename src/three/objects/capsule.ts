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

/**
 * Cap half as a lathe: dome top, straight overlap ring, and a sharp open rim
 * with a tiny inward lip — the rim edge is what catches the seam highlight.
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
  // Sharp rim edge + tiny inward lip
  points.push(new THREE.Vector2(r, 0));
  points.push(new THREE.Vector2(r - 0.012, 0));
  points.push(new THREE.Vector2(r - 0.012, 0.02));
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
    color: 0xf4ecdc,
    roughness: 1,
    metalness: 0,
    bumpMap: powderGrain,
    bumpScale: 0.45,
    transparent: true,
  });

  // Lower (body) half — narrower, slides inside the cap half
  const bodyGeometry = new THREE.CapsuleGeometry(BODY_RADIUS, 0.6, 16, 64);
  const bodyHalf = new THREE.Group();
  const bodyShell = new THREE.Mesh(bodyGeometry, shellBodyMaterial);
  bodyHalf.add(bodyShell);

  // Powder core: opaque fill at ~92% of shell radius, clearly visible through the shell
  const powderGeometry = new THREE.CapsuleGeometry(BODY_RADIUS * 0.92, 0.56, 12, 48);
  const powder = new THREE.Mesh(powderGeometry, powderMaterial);
  bodyHalf.add(powder);

  bodyHalf.position.y = -0.08;
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
    // The powder core stays behind and thins out as it spills
    powder.scale.setScalar(Math.max(0.001, 1 - t * 0.45));
    powderMaterial.opacity = 1 - t * 0.5;
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
