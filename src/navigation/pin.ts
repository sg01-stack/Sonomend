import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

/** Authored pin only; geographic data always comes from the live Leaflet map. */
export async function mountPin(host: HTMLElement, isDisposed: () => boolean) {
  const gltf = await new GLTFLoader().loadAsync(
    `${import.meta.env.BASE_URL}design/pin-only.glb`,
  );
  const disposeMeshes = () =>
    gltf.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        for (const m of Array.isArray(o.material) ? o.material : [o.material])
          m.dispose();
      }
    });
  if (isDisposed()) {
    disposeMeshes();
    return () => {};
  }
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setClearColor(0, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.add(gltf.scene, new THREE.HemisphereLight(0xffffff, 0x544040, 2.5));
  const key = new THREE.DirectionalLight(0xffffff, 3);
  key.position.set(-3, 5, 6);
  scene.add(key);
  const camera = new THREE.OrthographicCamera(
    -2.305,
    2.305,
    2.305,
    -2.305,
    0.01,
    100,
  );
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  const resize = () => {
    const aspect = host.clientWidth / Math.max(1, host.clientHeight);
    camera.left = -2.305 * aspect;
    camera.right = 2.305 * aspect;
    camera.updateProjectionMatrix();
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.render(scene, camera);
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  host.append(renderer.domElement);
  host.dataset.ready = "true";
  const mixer = new THREE.AnimationMixer(gltf.scene);
  const clip = gltf.animations[0];
  const action = mixer.clipAction(clip);
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const started = performance.now();
  let frame = 0;
  const draw = (now: number) => {
    const seconds = reduced
      ? 5
      : Math.min(5, Math.max(0, (now - started) / 1000));
    mixer.setTime(seconds);
    const scale = THREE.MathUtils.lerp(
      0.7,
      0.24,
      THREE.MathUtils.smoothstep(seconds, 0, 3.2),
    );
    gltf.scene.scale.setScalar(scale);
    gltf.scene.position.y =
      (1 - scale) * Math.max(0, 2.65 * (1 - seconds / 3.2));
    const progress = THREE.MathUtils.smoothstep(seconds, 3.2, 4.67);
    // Mask the blur overlay with one expanding hole, aligned with the fixed pin tip.
    host.parentElement!.style.setProperty(
      "--reveal-radius",
      `${progress * 150}%`,
    );
    host.dataset.time = seconds.toFixed(2);
    renderer.render(scene, camera);
    if (seconds < 5) frame = requestAnimationFrame(draw);
  };
  frame = requestAnimationFrame(draw);
  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    mixer.stopAllAction();
    disposeMeshes();
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  };
}
