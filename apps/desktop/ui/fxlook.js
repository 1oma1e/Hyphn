// Film looks (spec `Cam - Filtres et effets`, E15): each look is a colour
// function of ours, worked out once into a colour table (a 3D LUT, 32 steps
// per channel, like the .cube files of video software) and applied by the
// graphics card in WebGL. Nothing here comes from elsewhere: no licence.
'use strict';

const lk = {
  clamp: (v) => (v < 0 ? 0 : v > 1 ? 1 : v),
  luma: ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b,
  mix: (a, b, t) => a.map((v, i) => v + (b[i] - v) * t),
  sat: (c, s) => { const l = lk.luma(c); return c.map((v) => l + (v - l) * s); },
  // An S curve: k > 1 more contrast round the middle grey, 0 and 1 stay put.
  contrast: (c, k) => c.map((v) => { const x = v - 0.5; return 0.5 + (x * k) / (1 + Math.abs(x) * 2 * (k - 1)); }),
  // Shadows and highlights tinted with two colours.
  split: (c, sh, hi, t) => { const l = lk.luma(c); return c.map((v, i) => v + ((sh[i] - 0.5) * (1 - l) * (1 - l) + (hi[i] - 0.5) * l * l) * t); },
  // Black lifted to `lift`, white down to `gain`, per channel.
  levels: (c, lift, gain) => c.map((v, i) => lift[i] + v * (gain[i] - lift[i])),
  gamma: (c, g) => c.map((v, i) => Math.pow(Math.max(0, v), 1 / (Array.isArray(g) ? g[i] : g))),
  bw: (c, w = [0.2126, 0.7152, 0.0722]) => { const l = c[0] * w[0] + c[1] * w[1] + c[2] * w[2]; return [l, l, l]; },
  // Dark to light along several colours (duotone, heat map).
  ramp: (c, stops) => {
    const x = lk.clamp(lk.luma(c)) * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(x));
    return lk.mix(stops[i], stops[i + 1], x - i);
  },
  hsv: ([r, g, b]) => {
    const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
    const h = d === 0 ? 0 : mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, mx ? d / mx : 0, mx];
  },
  // Keeps the colour only near one hue (degrees), the rest in black and white.
  only: (c, hue, width) => {
    const [h, s] = lk.hsv(c);
    const dist = Math.min(Math.abs(h - hue), 360 - Math.abs(h - hue));
    const keep = Math.max(0, 1 - dist / width) * Math.min(1, s * 3);
    return lk.mix(lk.bw(c), c, keep);
  },
  poster: (c, n) => c.map((v) => Math.round(v * n) / n),
};
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);

// [group, [[id, name, colour function, vignette 0..1]]]
const FX_LOOK_GROUPS = [
  ['Cinéma', [
    ['tealorange', 'Bleu-orange', (c) => lk.contrast(lk.sat(lk.split(c, hex('#1F6F80'), hex('#F0A060'), 0.6), 1.12), 1.25), 0.3],
    ['blockbuster', 'Blockbuster', (c) => lk.contrast(lk.split(lk.sat(c, 0.9), hex('#24515E'), hex('#E8B27A'), 1.1), 1.45), 0.4],
    ['bleach', 'Sans blanchiment', (c) => lk.contrast(lk.mix(c, lk.bw(c), 0.55), 1.55), 0.25],
    ['matrix', 'Matrice', (c) => lk.contrast(lk.levels(lk.sat(c, 0.6), [0, 0.03, 0], [0.82, 1, 0.78]), 1.3), 0.35],
    ['nuit', 'Nuit américaine', (c) => lk.gamma(lk.levels(lk.sat(c, 0.45), [0, 0.02, 0.06], [0.55, 0.7, 0.95]), 0.85), 0.45],
    ['western', 'Western', (c) => lk.contrast(lk.split(lk.sat(c, 0.6), hex('#5A3A1E'), hex('#F3C77E'), 1), 1.2), 0.4],
    ['polar', 'Polar', (c) => lk.contrast(lk.split(lk.sat(c, 0.5), hex('#203540'), hex('#B7C9C2'), 0.9), 1.35), 0.45],
    ['technicolor', 'Technicolor', (c) => lk.contrast(lk.sat(lk.levels(c, [0.02, 0, 0.03], [1, 0.96, 0.92]), 1.55), 1.15), 0.2],
    ['superhuit', 'Super 8', (c) => lk.contrast(lk.split(lk.levels(lk.sat(c, 0.85), [0.08, 0.06, 0.04], [0.98, 0.92, 0.8]), hex('#3B2A55'), hex('#FFD08A'), 0.6), 1.1), 0.5],
    ['cyberpunk', 'Cyberpunk', (c) => lk.contrast(lk.split(lk.sat(c, 1.2), hex('#1A2BD9'), hex('#FF3FB0'), 0.75), 1.25), 0.35],
    ['annees80', 'Années 80', (c) => lk.split(lk.sat(lk.levels(c, [0.05, 0.02, 0.08], [1, 0.95, 1]), 1.25), hex('#3F2A8C'), hex('#FF7AB8'), 0.7), 0.25],
    ['annees70', 'Années 70', (c) => lk.split(lk.levels(lk.sat(c, 0.8), [0.06, 0.05, 0.02], [1, 0.93, 0.78]), hex('#5C4A1A'), hex('#F6B26B'), 0.8), 0.35],
  ]],
  ['Pellicules', [
    ['diapo', 'Diapositive', (c) => lk.contrast(lk.sat(c, 1.35), 1.3), 0.15],
    ['delave', 'Film délavé', (c) => lk.levels(lk.sat(c, 0.75), [0.12, 0.11, 0.13], [0.95, 0.94, 0.9]), 0.1],
    ['crossprocess', 'Traitement croisé', (c) => lk.levels(lk.gamma(c, [1.25, 1.1, 0.75]), [0.02, 0, 0.12], [1, 1, 0.82]), 0.2],
    ['lomo', 'Lomo', (c) => lk.contrast(lk.sat(lk.gamma(c, [1.05, 1.1, 0.9]), 1.3), 1.35), 0.6],
    ['polaroid', 'Instantané', (c) => lk.split(lk.levels(lk.sat(c, 0.85), [0.07, 0.07, 0.1], [0.97, 0.95, 0.88]), hex('#2F5F73'), hex('#FFE0A8'), 0.5), 0.2],
    ['portra', 'Portrait doux', (c) => lk.split(lk.levels(lk.sat(c, 0.92), [0.04, 0.03, 0.03], [1, 0.97, 0.93]), hex('#4A5A66'), hex('#F7C9A2'), 0.45), 0.1],
    ['infrarouge', 'Infrarouge', (c) => lk.contrast(lk.sat([c[1], c[0], c[2]], 1.1), 1.15), 0.2],
    ['negatif', 'Négatif', (c) => c.map((v) => 1 - v), 0],
  ]],
  ['Saisons et lumières', [
    ['heuredoree', 'Heure dorée', (c) => lk.split(lk.sat(lk.gamma(c, [0.92, 1, 1.15]), 1.1), hex('#5A3A2A'), hex('#FFC46B'), 0.9), 0.2],
    ['heurebleue', 'Heure bleue', (c) => lk.split(lk.gamma(c, [1.12, 1.02, 0.9]), hex('#1D3B7A'), hex('#B9D4FF'), 0.9), 0.25],
    ['coucher', 'Coucher de soleil', (c) => lk.split(lk.sat(c, 1.2), hex('#5B2A6E'), hex('#FF9A4D'), 1.1), 0.3],
    ['printemps', 'Printemps', (c) => lk.split(lk.sat(lk.levels(c, [0.03, 0.04, 0.03], [1, 1, 0.97]), 1.15), hex('#4C7A55'), hex('#FFE3EE'), 0.5), 0],
    ['ete', 'Été', (c) => lk.contrast(lk.sat(lk.gamma(c, [0.95, 0.97, 1.08]), 1.3), 1.1), 0.1],
    ['automne', 'Automne', (c) => lk.split(lk.sat(lk.gamma(c, [0.9, 1, 1.2]), 1.05), hex('#5E3A1A'), hex('#F0A040'), 0.8), 0.3],
    ['hiver', 'Hiver', (c) => lk.split(lk.sat(lk.levels(c, [0.04, 0.05, 0.08], [0.95, 0.98, 1]), 0.7), hex('#3A5B80'), hex('#E8F2FF'), 0.6), 0.15],
    ['foret', 'Forêt', (c) => lk.split(lk.contrast(lk.sat(c, 0.9), 1.15), hex('#21402A'), hex('#E9E0B0'), 0.7), 0.35],
    ['ocean', 'Océan', (c) => lk.split(lk.sat(c, 1.05), hex('#0F3D5E'), hex('#9FE6E0'), 0.8), 0.25],
    ['desert', 'Désert', (c) => lk.contrast(lk.split(lk.sat(c, 0.75), hex('#6A4A2A'), hex('#F5D9A0'), 0.9), 1.15), 0.3],
    ['bougie', 'Bougie', (c) => lk.gamma(lk.levels(lk.sat(c, 0.9), [0.03, 0.01, 0], [1, 0.82, 0.55]), 0.95), 0.45],
    ['neons', 'Néons de la ville', (c) => lk.contrast(lk.split(lk.sat(c, 1.35), hex('#00C2D1'), hex('#FF4FD8'), 1), 1.2), 0.4],
  ]],
  ['Noir et blanc', [
    ['nbdoux', 'Doux', (c) => lk.levels(lk.bw(c), [0.06, 0.06, 0.06], [0.96, 0.96, 0.96]), 0.15],
    ['nbfort', 'Fort', (c) => lk.contrast(lk.bw(c, [0.4, 0.5, 0.1]), 1.7), 0.35],
    ['nbrouge', 'Filtre rouge', (c) => lk.contrast(lk.bw(c, [0.9, 0.15, -0.05]), 1.3), 0.3],
    ['selenium', 'Sélénium', (c) => lk.split(lk.contrast(lk.bw(c), 1.2), hex('#3A3550'), hex('#EFE8DC'), 0.5), 0.3],
    ['sepia', 'Sépia', (c) => lk.ramp(c, [hex('#1A120B'), hex('#7A5634'), hex('#E8D2A8'), hex('#FFF6E4')]), 0.3],
    ['cyanotype', 'Cyanotype', (c) => lk.ramp(c, [hex('#06213F'), hex('#1E5A8C'), hex('#A9CDEB'), hex('#F2F8FF')]), 0.2],
  ]],
  ['Couleurs folles', [
    ['rougeseul', 'Seulement le rouge', (c) => lk.only(c, 0, 40), 0],
    ['bleuseul', 'Seulement le bleu', (c) => lk.only(c, 215, 45), 0],
    ['duoviolet', 'Duo violet-jaune', (c) => lk.ramp(c, [hex('#2A0F5C'), hex('#B23A8F'), hex('#FFE066')]), 0],
    ['duorose', 'Duo bleu-rose', (c) => lk.ramp(c, [hex('#0B1F5C'), hex('#3D7BFF'), hex('#FF8FC7')]), 0],
    ['thermique', 'Caméra thermique', (c) => lk.ramp(c, [hex('#000010'), hex('#2B00A0'), hex('#C0007A'), hex('#FF5A00'), hex('#FFE000'), hex('#FFFFFF')]), 0],
    ['popart', 'Pop art', (c) => lk.poster(lk.sat(c, 1.8), 3), 0],
    ['bonbon', 'Bonbon', (c) => lk.split(lk.sat(lk.levels(c, [0.08, 0.04, 0.08], [1, 0.95, 1]), 1.3), hex('#7B3FBF'), hex('#FFB3D9'), 0.9), 0],
    ['menthe', 'Menthe', (c) => lk.split(lk.sat(c, 0.9), hex('#1E5A4A'), hex('#C8FFE6'), 0.8), 0.1],
  ]],
];
const FX_LOOKS = FX_LOOK_GROUPS.flatMap(([, list]) => list);

// The colour table of a look: n×n×n, laid out as n slices of n×n side by
// side (x = red + n × blue, y = green). Worked out once per look and size:
// 32 steps for the picture (~30 ms), 16 for the previews (8 times faster).
const lutData = {};
function lutOf(look, n) {
  const key = look[0] + n;
  if (lutData[key]) return lutData[key];
  const d = new Uint8Array(n * n * n * 4);
  for (let b = 0; b < n; b++) for (let g = 0; g < n; g++) for (let r = 0; r < n; r++) {
    const o = look[2]([r / (n - 1), g / (n - 1), b / (n - 1)]);
    const i = (g * n * n + b * n + r) * 4;
    d[i] = lk.clamp(o[0]) * 255 + 0.5;
    d[i + 1] = lk.clamp(o[1]) * 255 + 0.5;
    d[i + 2] = lk.clamp(o[2]) * 255 + 0.5;
    d[i + 3] = 255;
  }
  return (lutData[key] = d);
}

// One WebGL canvas that draws a picture through a look, at its strength.
// Two of them: one for the picture, one for the small previews.
function makeLooks(n) {
  const cv = document.createElement('canvas');
  let gl = null, prog, uAmt, tImg, broken = false;
  const luts = {};
  const init = () => {
    gl = cv.getContext('webgl', { alpha: false, antialias: false, depth: false, premultipliedAlpha: false });
    if (!gl) throw new Error('WebGL absent');
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, 'attribute vec2 p; varying vec2 uv; void main() { uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }'));
    // Two slices of blue read and mixed: smooth colours between the steps.
    // Full precision when there is: the table is n × n texels wide.
    const N = n.toFixed(1), M = (n - 1).toFixed(1);
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, `#ifdef GL_FRAGMENT_PRECISION_HIGH
      precision highp float;
      #else
      precision mediump float;
      #endif
      uniform sampler2D img, lut; uniform float amt; varying vec2 uv;
      vec3 at(vec3 c, float b) { return texture2D(lut, vec2((c.r * ${M} + 0.5 + b * ${N}) / (${N} * ${N}), (c.g * ${M} + 0.5) / ${N})).rgb; }
      void main() {
        vec3 c = texture2D(img, uv).rgb;
        float b = c.b * ${M}, b0 = floor(b);
        vec3 l = mix(at(c, b0), at(c, min(b0 + 1.0, ${M})), b - b0);
        gl_FragColor = vec4(mix(c, l, amt), 1.0);
      }`));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const p = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(p);
    gl.vertexAttribPointer(p, 2, gl.FLOAT, false, 0, 0);
    gl.uniform1i(gl.getUniformLocation(prog, 'img'), 0);
    gl.uniform1i(gl.getUniformLocation(prog, 'lut'), 1);
    uAmt = gl.getUniformLocation(prog, 'amt');
    tImg = tex();
  };
  const tex = () => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  return {
    // The picture through the look; null without WebGL (the picture stays as it is).
    apply(src, W, H, look, amount) {
      if (broken) return null;
      try {
        if (!gl) init();
        if (cv.width !== W || cv.height !== H) {
          cv.width = W;
          cv.height = H;
        }
        gl.viewport(0, 0, W, H);
        gl.activeTexture(gl.TEXTURE1);
        if (!luts[look[0]]) {
          luts[look[0]] = tex();
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, n * n, n, 0, gl.RGBA, gl.UNSIGNED_BYTE, lutOf(look, n));
        }
        gl.bindTexture(gl.TEXTURE_2D, luts[look[0]]);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tImg);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
        gl.uniform1f(uAmt, amount);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        return cv;
      } catch (e) {
        broken = true;
        if (typeof Effects !== 'undefined') Effects.error = 'Looks cinéma indisponibles : ' + (e && e.message ? e.message : e);
        return null;
      }
    },
  };
}
const Looks = { main: makeLooks(32), thumbs: makeLooks(16) };
