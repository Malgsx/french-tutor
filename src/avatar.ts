import * as THREE from "three";
import type { AvatarState } from "./protocol";

// Original procedural male comic adventurer. No downloaded model or proprietary art.
export function createAvatar(host: HTMLElement) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 30);
  camera.position.set(0, 0.65, 7.7);
  camera.lookAt(0, 0.25, 0);
  scene.add(new THREE.HemisphereLight(0xfff4e8, 0x705288, 2.4));
  const key = new THREE.DirectionalLight(0xffe7cd, 3.3);
  key.position.set(-3, 5, 6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xb3a2ff, 3);
  rim.position.set(3, 3, -3);
  scene.add(rim);
  const skin = new THREE.MeshStandardMaterial({
    color: 0xf5b88d,
    roughness: 0.65,
  });
  const hair = new THREE.MeshStandardMaterial({
    color: 0x36213f,
    roughness: 0.48,
  });
  const jacket = new THREE.MeshStandardMaterial({
    color: 0x694890,
    roughness: 0.7,
  });
  const ink = new THREE.MeshStandardMaterial({
    color: 0x26202f,
    roughness: 0.75,
  });
  const yellow = new THREE.MeshStandardMaterial({
    color: 0xf2e96d,
    roughness: 0.4,
    metalness: 0.15,
  });
  const white = new THREE.MeshStandardMaterial({
    color: 0xfff7ec,
    roughness: 0.4,
  });
  const iris = new THREE.MeshStandardMaterial({
    color: 0x81589c,
    roughness: 0.35,
  });
  const root = new THREE.Group();
  scene.add(root);
  const mesh = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    parent: THREE.Object3D,
    x: number,
    y: number,
    z: number,
  ) => {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(x, y, z);
    parent.add(object);
    return object;
  };
  const sphere = (
    parent: THREE.Object3D,
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
  ) => {
    const object = mesh(
      new THREE.SphereGeometry(1, 32, 24),
      material,
      parent,
      x,
      y,
      z,
    );
    object.scale.set(sx, sy, sz);
    return object;
  };
  const head = new THREE.Group();
  head.position.y = 1.07;
  root.add(head);
  sphere(head, skin, 0, 0, 0, 0.61, 0.7, 0.48);
  sphere(head, skin, -0.61, -0.05, 0, 0.12, 0.19, 0.12);
  sphere(head, skin, 0.61, -0.05, 0, 0.12, 0.19, 0.12);
  sphere(head, hair, 0, 0.34, -0.16, 0.66, 0.53, 0.48);
  // Hand-placed tapered locks give the silhouette depth even at tray-panel size.
  for (let i = 0; i < 9; i++) {
    const x = (i - 4) * 0.14;
    const lock = mesh(
      new THREE.ConeGeometry(0.2, 0.58, 5),
      hair,
      head,
      x,
      0.62 + Math.sin(i * 0.9) * 0.06,
      0.08 + Math.cos(i) * 0.13,
    );
    lock.rotation.z = -0.7 + i * 0.14;
    lock.rotation.x = -0.3;
  }
  for (let i = 0; i < 4; i++) {
    const bang = mesh(
      new THREE.ConeGeometry(0.16, 0.54, 5),
      hair,
      head,
      -0.38 + i * 0.21,
      0.33 - i * 0.018,
      0.38,
    );
    bang.rotation.z = Math.PI + 0.5;
    bang.rotation.x = -0.14;
  }
  const eyes: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    sphere(head, white, side * 0.245, -0.035, 0.426, 0.153, 0.155, 0.075);
    eyes.push(
      sphere(head, iris, side * 0.23, -0.042, 0.492, 0.082, 0.11, 0.025),
    );
    sphere(head, ink, side * 0.222, -0.04, 0.515, 0.042, 0.073, 0.018);
    sphere(head, white, side * 0.22 - 0.021, 0.002, 0.535, 0.024, 0.027, 0.01);
    const brow = mesh(
      new THREE.CapsuleGeometry(0.025, 0.2, 3, 8),
      hair,
      head,
      side * 0.255,
      0.168,
      0.455,
    );
    brow.rotation.z = side * 1.24;
  }
  sphere(head, skin, 0, -0.19, 0.475, 0.066, 0.07, 0.072);
  const mouth = sphere(head, ink, 0, -0.365, 0.415, 0.115, 0.018, 0.018);
  sphere(root, skin, 0, 0.45, 0, 0.18, 0.3, 0.16);
  sphere(root, jacket, 0, -0.15, -0.02, 0.48, 0.64, 0.29);
  mesh(new THREE.BoxGeometry(0.18, 0.8, 0.08), ink, root, 0, -0.1, 0.26);
  mesh(
    new THREE.BoxGeometry(0.022, 0.82, 0.015),
    yellow,
    root,
    0.11,
    -0.11,
    0.305,
  );
  // Split haori-like coat with original diagonal gold trim, not a franchise costume.
  const coat = new THREE.MeshStandardMaterial({
    color: 0x9d83c0,
    roughness: 0.85,
  });
  for (const side of [-1, 1]) {
    const panel = mesh(
      new THREE.BoxGeometry(0.3, 1.2, 0.36),
      coat,
      root,
      side * 0.36,
      -0.5,
      -0.07,
    );
    panel.rotation.z = side * 0.09;
    for (let i = 0; i < 3; i++) {
      const trim = mesh(
        new THREE.BoxGeometry(0.26, 0.045, 0.025),
        yellow,
        root,
        side * 0.38,
        -0.42 - i * 0.22,
        0.125,
      );
      trim.rotation.z = side * 0.4;
    }
  }
  for (const side of [-1, 1]) {
    const collar = mesh(
      new THREE.BoxGeometry(0.17, 0.3, 0.31),
      jacket,
      root,
      side * 0.27,
      0.33,
      0.06,
    );
    collar.rotation.z = side * 0.2;
    const leg = mesh(
      new THREE.CapsuleGeometry(0.18, 0.65, 6, 12),
      ink,
      root,
      side * 0.23,
      -1.03,
      -0.02,
    );
    leg.rotation.z = side * -0.08;
    sphere(root, white, side * 0.27, -1.51, 0.1, 0.23, 0.09, 0.35);
    sphere(root, jacket, side * 0.27, -1.44, 0.075, 0.22, 0.14, 0.3);
    mesh(
      new THREE.BoxGeometry(0.21, 0.045, 0.02),
      yellow,
      root,
      side * 0.27,
      -1.42,
      0.36,
    );
  }
  const arms: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.43, 0.15, 0);
    root.add(arm);
    mesh(
      new THREE.CylinderGeometry(0.22, 0.27, 0.65, 12),
      coat,
      arm,
      0,
      -0.34,
      0,
    );
    sphere(arm, skin, 0, -0.76, 0.025, 0.135, 0.16, 0.13);
    arm.rotation.z = side * 0.22;
    arms.push(arm);
  }
  const starShape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const angle = (i * Math.PI) / 5 + Math.PI / 2,
      r = i % 2 ? 0.067 : 0.15;
    const x = Math.cos(angle) * r,
      y = Math.sin(angle) * r;
    if (!i) starShape.moveTo(x, y);
    else starShape.lineTo(x, y);
  }
  starShape.closePath();
  mesh(
    new THREE.ExtrudeGeometry(starShape, { depth: 0.035, bevelEnabled: false }),
    yellow,
    root,
    -0.25,
    0.12,
    0.29,
  );
  const sparkles = new THREE.Group();
  root.add(sparkles);
  for (let i = 0; i < 3; i++)
    mesh(
      new THREE.OctahedronGeometry(0.08),
      yellow,
      sparkles,
      (i - 1) * 0.85,
      0.9 + (i % 2) * 0.7,
      0,
    );
  const shadow = mesh(
    new THREE.CircleGeometry(0.75, 48),
    new THREE.MeshBasicMaterial({
      color: 0x39203d,
      transparent: true,
      opacity: 0.12,
    }),
    scene,
    0,
    -1.64,
    0,
  );
  shadow.rotation.x = -Math.PI / 2;
  let state: AvatarState = "idle";
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const observer = new ResizeObserver(() => {
    const { width, height } = host.getBoundingClientRect();
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  });
  observer.observe(host);
  const start = performance.now();
  renderer.setAnimationLoop(() => {
    if (document.hidden) return;
    const t = motion.matches ? 0 : (performance.now() - start) / 1000;
    root.position.y =
      Math.sin(t * 1.8) * 0.045 +
      (state === "success" ? Math.abs(Math.sin(t * 4)) * 0.13 : 0);
    root.rotation.y = -0.16 + Math.sin(t * 0.8) * 0.07;
    head.rotation.z =
      state === "listening" ? -0.12 : state === "correction" ? 0.1 : 0;
    head.rotation.y = state === "thinking" ? Math.sin(t * 1.5) * 0.17 : 0;
    head.rotation.x = state === "error" ? 0.16 : Math.sin(t * 2) * 0.018;
    mouth.scale.y =
      state === "speaking" ? 0.035 + Math.abs(Math.sin(t * 13)) * 0.065 : 0.018;
    arms[0].rotation.z =
      state === "success" ? -2.3 + Math.sin(t * 7) * 0.18 : -0.22;
    arms[1].rotation.z =
      state === "speaking"
        ? 0.55 + Math.sin(t * 3) * 0.13
        : state === "thinking"
          ? 1.2
          : 0.22;
    sparkles.visible = state === "success";
    sparkles.rotation.y = t;
    for (const eye of eyes) eye.scale.y = t % 5 > 4.85 ? 0.025 : 0.11;
    renderer.render(scene, camera);
  });
  return {
    setState(next: AvatarState) {
      state = next;
    },
    dispose() {
      observer.disconnect();
      renderer.setAnimationLoop(null);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          if (object.material instanceof THREE.Material)
            object.material.dispose();
        }
      });
      renderer.dispose();
    },
  };
}
