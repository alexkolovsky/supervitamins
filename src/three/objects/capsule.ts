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

function createGrainTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#888888';
    ctx.fillRect(0, 0, size, size);
    // Deterministic speckle noise (LCG so scrubbing/rebuilds look identical)
    let seed = 1337;
    const rand = (): number => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let i = 0; i < 9000; i++) {
      const v = 90 + Math.floor(rand() * 130);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(Math.floor(rand() * size), Math.floor(rand() * size), 2, 2);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 3);
  return texture;
}

/**
 * Procedural two-piece gelatin capsule with a powder core.
 * Swap point for a real GLTF: keep the two-halves structure (bodyHalf/capHalf
 * pivoting apart along local Y) and the seam/anchor conventions.
 */
export function createCapsule(): Capsule {
  const group = new THREE.Group();
  group.name = 'capsule';

  const grain = createGrainTexture();

  const shellBodyMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xf6efe4,
    roughness: 0.55,
    metalness: 0,
    transmission: 0.35,
    thickness: 0.35,
    transparent: true,
    roughnessMap: grain,
  });
  const shellCapMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xf3d6ca,
    roughness: 0.55,
    metalness: 0,
    transmission: 0.35,
    thickness: 0.35,
    transparent: true,
    roughnessMap: grain,
  });
  const powderMaterial = new THREE.MeshStandardMaterial({
    color: 0xefe2cd,
    roughness: 1,
    metalness: 0,
    roughnessMap: grain,
    bumpMap: grain,
    bumpScale: 0.6,
    transparent: true,
  });

  // Lower (body) half — slightly narrower, slides into the cap half
  const bodyGeometry = new THREE.CapsuleGeometry(0.27, 0.55, 12, 48);
  const bodyHalf = new THREE.Group();
  const bodyShell = new THREE.Mesh(bodyGeometry, shellBodyMaterial);
  bodyHalf.add(bodyShell);

  // Powder core rides in the body half
  const powderGeometry = new THREE.CapsuleGeometry(0.225, 0.5, 8, 32);
  const powder = new THREE.Mesh(powderGeometry, powderMaterial);
  bodyHalf.add(powder);

  bodyHalf.position.y = -0.14;
  group.add(bodyHalf);

  // Upper (cap) half — slightly wider, overlaps the body
  const capGeometry = new THREE.CapsuleGeometry(0.295, 0.3, 12, 48);
  const capHalf = new THREE.Group();
  const capShell = new THREE.Mesh(capGeometry, shellCapMaterial);
  capHalf.add(capShell);
  capHalf.position.y = 0.26;
  group.add(capHalf);

  const seamLocal = new THREE.Vector3(0, 0.08, 0.29);

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
    grain.dispose();
  }

  return { group, seamLocal, anchors, setSplit, setOpacity, dispose };
}
