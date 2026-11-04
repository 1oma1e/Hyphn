// Camera effects (spec `Cam - Filtres et effets`, ADR-0034): the window draws
// the picture with its effects on the graphics card (canvas filters and blend
// modes, as the CSSgram recipes do for Instagram's filters; MediaPipe from
// Google, Apache-2.0, for the face points and the person mask), and the
// Windows webcam gets exactly that picture (vcam::fx in Rust). The masks are
// made of Microsoft's Fluent Emoji 3D (MIT, vendor/fluent); the backgrounds
// are free photos (CC0 or public domain, vendor/backgrounds/CREDITS.txt).
'use strict';

// [id, name, canvas filter, overlay [color, blend, strength], vignette]
const FX_FILTERS = [
  ['none', 'Original', 'none', null, 0],
  ['vif', 'Vif', 'saturate(1.45) contrast(1.1)', null, 0],
  ['chaud', 'Chaud', 'saturate(1.15) contrast(1.05) sepia(.12)', ['#FFA552', 'soft-light', 0.4], 0.12],
  ['froid', 'Froid', 'saturate(1.05) brightness(1.04)', ['#3D8BFF', 'soft-light', 0.35], 0.1],
  ['nb', 'Noir et blanc', 'grayscale(1) contrast(1.18)', null, 0.25],
  ['vintage', 'Vintage', 'sepia(.45) contrast(1.05) brightness(1.05) saturate(1.15)', ['#F5D9A8', 'multiply', 0.3], 0.35],
  ['film', 'Film', 'contrast(1.22) saturate(.82) brightness(.98)', ['#26364A', 'lighten', 0.35], 0.3],
  ['pastel', 'Pastel', 'saturate(.7) brightness(1.1) contrast(.88)', ['#FFC9E3', 'soft-light', 0.35], 0],
  ['neon', 'Néon', 'saturate(1.9) contrast(1.25) hue-rotate(-12deg)', ['#B64DFF', 'overlay', 0.28], 0.3],
  ['cine', 'Ciné', 'contrast(1.15) saturate(1.12)', ['#0E9AA7', 'soft-light', 0.3], 0.32],
  ['doux', 'Doux', 'brightness(1.06) contrast(.92) saturate(1.05)', ['#FFE6D0', 'screen', 0.18], 0.08],
  ['dramatique', 'Dramatique', 'contrast(1.4) saturate(.9) brightness(.95)', null, 0.45],
];
// Masks: [id, name, tile picture, parts]. A part: [picture, anchor, size,
// dx, dy, motion], sizes and offsets in eye gaps, turned with the head.
// Anchors: eyes, eyeR, eyeL, top (forehead), face, mouth, nose, cheekR, cheekL.
// Motions: orbit (round the head), fall (from above), open (mouth open only), bob.
const FX_MASKS = [
  ['none', 'Aucun', null, []],
  ['soleil', 'Lunettes de soleil', 'sunglasses', [['sunglasses', 'eyes', 2.6, 0, 0.1]]],
  ['lunettes', 'Lunettes', 'glasses', [['glasses', 'eyes', 2.6, 0, 0.1]]],
  ['couronne', 'Couronne', 'crown', [['crown', 'top', 2.2, 0, -0.75, 'bob']]],
  ['chapeau', 'Haut-de-forme', 'top_hat', [['top_hat', 'top', 2.6, 0, -1.05]]],
  ['casquette', 'Casquette', 'billed_cap', [['billed_cap', 'top', 3, 0, -0.6]]],
  ['diplome', 'Diplômé', 'graduation_cap', [['graduation_cap', 'top', 2.8, 0, -0.75]]],
  ['fleurs', 'Fleurs', 'cherry_blossom', [-1.15, -0.7, -0.25, 0.25, 0.7, 1.15].map((x, i) =>
    [['cherry_blossom', 'hibiscus', 'blossom'][i % 3], 'top', 0.85, x, -0.35 - 0.3 * Math.cos(x / 1.2), 'bob'])],
  ['papillons', 'Papillons', 'butterfly', [0, 1, 2].map((i) => ['butterfly', 'orbit', 0.8, i, 3])],
  ['coeurs', 'Cœurs', 'sparkling_heart', [['red_heart', 'eyeR', 1.1, 0, 0, 'bob'], ['red_heart', 'eyeL', 1.1, 0, 0, 'bob'],
    ...[0, 1, 2, 3, 4].map((i) => ['sparkling_heart', 'orbit', 0.55, i, 5])]],
  ['etoiles', 'Étoiles', 'glowing_star', [0, 1, 2, 3].map((i) => [i % 2 ? 'sparkles' : 'glowing_star', 'orbit', 0.65, i, 4])],
  ['feu', 'Tête en feu', 'fire', [['fire', 'top', 3, 0, -1, 'bob']]],
  ['arcenciel', 'Arc-en-ciel', 'rainbow', [['rainbow', 'mouth', 2.6, 0, 1.1, 'open']]],
  ['fete', 'Fête', 'party_popper', [['party_popper', 'top', 1.3, -1.5, -0.4, 'bob'], ['confetti_ball', 'top', 1.3, 1.5, -0.4, 'bob'],
    ...[0, 1, 2, 3, 4, 5].map((i) => ['sparkles', 'fall', 0.5, i, 6])]],
  ['neige', 'Neige', 'snowflake', [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ['snowflake', 'fall', 0.45, i, 8])],
  ['musique', 'Musique', 'musical_notes', [0, 1, 2].map((i) => ['musical_notes', 'orbit', 0.75, i, 3])],
  ['bisou', 'Bisous', 'kiss_mark', [['kiss_mark', 'cheekR', 0.8, 0, 0], ['kiss_mark', 'cheekL', 0.8, 0, 0]]],
  ['chien', 'Chien', 'dog_face', [['dog_face', 'face', 4.1, 0, 0.05]]],
  ['chat', 'Chat', 'cat_face', [['cat_face', 'face', 4.1, 0, 0.05]]],
  ['panda', 'Panda', 'panda', [['panda', 'face', 4.1, 0, 0.05]]],
  ['renard', 'Renard', 'fox', [['fox', 'face', 4.1, 0, 0.05]]],
  ['tigre', 'Tigre', 'tiger_face', [['tiger_face', 'face', 4.1, 0, 0.05]]],
  ['licorne', 'Licorne', 'unicorn', [['unicorn', 'face', 4.3, 0, 0]]],
  ['robot', 'Robot', 'robot', [['robot', 'face', 4.1, 0, 0.05]]],
  ['alien', 'Extraterrestre', 'alien', [['alien', 'face', 4.1, 0, 0.05]]],
  ['clown', 'Clown', 'clown_face', [['clown_face', 'face', 4.1, 0, 0.05]]],
  ['squelette', 'Squelette', 'skull', [['skull', 'face', 4.1, 0, 0.05]]],
  ['fantome', 'Fantômes', 'ghost', [0, 1].map((i) => ['ghost', 'orbit', 1, i, 2])],
  // 3D, the way MindAR does it (fx3d.js): [.., [], [{ model, at (face point), width, off, rot }]].
  ['lunettes3d', 'Lunettes 3D', 'models3d/glasses/thumbnail.png', [], [{ model: 'glasses', at: 168, width: 2.15, off: [0.3, -0.12, 0.2] }]],
  ['clown3d', 'Chapeau de clown 3D', 'models3d/hat/thumbnail.png', [], [{ model: 'hat', at: 10, width: 3.1, off: [0, 0.6, -0.3] }]],
  ['boucles3d', 'Boucles d’oreilles 3D', 'models3d/earring/thumbnail.png', [], [
    { model: 'earring', at: 177, width: 0.3, off: [0, -0.25, 0] }, { model: 'earring', at: 401, width: 0.3, off: [0, -0.25, 0] }]],
  ['fete3d', 'Fête 3D', 'models3d/hat/thumbnail.png', [], [
    { model: 'hat', at: 10, width: 3.1, off: [0, 0.6, -0.3] }, { model: 'glasses', at: 168, width: 2.15, off: [0.3, -0.12, 0.2] }]],
];
const FX_PHOTOS = [['salon', 'Salon'], ['bureau', 'Bureau'], ['bibliotheque', 'Bibliothèque'], ['cuisine', 'Cuisine'], ['lecture', 'Salle de lecture'],
  ['plage', 'Plage'], ['montagne', 'Montagne'], ['aurore', 'Aurore boréale'], ['ville', 'Ville la nuit'], ['espace', 'Espace']];
const FX_BG = [['none', 'Normal'], ['blur', 'Flou'], ['strong', 'Très flou'], ...FX_PHOTOS, ['image', 'Ton image']];
const fxPicture = (name) => (name.includes('/') ? `vendor/${name}` : `vendor/fluent/${name}_3d.png`);
const FX_DEFAULTS = { filter: 'none', amount: 100, mask: 'none', bg: 'none', bgImg: null, smooth: 0, light: 0 };
// MediaPipe face mesh: the face outline, the eyes and the lips.
const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
const EYE_R = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
const EYE_L = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398];
const LIPS = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185];

const Effects = {
  cfg: Object.assign({}, FX_DEFAULTS),
  face: null, // MediaPipe FaceLandmarker
  seg: null, // MediaPipe ImageSegmenter (selfie)
  loading: null,
  error: '',
  pts: null, // last face points, in pixels of the output
  open: 0, // mouth opening, 0..1
  sending: false,
  canvases: {},
  // Anything on? Then the picture goes through here.
  active() {
    const c = this.cfg;
    return c.filter !== 'none' || c.mask !== 'none' || c.bg !== 'none' || c.smooth > 0 || c.light > 0;
  },
  needsFace() {
    const c = this.cfg;
    return c.mask !== 'none' || c.smooth > 0 || c.light > 0;
  },
  set(cfg) {
    this.cfg = Object.assign({}, FX_DEFAULTS, cfg || {});
    if (this.cfg.bg === 'image' && this.cfg.bgImg && (!this.bgImage || this.bgImage.src !== this.cfg.bgImg)) {
      this.bgImage = new Image();
      this.bgImage.src = this.cfg.bgImg;
    }
    // The pictures of the chosen mask and background load now, not mid-picture.
    const m = FX_MASKS.find(([id]) => id === this.cfg.mask);
    if (m) for (const part of m[3]) this.img(fxPicture(part[0]));
    if (m && m[4] && this.three) this.three.preload(m[4]);
    if (FX_PHOTOS.some(([id]) => id === this.cfg.bg)) this.img(`vendor/backgrounds/${this.cfg.bg}.jpg`);
    if ((this.needsFace() || this.cfg.bg !== 'none') && !this.loading) this.load();
  },
  canvas(name, w, h) {
    let c = this.canvases[name];
    if (!c) c = this.canvases[name] = document.createElement('canvas');
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    return c;
  },
  // MediaPipe, from the app itself (vendor/mediapipe): nothing is downloaded.
  load() {
    Popup.show({ icon: 'wand', title: 'Préparation des effets', text: 'Détection du visage et du fond, sur ce PC', pct: -1 });
    this.loading = (async () => {
      try {
        if (!window.Vision) {
          await new Promise((ok, ko) => {
            const s = document.createElement('script');
            s.src = 'vendor/mediapipe/vision_bundle.js';
            s.onload = ok;
            s.onerror = () => ko(new Error('MediaPipe absent'));
            document.head.appendChild(s);
          });
        }
        const base = new URL('vendor/mediapipe/', location.href).href;
        const files = { wasmLoaderPath: base + 'wasm/vision_wasm_internal.js', wasmBinaryPath: base + 'wasm/vision_wasm_internal.wasm' };
        const make = async (Task, model, extra) => {
          try {
            return await Task.createFromOptions(files, Object.assign({ baseOptions: { modelAssetPath: base + model, delegate: 'GPU' }, runningMode: 'VIDEO' }, extra));
          } catch (e) {
            // No usable graphics card for it: the processor does it, slower.
            return Task.createFromOptions(files, Object.assign({ baseOptions: { modelAssetPath: base + model, delegate: 'CPU' }, runningMode: 'VIDEO' }, extra));
          }
        };
        // The head pose too: the 3D masks turn with it.
        this.face = await make(window.Vision.FaceLandmarker, 'face_landmarker.task', { numFaces: 1, outputFacialTransformationMatrixes: true });
        // The landscape model: made for 16:9 webcam pictures (cleaner edges than the square one).
        this.seg = await make(window.Vision.ImageSegmenter, 'selfie_segmenter_landscape.tflite', { outputConfidenceMasks: true, outputCategoryMask: false });
        this.error = '';
        Popup.show({ title: 'Effets prêts', text: 'Masques, fond et retouche', done: true });
      } catch (e) {
        this.error = 'Effets visage et fond indisponibles : ' + (e && e.message ? e.message : e);
        Popup.show({ title: 'Effets indisponibles', text: String(e && e.message ? e.message : e), bad: true });
      }
      if (typeof Cam !== 'undefined' && Cam.panel === 'fx') Cam.paintFx();
    })();
  },
  // The size to draw at: the webcam's while it shows the picture with
  // effects, else the window's.
  size(frame, box) {
    const v = S && S.vcam;
    if (this.toWebcam() && v.fx_size) return v.fx_size;
    const s = Math.min(1, 1920 / frame.displayWidth, (box.w || frame.displayWidth) / frame.displayWidth);
    return [Math.max(2, Math.round(frame.displayWidth * s / 2) * 2), Math.max(2, Math.round(frame.displayHeight * s / 2) * 2)];
  },
  toWebcam() {
    return !!(S && S.cam.live && S.vcam && S.vcam.in_use && S.vcam.fx_size && Video.ws && Video.ws.readyState === 1);
  },
  // One picture through the effects; returns the canvas to show.
  render(frame, box) {
    const [W, H] = this.size(frame, box);
    const c = this.cfg;
    const now = performance.now();
    const small = this.canvas('small', 320, Math.round(320 * frame.displayHeight / frame.displayWidth));
    // The picture as it comes, small: for the models and the filter previews.
    small.getContext('2d').drawImage(frame, 0, 0, small.width, small.height);
    // 1. The face points, for masks and touch-ups.
    this.pts = null;
    if (this.face && this.needsFace()) {
      try {
        const r = this.face.detectForVideo(small, now);
        const lm = r.faceLandmarks && r.faceLandmarks[0];
        if (lm) this.pts = lm.map((p) => [p.x * W, p.y * H, p.z * W]);
        const mx = r.facialTransformationMatrixes && r.facialTransformationMatrixes[0];
        this.pose = mx ? mx.data : null;
      } catch (e) { /* one picture without points */ }
    }
    // 2. The base: background then person, or the picture as it is.
    const base = this.canvas('base', W, H);
    const g = base.getContext('2d');
    g.filter = 'none';
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    if (c.bg !== 'none' && this.seg) {
      // The person mask moves little between two pictures: worked out about
      // 25 times a second, the last one used in between.
      let mask = this.lastMask && now - this.maskAt < 38 ? this.lastMask : null;
      if (!mask) try {
        this.maskAt = now;
        this.seg.segmentForVideo(small, now + 0.01, (res) => {
          const m = res.confidenceMasks && res.confidenceMasks[0];
          if (!m) return;
          const f = m.getAsFloat32Array();
          const mc = this.canvas('mask', m.width, m.height);
          const mg = mc.getContext('2d');
          const img = mg.createImageData(m.width, m.height);
          // Steady from one picture to the next (no flicker on the edges),
          // then a soft but narrow edge between 0.35 and 0.65.
          if (!this.prevMask || this.prevMask.length !== f.length) this.prevMask = new Float32Array(f.length);
          const pm = this.prevMask;
          for (let i = 0; i < f.length; i++) {
            const v = (pm[i] = pm[i] * 0.45 + f[i] * 0.55);
            const t = Math.min(1, Math.max(0, (v - 0.35) / 0.3));
            img.data[i * 4 + 3] = t * t * (3 - 2 * t) * 255;
          }
          mg.putImageData(img, 0, 0);
          mask = this.lastMask = mc;
        });
      } catch (e) { /* no mask this time */ }
      this.drawBackground(g, frame, W, H);
      if (mask) {
        const p = this.canvas('person', W, H);
        const pg = p.getContext('2d');
        pg.globalCompositeOperation = 'source-over';
        pg.filter = 'none';
        pg.clearRect(0, 0, W, H);
        pg.drawImage(frame, 0, 0, W, H);
        pg.globalCompositeOperation = 'destination-in';
        // A soft edge around the person, a thin one: the hair keeps its shape.
        pg.filter = `blur(${Math.max(0.8, W / 900).toFixed(1)}px)`;
        pg.drawImage(mask, 0, 0, W, H);
        pg.filter = 'none';
        pg.globalCompositeOperation = 'source-over';
        g.drawImage(p, 0, 0);
      } else {
        g.drawImage(frame, 0, 0, W, H);
      }
    } else {
      g.drawImage(frame, 0, 0, W, H);
    }
    // 3. Touch-ups on the face: smooth skin (eyes and lips stay sharp), soft light.
    if (this.pts && (c.smooth > 0 || c.light > 0)) this.touchUp(g, W, H);
    // 4. The colour filter over the whole picture, at its strength.
    const out = this.canvas('out', W, H);
    const o = out.getContext('2d');
    o.globalCompositeOperation = 'source-over';
    o.globalAlpha = 1;
    o.filter = 'none';
    const f = FX_FILTERS.find(([id]) => id === c.filter) || FX_FILTERS[0];
    const amount = Math.max(0, Math.min(100, c.amount)) / 100;
    if (f[0] === 'none') {
      o.drawImage(base, 0, 0);
    } else {
      if (amount < 1) o.drawImage(base, 0, 0);
      o.globalAlpha = amount;
      o.filter = f[2];
      o.drawImage(base, 0, 0);
      o.filter = 'none';
      if (f[3]) {
        o.globalCompositeOperation = f[3][1];
        o.globalAlpha = f[3][2] * amount;
        o.fillStyle = f[3][0];
        o.fillRect(0, 0, W, H);
        o.globalCompositeOperation = 'source-over';
      }
      if (f[4]) {
        const v = o.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.6);
        v.addColorStop(0, 'rgba(0,0,0,0)');
        v.addColorStop(1, `rgba(0,0,0,${(f[4] * amount).toFixed(2)})`);
        o.globalAlpha = 1;
        o.fillStyle = v;
        o.fillRect(0, 0, W, H);
      }
      o.globalAlpha = 1;
    }
    // 5. The mask on top, following the face.
    if (this.pts && c.mask !== 'none') {
      this.drawMask(o, c.mask, now);
      this.draw3d(o, c.mask, W, H);
    }
    // 6. The same picture for Discord, OBS… (one at a time, never a queue).
    if (this.toWebcam()) this.send(out, W, H, frame.timestamp);
    return out;
  },
  drawBackground(g, frame, W, H) {
    const bg = this.cfg.bg;
    if (bg === 'blur' || bg === 'strong') {
      const r = (bg === 'strong' ? W / 40 : W / 90).toFixed(1);
      g.filter = `blur(${r}px)`;
      // A little bigger: no dark edge from the blur.
      g.drawImage(frame, -W * 0.04, -H * 0.04, W * 1.08, H * 1.08);
      g.filter = 'none';
      return;
    }
    const im = bg === 'image' ? this.bgImage : this.img(`vendor/backgrounds/${bg}.jpg`);
    if (im && im.complete && im.naturalWidth) {
      // Fills the picture, cut evenly on both sides.
      const s = Math.max(W / im.naturalWidth, H / im.naturalHeight);
      g.drawImage(im, (W - im.naturalWidth * s) / 2, (H - im.naturalHeight * s) / 2, im.naturalWidth * s, im.naturalHeight * s);
    } else {
      g.fillStyle = '#16181D';
      g.fillRect(0, 0, W, H);
    }
  },
  // Pictures (stickers, backgrounds), loaded once.
  img(src) {
    this.imgs = this.imgs || {};
    if (!this.imgs[src]) {
      const im = new Image();
      im.src = src;
      this.imgs[src] = im;
    }
    return this.imgs[src];
  },
  path(g, idx) {
    idx.forEach((i, k) => (k ? g.lineTo(...this.pts[i]) : g.moveTo(...this.pts[i])));
    g.closePath();
  },
  touchUp(g, W, H) {
    const c = this.cfg, p = this.pts;
    const u = Math.hypot(p[263][0] - p[33][0], p[263][1] - p[33][1]);
    if (c.smooth > 0) {
      const b = this.canvas('soft', W, H);
      const bg = b.getContext('2d');
      bg.filter = `blur(${Math.max(1.5, u / 28).toFixed(1)}px)`;
      bg.drawImage(g.canvas, 0, 0);
      bg.filter = 'none';
      g.save();
      g.beginPath();
      this.path(g, FACE_OVAL);
      this.path(g, EYE_R);
      this.path(g, EYE_L);
      this.path(g, LIPS);
      g.clip('evenodd');
      g.globalAlpha = (c.smooth / 100) * 0.65;
      g.drawImage(b, 0, 0);
      g.restore();
    }
    if (c.light > 0) {
      const [cx, cy] = p[1];
      const r = g.createRadialGradient(cx, cy - u * 0.4, u * 0.2, cx, cy - u * 0.4, u * 2.4);
      r.addColorStop(0, 'rgba(255,240,225,1)');
      r.addColorStop(1, 'rgba(255,240,225,0)');
      g.save();
      g.globalCompositeOperation = 'soft-light';
      g.globalAlpha = (c.light / 100) * 0.7;
      g.fillStyle = r;
      g.fillRect(0, 0, W, H);
      g.restore();
    }
  },
  // 3D models on the head (fx3d.js, loaded the first time one is chosen).
  draw3d(g, kind, W, H) {
    const m = FX_MASKS.find(([id]) => id === kind);
    if (!m || !m[4] || !this.pose) return;
    if (!this.three) {
      if (!this.loading3d) {
        this.loading3d = import('./fx3d.js').then((mod) => { this.three = mod.create(); }).catch((e) => { this.error = 'Masques 3D indisponibles : ' + e; });
      }
      return;
    }
    const p = this.pts;
    const u = Math.hypot(p[263][0] - p[33][0], p[263][1] - p[33][1]) * 0.78;
    g.drawImage(this.three.draw(W, H, p, this.pose, u, m[4]), 0, 0);
  },
  // A mask: its pictures placed on the face points, turned with the head.
  drawMask(g, kind, now) {
    const m = FX_MASKS.find(([id]) => id === kind);
    if (!m) return;
    const p = this.pts;
    const mid = (a, b) => [(p[a][0] + p[b][0]) / 2, (p[a][1] + p[b][1]) / 2];
    const eR = mid(33, 133), eL = mid(263, 362);
    const u = Math.hypot(eL[0] - eR[0], eL[1] - eR[1]);
    const a = Math.atan2(eL[1] - eR[1], eL[0] - eR[0]);
    const anchors = {
      eyes: [(eR[0] + eL[0]) / 2, (eR[1] + eL[1]) / 2], eyeR: eR, eyeL: eL, top: p[10], nose: p[4],
      face: mid(10, 152), mouth: mid(13, 14), cheekR: p[205], cheekL: p[425],
    };
    const open = Math.hypot(p[13][0] - p[14][0], p[13][1] - p[14][1]) / u;
    const t = now / 1000;
    for (const [name, anchor, size, dx0, dy0, motion] of m[3]) {
      const im = this.img(fxPicture(name));
      if (!im.complete || !im.naturalWidth) continue;
      let dx = dx0, dy = dy0, sz = size, alpha = 1, at = anchors[anchor] || anchors.face;
      if (anchor === 'orbit' || anchor === 'fall') {
        // dx0 = index, dy0 = count: spread evenly round the head, or falling.
        const k = dx0 / dy0;
        at = anchors.face;
        if (anchor === 'orbit') {
          const ang = t * 1.1 + k * Math.PI * 2;
          dx = Math.cos(ang) * 1.9;
          dy = -0.6 + Math.sin(ang) * 0.5;
          // Behind the head: smaller and paler.
          sz = size * (0.8 + 0.25 * Math.sin(ang));
        } else {
          const fall = (t * 0.35 + k) % 1;
          dx = (k - 0.5) * 4.6 + Math.sin(t * 2 + dx0) * 0.2;
          dy = -2.6 + fall * 5.2;
          alpha = Math.min(1, Math.min(fall, 1 - fall) * 6);
        }
      }
      if (motion === 'bob') dy += Math.sin(t * 2.4 + dx0) * 0.04;
      if (motion === 'open') {
        // Out of the mouth when it opens, bigger the wider.
        if (open < 0.15) continue;
        sz = size * Math.min(1.2, 0.4 + open * 1.6);
        alpha = Math.min(1, (open - 0.15) * 8);
      }
      g.save();
      g.globalAlpha = alpha;
      g.translate(at[0], at[1]);
      g.rotate(a);
      const w = sz * u, h = w * im.naturalHeight / im.naturalWidth;
      g.drawImage(im, dx * u - w / 2, dy * u - h / 2, w, h);
      g.restore();
    }
  },
  // The finished picture to the webcam: one in flight at most.
  async send(canvas, W, H, ts) {
    // The last picture still on its way: this one is skipped, else they pile
    // up in the socket and the webcam falls further and further behind.
    if (this.sending || (Video.ws && Video.ws.bufferedAmount > 0)) return;
    this.sending = true;
    try {
      const buf = new Uint8Array(13 + W * H * 4);
      // Read back without stopping the drawing; else the plain way (RGBA).
      const vf = new VideoFrame(canvas, { timestamp: ts || 0 });
      let fmt = vf.format;
      if (/^(RGB|BGR)[AX]$/.test(fmt || '')) {
        await vf.copyTo(buf.subarray(13), { rect: { x: 0, y: 0, width: W, height: H } });
      } else {
        buf.set(canvas.getContext('2d').getImageData(0, 0, W, H).data, 13);
        fmt = 'RGBA';
      }
      vf.close();
      buf.set([72, 70, 88, 49]); // "HFX1"
      const dv = new DataView(buf.buffer);
      dv.setUint32(4, W, true);
      dv.setUint32(8, H, true);
      buf[12] = fmt === 'BGRA' || fmt === 'BGRX' ? 1 : 0;
      if (Video.ws && Video.ws.readyState === 1) Video.ws.send(buf);
    } catch (e) { /* this picture is skipped */ }
    this.sending = false;
  },
};
