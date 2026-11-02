// 3D masks, the way MindAR does them (github.com/hiukim/mind-ar-js, MIT):
// MediaPipe's face points and head pose, three.js (MIT) to draw 3D models on
// the head. The models come from MindAR's examples, CC-BY-4.0
// (vendor/models3d/CREDITS.txt). Loaded only when a 3D mask is chosen.
import * as THREE from './vendor/three/three.module.min.js';
import { GLTFLoader } from './vendor/three/GLTFLoader.js';

export function create() {
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3a46, 2.4));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(0.3, 1, 2);
  scene.add(sun);
  // Pixels, y up: x 0..W, y 0..-H (the picture's y goes down).
  const camera = new THREE.OrthographicCamera(0, 1, 0, -1, -100000, 100000);
  // The head hides what is behind it (back of the hat, the far earring).
  const head = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), new THREE.MeshBasicMaterial({ colorWrite: false }));
  head.renderOrder = -1;
  scene.add(head);
  const loader = new GLTFLoader();
  const models = {};
  const placed = [];
  // A model, centred and 1 unit wide, ready to be placed and sized.
  const model = (name) => {
    if (!models[name]) {
      models[name] = { ready: null };
      loader.loadAsync(`vendor/models3d/${name}/scene.gltf`).then((g) => {
        const root = g.scene;
        // The model's own inner sizes count (Sketchfab files scale inside).
        root.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(root);
        const size = box.getSize(new THREE.Vector3());
        root.position.sub(box.getCenter(new THREE.Vector3()));
        // Inside: 1 unit wide; outside: free for the size on the face.
        const inner = new THREE.Group();
        inner.add(root);
        inner.scale.setScalar(1 / Math.max(size.x, 1e-6));
        const unit = new THREE.Group();
        unit.add(inner);
        models[name].ready = unit;
      }).catch(() => { models[name].failed = true; });
    }
    return models[name];
  };
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const fix = new THREE.Quaternion();
  const tmp = new THREE.Vector3();
  const scl = new THREE.Vector3();
  return {
    canvas,
    // Loads the models of a mask ahead of time.
    preload(items) {
      for (const it of items) model(it.model);
    },
    // pts: face points [x, y, z] in pixels (y down); pose: MediaPipe's
    // head matrix (16 numbers); items: [{ model, at, width, off, rot }] with
    // sizes in eye gaps (u) and offsets along the head's axes.
    draw(W, H, pts, pose, u, items) {
      if (canvas.width !== W || canvas.height !== H) renderer.setSize(W, H, false);
      Object.assign(camera, { left: 0, right: W, top: 0, bottom: -H });
      camera.updateProjectionMatrix();
      m4.fromArray(pose);
      m4.decompose(tmp, q, scl);
      for (const p of placed) scene.remove(p);
      placed.length = 0;
      const world = (i) => new THREE.Vector3(pts[i][0], -pts[i][1], -pts[i][2]);
      // The head: an ellipsoid behind the face, between the ears.
      const c = world(234).add(world(454)).multiplyScalar(0.5).add(new THREE.Vector3(0, 0, -0.55 * u).applyQuaternion(q));
      head.position.copy(c);
      head.quaternion.copy(q);
      head.scale.set(1.25 * u, 1.65 * u, 1.35 * u);
      for (const it of items) {
        const m = model(it.model);
        if (!m.ready) continue;
        const g = m.ready.clone();
        fix.setFromEuler(new THREE.Euler(...(it.rot || [0, 0, 0])));
        g.quaternion.copy(q).multiply(fix);
        g.scale.setScalar(it.width * u);
        g.position.copy(world(it.at)).add(new THREE.Vector3(...it.off).multiplyScalar(u).applyQuaternion(q));
        scene.add(g);
        placed.push(g);
      }
      renderer.render(scene, camera);
      return canvas;
    },
  };
}
