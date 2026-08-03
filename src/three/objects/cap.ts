import * as THREE from 'three';

export interface Cap {
  group: THREE.Group;
  height: number;
  setOpacity(opacity: number): void;
  dispose(): void;
}

/**
 * Procedural knurled screw cap. The group's origin is at the cap's base
 * so the timeline can seat it directly on the bottle neck.
 * Swap point for a real GLTF: replace the meshes, keep group origin at base.
 */
export function createCap(): Cap {
  const group = new THREE.Group();
  group.name = 'cap';

  const radius = 0.58;
  const height = 0.52;

  const material = new THREE.MeshStandardMaterial({
    color: 0xe3c3b8,
    roughness: 0.82,
    metalness: 0,
    transparent: true,
  });

  const bodyGeometry = new THREE.CylinderGeometry(radius, radius, height, 64);
  const body = new THREE.Mesh(bodyGeometry, material);
  body.position.y = height / 2;
  group.add(body);

  // Slightly domed top
  const topGeometry = new THREE.CylinderGeometry(radius * 0.92, radius, 0.05, 64);
  const top = new THREE.Mesh(topGeometry, material);
  top.position.y = height + 0.025;
  group.add(top);

  // Vertical knurling: thin fins instanced around the rim
  const finCount = 56;
  const finGeometry = new THREE.BoxGeometry(0.022, height * 0.86, 0.018);
  const fins = new THREE.InstancedMesh(finGeometry, material, finCount);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < finCount; i++) {
    const angle = (i / finCount) * Math.PI * 2;
    dummy.position.set(Math.cos(angle) * radius, height / 2, Math.sin(angle) * radius);
    dummy.rotation.y = -angle;
    dummy.updateMatrix();
    fins.setMatrixAt(i, dummy.matrix);
  }
  fins.instanceMatrix.needsUpdate = true;
  group.add(fins);

  function setOpacity(opacity: number): void {
    material.opacity = opacity;
    group.visible = opacity > 0.001;
  }

  function dispose(): void {
    bodyGeometry.dispose();
    topGeometry.dispose();
    finGeometry.dispose();
    fins.dispose();
    material.dispose();
  }

  return { group, height, setOpacity, dispose };
}
