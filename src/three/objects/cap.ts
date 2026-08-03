import * as THREE from 'three';

export interface Cap {
  group: THREE.Group;
  height: number;
  setOpacity(opacity: number): void;
  dispose(): void;
}

/**
 * Procedural knurled screw cap. The group's origin is at the bottle's neck-top
 * seat; the skirt extends below it to cover the thread zone, so unscrewing
 * visibly reveals the threads. Swap point for a real GLTF: replace the meshes,
 * keep the origin convention.
 */
export function createCap(): Cap {
  const group = new THREE.Group();
  group.name = 'cap';

  const radius = 0.58;
  const skirt = 0.24; // below origin, covering the neck threads
  const height = 0.5; // above origin
  const totalHeight = height + skirt;

  const material = new THREE.MeshStandardMaterial({
    color: 0xe3c3b8,
    roughness: 0.78,
    metalness: 0,
    envMapIntensity: 0.9,
    transparent: true,
  });

  const bodyGeometry = new THREE.CylinderGeometry(radius, radius, totalHeight, 64);
  const body = new THREE.Mesh(bodyGeometry, material);
  body.position.y = totalHeight / 2 - skirt;
  group.add(body);

  // Chamfered top rim: torus edge that catches a highlight
  const rimGeometry = new THREE.TorusGeometry(radius - 0.035, 0.035, 12, 64);
  const rim = new THREE.Mesh(rimGeometry, material);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = height;
  group.add(rim);

  // Flat top inside the chamfer
  const topGeometry = new THREE.CylinderGeometry(radius - 0.035, radius - 0.035, 0.07, 64);
  const top = new THREE.Mesh(topGeometry, material);
  top.position.y = height;
  group.add(top);

  // Vertical knurling: thin fins instanced around the rim
  const finCount = 56;
  const finHeight = totalHeight * 0.82;
  const finGeometry = new THREE.BoxGeometry(0.022, finHeight, 0.02);
  const fins = new THREE.InstancedMesh(finGeometry, material, finCount);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < finCount; i++) {
    const angle = (i / finCount) * Math.PI * 2;
    dummy.position.set(Math.cos(angle) * radius, totalHeight / 2 - skirt, Math.sin(angle) * radius);
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
    rimGeometry.dispose();
    topGeometry.dispose();
    finGeometry.dispose();
    fins.dispose();
    material.dispose();
  }

  return { group, height: totalHeight, setOpacity, dispose };
}
