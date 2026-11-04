// Camera effects (spec `Cam - Filtres et effets`, ADR-0034): the window draws
// the picture with its effects on the graphics card (canvas filters and blend
// modes, as the CSSgram recipes do for Instagram's filters; MediaPipe from
// Google, Apache-2.0, for the face points and the person mask), and the
// Windows webcam gets exactly that picture (vcam::fx in Rust). The masks are
// made of Microsoft's Fluent Emoji 3D (MIT, vendor/fluent); the backgrounds
// are free photos (CC0 or public domain, vendor/backgrounds/CREDITS.txt).
// The film looks and their colour tables are in fxlook.js.
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
// Motions: orbit (round the head), fall (from above), rise (from below),
// open (mouth open only), bob.
const fxHead = (id, name, pic, size = 4.1) => [id, name, pic, [[pic, 'face', size, 0, 0.05]]];
// n pictures round the head, or falling, or rising: [picture, how, size, index, count].
const fxMany = (pics, n, size, how = 'orbit') => Array.from({ length: n }, (_, i) => [pics[i % pics.length], how, size, i, n]);
const fxAbove = (pic, size, dx, dy) => [[pic, 'top', size, dx, dy, 'bob']];
// [group name, masks]; the panel shows one heading per group.
const FX_MASK_GROUPS = [
  ['Lunettes et chapeaux', [
    ['soleil', 'Lunettes de soleil', 'sunglasses', [['sunglasses', 'eyes', 2.6, 0, 0.1]]],
    ['lunettes', 'Lunettes', 'glasses', [['glasses', 'eyes', 2.6, 0, 0.1]]],
    ['masque', 'Masque de plongée', 'goggles', [['goggles', 'eyes', 2.8, 0, 0.1]]],
    ['yeuxetoiles', 'Yeux étoiles', 'glowing_star', [['glowing_star', 'eyeR', 1.2, 0, 0, 'bob'], ['glowing_star', 'eyeL', 1.2, 0, 0, 'bob']]],
    ['spirales', 'Tête qui tourne', 'dizzy', [['dizzy', 'eyeR', 1.1, 0, 0], ['dizzy', 'eyeL', 1.1, 0, 0], ...fxMany(['dizzy'], 3, 0.6)]],
    ['couronne', 'Couronne', 'crown', [['crown', 'top', 2.2, 0, -0.75, 'bob']]],
    ['chapeau', 'Haut-de-forme', 'top_hat', [['top_hat', 'top', 2.6, 0, -1.05]]],
    ['casquette', 'Casquette', 'billed_cap', [['billed_cap', 'top', 3, 0, -0.6]]],
    ['diplome', 'Diplômé', 'graduation_cap', [['graduation_cap', 'top', 2.8, 0, -0.75]]],
    ['militaire', 'Casque militaire', 'military_helmet', [['military_helmet', 'top', 3.8, 0, -0.5]]],
    ['noeud', 'Nœud', 'ribbon', [['ribbon', 'top', 1.5, 0.9, -0.35, 'bob']]],
    ['fleurs', 'Fleurs', 'cherry_blossom', [-1.15, -0.7, -0.25, 0.25, 0.7, 1.15].map((x, i) =>
      [['cherry_blossom', 'hibiscus', 'blossom'][i % 3], 'top', 0.85, x, -0.35 - 0.3 * Math.cos(x / 1.2), 'bob'])],
    ['bouquet', 'Couronne de fleurs', 'sunflower', [-1.2, -0.6, 0, 0.6, 1.2].map((x, i) =>
      [['sunflower', 'tulip', 'rose'][i % 3], 'top', 0.95, x, -0.4 - 0.3 * Math.cos(x / 1.2), 'bob'])],
  ]],
  ['Nez et bouche', [
    ['cochon', 'Nez de cochon', 'pig_nose', [['pig_nose', 'nose', 1.25, 0, 0.05]]],
    ['nezclown', 'Nez de clown', 'red_circle', [['red_circle', 'nose', 0.8, 0, 0.05]]],
    ['langue', 'Langue', 'tongue', [['tongue', 'mouth', 1.3, 0, 0.55, 'open']]],
    ['arcenciel', 'Arc-en-ciel', 'rainbow', [['rainbow', 'mouth', 2.6, 0, 1.1, 'open']]],
    ['dragon', 'Cracheur de feu', 'fire', [['fire', 'mouth', 2.4, 0, 1.3, 'open']]],
    ['souffle', 'Bulles', 'bubbles', [['bubbles', 'mouth', 2, 0, 1.1, 'open']]],
    ['sucette', 'Sucette', 'lollipop', [['lollipop', 'mouth', 1.5, 0.75, 0.2]]],
    ['bisou', 'Bisous', 'kiss_mark', [['kiss_mark', 'cheekR', 0.8, 0, 0], ['kiss_mark', 'cheekL', 0.8, 0, 0]]],
  ]],
  ['Au-dessus de la tête', [
    ['feu', 'Tête en feu', 'fire', [['fire', 'top', 3, 0, -1, 'bob']]],
    ['idee', 'Idée', 'light_bulb', fxAbove('light_bulb', 1.4, 0, -1.25)],
    ['pense', 'Je réfléchis', 'thought_balloon', fxAbove('thought_balloon', 1.8, 1.5, -1.2)],
    ['dodo', 'Dodo', 'zzz', [...fxAbove('zzz', 1.4, 1.3, -0.9), ['crescent_moon', 'top', 1.2, -1.4, -1, 'bob']]],
    ['colere', 'En colère', 'anger_symbol', fxAbove('anger_symbol', 1.1, 1.1, -0.45)],
    ['question', 'Question', 'red_question_mark', fxAbove('red_question_mark', 1.3, 0, -1.25)],
    ['exclamation', 'Exclamation', 'red_exclamation_mark', fxAbove('red_exclamation_mark', 1.3, 0, -1.25)],
    ['cent', '100 %', 'hundred_points', fxAbove('hundred_points', 1.6, 0, -1.2)],
    ['gene', 'Gêné', 'sweat_droplets', fxAbove('sweat_droplets', 1.1, 1.2, -0.3)],
    ['soleiltete', 'Soleil', 'sun', fxAbove('sun', 2, 0, -1.5)],
    ['orage', 'Orage', 'cloud_with_lightning', [...fxAbove('cloud_with_lightning', 2.6, 0, -1.7), ...fxMany(['droplet'], 6, 0.4, 'fall')]],
    ['trophee', 'Trophée', 'trophy', fxAbove('trophy', 1.8, 0, -1.2)],
  ]],
  ['Autour de toi', [
    ['papillons', 'Papillons', 'butterfly', fxMany(['butterfly'], 3, 0.8)],
    ['coeurs', 'Cœurs', 'sparkling_heart', [['red_heart', 'eyeR', 1.1, 0, 0, 'bob'], ['red_heart', 'eyeL', 1.1, 0, 0, 'bob'],
      ...fxMany(['sparkling_heart'], 5, 0.55)]],
    ['etoiles', 'Étoiles', 'glowing_star', fxMany(['glowing_star', 'sparkles'], 4, 0.65)],
    ['musique', 'Musique', 'musical_notes', fxMany(['musical_notes'], 3, 0.75)],
    ['fantome', 'Fantômes', 'ghost', fxMany(['ghost'], 2, 1)],
    ['abeilles', 'Abeilles', 'honeybee', fxMany(['honeybee'], 3, 0.7)],
    ['coccinelles', 'Coccinelles', 'lady_beetle', fxMany(['lady_beetle'], 3, 0.6)],
    ['chauvesouris', 'Chauves-souris', 'bat', fxMany(['bat'], 3, 0.85)],
    ['poissons', 'Poissons', 'tropical_fish', fxMany(['tropical_fish'], 3, 0.8)],
    ['espace', 'Espace', 'ringed_planet', fxMany(['ringed_planet', 'rocket', 'shooting_star'], 3, 0.9)],
    ['eclairs', 'Éclairs', 'high_voltage', fxMany(['high_voltage'], 4, 0.7)],
  ]],
  ['Pluies et fêtes', [
    ['fete', 'Fête', 'party_popper', [['party_popper', 'top', 1.3, -1.5, -0.4, 'bob'], ['confetti_ball', 'top', 1.3, 1.5, -0.4, 'bob'],
      ...fxMany(['sparkles'], 6, 0.5, 'fall')]],
    ['anniversaire', 'Anniversaire', 'birthday_cake', [...fxAbove('birthday_cake', 1.8, 0, -1.25), ...fxMany(['balloon'], 5, 0.8, 'rise')]],
    ['noel', 'Noël', 'christmas_tree', [['christmas_tree', 'top', 1.4, -1.7, -0.2, 'bob'], ['wrapped_gift', 'top', 1.1, 1.7, -0.1, 'bob'],
      ...fxMany(['snowflake'], 6, 0.4, 'fall')]],
    ['halloween', 'Halloween', 'jack-o-lantern', [...fxMany(['jack-o-lantern'], 2, 1), ...fxMany(['bat'], 4, 0.6, 'fall')]],
    ['neige', 'Neige', 'snowflake', fxMany(['snowflake'], 8, 0.45, 'fall')],
    ['pluie', 'Pluie', 'droplet', fxMany(['droplet'], 10, 0.35, 'fall')],
    ['argent', 'Pluie d’argent', 'money_with_wings', fxMany(['money_with_wings'], 6, 0.7, 'fall')],
    ['diamants', 'Diamants', 'gem_stone', fxMany(['gem_stone'], 6, 0.55, 'fall')],
    ['chance', 'Trèfles', 'four_leaf_clover', fxMany(['four_leaf_clover'], 6, 0.55, 'fall')],
    ['automne', 'Automne', 'maple_leaf', fxMany(['maple_leaf', 'fallen_leaf'], 7, 0.6, 'fall')],
    ['etoilesfilantes', 'Étoiles filantes', 'shooting_star', fxMany(['shooting_star'], 5, 0.7, 'fall')],
    ['feuxartifice', 'Feux d’artifice', 'fireworks', fxMany(['fireworks'], 4, 1.1, 'fall')],
    ['cadeaux', 'Cadeaux', 'wrapped_gift', fxMany(['wrapped_gift'], 5, 0.65, 'fall')],
    ['pizza', 'Pizza', 'pizza', fxMany(['pizza'], 5, 0.7, 'fall')],
    ['donuts', 'Donuts', 'doughnut', fxMany(['doughnut'], 5, 0.65, 'fall')],
    ['ballons', 'Ballons', 'balloon', fxMany(['balloon'], 6, 0.8, 'rise')],
    ['bulles', 'Bulles qui montent', 'bubbles', fxMany(['bubbles'], 7, 0.55, 'rise')],
  ]],
  ['Têtes d’animaux', [
    fxHead('chien', 'Chien', 'dog_face'), fxHead('chat', 'Chat', 'cat_face'), fxHead('panda', 'Panda', 'panda'),
    fxHead('renard', 'Renard', 'fox'), fxHead('tigre', 'Tigre', 'tiger_face'), fxHead('licorne', 'Licorne', 'unicorn', 4.3),
    fxHead('singe', 'Singe', 'monkey_face'), fxHead('lion', 'Lion', 'lion'), fxHead('ours', 'Ours', 'bear'),
    fxHead('koala', 'Koala', 'koala'), fxHead('grenouille', 'Grenouille', 'frog'), fxHead('porc', 'Cochon', 'pig_face'),
    fxHead('souris', 'Souris', 'mouse_face'), fxHead('lapin', 'Lapin', 'rabbit_face'), fxHead('vache', 'Vache', 'cow_face'),
    fxHead('hamster', 'Hamster', 'hamster'), fxHead('loup', 'Loup', 'wolf'), fxHead('cheval', 'Cheval', 'horse_face'),
    fxHead('dragonh', 'Dragon', 'dragon_face'), fxHead('hibou', 'Hibou', 'owl'), fxHead('pingouin', 'Pingouin', 'penguin', 4.4),
  ]],
  ['Têtes de smileys', [
    fxHead('cool', 'Cool', 'smiling_face_with_sunglasses'), fxHead('star', 'Des étoiles plein les yeux', 'star-struck'),
    fxHead('mdr', 'Mort de rire', 'face_with_tears_of_joy'), fxHead('amoureux', 'Amoureux', 'smiling_face_with_heart-eyes'),
    fxHead('intello', 'Intello', 'nerd_face'), fxHead('fetard', 'Fêtard', 'partying_face', 4.4), fxHead('fou', 'Fou', 'zany_face'),
    fxHead('cowboy', 'Cow-boy', 'cowboy_hat_face', 4.6), fxHead('explose', 'Tête qui explose', 'exploding_head', 4.4),
    fxHead('chaud', 'Trop chaud', 'hot_face'), fxHead('gele', 'Gelé', 'cold_face'), fxHead('riche', 'Riche', 'money-mouth_face'),
    fxHead('peur', 'Peur', 'face_screaming_in_fear'), fxHead('ange', 'Ange', 'smiling_face_with_halo', 4.4),
    fxHead('diable', 'Diable', 'smiling_face_with_horns', 4.4), fxHead('lune', 'Lune', 'new_moon_face'), fxHead('soleilface', 'Soleil', 'sun_with_face', 4.6),
  ]],
  ['Monstres', [
    fxHead('robot', 'Robot', 'robot'), fxHead('alien', 'Extraterrestre', 'alien'), fxHead('envahisseur', 'Envahisseur', 'alien_monster'),
    fxHead('clown', 'Clown', 'clown_face'), fxHead('squelette', 'Squelette', 'skull'), fxHead('citrouille', 'Citrouille', 'jack-o-lantern'),
    fxHead('ogre', 'Ogre', 'ogre'), fxHead('lutin', 'Lutin', 'goblin'), fxHead('caca', 'Caca', 'pile_of_poo', 4.3),
  ]],
  // 3D, the way MindAR does it (fx3d.js): [.., [], [{ model, at (face point), width, off, rot }]].
  ['En 3D', [
    ['lunettes3d', 'Lunettes 3D', 'models3d/glasses/thumbnail.png', [], [{ model: 'glasses', at: 168, width: 2.15, off: [0.3, -0.12, 0.2] }]],
    ['clown3d', 'Chapeau de clown 3D', 'models3d/hat/thumbnail.png', [], [{ model: 'hat', at: 10, width: 3.1, off: [0, 0.6, -0.3] }]],
    ['boucles3d', 'Boucles d’oreilles 3D', 'models3d/earring/thumbnail.png', [], [
      { model: 'earring', at: 177, width: 0.3, off: [0, -0.25, 0] }, { model: 'earring', at: 401, width: 0.3, off: [0, -0.25, 0] }]],
    ['fete3d', 'Fête 3D', 'models3d/hat/thumbnail.png', [], [
      { model: 'hat', at: 10, width: 3.1, off: [0, 0.6, -0.3] }, { model: 'glasses', at: 168, width: 2.15, off: [0.3, -0.12, 0.2] }]],
  ]],
];
const FX_MASKS = [['none', 'Aucun', null, []], ...FX_MASK_GROUPS.flatMap(([, list]) => list)];
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
    const look = f[0] === 'none' && FX_LOOKS.find(([id]) => id === c.filter);
    const amount = Math.max(0, Math.min(100, c.amount)) / 100;
    if (look) {
      // A film look: its colour table on the graphics card (fxlook.js).
      o.drawImage(Looks.main.apply(base, W, H, look, amount) || base, 0, 0);
      this.vignette(o, W, H, look[3] * amount);
    } else if (f[0] === 'none') {
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
      o.globalAlpha = 1;
      this.vignette(o, W, H, f[4] * amount);
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
  // Darker corners, as with an old lens.
  vignette(o, W, H, strength) {
    if (!(strength > 0)) return;
    const v = o.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.6);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, `rgba(0,0,0,${strength.toFixed(2)})`);
    o.globalAlpha = 1;
    o.fillStyle = v;
    o.fillRect(0, 0, W, H);
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
      if (anchor === 'orbit' || anchor === 'fall' || anchor === 'rise') {
        // dx0 = index, dy0 = count: spread evenly round the head, falling or rising.
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
          dy = anchor === 'rise' ? 2.6 - fall * 5.2 : -2.6 + fall * 5.2;
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
