import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export interface SceneContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Point the camera looks at; updated by the timeline, applied each frame. */
  cameraTarget: THREE.Vector3;
  resize(width: number, height: number): void;
  dispose(): void;
}

function fovForAspect(aspect: number): number {
  // Wider vertical FOV in portrait so the bottle still fits the frame.
  if (aspect < 0.75) return 46;
  if (aspect < 1.2) return 40;
  return 34;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(90, 20, 30, 0.4)');
    grad.addColorStop(0.55, 'rgba(90, 20, 30, 0.16)');
    grad.addColorStop(1, 'rgba(90, 20, 30, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createScene(canvas: HTMLCanvasElement, isMobile: boolean): SceneContext {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);

  const scene = new THREE.Scene();

  const aspect = window.innerWidth / window.innerHeight;
  const camera = new THREE.PerspectiveCamera(fovForAspect(aspect), aspect, 0.1, 60);
  camera.position.set(0, 0.4, 7.5);
  const cameraTarget = new THREE.Vector3(0, 0.2, 0);

  // Environment reflections
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTexture;
  scene.environmentIntensity = 0.55;

  // Warm key light, upper right front
  const key = new THREE.DirectionalLight(0xfff1e6, 2.4);
  key.position.set(3.5, 5, 4);
  scene.add(key);

  // Cool rim light from back-left
  const rim = new THREE.DirectionalLight(0xcfe4ff, 2.0);
  rim.position.set(-4, 3, -4.5);
  scene.add(rim);

  // Large soft fill
  const fill = new THREE.HemisphereLight(0xffe9e4, 0xd96a6e, 0.7);
  scene.add(fill);

  // Fake contact shadow under the bottle
  const shadowTexture = createContactShadowTexture();
  const shadowMaterial = new THREE.MeshBasicMaterial({
    map: shadowTexture,
    transparent: true,
    depthWrite: false,
  });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), shadowMaterial);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -1.42;
  shadow.name = 'contactShadow';
  scene.add(shadow);

  function resize(width: number, height: number): void {
    const a = width / height;
    camera.aspect = a;
    camera.fov = fovForAspect(a);
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }

  function dispose(): void {
    shadow.geometry.dispose();
    shadowMaterial.dispose();
    shadowTexture.dispose();
    envTexture.dispose();
    pmrem.dispose();
    renderer.dispose();
  }

  return { renderer, scene, camera, cameraTarget, resize, dispose };
}
