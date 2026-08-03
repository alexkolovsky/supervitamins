import * as THREE from 'three';

export interface Bottle {
  group: THREE.Group;
  /** Top-of-neck world-space local Y (bottle-local), where the cap seats. */
  neckTopY: number;
  neckRadius: number;
  setOpacity(opacity: number): void;
  dispose(): void;
}

function createLabelTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#fdf3ef';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // The label wraps the full cylinder; draw the wordmark on the front arc.
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e96a6e';
    ctx.font = '600 92px Georgia, serif';
    ctx.fillText('SUPERVITA', canvas.width / 2, 235);

    ctx.font = '300 34px Helvetica, Arial, sans-serif';
    ctx.fillStyle = '#d8797c';
    ctx.fillText("W O M E N ' S   D A I L Y", canvas.width / 2, 310);

    ctx.strokeStyle = '#e8a5a2';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2 - 180, 360);
    ctx.lineTo(canvas.width / 2 + 180, 360);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/**
 * Procedural rounded-shoulder supplement bottle.
 * Swap point for a real GLTF: return the loaded scene as `group`
 * and keep the same interface (neckTopY/neckRadius drive cap + capsule paths).
 */
export function createBottle(): Bottle {
  const group = new THREE.Group();
  group.name = 'bottle';

  const neckTopY = 2.62;
  const neckRadius = 0.5;

  // Lathe profile: (radius, height) pairs from base to neck lip
  const profile: Array<[number, number]> = [
    [0.0, 0.02],
    [0.45, 0.0],
    [0.72, 0.02],
    [0.82, 0.08],
    [0.85, 0.2],
    [0.85, 1.85],
    [0.83, 2.0],
    [0.74, 2.16],
    [0.6, 2.28],
    [0.51, 2.34],
    [0.5, 2.4],
    [0.5, neckTopY],
    [0.42, neckTopY],
    [0.42, neckTopY - 0.06],
  ];
  const points = profile.map(([x, y]) => new THREE.Vector2(x, y));
  const bodyGeometry = new THREE.LatheGeometry(points, 72);

  const bodyMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xf7e2da,
    roughness: 0.32,
    metalness: 0,
    clearcoat: 0.65,
    clearcoatRoughness: 0.28,
    transparent: true,
  });
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  group.add(body);

  // Label band
  const labelTexture = createLabelTexture();
  const labelGeometry = new THREE.CylinderGeometry(0.865, 0.865, 1.25, 72, 1, true);
  const labelMaterial = new THREE.MeshStandardMaterial({
    map: labelTexture,
    roughness: 0.6,
    metalness: 0,
    transparent: true,
  });
  const label = new THREE.Mesh(labelGeometry, labelMaterial);
  label.position.y = 1.0;
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
    bodyMaterial.dispose();
    labelGeometry.dispose();
    labelMaterial.dispose();
    labelTexture.dispose();
  }

  return { group, neckTopY, neckRadius, setOpacity, dispose };
}
