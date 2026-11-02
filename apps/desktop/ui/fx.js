// Camera effects (spec `Cam - Filtres et effets`, ADR-0034): the window draws
// the picture with its effects on the graphics card (canvas filters and blend
// modes, as the CSSgram recipes do for Instagram's filters; MediaPipe from
// Google, Apache-2.0, for the face points and the person mask), and the
// Windows webcam gets exactly that picture (vcam::fx in Rust).
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
const FX_MASKS = [['none', 'Aucun'], ['lunettes', 'Lunettes'], ['chien', 'Chien'], ['chat', 'Chat'], ['couronne', 'Couronne'], ['moustache', 'Moustache'], ['coeurs', 'Cœurs']];
const FX_BG = [['none', 'Normal'], ['blur', 'Flou'], ['strong', 'Très flou'], ['studio', 'Studio'], ['sunset', 'Coucher de soleil'], ['ocean', 'Océan'], ['neonbg', 'Néon'], ['image', 'Ton image']];
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
    this.bgCache = null;
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
        this.face = await make(window.Vision.FaceLandmarker, 'face_landmarker.task', { numFaces: 1 });
        this.seg = await make(window.Vision.ImageSegmenter, 'selfie_segmenter.tflite', { outputConfidenceMasks: true, outputCategoryMask: false });
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
    if (this.face || this.seg) small.getContext('2d').drawImage(frame, 0, 0, small.width, small.height);
    // 1. The face points, for masks and touch-ups.
    this.pts = null;
    if (this.face && this.needsFace()) {
      try {
        const r = this.face.detectForVideo(small, now);
        const lm = r.faceLandmarks && r.faceLandmarks[0];
        if (lm) this.pts = lm.map((p) => [p.x * W, p.y * H]);
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
          for (let i = 0; i < f.length; i++) img.data[i * 4 + 3] = Math.min(255, Math.max(0, (f[i] - 0.25) * 2 * 255));
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
        // Soft edge around the person.
        pg.filter = `blur(${Math.max(1, W / 480).toFixed(1)}px)`;
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
    if (this.pts && c.mask !== 'none') this.drawMask(o, c.mask, now);
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
    if (bg === 'image' && this.bgImage && this.bgImage.complete && this.bgImage.naturalWidth) {
      const im = this.bgImage, s = Math.max(W / im.naturalWidth, H / im.naturalHeight);
      g.drawImage(im, (W - im.naturalWidth * s) / 2, (H - im.naturalHeight * s) / 2, im.naturalWidth * s, im.naturalHeight * s);
      return;
    }
    // The backgrounds drawn by the app, kept until the size changes.
    if (!this.bgCache || this.bgCache.width !== W || this.bgCache.height !== H || this.bgCache.dataset.bg !== bg) {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      c.dataset.bg = bg;
      const x = c.getContext('2d');
      const lin = (stops) => {
        const l = x.createLinearGradient(0, 0, 0, H);
        stops.forEach(([p, col]) => l.addColorStop(p, col));
        return l;
      };
      if (bg === 'sunset') x.fillStyle = lin([[0, '#2B1B4A'], [0.45, '#C2456B'], [0.75, '#F28B54'], [1, '#FFD27A']]);
      else if (bg === 'ocean') x.fillStyle = lin([[0, '#0B2545'], [0.5, '#13678A'], [1, '#45C4B0']]);
      else if (bg === 'neonbg') x.fillStyle = lin([[0, '#0A0614'], [1, '#2A0C45']]);
      else {
        const r = x.createRadialGradient(W / 2, H * 0.4, 10, W / 2, H * 0.4, Math.hypot(W, H) * 0.6);
        r.addColorStop(0, '#5A5F69');
        r.addColorStop(1, '#16181D');
        x.fillStyle = r;
      }
      x.fillRect(0, 0, W, H);
      if (bg === 'neonbg') {
        x.strokeStyle = 'rgba(255,80,220,.35)';
        x.lineWidth = Math.max(1, W / 640);
        for (let i = 0; i <= 12; i++) {
          const y = H * 0.55 + (H * 0.45) * (i / 12) ** 2;
          x.beginPath();
          x.moveTo(0, y);
          x.lineTo(W, y);
          x.stroke();
        }
        for (let i = -10; i <= 10; i++) {
          x.beginPath();
          x.moveTo(W / 2 + i * W * 0.02, H * 0.55);
          x.lineTo(W / 2 + i * W * 0.2, H);
          x.stroke();
        }
      }
      this.bgCache = c;
    }
    g.drawImage(this.bgCache, 0, 0);
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
  heart(g, x, y, s, col) {
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(x, y + s * 0.35);
    g.bezierCurveTo(x - s * 1.1, y - s * 0.35, x - s * 0.45, y - s * 1.05, x, y - s * 0.45);
    g.bezierCurveTo(x + s * 0.45, y - s * 1.05, x + s * 1.1, y - s * 0.35, x, y + s * 0.35);
    g.fill();
  },
  // The masks, drawn here (no image files): anchored on the eyes, the nose,
  // the forehead and the lips, turned with the head.
  drawMask(g, kind, now) {
    const p = this.pts;
    const mid = (a, b) => [(p[a][0] + p[b][0]) / 2, (p[a][1] + p[b][1]) / 2];
    const eR = mid(33, 133), eL = mid(263, 362);
    const u = Math.hypot(eL[0] - eR[0], eL[1] - eR[1]);
    const a = Math.atan2(eL[1] - eR[1], eL[0] - eR[0]);
    const at = (pt, fn) => {
      g.save();
      g.translate(pt[0], pt[1]);
      g.rotate(a);
      fn();
      g.restore();
    };
    const eyes = [(eR[0] + eL[0]) / 2, (eR[1] + eL[1]) / 2];
    const mouth = Math.hypot(p[13][0] - p[14][0], p[13][1] - p[14][1]) / u;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    if (kind === 'lunettes') {
      at(eyes, () => {
        for (const sx of [-1, 1]) {
          const x = sx * u * 0.52;
          g.beginPath();
          g.roundRect(x - u * 0.42, -u * 0.3, u * 0.84, u * 0.6, u * 0.18);
          const lens = g.createLinearGradient(0, -u * 0.3, 0, u * 0.3);
          lens.addColorStop(0, 'rgba(40,40,60,.88)');
          lens.addColorStop(1, 'rgba(10,10,20,.92)');
          g.fillStyle = lens;
          g.fill();
          g.lineWidth = u * 0.07;
          g.strokeStyle = '#111';
          g.stroke();
          g.beginPath();
          g.moveTo(x - u * 0.25, -u * 0.17);
          g.lineTo(x - u * 0.05, -u * 0.17);
          g.lineWidth = u * 0.05;
          g.strokeStyle = 'rgba(255,255,255,.55)';
          g.stroke();
        }
        g.beginPath();
        g.moveTo(-u * 0.1, -u * 0.08);
        g.quadraticCurveTo(0, -u * 0.18, u * 0.1, -u * 0.08);
        g.lineWidth = u * 0.07;
        g.strokeStyle = '#111';
        g.stroke();
      });
    } else if (kind === 'chien' || kind === 'chat') {
      const cat = kind === 'chat';
      at(p[10], () => {
        for (const sx of [-1, 1]) {
          g.save();
          g.translate(sx * u * (cat ? 0.75 : 0.95), -u * (cat ? 0.55 : 0.35));
          g.rotate(sx * (cat ? 0.25 : 0.45));
          if (cat) {
            g.beginPath();
            g.moveTo(-u * 0.38, u * 0.15);
            g.lineTo(0, -u * 0.7);
            g.lineTo(u * 0.38, u * 0.15);
            g.closePath();
            g.fillStyle = '#6B6F78';
            g.fill();
            g.beginPath();
            g.moveTo(-u * 0.2, u * 0.08);
            g.lineTo(0, -u * 0.42);
            g.lineTo(u * 0.2, u * 0.08);
            g.closePath();
            g.fillStyle = '#F4A7B9';
            g.fill();
          } else {
            g.beginPath();
            g.ellipse(0, 0, u * 0.42, u * 0.78, 0, 0, Math.PI * 2);
            g.fillStyle = '#7A4A26';
            g.fill();
            g.beginPath();
            g.ellipse(0, u * 0.08, u * 0.24, u * 0.55, 0, 0, Math.PI * 2);
            g.fillStyle = '#C98B5B';
            g.fill();
          }
          g.restore();
        }
      });
      at(p[4], () => {
        if (cat) {
          g.beginPath();
          g.moveTo(-u * 0.14, -u * 0.05);
          g.lineTo(u * 0.14, -u * 0.05);
          g.lineTo(0, u * 0.12);
          g.closePath();
          g.fillStyle = '#F48FB1';
          g.fill();
          g.strokeStyle = 'rgba(255,255,255,.9)';
          g.lineWidth = u * 0.025;
          for (const sx of [-1, 1]) {
            for (const dy of [-0.08, 0.05, 0.18]) {
              g.beginPath();
              g.moveTo(sx * u * 0.25, u * 0.12);
              g.lineTo(sx * u * 1.05, u * (0.12 + dy * 2));
              g.stroke();
            }
          }
        } else {
          g.beginPath();
          g.ellipse(0, 0, u * 0.3, u * 0.21, 0, 0, Math.PI * 2);
          g.fillStyle = '#1A1A1A';
          g.fill();
          g.beginPath();
          g.ellipse(-u * 0.09, -u * 0.07, u * 0.08, u * 0.045, -0.3, 0, Math.PI * 2);
          g.fillStyle = 'rgba(255,255,255,.7)';
          g.fill();
        }
      });
      // The dog shows its tongue when the mouth opens.
      if (!cat && mouth > 0.18) {
        at(p[14], () => {
          g.beginPath();
          g.roundRect(-u * 0.2, -u * 0.05, u * 0.4, u * (0.35 + Math.min(0.5, mouth)), u * 0.2);
          g.fillStyle = '#F25C7A';
          g.fill();
          g.beginPath();
          g.moveTo(0, u * 0.02);
          g.lineTo(0, u * 0.3);
          g.strokeStyle = '#C93C5A';
          g.lineWidth = u * 0.03;
          g.stroke();
        });
      }
    } else if (kind === 'couronne') {
      at(p[10], () => {
        const w = u * 1.0, h = u * 0.8, y = -u * 0.5;
        g.beginPath();
        g.moveTo(-w, y);
        g.lineTo(-w, y - h * 0.7);
        g.lineTo(-w * 0.5, y - h * 0.3);
        g.lineTo(0, y - h);
        g.lineTo(w * 0.5, y - h * 0.3);
        g.lineTo(w, y - h * 0.7);
        g.lineTo(w, y);
        g.closePath();
        const gold = g.createLinearGradient(0, y - h, 0, y);
        gold.addColorStop(0, '#FFE680');
        gold.addColorStop(1, '#D49A1F');
        g.fillStyle = gold;
        g.fill();
        g.lineWidth = u * 0.04;
        g.strokeStyle = '#9A6A0B';
        g.stroke();
        for (const [x, col] of [[-w * 0.55, '#E5394E'], [0, '#3D7BFF'], [w * 0.55, '#2EC27E']]) {
          g.beginPath();
          g.arc(x, y - h * 0.18, u * 0.09, 0, Math.PI * 2);
          g.fillStyle = col;
          g.fill();
        }
      });
    } else if (kind === 'moustache') {
      at(mid(2, 13), () => {
        g.fillStyle = '#2A1A10';
        for (const sx of [-1, 1]) {
          g.beginPath();
          g.moveTo(0, -u * 0.04);
          g.bezierCurveTo(sx * u * 0.25, -u * 0.18, sx * u * 0.55, -u * 0.1, sx * u * 0.62, u * 0.05);
          g.bezierCurveTo(sx * u * 0.72, u * 0.18, sx * u * 0.85, u * 0.02, sx * u * 0.78, -u * 0.08);
          g.bezierCurveTo(sx * u * 0.8, u * 0.12, sx * u * 0.5, u * 0.14, 0, u * 0.08);
          g.closePath();
          g.fill();
        }
      });
    } else if (kind === 'coeurs') {
      for (const e of [eR, eL]) at(e, () => this.heart(g, 0, u * 0.08, u * 0.32, '#FF3B5C'));
      // Little hearts going round above the head.
      at(p[10], () => {
        const t = now / 1000;
        for (let i = 0; i < 6; i++) {
          const ang = t * 1.2 + (i * Math.PI * 2) / 6;
          this.heart(g, Math.cos(ang) * u * 1.2, -u * 0.55 + Math.sin(ang) * u * 0.18, u * (0.1 + 0.03 * Math.sin(ang)), i % 2 ? '#FF7AA2' : '#FF3B5C');
        }
      });
    }
  },
  // The finished picture to the webcam: one in flight at most.
  async send(canvas, W, H, ts) {
    if (this.sending) return;
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
