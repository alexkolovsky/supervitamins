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
// Label panel recessed ~1.5% into the body
const PANEL_RADIUS = BODY_RADIUS * 0.985;
const NECK_RADIUS = 0.5;
const NECK_TOP_Y = 2.62;

function createLabelTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const cx = canvas.width / 2;
    ctx.fillStyle = '#fdf4f0';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = 'center';

    ctx.fillStyle = '#d8797c';
    ctx.font = '500 40px Helvetica, Arial, sans-serif';
    ctx.fillText('W O M E N ’ S   D A I L Y', cx, 300);

    ctx.fillStyle = '#e96a6e';
    ctx.font = '600 170px Georgia, serif';
    ctx.fillText('SUPERVITA', cx, 480);

    ctx.strokeStyle = '#e8a5a2';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx - 330, 550);
    ctx.lineTo(cx + 330, 550);
    ctx.stroke();

    ctx.fillStyle = '#d8797c';
    ctx.font = '300 44px Helvetica, Arial, sans-serif';
    ctx.fillText('MULTIVITAMIN  ·  23 ESSENTIAL NUTRIENTS', cx, 640);

    ctx.font = '300 38px Helvetica, Arial, sans-serif';
    ctx.fillStyle = '#dd9694';
    ctx.fillText('60 CAPSULES  —  DIETARY SUPPLEMENT', cx, 720);

    ctx.font = 'italic 300 34px Georgia, serif';
    ctx.fillText('one capsule a day, with or without food', cx, 800);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Two helical thread ridges around the neck, as real geometry so they catch light. */
function createThreads(material: THREE.Material): { mesh: THREE.Group; geometries: THREE.BufferGeometry[] } {
  const mesh = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const turns = 1.4;
  const pitch = 0.09;
  const helixRadius = NECK_RADIUS + 0.004;
  for (let ridge = 0; ridge < 2; ridge++) {
    const phase = ridge * Math.PI;
    const startY = 2.38 + ridge * 0.02;
    const points: THREE.Vector3[] = [];
    const steps = Math.ceil(turns * 32);
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * turns * Math.PI * 2 + phase;
      points.push(new THREE.Vector3(Math.cos(a) * helixRadius, startY + (i / steps) * turns * pitch, Math.sin(a) * helixRadius));
    }
    const curve = new THREE.CatmullRomCurve3(points);
    const tube = new THREE.TubeGeometry(curve, steps * 2, 0.013, 8, false);
    geometries.push(tube);
    mesh.add(new THREE.Mesh(tube, material));
  }
  return { mesh, geometries };
}

/**
 * Procedural rounded-shoulder supplement bottle with a recessed label panel
 * and real helical neck threads.
 * Swap point for a real GLTF: return the loaded scene as `group`
 * and keep the same interface (neckTopY/neckRadius drive cap + capsule paths).
 */
export function createBottle(): Bottle {
  const group = new THREE.Group();
  group.name = 'bottle';

  // Lathe profile: (radius, height) pairs from base to neck lip
  const profile: Array<[number, number]> = [
    // Base with chamfered foot
    [0.0, 0.02],
    [0.5, 0.0],
    [0.78, 0.03],
    [0.84, 0.1],
    [BODY_RADIUS, 0.18],
    // Lower body, then step into the recessed label panel
    [BODY_RADIUS, 0.3],
    [PANEL_RADIUS, 0.34],
    [PANEL_RADIUS, 1.6],
    // Step back out above the panel
    [BODY_RADIUS, 1.64],
    [BODY_RADIUS, 1.84],
    // Tight-radius shoulder
    [0.845, 1.96],
    [0.8, 2.08],
    [0.7, 2.18],
    [0.58, 2.26],
    [0.52, 2.31],
    // Neck with thread zone
    [NECK_RADIUS, 2.36],
    [NECK_RADIUS, NECK_TOP_Y],
    // Lip
    [0.42, NECK_TOP_Y],
    [0.42, NECK_TOP_Y - 0.06],
  ];
  const points = profile.map(([x, y]) => new THREE.Vector2(x, y));
  const bodyGeometry = new THREE.LatheGeometry(points, 96);

  const bodyMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xf7e2da,
    roughness: 0.3,
    metalness: 0,
    clearcoat: 0.6,
    clearcoatRoughness: 0.25,
    sheen: 0.35,
    sheenColor: 0xffd9cf,
    sheenRoughness: 0.6,
    envMapIntensity: 1.2,
    transparent: true,
  });
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  group.add(body);

  const threads = createThreads(bodyMaterial);
  group.add(threads.mesh);

  // Label wrap, seated inside the recessed panel (paper: rougher than the plastic)
  const labelTexture = createLabelTexture();
  const labelGeometry = new THREE.CylinderGeometry(PANEL_RADIUS + 0.005, PANEL_RADIUS + 0.005, 1.22, 96, 1, true);
  const labelMaterial = new THREE.MeshStandardMaterial({
    map: labelTexture,
    roughness: 0.68,
    metalness: 0,
    envMapIntensity: 0.6,
    transparent: true,
  });
  const label = new THREE.Mesh(labelGeometry, labelMaterial);
  label.position.y = 0.97;
  // Face the wordmark toward the camera (+Z)
  label.rotation.y = Math.PI;
  group.add(label);

  function setOpacity(opacity: number): void {
    bodyMaterial.opacity = opacity;
    labelMaterial.opacity = opacity;
    group.visible = opacity > 0.001;
  }

  function dispose(): void {
    bodyGeometry.dispose();
    for (const g of threads.geometries) g.dispose();
    bodyMaterial.dispose();
    labelGeometry.dispose();
    labelMaterial.dispose();
    labelTexture.dispose();
  }

  return { group, neckTopY: NECK_TOP_Y, neckRadius: NECK_RADIUS, setOpacity, dispose };
}
