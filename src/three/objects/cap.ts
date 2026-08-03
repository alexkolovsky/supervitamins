import * as THREE from 'three';

export interface Cap {
  group: THREE.Group;
  height: number;
  setOpacity(opacity: number): void;
  dispose(): void;
}

/**
 * Classic white ribbed pharmacy screw cap (reference style): flat top with a
 * subtle raised inner disc, straight fluted sides, chamfered edges. Group
 * origin sits at the bottle's neck-top seat; a short skirt extends below it.
 * Swap point for a real GLTF: replace the meshes, keep the origin convention.
 */
export function createCap(): Cap {
  const group = new THREE.Group();
  group.name = 'cap';

  const radius = 0.72;
  const skirt = 0.12; // below origin, overlapping the neck
  const height = 0.42; // above origin
  const chamfer = 0.05;

  const material = new THREE.MeshStandardMaterial({
    color: 0xf4f2ee,
    roughness: 0.42,
    metalness: 0,
    envMapIntensity: 1.0,
    transparent: true,
    side: THREE.DoubleSide,
  });

  // Body: bottom chamfer, straight side, top chamfer, flat top
  const points: THREE.Vector2[] = [
    new THREE.Vector2(0.0, -skirt),
    new THREE.Vector2(radius - chamfer, -skirt),
    new THREE.Vector2(radius, -skirt + chamfer),
    new THREE.Vector2(radius, height - chamfer),
    new THREE.Vector2(radius - chamfer, height),
    new THREE.Vector2(0.0, height),
  ];
  const bodyGeometry = new THREE.LatheGeometry(points, 96);
  const body = new THREE.Mesh(bodyGeometry, material);
  group.add(body);

  // Subtle raised inner disc on the top (the inset circle in the reference)
  const discGeometry = new THREE.CylinderGeometry(radius * 0.8, radius * 0.8, 0.016, 96);
  const disc = new THREE.Mesh(discGeometry, material);
  disc.position.y = height;
  group.add(disc);

  // Fine vertical fluting around the side
  const ribCount = 96;
  const ribHeight = height + skirt - chamfer * 2;
  const ribGeometry = new THREE.BoxGeometry(0.016, ribHeight, 0.014);
  const ribs = new THREE.InstancedMesh(ribGeometry, material, ribCount);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < ribCount; i++) {
    const angle = (i / ribCount) * Math.PI * 2;
    dummy.position.set(Math.cos(angle) * radius, (height - skirt) / 2, Math.sin(angle) * radius);
    dummy.rotation.y = -angle;
    dummy.updateMatrix();
    ribs.setMatrixAt(i, dummy.matrix);
  }
  ribs.instanceMatrix.needsUpdate = true;
  group.add(ribs);

  function setOpacity(opacity: number): void {
    material.opacity = opacity;
    group.visible = opacity > 0.001;
  }

  function dispose(): void {
    bodyGeometry.dispose();
    discGeometry.dispose();
    ribGeometry.dispose();
    ribs.dispose();
    material.dispose();
  }

  return { group, height: height + skirt, setOpacity, dispose };
}
