import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
export async function mountModel(
  host: HTMLElement,
  reduced: boolean,
  isDisposed: () => boolean,
) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setClearColor(0, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  const gltf = await new GLTFLoader()
    .loadAsync(`${import.meta.env.BASE_URL}design/scene.glb`)
    .catch((e) => {
      renderer.dispose();
      throw e;
    });
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
    renderer.dispose();
    return () => {};
  }
  const scene = new THREE.Scene();
  scene.add(gltf.scene);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x51404a, 2));
  for (const [x, y, z, p] of [
    [-4, 7, 6, 45],
    [5, 3, 3, 30],
  ]) {
    const l = new THREE.PointLight(0xffffff, p);
    l.position.set(x, y, z);
    scene.add(l);
  }
  let meshCount = 0,
    capsules = 0;
  gltf.scene.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      meshCount++;
      if (o.name === "Cube") o.visible = false;
      if (
        o.name.startsWith("Liquid_glass_capsule") ||
        o.name.startsWith("Liquid glass capsule")
      ) {
        capsules++;
        const m = (o.material as THREE.MeshPhysicalMaterial).clone();
        m.transmission = 0;
        m.transparent = true;
        m.opacity = 0.19;
        m.depthWrite = false;
        m.roughness = 0.24;
        m.metalness = 0;
        m.envMap = null;
        m.envMapIntensity = 0;
        m.clearcoat = 0;
        o.material = m;
      }
    }
  });
  host.dataset.meshCount = String(meshCount);
  host.dataset.capsules = String(capsules);
  const mixer = new THREE.AnimationMixer(gltf.scene),
    clip = gltf.animations.find((c) => c.name === "Megaphone_Reveal_2p5s");
  if (!clip) {
    disposeMeshes();
    renderer.dispose();
    throw Error("Missing authored reveal");
  }
  const action = mixer.clipAction(clip);
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  // Measure the authored final pose, then explicitly restart the reveal.
  action.play();
  mixer.setTime(clip.duration);
  gltf.scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  gltf.scene.traverse((o) => {
    if (o instanceof THREE.Mesh && o.visible) bounds.expandByObject(o);
  });
  const center = bounds.getCenter(new THREE.Vector3()),
    size = bounds.getSize(new THREE.Vector3());
  const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 1000),
    direction = new THREE.Vector3(4, 2, 7);
  if (gltf.cameras[0]) {
    gltf.cameras[0].getWorldPosition(direction);
    direction.sub(center);
  }
  direction.normalize();
  const resize = () => {
    renderer.setSize(host.clientWidth, host.clientHeight);
    camera.aspect = host.clientWidth / host.clientHeight;
    const r = Math.max(size.y, size.x / camera.aspect, size.z * 0.65);
    camera.position
      .copy(center)
      .addScaledVector(
        direction,
        (r / (2 * Math.tan(THREE.MathUtils.degToRad(16)))) * 1.18,
      );
    camera.lookAt(center);
    camera.updateProjectionMatrix();
  };
  resize();
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(center);
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.enableDamping = true;
  controls.minPolarAngle = 0.3;
  controls.maxPolarAngle = Math.PI - 0.3;
  controls.update();
  controls.saveState();
  host.append(renderer.domElement);
  host.dataset.ready = "true";
  host.tabIndex = 0;
  host.setAttribute("role", "group");
  host.setAttribute(
    "aria-label",
    "Interactive megaphone and six glass capsules. Drag to rotate; arrow keys rotate; Enter replays; Escape resets view.",
  );
  const replay = () => {
    action.reset().play();
    if (reduced) mixer.setTime(clip.duration);
    else mixer.update(0.000001);
  };
  replay();
  const key = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      replay();
      e.preventDefault();
    } else if (e.key === "Escape") {
      controls.reset();
      e.preventDefault();
    } else if (
      ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
    ) {
      const offset = camera.position.clone().sub(center),
        s = new THREE.Spherical().setFromVector3(offset);
      if (e.key === "ArrowLeft") s.theta -= 0.15;
      if (e.key === "ArrowRight") s.theta += 0.15;
      if (e.key === "ArrowUp") s.phi = Math.max(0.3, s.phi - 0.1);
      if (e.key === "ArrowDown") s.phi = Math.min(Math.PI - 0.3, s.phi + 0.1);
      camera.position.copy(center).add(new THREE.Vector3().setFromSpherical(s));
      controls.update();
      e.preventDefault();
    }
  };
  host.addEventListener("keydown", key);
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  let frame = 0,
    last = performance.now();
  const loop = (now: number) => {
    frame = requestAnimationFrame(loop);
    const dt = Math.max(0, Math.min((now - last) / 1000, 0.05));
    last = now;
    const rect = host.getBoundingClientRect();
    if (document.hidden || rect.bottom < 0 || rect.top > innerHeight) return;
    if (!reduced) mixer.update(dt);
    controls.update();
    host.dataset.revealTime = action.time.toFixed(3);
    renderer.render(scene, camera);
  };
  frame = requestAnimationFrame(loop);
  return () => {
    cancelAnimationFrame(frame);
    ro.disconnect();
    host.removeEventListener("keydown", key);
    controls.dispose();
    mixer.stopAllAction();
    disposeMeshes();
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  };
}
