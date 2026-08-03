import * as THREE from 'three';

export interface Bottle {
  group: THREE.Group;
  /** Top-of-neck world-space local Y (bottle-local), where the cap seats. */
  neckTopY: number;
  neckRadius: number;
  setOpacity(opacity: number): void;
  dispose(): void;
}

const BODY_RADIUS = 0.85;
const NECK_RADIUS = 0.62;
const NECK_TOP_Y = 2.62;
const CORAL = '#dd6360';

function createLabelTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const cx = canvas.width / 2;
    const h = canvas.height;
    // White paper with coral accent stripes at the label's top and bottom edges
    ctx.fillStyle = '#fbf7f3';
    ctx.fillRect(0, 0, canvas.width, h);
    ctx.fillStyle = CORAL;
    ctx.fillRect(0, 0, canvas.width, 36);
    ctx.fillRect(0, h - 36, canvas.width, 36);

    ctx.textAlign = 'center';

    // Big bold two-line wordmark, reference style
    ctx.fillStyle = CORAL;
    ctx.font = '800 218px Helvetica, Arial, sans-serif';
    ctx.fillText('SUPER', cx, 330);
    ctx.fillText('VITA', cx, 530);

    ctx.fillStyle = '#3a3232';
    ctx.font = '500 64px Helvetica, Arial, sans-serif';
    ctx.fillText('Women’s Daily Multivitamin', cx, 680);
    ctx.fillText('for Energy and Balance', cx, 762);

    ctx.fillStyle = CORAL;
    ctx.font = '600 44px Helvetica, Arial, sans-serif';
    ctx.fillText('DIETARY SUPPLEMENT', cx, 880);
    ctx.font = '500 40px Helvetica, Arial, sans-serif';
    ctx.fillText('60 CAPSULES', cx, 940);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Deterministic PRNG for the jumbled capsules inside the jar. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Clear glass supplement jar: straight cylindrical body, tight shoulder, wide
 * neck with a bead ring, capsules visible inside, white label band with coral
 * accent stripes. Swap point for a real GLTF: return the loaded scene as
 * `group`, keep neckTopY/neckRadius (they drive the cap seat + capsule path).
 */
export function createBottle(): Bottle {
  const group = new THREE.Group();
  group.name = 'bottle';

  // Glass profile: straight wall, short shoulder, wide neck, mouth lip
  const profile: Array<[number, number]> = [
    [0.0, 0.04],
    [0.55, 0.04],
    [0.76, 0.06],
    [0.83, 0.12],
    [BODY_RADIUS, 0.22],
    [BODY_RADIUS, 2.02],
    [0.83, 2.12],
    [0.76, 2.2],
    [0.67, 2.27],
    [NECK_RADIUS, 2.33],
    [NECK_RADIUS, NECK_TOP_Y],
    [0.54, NECK_TOP_Y],
    [0.54, NECK_TOP_Y - 0.14],
  ];
  const points = profile.map(([x, y]) => new THREE.Vector2(x, y));
  const bodyGeometry = new THREE.LatheGeometry(points, 96);

  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    transmission: 0.95,
    thickness: 0.04,
    roughness: 0.04,
    ior: 1.5,
    clearcoat: 0.5,
    clearcoatRoughness: 0.1,
    metalness: 0,
    envMapIntensity: 1.2,
    transparent: true,
  });
  const body = new THREE.Mesh(bodyGeometry, glassMaterial);
  group.add(body);

  // Bead ring under the cap (the glass lip real jars have)
  const beadGeometry = new THREE.TorusGeometry(NECK_RADIUS + 0.015, 0.025, 10, 64);
  const bead = new THREE.Mesh(beadGeometry, glassMaterial);
  bead.rotation.x = Math.PI / 2;
  bead.position.y = 2.44;
  group.add(bead);

  // Glass thread rings on the neck, revealed as the cap unscrews
  const threadGeometry = new THREE.TorusGeometry(NECK_RADIUS + 0.008, 0.014, 8, 64);
  for (const y of [2.5, 2.56]) {
    const ring = new THREE.Mesh(threadGeometry, glassMaterial);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    group.add(ring);
  }

  // Jumbled capsules inside, visible through the glass above and below the label
  const pillGeometry = new THREE.CapsuleGeometry(0.135, 0.3, 8, 24);
  const pillMaterial = new THREE.MeshStandardMaterial({
    color: 0xf2e3d0,
    roughness: 0.45,
    metalness: 0,
    envMapIntensity: 0.8,
  });
  // Cluster the pills in the zones visible past the label (under the cap and
  // at the base) and press them toward the glass wall, like the reference.
  const pillCount = 26;
  const pills = new THREE.InstancedMesh(pillGeometry, pillMaterial, pillCount);
  const rand = mulberry32(48151623);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < pillCount; i++) {
    const angle = rand() * Math.PI * 2;
    const radius = 0.25 + rand() * 0.32;
    const upperZone = i < 12;
    const y = upperZone ? 1.55 + rand() * 0.42 : 0.2 + rand() * 0.38;
    dummy.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
    dummy.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
    dummy.updateMatrix();
    pills.setMatrixAt(i, dummy.matrix);
  }
  pills.instanceMatrix.needsUpdate = true;
  group.add(pills);

  // Label band wrapping the middle of the jar
  const labelTexture = createLabelTexture();
  const labelGeometry = new THREE.CylinderGeometry(BODY_RADIUS + 0.012, BODY_RADIUS + 0.012, 1.18, 96, 1, true);
  const labelMaterial = new THREE.MeshStandardMaterial({
    map: labelTexture,
    roughness: 0.7,
    metalness: 0,
    envMapIntensity: 0.5,
    transparent: true,
  });
  const label = new THREE.Mesh(labelGeometry, labelMaterial);
  label.position.y = 1.08;
  // Face the wordmark toward the camera (+Z)
  label.rotation.y = Math.PI;
  group.add(label);

  function setOpacity(opacity: number): void {
    glassMaterial.opacity = opacity;
    labelMaterial.opacity = opacity;
    pillMaterial.opacity = opacity;
    pillMaterial.transparent = opacity < 0.999;
    group.visible = opacity > 0.001;
  }

  function dispose(): void {
    bodyGeometry.dispose();
    beadGeometry.dispose();
    threadGeometry.dispose();
    pillGeometry.dispose();
    pills.dispose();
    glassMaterial.dispose();
    pillMaterial.dispose();
    labelGeometry.dispose();
    labelMaterial.dispose();
    labelTexture.dispose();
  }

  return { group, neckTopY: NECK_TOP_Y, neckRadius: NECK_RADIUS, setOpacity, dispose };
}
