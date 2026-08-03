import * as THREE from 'three';

export interface PowderParticles {
  mesh: THREE.InstancedMesh;
  /** Deterministic, scrub-safe: same t always yields the same cloud. */
  setProgress(t: number): void;
  dispose(): void;
}

/** Small deterministic PRNG so trajectories are identical every session. */
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

interface Trajectory {
  start: THREE.Vector3;
  velocity: THREE.Vector3;
  phase: number;
  turbulence: number;
  spawnDelay: number; // fraction of the progress window before this grain appears
  size: number;
}

/**
 * Powder cloud spilling from the capsule seam. Trajectories are precomputed;
 * position is a pure function of progress so scrubbing backwards is exact.
 */
export function createPowderParticles(seamLocal: THREE.Vector3, count: number): PowderParticles {
  const geometry = new THREE.IcosahedronGeometry(0.0075, 0);
  const material = new THREE.MeshStandardMaterial({
    color: 0xf6ecd9,
    roughness: 0.95,
    metalness: 0,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.frustumCulled = false;

  const rand = mulberry32(20260804);
  const trajectories: Trajectory[] = [];
  for (let i = 0; i < count; i++) {
    const angle = rand() * Math.PI * 2;
    const spread = rand() * 0.12;
    trajectories.push({
      start: new THREE.Vector3(
        seamLocal.x + Math.cos(angle) * spread,
        seamLocal.y + (rand() - 0.5) * 0.08,
        seamLocal.z * 0.2 + Math.sin(angle) * spread,
      ),
      velocity: new THREE.Vector3(
        Math.cos(angle) * (0.12 + rand() * 0.28),
        -0.3 - rand() * 0.55,
        Math.sin(angle) * (0.12 + rand() * 0.28),
      ),
      phase: rand() * Math.PI * 2,
      turbulence: 0.04 + rand() * 0.08,
      spawnDelay: rand() * 0.45,
      size: 0.5 + rand() * 0.9,
    });
  }

  const dummy = new THREE.Object3D();
  const gravity = -1.1;
  const duration = 2.2; // virtual seconds across the full progress window

  function setProgress(t: number): void {
    mesh.visible = t > 0.001;
    for (let i = 0; i < count; i++) {
      const traj = trajectories[i];
      if (!traj) continue;
      // Per-grain local time after its spawn delay
      const local = Math.max(0, (t - traj.spawnDelay) / (1 - traj.spawnDelay));
      const time = local * duration;

      dummy.position.set(
        traj.start.x + traj.velocity.x * time + Math.sin(traj.phase + time * 3.1) * traj.turbulence * time,
        traj.start.y + traj.velocity.y * time + 0.5 * gravity * time * time * 0.35,
        traj.start.z + traj.velocity.z * time + Math.cos(traj.phase + time * 2.7) * traj.turbulence * time,
      );

      // Pop in quickly at spawn, dissolve near the end of its life
      const appear = Math.min(1, local * 8);
      const fade = 1 - Math.max(0, (local - 0.75) / 0.25) * 0.8;
      dummy.scale.setScalar(Math.max(0.0001, traj.size * appear * fade));
      dummy.rotation.set(traj.phase + time * 2, traj.phase * 2, time);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  setProgress(0);

  function dispose(): void {
    geometry.dispose();
    material.dispose();
    mesh.dispose();
  }

  return { mesh, setProgress, dispose };
}
