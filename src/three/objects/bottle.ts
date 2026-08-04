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
const DEEP_CORAL = '#c04350'; /* near --coral-700; renders as ~coral-500 under lighting */
const IVORY = '#fff8f4'; /* --ivory */

const SANS = '"General Sans", Helvetica, Arial, sans-serif';
const SERIF = '"Fraunces Variable", Georgia, serif';

/**
 * Modern DTC-style label: solid coral block, left-aligned type system
 * (eyebrow, sans product name, italic serif subline, thin-ruled benefit
 * list, meta) with a large serif wordmark cropped off the bottom-right —
 * drawn with the page's own webfonts and redrawn once they load.
 */
function createLabelTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  // Match the unrolled surface aspect (circumference ≈ 5.42u : height 1.18u)
  // so glyphs keep their true proportions when wrapped around the cylinder.
  canvas.width = 4704;
  canvas.height = 1024;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;

  const draw = (): void => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const cx = canvas.width / 2;
    const h = canvas.height;
    // The camera sees roughly ±700px of the wrapped texture around cx.
    const left = cx - 700;
    const right = cx + 700;

    // Drawn deeper than the target color: the lit, tone-mapped render
    // lifts it back up to roughly --coral-500.
    ctx.fillStyle = DEEP_CORAL;
    ctx.fillRect(0, 0, canvas.width, h);

    ctx.textAlign = 'left';
    ctx.fillStyle = IVORY;

    // Eyebrow
    ctx.globalAlpha = 0.8;
    ctx.font = `500 40px ${SANS}`;
    ctx.fillText('Dietary Supplement', left, 128);

    // Product name
    ctx.globalAlpha = 1;
    ctx.font = `600 128px ${SANS}`;
    ctx.fillText('Daily Multi', left, 272);

    // Italic serif subline (synthetic oblique is fine at this size)
    ctx.font = `italic 500 56px ${SERIF}`;
    ctx.fillText('Supports your energy, balance & everyday glow', left, 380);

    // Thin-ruled benefit list
    const benefits = [
      '+ Iron to reduce fatigue',
      '+ 100% daily Vitamin C',
      '+ Zinc for skin, hair & nails',
    ];
    ctx.font = `500 46px ${SANS}`;
    benefits.forEach((line, i) => {
      const rowTop = 458 + i * 106;
      ctx.globalAlpha = 0.45;
      ctx.fillRect(left, rowTop, right - left, 2);
      ctx.globalAlpha = 0.95;
      ctx.fillText(line, left, rowTop + 70);
    });
    ctx.globalAlpha = 0.45;
    ctx.fillRect(left, 458 + benefits.length * 106, right - left, 2);

    // Meta, bottom-left
    ctx.globalAlpha = 0.85;
    ctx.font = `500 38px ${SANS}`;
    ctx.fillText('60 capsules · 30 servings', left, 886);
    ctx.globalAlpha = 1;

    // Big serif wordmark, sliding off the visible face bottom-right
    ctx.font = `600 230px ${SERIF}`;
    ctx.fillText('Supervita', cx + 120, h - 12);

    texture.needsUpdate = true;
  };

  draw();
  if (typeof document !== 'undefined' && document.fonts) {
    Promise.all([
      document.fonts.load(`600 128px ${SANS}`),
      document.fonts.load(`500 46px ${SANS}`),
      document.fonts.load(`600 230px ${SERIF}`),
      document.fonts.load(`italic 500 56px ${SERIF}`),
    ])
      .then(draw)
      .catch(() => {});
  }
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
