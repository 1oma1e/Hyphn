// Hyphn PC interface. Design V2 (ADR-0016). Every iPhone value comes from the
// Rust side (`link`), which talks to the real iPhone app over TLS.
'use strict';

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const view = $('#view');
const layer = $('#layer');

// ---------- Icons ----------
const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" aria-hidden="true"${extra}>${d}</svg>`;
const I = {
  cam: svg('<rect x="2" y="6" width="14" height="12" rx="2.5"/><path d="M16 10.5l6-3.5v10l-6-3.5z"/>'),
  down: svg('<path d="M12 4v12M7 11l5 5 5-5M5 20h14"/>'),
  up: svg('<path d="M12 20V8M7 13l5-5 5 5M5 4h14"/>'),
  phone: svg('<rect x="7" y="2" width="10" height="20" rx="2.5"/><path d="M11 18h2"/>'),
  pc: svg('<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>'),
  folder: svg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  check: svg('<path d="M5 12l5 5 9-10"/>'),
  bolt: svg('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>'),
  temp: svg('<path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z"/>'),
  wifi: svg('<path d="M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19" r="1"/>'),
  wifiOff: svg('<path d="M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M3 3l18 18"/>'),
  disk: svg('<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 14h18"/>'),
  arrow: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  play: svg('<path d="M8 5l11 7-11 7z"/>'),
  pause: svg('<path d="M8 5v14M16 5v14"/>'),
  flip: svg('<path d="M4 9a8 8 0 0 1 14-3l2 2M20 15a8 8 0 0 1-14 3l-2-2M20 4v4h-4M4 20v-4h4"/>'),
  photo: svg('<rect x="3" y="6" width="18" height="14" rx="2"/><circle cx="12" cy="13" r="4"/><path d="M8 6l1.5-2h5L16 6"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>'),
  sliders: svg('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  refresh: svg('<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>'),
  lock: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  shield: svg('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>'),
  alert: svg('<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>'),
  mirror: svg('<path d="M12 3v18" stroke-dasharray="2 2.5"/><path d="M9 6L3 18h6zM15 6l6 12h-6z"/>'),
  turn: svg('<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>'),
  eye: svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  eyeOff: svg('<path d="M3 3l18 18M10.6 5.1A9.7 9.7 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7a9.5 9.5 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
  swap: svg('<path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4"/>'),
};

// ---------- Formatting ----------
const nf = new Intl.NumberFormat('fr-FR');
const n1 = (x) => x.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
function bytes(b) {
  if (b >= 1e9) return n1(b / 1e9) + ' Go';
  if (b >= 1e6) return Math.round(b / 1e6) + ' Mo';
  if (b >= 1e3) return Math.round(b / 1e3) + ' Ko';
  return b + ' o';
}
function ago(unix) {
  if (!unix) return 'jamais vu';
  const s = Math.max(0, Date.now() / 1000 - unix);
  if (s < 60) return 'vu à l’instant';
  if (s < 3600) return `vu il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `vu il y a ${Math.floor(s / 3600)} h`;
  return `vu il y a ${Math.floor(s / 86400)} j`;
}
function when(unix) {
  const d = new Date(unix * 1000), now = new Date();
  const hm = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = (day(now) - day(d)) / 86400000;
  if (diff === 0) return 'Auj. ' + hm;
  if (diff === 1) return 'Hier ' + hm;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) + ' ' + hm;
}
function dateFr(unix) {
  return new Date(unix * 1000).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
const HEAT = { nominal: 'Normale', fair: 'Tiède', serious: 'Chaude', critical: 'Très chaude' };
const HEAT_COLOR = { nominal: 'var(--li)', fair: 'var(--li)', serious: 'var(--am)', critical: 'var(--co)' };
const CHARGE = { charging: 'en charge', full: 'pleine', unplugged: 'sur batterie' };
const resName = (h) => (h >= 2160 ? '4K' : h + 'p');
function linkQuality(ms) {
  if (ms == null) return 'inconnu';
  return ms < 10 ? 'Excellente' : ms < 30 ? 'Bonne' : 'Faible';
}

// ---------- State ----------
let S = null; // last snapshot from Rust
let settings = null;
let page = null;
let pageKey = '';
let justPaired = false;
const devName = () => (S && S.device ? S.device.name : 'iPhone');

function toast(text, kind = 'ok') {
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  t.innerHTML = `<i class="${kind === 'ok' ? '' : 'info'}">${kind === 'ok' ? I.check : I.info}</i>${esc(text)}`;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 5200);
}

async function saveSettings() {
  try {
    await invoke('save_settings', { settings });
  } catch (e) {
    toast(String(e), 'info');
  }
}

function applyTheme() {
  const t = settings ? settings.theme : 'system';
  const dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

// ---------- Background waves (« trame ») ----------
function waves(n, y0, gap, alpha, swap) {
  let out = '';
  for (let i = 0; i < n; i++) {
    const y = y0 + i * gap;
    const a = 12 + 24 * Math.abs(Math.sin(i * 0.62));
    const mid = 1 - Math.abs(i - (n - 1) / 2) / (n / 2);
    const c = (i % 3 === 0) !== !!swap ? '#5FD4F4' : '#B9F25A';
    const d = `M0 ${y} C 100 ${y - a}, 300 ${y + a}, 400 ${y} S 700 ${y + a}, 800 ${y}`;
    out += `<path class="wv" d="${d}" style="stroke:${c};opacity:${(0.05 + alpha * mid).toFixed(2)};animation-duration:${22 + (i * 7) % 19}s;animation-delay:${-((i * 5.3) % 20).toFixed(1)}s"></path>`;
  }
  return out;
}
$('#trame').innerHTML = waves(16, 50, 13, 0.2);

// ---------- Header ----------
function paintHeader() {
  const el = $('#devc');
  if (!S || !S.device) {
    el.innerHTML = '<span class="led off"></span>Aucun appareil';
    return;
  }
  const state = S.connected ? (S.latency_ms == null ? 'relié' : `${S.latency_ms} ms`) : 'en veille';
  el.innerHTML = `<span class="led${S.connected ? '' : ' off'}"></span>${esc(S.device.name)} · ${state}`;
}

// ---------- Router ----------
const ACCENT = { home: 'var(--li)', pair: 'var(--li)', cam: 'var(--co)', drop: 'var(--cy)', settings: 'var(--li)' };
function route() {
  const r = location.hash.slice(1);
  return PAGES[r] ? r : 'home';
}
function mount(force) {
  const r = route();
  const key = r + ':' + (PAGES[r].key ? PAGES[r].key() : '');
  if (!force && key === pageKey) return;
  if (page && page.unmount) page.unmount();
  layer.innerHTML = '';
  pageKey = key;
  page = PAGES[r];
  document.documentElement.style.setProperty('--accent', ACCENT[r]);
  for (const a of document.querySelectorAll('[data-route]')) a.classList.toggle('on', a.dataset.route === r);
  view.innerHTML = '';
  page.mount(view);
  if (page.update && S) page.update();
  $('#app').scrollTop = 0;
}
window.addEventListener('hashchange', () => mount(true));
function go(r) {
  if (location.hash === '#' + r) mount(true);
  else location.hash = r;
}

// Event delegation: data-act="name" calls page.acts[name](el, event).
function dispatch(type) {
  return (ev) => {
    const el = ev.target.closest(`[data-${type}]`);
    if (!el) return;
    const name = el.dataset[type];
    const fn = (page && page.acts && page.acts[name]) || GLOBAL_ACTS[name];
    if (fn) fn(el, ev);
  };
}
document.addEventListener('click', dispatch('act'));
document.addEventListener('input', dispatch('input'));
document.addEventListener('change', dispatch('change'));

const GLOBAL_ACTS = {
  go: (el) => go(el.dataset.to),
  // Both sides start fresh: the PC ends the link, the iPhone comes back at once.
  reconnect: async () => {
    await invoke('reconnect');
    toast('Reconnexion…', 'info');
  },
};

// ===================================================================
// Accueil
// ===================================================================
const Home = {
  key() {
    if (!S || !S.device) return 'none';
    return S.connected ? 'on' : 'veille';
  },
  mount(root) {
    const k = this.key();
    const arrive = justPaired;
    justPaired = false;
    const name = esc(devName());
    let left;
    if (k === 'on') {
      left = `
        <span class="eyebrow"><span class="led"></span>${name} · relié en Wi-Fi</span>
        <h1 class="big-h"><span class="w">Tout</span> <span class="w" style="animation-delay:.08s">est</span> <span class="w" style="animation-delay:.16s">prêt.</span></h1>
        <p class="lead">Lance la caméra pour tes appels et tes streams, ou récupère tes photos en un clic.</p>
        <div class="row" style="gap:12px">
          <a class="btn cam" href="#cam">${I.cam}Ouvrir Cam</a>
          <a class="btn" href="#drop">${I.down}Drop</a>
        </div>`;
    } else if (k === 'veille') {
      left = `
        <span class="eyebrow"><span class="led off"></span>${name} · <span id="h-seen">${ago(S.device.last_seen)}</span></span>
        <h1 class="big-h"><span class="w">En attente</span><br><span class="w" style="animation-delay:.1s">de l’iPhone.</span></h1>
        <p class="lead">Ouvre Hyphn sur l’iPhone : il se reconnecte tout seul, sans scanner.</p>
        <button class="btn" type="button" data-act="reconnect">${I.refresh}Reconnecter</button>`;
    } else {
      left = `
        <span class="eyebrow">Bienvenue dans Hyphn</span>
        <h1 class="big-h"><span class="w">Relie</span> <span class="w" style="animation-delay:.08s">ton</span> <span class="w" style="animation-delay:.16s">iPhone.</span></h1>
        <p class="lead">Un QR code à scanner, une seule fois. Ensuite tout se fait tout seul.</p>
        <a class="btn pri" href="#pair">Relier un iPhone</a>`;
    }
    const dim = k === 'on' ? '' : ' dim';
    root.innerHTML = `
      <main class="wrap ${arrive ? 'arrive' : 'enter'}">
        <div id="h-low"></div>
        <section class="hero">
          <div>${left}</div>
          <div class="orbit${dim}" role="img" id="h-orbit" aria-label="Batterie de l’iPhone">
            <div class="spin"><span class="sat"></span></div>
            <svg class="ring" viewBox="0 0 340 340" aria-hidden="true">
              <defs><linearGradient id="bg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E7FFB8"/><stop offset="1" stop-color="#B9F25A"/></linearGradient></defs>
              <circle cx="170" cy="170" r="163" style="stroke:color-mix(in srgb, var(--tx) 7%, transparent);stroke-width:10"/>
              <circle class="arc" id="h-arc" cx="170" cy="170" r="163" style="stroke:url(#bg1);stroke-width:10;stroke-dasharray:0 1025"/>
            </svg>
            <div class="core">
              ${I.phone}
              <span class="pct" id="h-pct">—</span>
              <span style="font-size:13px;color:var(--tx2)" id="h-charge">${k === 'none' ? 'aucun iPhone' : ''}</span>
            </div>
          </div>
        </section>
        ${k === 'none' ? '' : `
        <section class="facts${dim}" aria-label="État de l’iPhone">
          <div class="fact" style="--c:var(--li)"><span class="ic">${I.bolt}</span><div><div class="k">Batterie</div><div class="v" id="f-bat">inconnu</div></div></div>
          <div class="fact" style="--c:var(--li)"><span class="ic">${I.temp}</span><div><div class="k">Chaleur</div><div class="v" id="f-heat">inconnu</div></div></div>
          <div class="fact" style="--c:var(--cy)"><span class="ic">${I.wifi}</span><div><div class="k">Connexion</div><div class="v" id="f-link">inconnu</div></div></div>
          <div class="fact" style="--c:var(--cy)"><span class="ic">${I.disk}</span><div><div class="k">Stockage</div><div class="v" id="f-disk">inconnu</div></div></div>
        </section>
        <section class="acts${dim}">
          <a class="act" style="--c:var(--co)" href="#cam">
            <div class="thumb" aria-hidden="true">
              <span class="bk" style="left:6%;top:10%;width:60px;height:60px;background:#FFB547"></span>
              <span class="bk" style="left:64%;top:4%;width:74px;height:74px;background:#FF7A66;animation-delay:-3s"></span>
              <div class="mini"><span class="h"></span><span class="s"></span></div>
              <span class="tag" id="h-camtag">Prête</span>
            </div>
            <div><h3>Cam</h3><p>Ton iPhone devient la webcam du PC, pour Discord, Teams ou OBS.</p><span class="go">Ouvrir${I.arrow}</span></div>
          </a>
          <a class="act" style="--c:var(--cy)" href="#drop">
            <div class="fly" aria-hidden="true">
              <span class="end" style="left:14px">${I.phone}</span>
              <span class="end" style="left:158px;color:var(--cy)">${I.folder}</span>
              <span class="ph" style="background:linear-gradient(135deg,#FFB547,#FF7A66)"></span>
              <span class="ph" style="background:linear-gradient(135deg,#5FD4F4,#2D6CDF);animation-delay:.7s"></span>
              <span class="ph" style="background:linear-gradient(135deg,#B9F25A,#3E9B4F);animation-delay:1.4s"></span>
              <span class="ph" style="background:linear-gradient(135deg,#8E7CFF,#4A3BB5);animation-delay:2.1s"></span>
            </div>
            <div><h3>Drop</h3><p>Photos et fichiers entre l’iPhone et le PC. Arrive bientôt.</p><span class="go">Voir${I.arrow}</span></div>
          </a>
        </section>`}
      </main>`;
    if (arrive) toast(`${devName()} est lié à ce PC`);
  },
  update() {
    if (!S.device) return;
    const p = S.status || {};
    const pct = p.battery;
    $('#h-pct').innerHTML = pct == null ? '—' : `${pct}<small>%</small>`;
    $('#h-arc').style.strokeDasharray = `${pct == null ? 0 : (1024 * pct / 100).toFixed(0)} 1025`;
    $('#h-orbit').setAttribute('aria-label', pct == null ? 'Batterie inconnue' : `Batterie de l’iPhone : ${pct} %`);
    $('#h-charge').textContent = p.charge ? 'batterie · ' + CHARGE[p.charge] : 'batterie';
    $('#f-bat').textContent = pct == null ? 'inconnu' : `${pct} %` + (p.charge ? ' · ' + CHARGE[p.charge] : '');
    $('#f-heat').textContent = p.thermal ? HEAT[p.thermal] : 'inconnu';
    $('#f-link').textContent = S.connected ? linkQuality(S.latency_ms) : 'Hors ligne';
    $('#f-disk').textContent = p.storage_free_gb == null ? 'inconnu' : `${nf.format(Math.round(p.storage_free_gb))} Go libres`;
    const q = S.cam.effective.quality;
    $('#h-camtag').textContent = S.connected ? `Prête · ${resName(q.height)}${q.fps}` : 'Hors ligne';
    const seen = $('#h-seen');
    if (seen) seen.textContent = ago(S.device.last_seen);
    const low = pct != null && pct < 15 && p.charge === 'unplugged' && settings && settings.low_battery_alert;
    $('#h-low').innerHTML = low
      ? `<div class="ban bad">${I.alert}<span><strong>Batterie faible : ${pct} %.</strong> Branche l’iPhone ; Hyphn baisse la qualité pour tenir.</span></div>`
      : '';
  },
};

// ===================================================================
// Appairage
// ===================================================================

// The QR in whole screen pixels per square, with a 3-square light margin
// (ADR-0028): solid corner patterns, no thin gaps between squares.
function drawQr(cv, rows) {
  if (!cv) return;
  const n = rows.length + 6;
  const box = cv.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const px = Math.max(1, Math.floor(Math.min(box.width, box.height) * dpr / n));
  const side = px * n;
  cv.width = cv.height = side;
  cv.style.width = cv.style.height = side / dpr + 'px';
  const g = cv.getContext('2d');
  g.fillStyle = '#F4F7EE';
  g.fillRect(0, 0, side, side);
  g.fillStyle = '#0A0D08';
  rows.forEach((r, y) => {
    for (let x = 0; x < r.length; x++) if (r[x] === '1') g.fillRect((x + 3) * px, (y + 3) * px, px, px);
  });
}
// A new window size or screen scale: redraw at the new pixel size.
addEventListener('resize', () => {
  if (page === Pair && Pair.step === 'qr' && Pair.offer && Pair.offer.qr) drawQr($('#p-qr'), Pair.offer.qr);
});
const Pair = {
  key: () => '',
  mount(root) {
    this.step = 'qr';
    this.offer = null;
    this.left = 0;
    this.err = '';
    this.root = root;
    clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), 1000);
    this.newOffer();
  },
  unmount() {
    clearInterval(this.timer);
    clearTimeout(this.t1);
    clearTimeout(this.t2);
  },
  async newOffer() {
    this.offer = await invoke('pair_offer');
    this.left = this.offer.seconds_left;
    this.step = this.offer.problem ? 'problem' : 'qr';
    this.paint();
  },
  tick() {
    if (this.step !== 'qr' || !this.offer) return;
    this.left = Math.max(0, this.left - 1);
    if (this.left === 0) {
      this.newOffer(); // the token expired: a fresh QR, the old one is refused (E3)
      return;
    }
    const m = Math.floor(this.left / 60), s = String(this.left % 60).padStart(2, '0');
    const c = $('#p-clock'), tr = $('#p-track');
    if (c) c.textContent = `${m}:${s}`;
    if (tr) tr.style.width = (this.left / this.offer.seconds_left * 100).toFixed(1) + '%';
  },
  paint() {
    let body = '';
    if (this.step === 'problem') {
      body = `<div class="problem"><span class="ic">${I.wifiOff}</span>
        <h2 style="margin:0;font-size:28px;letter-spacing:-.03em">Pas de QR pour l’instant</h2>
        <p class="sub" style="max-width:520px;line-height:1.55">${esc(this.offer.problem)}</p>
        <button class="btn pri" type="button" data-act="renew">${I.refresh}Réessayer</button></div>`;
    } else if (this.step === 'qr') {
      body = `<div class="stage">
        <div class="qrbox">
          <span class="corner a"></span><span class="corner b"></span><span class="corner c"></span><span class="corner e"></span>
          <div class="qr" role="img" aria-label="QR code d’appairage"><canvas id="p-qr"></canvas></div>
        </div>
        <div>
          <span class="lbl">Étape 1 sur 2</span>
          <div class="steps">
            <div class="st"><b>1</b>Ouvre Hyphn sur l’iPhone</div>
            <div class="st"><b>2</b>Touche « Scanner le QR code »</div>
            <div class="st"><b>3</b>Vise ce code, c’est tout</div>
          </div>
          <div class="timer">
            <div class="row" style="justify-content:space-between;font-size:13px;color:var(--tx2)"><span>Usage unique · expire dans</span><span class="mono" id="p-clock" style="color:var(--tx);font-size:20px">1:00</span></div>
            <div class="track"><span id="p-track" style="width:100%"></span></div>
          </div>
          ${this.err ? `<div class="ban bad" style="margin-bottom:18px">${I.alert}<span>${esc(this.err)}</span></div>` : ''}
          <div class="row">
            <button class="btn" type="button" data-act="renew">${I.refresh}Nouveau QR</button>
          </div>
        </div>
      </div>`;
    } else if (this.step === 'code') {
      const d = this.code.split('');
      body = `<div class="stage" style="grid-template-columns:1fr;text-align:center;padding:56px 36px">
        <div>
          <span class="lbl">Étape 2 sur 2 · ${esc(this.device)} trouvé</span>
          <h2 style="margin:16px 0 36px;font-size:36px;letter-spacing:-.04em;font-weight:600">Confirme sur l’iPhone</h2>
          <div class="digits" aria-label="Code ${d.join(' ')}">${d.map((x, i) => `<span class="dg" style="animation-delay:${i * 0.12}s">${x}</span>`).join('')}</div>
          <p style="margin:26px auto 0;max-width:520px;color:var(--tx2);font-size:14px;line-height:1.55">Même code sur l’iPhone ? Touche « Oui, relier ».</p>
        </div>
      </div>`;
    } else {
      body = `<div class="linked" role="status">
        <div class="lk" aria-hidden="true">
          <span class="dv a">${I.pc}</span>
          <span class="wire"></span>
          <span class="p" style="animation-delay:1.6s"></span><span class="p r" style="animation-delay:2s"></span>
          <span class="burst"></span>
          <span class="lock">${I.lock}</span>
          <span class="dv b">${I.phone}</span>
        </div>
        <h2 class="lt">Ce PC et ${esc(this.device)} sont liés</h2>
        <div class="lchips">
          <span class="lchip" style="animation-delay:2.1s">${I.check}Relié pour de bon</span>
          <span class="lchip" style="animation-delay:2.3s">${I.check}Chiffré de bout en bout</span>
          <span class="lchip" style="animation-delay:2.5s">${I.check}Se reconnecte tout seul</span>
        </div>
        <button class="btn auto" type="button" data-act="home">Aller à l’accueil</button>
      </div>`;
    }
    const replace = S && S.device ? `<p class="sub">Relier un nouvel iPhone remplace ${esc(S.device.name)}.</p>` : '<p class="sub">Une seule fois. Ensuite, l’iPhone et ce PC se reconnaissent tout seuls.</p>';
    this.root.innerHTML = `
      <main class="wrap enter" id="p-main">
        <header class="row" style="justify-content:space-between;align-items:flex-end;gap:16px">
          <div><h1 class="h1">Relier un iPhone</h1>${replace}</div>
          <a class="btn" href="#home">Fermer</a>
        </header>
        <section class="card" style="padding:0">${body}</section>
      </main>`;
    if (this.step === 'qr' && this.offer.qr) drawQr($('#p-qr'), this.offer.qr);
  },
  leave() {
    clearTimeout(this.t1);
    clearTimeout(this.t2);
    $('#p-main').classList.add('out');
    this.t2 = setTimeout(() => {
      justPaired = true;
      go('home');
    }, 650);
  },
  // Events from `link`: the iPhone scanned (code), said yes (linked) or left (ended).
  onPair(e) {
    if (page !== Pair) {
      if (e.step === 'linked') toast(`${e.device_name} est lié à ce PC`);
      return;
    }
    if (e.step === 'code') {
      Pair.code = e.code;
      Pair.device = e.device_name;
      Pair.step = 'code';
      Pair.err = '';
      Pair.paint();
    } else if (e.step === 'linked') {
      Pair.device = e.device_name;
      Pair.step = 'linked';
      Pair.paint();
      // E8: about 8 s of « liés », then slide to the home page.
      Pair.t1 = setTimeout(() => Pair.leave(), 8000);
    } else if (Pair.step !== 'linked') {
      Pair.err = e.message || (Pair.step === 'code' ? 'L’iPhone a refusé ou s’est déconnecté. Voici un nouveau QR.' : '');
      Pair.newOffer();
    }
  },
  acts: {
    renew: () => {
      Pair.err = '';
      Pair.newOffer();
    },
    home: () => Pair.leave(),
  },
};

// ===================================================================
// Cam
// ===================================================================
const RES = [2160, 1440, 1080, 720, 480];
const RES_L = ['4K', '1440p', '1080p', '720p', '480p'];
const FPS = [24, 25, 30, 60, 120];
const RATE = [0, 8, 20, 40, 80];
const PROFILES = [['Appel', 2, 2], ['Stream', 0, 3], ['Cours', 3, 2]];
const CAM_DEFAULTS = {
  res: 0, fps: 3, codec: 0, rate: 0, autoq: true,
  ev: 0, focus: 50, wb: 5600, afA: true, wbA: true, torch: false, stab: 0,
  msg: 'Je reviens bientôt', multi: true, wst: 0, prof: 1, lens: 1, front: false, mirror: false, turn: 0,
};
// [lang, text], 2.6 s each (same list and order in apps/desktop-vcam/src/feed.cpp).
const LANGS = [
  ['fr', 'Je reviens bientôt'], ['en', 'Be right back'], ['es', 'Vuelvo enseguida'], ['de', 'Bin gleich zurück'],
  ['it', 'Torno subito'], ['pt', 'Volto já'], ['nl', 'Ben zo terug'], ['pl', 'Zaraz wracam'],
  ['tr', 'Hemen dönüyorum'], ['ru', 'Скоро вернусь'], ['uk', 'Скоро повернуся'], ['ar', 'سأعود قريبًا'],
  ['hi', 'थोड़ी देर में वापस'], ['zh', '马上回来'], ['ja', 'すぐ戻ります'], ['ko', '곧 돌아올게요'],
  ['vi', 'Quay lại ngay'], ['id', 'Segera kembali'],
];

// Video from the iPhone (spec `Cam - Flux v1`): Annex-B packets over a local
// WebSocket, decoded by WebCodecs on the graphics card. Only the newest frame
// is drawn at each screen refresh; when the decoder falls behind, it asks the
// iPhone for a keyframe instead of freezing until the next one.
const CODEC_STR = { 1: 'hev1.1.6.L153.B0', 2: 'avc1.640033' };
const Video = {
  hevc: true,
  dec: null,
  codec: 0,
  size: '',
  waitKey: true,
  drops: 0,
  lastFrame: 0,
  ws: null,
  gen: 0,
  pending: null,
  raf: 0,
  async detect() {
    try {
      const r = await VideoDecoder.isConfigSupported({ codec: CODEC_STR[1], hardwareAcceleration: 'prefer-hardware' });
      this.hevc = !!r.supported;
    } catch (e) {
      this.hevc = false;
    }
  },
  async start(canvas) {
    this.stop(); // never two sockets
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    const gen = ++this.gen;
    const url = await invoke('cam_video_url');
    if (gen === this.gen) this.connect(url, gen);
  },
  connect(url, gen) {
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    ws.onmessage = (e) => this.packet(new Uint8Array(e.data));
    // The app restarted or the socket dropped: come back quietly.
    ws.onclose = () => setTimeout(() => { if (gen === this.gen && this.canvas) this.connect(url, gen); }, 800);
    this.ws = ws;
  },
  stop() {
    this.gen++;
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
    }
    this.ws = null;
    this.close();
    this.canvas = null;
  },
  key() {
    if (this.ws && this.ws.readyState === 1) this.ws.send('key');
  },
  close() {
    if (this.pending) this.pending.close();
    this.pending = null;
    if (this.dec && this.dec.state !== 'closed') this.dec.close();
    this.dec = null;
    this.waitKey = true;
  },
  configure(codec, w, h) {
    this.close();
    this.codec = codec;
    this.size = w + 'x' + h;
    this.w = w;
    this.h = h;
    this.dec = new VideoDecoder({
      output: (frame) => {
        if (this.pending) this.pending.close();
        this.pending = frame;
        if (!this.raf) this.raf = requestAnimationFrame(() => this.paint());
      },
      error: (e) => {
        console.warn('decoder', e);
        // HEVC refused by this PC: ask the iPhone for H.264 instead.
        if (this.codec === 1 && this.hevc) {
          this.hevc = false;
          Cam.push();
        }
        this.dec = null;
        this.waitKey = true;
        this.key();
      },
    });
    // The real picture size, from the iPhone: some HEVC decoders announce a
    // wrong visible area otherwise (only a corner shown, as if zoomed in).
    this.dec.configure({
      codec: CODEC_STR[codec] || CODEC_STR[2], optimizeForLatency: true, hardwareAcceleration: 'prefer-hardware',
      codedWidth: w, codedHeight: h, displayAspectWidth: w, displayAspectHeight: h,
    });
  },
  paint() {
    this.raf = 0;
    let f = this.pending;
    this.pending = null;
    if (!f) return;
    const vr = f.visibleRect;
    if (vr && this.w && (vr.width !== this.w || vr.height !== this.h) && f.codedWidth >= this.w && f.codedHeight >= this.h) {
      // Visible area wrong (HEVC): crop the frame to the iPhone's real size.
      const fixed = new VideoFrame(f, { visibleRect: { x: 0, y: 0, width: this.w, height: this.h }, displayWidth: this.w, displayHeight: this.h });
      f.close();
      f = fixed;
    }
    const c = this.canvas;
    if (c) {
      // Drawn at the size shown on screen, not at the 4K of the stream.
      const box = c.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const scale = Math.min(1, (box.width * dpr) / f.displayWidth, (box.height * dpr) / f.displayHeight) || 1;
      const w = Math.max(2, Math.round(f.displayWidth * scale)), h = Math.max(2, Math.round(f.displayHeight * scale));
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
      this.ctx.drawImage(f, 0, 0, w, h);
      this.lastFrame = performance.now();
    }
    f.close();
  },
  packet(u8) {
    if (!this.canvas || u8.length < 18) return;
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const codec = u8[0], key = u8[1] === 1;
    const pts = Number(dv.getBigInt64(2, true));
    const w = dv.getUint32(10, true), h = dv.getUint32(14, true);
    if (!this.dec || codec !== this.codec || this.size !== w + 'x' + h) {
      if (!key) return this.key();
      this.configure(codec, w, h);
    }
    if (this.waitKey && !key) return;
    // A Wi-Fi burst of a few frames is fine (the graphics card catches up);
    // a real backlog means old pictures: start again from a fresh keyframe.
    if (this.dec.decodeQueueSize > 12) {
      this.drops++;
      this.waitKey = true;
      return this.key();
    }
    this.waitKey = false;
    try {
      this.dec.decode(new EncodedVideoChunk({ type: key ? 'key' : 'delta', timestamp: pts, data: u8.subarray(18) }));
    } catch (e) {
      this.waitKey = true;
      this.key();
    }
  },
  // A picture arrived in the last 1.5 s.
  fresh: () => performance.now() - Video.lastFrame < 1500,
};
Video.detect();

const LENS_L = ['0,5×', '1×', '2×', '5×'];

// The waiting screen (ADR-0018): what Discord and OBS see while paused. The
// Windows webcam draws the same design itself (apps/desktop-vcam).
function waitScreen(c, sub) {
  const cycle = c.multi && c.msg === CAM_DEFAULTS.msg;
  // The languages follow the Windows clock (2.6 s each, 46.8 s a round, as in
  // app.css), like the webcam (feed.cpp): Discord shows the same one.
  const phase = (Date.now() % (LANGS.length * 2600)) / 1000;
  // Letter by letter, 30 ms apart; Arabic and Hindi stay whole (joined letters).
  const line = ([lang, t], i) => {
    const parts = lang === 'ar' || lang === 'hi' ? [t] : Array.from(t);
    return `<div class="wl" lang="${lang}"${lang === 'ar' ? ' dir="rtl"' : ''}>${parts.map((ch, j) =>
      `<span style="animation-delay:${(i * 2.6 + j * 0.03 - phase).toFixed(3)}s">${ch === ' ' ? '&nbsp;' : esc(ch)}</span>`).join('')}</div>`;
  };
  const text = cycle
    ? `<div class="wmsg" aria-label="${esc(c.msg)}">${LANGS.map(line).join('')}</div>`
    : `<div class="wmsg"><div class="wl still">${esc(c.msg)}</div></div>`;
  return `<div class="wait2${c.wst === 1 ? ' minimal' : ''}">
    <div class="rays" aria-hidden="true"><i></i></div>
    <div class="halo" aria-hidden="true"></div>
    <div class="dust" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
    <div class="neon" aria-hidden="true">
      <span class="w"></span><span class="w"></span>
      <div class="tube"><span class="ring"></span><span class="bar"><i></i><i></i><i></i><i></i><i></i><i></i></span><span class="ring r"></span></div>
    </div>
    <div class="floor" aria-hidden="true"></div>
    <div class="hair" aria-hidden="true"></div>
    ${text}
    ${sub ? `<div class="wsub">${sub}</div>` : ''}
  </div>`;
}

const Cam = {
  key: () => '',
  mount(root) {
    this.cs = Object.assign({}, CAM_DEFAULTS, settings.cam || {});
    if (this.cs.wst > 1) this.cs.wst = 0;
    // The iPhone's own lens wins over the one saved here.
    const ph = S && S.cam.phone;
    if (ph) Object.assign(this.cs, { front: ph.front, lens: ph.lens });
    this.panel = '';
    this.tab = 0;
    this.spark = [];
    this.overlayKey = '';
    this.dockKey = '';
    this.phoneKey = '';
    root.innerHTML = `
      <main class="cam-wrap enter">
        <div class="pv" id="c-pv">
          <div class="vbox" id="c-vbox">
            <canvas class="scene vid" id="c-scene" role="img" aria-label="Image de la caméra de l’iPhone"></canvas>
            <span class="ptag">Aperçu · vous seul</span>
            <button class="pclose" type="button" aria-label="Cacher l’aperçu" title="Cacher l’aperçu" data-act="peek">${I.close}</button>
          </div>
          <div id="c-wait"></div>
          <div class="hud" style="left:18px;top:18px" id="c-hudl"></div>
          <div class="hud" style="right:18px;top:18px" id="c-hudr"></div>
          <div id="c-notice"></div>
          <div class="dock" role="toolbar" aria-label="Commandes de la caméra" id="c-dock"></div>
        </div>
      </main>`;
    Video.start($('#c-scene'));
    this.paintDock();
    this.push();
    // While paused, the iPhone sends a small preview only while this page is
    // on screen (ADR-0027).
    this.pushPreview();
    // Hidden window (tray, minimized): no decoding for nobody to see.
    this.onVis = () => {
      this.pushPreview();
      document.hidden ? Video.stop() : Video.start($('#c-scene'));
    };
    document.addEventListener('visibilitychange', this.onVis);
  },
  unmount() {
    // The camera keeps going: Discord or OBS may be using the Windows webcam.
    document.removeEventListener('visibilitychange', this.onVis);
    invoke('cam_preview', { on: false });
    Video.stop();
  },
  connected: () => !!(S && S.connected),
  // The paused preview is on unless Evan hid it (dock or ×); hidden, the
  // iPhone sends nothing at all while paused (ADR-0027).
  peekOn() {
    return this.cs.peek !== false;
  },
  pushPreview() {
    invoke('cam_preview', { on: !document.hidden && this.peekOn() });
  },
  // « live » lives in Rust (snapshot); the window only asks to change it.
  isLive: () => !!(S && S.cam.live),
  pushLens() {
    invoke('cam_lens', { front: this.cs.front, lens: this.cs.lens, mirror: !!this.cs.mirror, turn: (this.cs.turn | 0) % 4 });
  },
  push() {
    const c = this.cs;
    invoke('cam_set', {
      quality: {
        height: RES[c.res], fps: FPS[c.fps], bitrate_mbps: RATE[c.rate], adapt: c.autoq,
        codec: c.codec === 1 || !Video.hevc ? 'h264' : 'hevc',
        ev: c.ev, focus: c.afA ? null : c.focus, wb: c.wbA ? null : c.wb, torch: c.torch, stab: c.stab,
      },
    });
  },
  save() {
    clearTimeout(this.saveT);
    this.saveT = setTimeout(() => {
      settings.cam = this.cs;
      saveSettings();
    }, 400);
  },
  paintWait() {
    const c = this.cs;
    const conn = this.connected();
    const live = this.isLive();
    const phone = S && S.cam.phone;
    const show = !live || !conn || !Video.fresh();
    // Paused with the preview coming in: the picture sits in a corner, over
    // the waiting screen, for this window only (ADR-0027).
    $('#c-vbox').classList.toggle('peek', !live && conn && Video.fresh() && this.peekOn());
    // Hidden: the old picture must not stay behind the waiting screen either.
    $('#c-vbox').classList.toggle('nopeek', !live && !this.peekOn());
    const key = [show, conn, c.wst, c.multi, c.msg, live, phone && phone.open, !!(S && S.device)].join('|');
    if (key === this.overlayKey) return;
    this.overlayKey = key;
    if (!show) {
      $('#c-wait').innerHTML = '';
      return;
    }
    const sub = !S || !S.device ? 'Aucun iPhone relié · <a href="#pair">Relier</a>'
      : !conn ? 'iPhone hors ligne'
        : live ? 'L’image arrive…' : '';
    // Already on screen (a new message, style…): no fade in again, the camera
    // picture behind must never show through.
    const shown = !!$('#c-wait .wait2');
    $('#c-wait').innerHTML = waitScreen(c, sub);
    if (shown) $('#c-wait .wait2').classList.add('shown');
  },
  paintDock() {
    const c = this.cs;
    const conn = this.connected();
    const live = this.isLive() && conn;
    $('#c-dock').innerHTML = `
      <button class="pz ${live ? 'live' : 'paused'}" type="button" data-act="pause" ${conn ? '' : 'disabled'}>${live ? I.pause + 'Pause' : I.play + 'Afficher la caméra'}</button>
      <div class="lens" role="group" aria-label="Objectif">${LENS_L.map((n, i) => `<button type="button" class="${i === c.lens && !c.front ? 'on' : ''}" data-act="set" data-k="lens" data-v="${i}" ${c.front ? 'disabled' : ''}>${n}</button>`).join('')}</div>
      <button class="db${c.mirror ? ' on' : ''}" type="button" aria-label="Miroir" aria-pressed="${!!c.mirror}" title="Miroir (l’écran d’attente reste à l’endroit)" data-act="mirror">${I.mirror}</button>
      <button class="db${c.turn ? ' on' : ''}" type="button" aria-label="Tourner de 90°" title="Tourner de 90° (${(c.turn | 0) * 90}°)" data-act="turn">${I.turn}</button>
      <button class="db" type="button" aria-label="Retourner la caméra" data-act="flipcam">${I.flip}</button>
      ${live ? '' : `<button class="db${this.peekOn() ? ' on' : ''}" type="button" aria-label="${this.peekOn() ? 'Cacher' : 'Montrer'} l’aperçu" aria-pressed="${this.peekOn()}" title="${this.peekOn() ? 'Cacher l’aperçu (rien n’est envoyé en pause)' : 'Montrer l’aperçu, pour toi seul'}" data-act="peek">${this.peekOn() ? I.eye : I.eyeOff}</button>`}
      <span class="sep"></span>
      <button class="db${this.panel === 'info' ? ' on' : ''}" type="button" aria-label="Infos du flux" data-act="panel" data-v="info">${I.info}</button>
      <button class="db${this.panel === 'set' ? ' on' : ''}" type="button" aria-label="Réglages de la caméra" data-act="panel" data-v="set">${I.sliders}</button>`;
  },
  paintHud() {
    const conn = this.connected();
    const live = this.isLive() && conn;
    const q = S.cam.effective.quality;
    const ph = S.cam.phone;
    const qual = ph && ph.height && live ? `${resName(Math.min(ph.width, ph.height))} · ${ph.fps}` : `${resName(q.height)} · ${q.fps}`;
    const used = S.vcam && S.vcam.in_use ? `<span class="chip">${I.cam}${S.vcam.in_use > 1 ? S.vcam.in_use + ' apps' : 'Webcam utilisée'}</span>` : '';
    $('#c-hudl').innerHTML = (live
      ? '<span class="chip" style="color:#FFB3A6"><span class="rec"></span>EN DIRECT</span>'
      : `<span class="chip">${I.pause}En pause</span>`) + `<span class="chip mono">${qual}</span>` + used;
    const p = S.status;
    if (!S.device || !p) {
      $('#c-hudr').innerHTML = '';
    } else {
      const low = p.battery != null && p.battery < 15 && p.charge === 'unplugged';
      const bc = low ? '#FF7A66' : '#B9F25A';
      $('#c-hudr').innerHTML = `
        <span class="chip" style="color:${bc}"><span class="batt" aria-hidden="true"><i style="width:${p.battery ?? 0}%"></i></span><span class="mono">${p.battery ?? '—'} %</span>${p.charge !== 'unplugged' ? svg('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>', ' aria-label="en charge"') : ''}</span>
        <span class="chip"><span class="tdot" style="background:${HEAT_COLOR[p.thermal] || '#868F9D'}"></span>${p.thermal ? HEAT[p.thermal] : 'inconnu'}</span>
        <span class="chip">${I.wifi}<span class="mono">${conn ? (S.latency_ms == null ? '—' : S.latency_ms + ' ms') : 'hors ligne'}</span></span>`;
    }
    const e = S.cam.effective;
    $('#c-notice').innerHTML = !conn ? '' : e.alert
      ? '<div class="notice hot">iPhone très chaud : 1080p30 pour garder le flux</div>'
      : e.lowered ? '<div class="notice">iPhone chaud : 30 images/s pour garder le flux</div>' : '';
  },
  update() {
    // The iPhone can switch lens or camera itself: the PC follows.
    const ph = S.cam.phone;
    const pk = ph ? [ph.front, ph.lens].join('|') : '';
    if (ph && pk !== this.phoneKey) {
      this.phoneKey = pk;
      if (ph.front !== this.cs.front || ph.lens !== this.cs.lens) {
        this.cs.front = ph.front;
        this.cs.lens = ph.lens;
        this.save();
      }
      this.dockKey = '';
    }
    const dockKey = [this.connected(), this.isLive(), this.cs.front, this.cs.lens, this.cs.mirror, this.cs.turn, this.peekOn()].join('|');
    if (dockKey !== this.dockKey) {
      this.dockKey = dockKey;
      this.paintDock();
    }
    this.paintWait();
    this.paintHud();
    this.spark.push(S.cam.stats.bitrate_mbps);
    if (this.spark.length > 40) this.spark.shift();
    if (this.panel === 'info') this.paintInfo();
  },
  paintInfo() {
    const st = S.cam.stats, q = S.cam.effective.quality, p = S.status || {}, ph = S.cam.phone;
    const max = Math.max(1, ...this.spark);
    const bars = Array.from({ length: 40 }, (_, i) => this.spark[i - (40 - this.spark.length)] ?? 0)
      .map((v) => `<i style="height:${Math.max(4, Math.round(v / max * 90))}%"></i>`).join('');
    const cell = (k, v) => `<div class="icell"><div class="k">${k}</div><div class="v">${v}</div></div>`;
    const body = `
      <div class="spark" aria-hidden="true">${bars}</div>
      <div class="ig">
        ${cell('Image envoyée', ph && ph.height ? `${ph.width}×${ph.height} · ${ph.fps}` : `${resName(q.height)} · ${q.fps}`)}
        ${cell('Débit', `${n1(st.bitrate_mbps)} Mb/s`)}
        ${cell('Images par seconde', n1(st.fps))}
        ${cell('Latence Wi-Fi', S.latency_ms == null ? 'inconnu' : S.latency_ms + ' ms')}
        ${cell('Images sautées', String(st.dropped + Video.drops))}
        ${cell('iPhone', `${p.battery ?? '—'} % · ${p.thermal ? HEAT[p.thermal] : 'inconnu'}`)}
      </div>`;
    const el = $('#c-info');
    if (el) el.innerHTML = body;
  },
  openPanel(name) {
    this.panel = this.panel === name ? '' : name;
    this.paintDock();
    if (!this.panel) {
      layer.innerHTML = '';
      return;
    }
    if (this.panel === 'info') {
      layer.innerHTML = `<button class="scrim" type="button" aria-label="Fermer les infos" data-act="close"></button>
        <div class="modal" role="dialog" aria-label="Infos du flux">
          <div class="row" style="justify-content:space-between">
            <div style="font-size:20px;font-weight:600;letter-spacing:-.03em">Infos du flux</div>
            <button class="ib" type="button" aria-label="Fermer" data-act="close">${I.close}</button>
          </div>
          <div id="c-info"></div>
        </div>`;
      this.paintInfo();
    } else {
      layer.innerHTML = `<button class="scrim" type="button" aria-label="Fermer les réglages" data-act="close"></button>
        <aside class="drawer" aria-label="Réglages de la caméra">
          <div class="dh">
            <div style="font-size:20px;font-weight:600;letter-spacing:-.03em">Réglages de la caméra</div>
            <button class="ib" type="button" aria-label="Fermer" data-act="close">${I.close}</button>
          </div>
          <div id="c-drawer"></div>
        </aside>`;
      this.paintDrawer();
    }
  },
  paintDrawer() {
    const c = this.cs;
    const chips = (list, k) => `<div class="chips">${list.map((n, i) => `<button type="button" class="cp${c[k] === i ? ' on' : ''}" data-act="set" data-k="${k}" data-v="${i}">${esc(n)}</button>`).join('')}</div>`;
    const tog = (k, label) => `<button class="tg" type="button" data-act="toggle" data-k="${k}" aria-pressed="${c[k]}">${esc(label)}<span class="sw${c[k] ? ' on' : ''}"></span></button>`;
    const slider = (k, label, min, max, step, fmt, off) => {
      const p = ((c[k] - min) / (max - min) * 100).toFixed(1);
      return `<label class="sl${off ? ' off' : ''}"><span class="r"><span>${esc(label)}</span><span class="val" id="v-${k}">${fmt(c[k])}</span></span>
        <input type="range" min="${min}" max="${max}" step="${step}" value="${c[k]}" data-input="slide" data-change="slid" data-k="${k}" ${off ? 'disabled' : ''} style="background:linear-gradient(90deg,var(--co) ${p}%,color-mix(in srgb,var(--tx) 12%,transparent) ${p}%)"></label>`;
    };
    this.fmt = {
      ev: (v) => (v > 0 ? '+' : '') + Number(v).toFixed(1) + ' EV',
      wb: (v) => (c.wbA ? 'auto' : v + ' K'),
      focus: (v) => (c.afA ? 'auto' : v + ' %'),
    };
    const F = this.fmt;
    let body = '';
    if (this.tab === 0) {
      body = `
        <div class="grp"><span class="gl">Résolution</span>${chips(RES_L, 'res')}</div>
        <div class="grp"><span class="gl">Images par seconde</span>${chips(FPS.map(String), 'fps')}</div>
        <div class="grp"><span class="gl">Codec</span>${chips(['HEVC', 'H.264'], 'codec')}</div>
        <div class="grp"><span class="gl">Débit (Mb/s)</span>${chips(['Auto', '8', '20', '40', '80'], 'rate')}</div>
        <div class="grp">${tog('autoq', 'Baisser la qualité si l’iPhone chauffe')}</div>`;
    } else if (this.tab === 1) {
      body = slider('ev', 'Exposition', -2, 2, 0.1, F.ev)
        + `<div class="grp">${tog('afA', 'Mise au point auto')}</div>` + slider('focus', 'Mise au point', 0, 100, 1, F.focus, c.afA)
        + `<div class="grp">${tog('wbA', 'Balance des blancs auto')}</div>` + slider('wb', 'Balance des blancs', 2500, 8000, 100, F.wb, c.wbA)
        + `<div class="grp"><span class="gl">Stabilisation</span>${chips(['Off', 'Standard', 'Cinéma'], 'stab')}</div>
        <div class="grp">${tog('torch', 'Lampe de l’iPhone')}</div>`;
    } else {
      body = `<label class="grp"><span class="gl">Message</span><input class="txt" type="text" maxlength="60" value="${esc(c.msg)}" data-change="msg"></label>
        <div class="grp">${tog('multi', 'Dans toutes les langues')}</div>
        <div class="grp"><span class="gl">Style</span>${chips(['Animé', 'Minimal'], 'wst')}</div>
        <div class="wprev">${waitScreen(c, '')}</div>`;
    }
    const el = $('#c-drawer');
    if (!el) return;
    el.style.cssText = 'display:flex;flex-direction:column;flex:1;min-height:0';
    el.innerHTML = `
      <div style="padding:0 22px 14px"><div class="chips">${PROFILES.map(([n], i) => `<button type="button" class="cp${c.prof === i ? ' on' : ''}" data-act="profile" data-v="${i}">${n}</button>`).join('')}</div></div>
      <div class="tabs" role="tablist">${['Qualité', 'Caméra', 'Écran d’attente'].map((n, i) => `<button type="button" role="tab" aria-selected="${i === this.tab}" class="${i === this.tab ? 'on' : ''}" data-act="tab" data-v="${i}">${n}</button>`).join('')}</div>
      <div class="dbody">${body}</div>`;
  },
  // `wait`: the change touches the waiting screen (message, style…); mirror,
  // turn and lens never do, so it stays as it is.
  changed(send, wait = true) {
    if (wait) {
      this.overlayKey = '';
      this.paintWait();
    }
    if (this.panel === 'set') {
      const scroll = $('.dbody') ? $('.dbody').scrollTop : 0;
      this.paintDrawer();
      if ($('.dbody')) $('.dbody').scrollTop = scroll;
    }
    if (send) this.push();
    this.save();
  },
  acts: {
    pause: () => {
      const on = !Cam.isLive();
      S.cam.live = on; // shown at once; the snapshot confirms
      invoke('cam_live', { on });
      Cam.update();
    },
    set: (el) => {
      const k = el.dataset.k;
      Cam.cs[k] = Number(el.dataset.v);
      if (k === 'lens') {
        Cam.paintDock();
        Cam.pushLens();
      }
      Cam.changed(['res', 'fps', 'rate', 'codec', 'stab'].includes(k));
    },
    toggle: (el) => {
      const k = el.dataset.k;
      Cam.cs[k] = !Cam.cs[k];
      Cam.changed(['autoq', 'afA', 'wbA', 'torch'].includes(k));
    },
    profile: (el) => {
      const i = Number(el.dataset.v);
      const [, res, fps] = PROFILES[i];
      Object.assign(Cam.cs, { prof: i, res, fps });
      Cam.changed(true);
    },
    tab: (el) => {
      Cam.tab = Number(el.dataset.v);
      Cam.paintDrawer();
    },
    panel: (el) => Cam.openPanel(el.dataset.v),
    close: () => Cam.openPanel(Cam.panel),
    peek: () => {
      Cam.cs.peek = !Cam.peekOn();
      Cam.dockKey = '';
      Cam.pushPreview();
      Cam.update();
      Cam.save();
    },
    mirror: () => {
      Cam.cs.mirror = !Cam.cs.mirror;
      Cam.paintDock();
      Cam.pushLens();
      Cam.changed(false, false);
    },
    turn: () => {
      Cam.cs.turn = ((Cam.cs.turn | 0) + 1) % 4;
      Cam.paintDock();
      Cam.pushLens();
      Cam.changed(false, false);
    },
    flipcam: () => {
      Cam.cs.front = !Cam.cs.front;
      Cam.paintDock();
      Cam.pushLens();
      Cam.changed(false, false);
    },
    slide: (el) => {
      const k = el.dataset.k;
      Cam.cs[k] = Number(el.value);
      const min = Number(el.min), max = Number(el.max);
      const p = ((Cam.cs[k] - min) / (max - min) * 100).toFixed(1);
      el.style.background = `linear-gradient(90deg,var(--co) ${p}%,color-mix(in srgb,var(--tx) 12%,transparent) ${p}%)`;
      $('#v-' + k).textContent = Cam.fmt[k](Cam.cs[k]);
      // Sent while sliding (throttled), so the iPhone follows the finger.
      clearTimeout(Cam.slideT);
      Cam.slideT = setTimeout(() => Cam.push(), 120);
    },
    slid: () => {
      Cam.push();
      Cam.save();
    },
    msg: (el) => {
      Cam.cs.msg = el.value.trim() || CAM_DEFAULTS.msg;
      Cam.changed(false);
    },
  },
};

// ===================================================================
// Drop
// ===================================================================
// Spec `Drop - Photos vers le PC` (ADR-0030): Drop starts on the iPhone. At
// rest the page explains how; when the iPhone asks, a confirmation opens
// (the first time: folder, then sorting, then the answer); then the send in
// progress (E10) and its result. Rebuilt only when the state changes; the
// numbers are filled in place every second.
const SORTS = [
  ['year_month', 'Année, puis mois', '2026 › 10 › IMG_1234.HEIC', true],
  ['year', 'Année', '2026 › IMG_1234.HEIC', false],
  ['flat', 'Tout ensemble', 'IMG_1234.HEIC', false],
];
// Time on each step; the CSS animations follow (--simd in app.css).
const SIM_MS = 4500;
const SIM_STEPS = ['Ouvre Drop sur l’iPhone', 'Choisis : photos, album, fichiers…', 'Vois l’aperçu et envoie', 'Confirme sur ce PC', 'C’est rangé et vérifié'];
const SORT_NAME = { year_month: 'par année puis par mois', year: 'par année', flat: 'tous ensemble' };
const Drop = {
  key: () => '',
  mount(root) {
    this.root = root;
    this.shape = '';
    this.ask = '';
    this.askShape = '';
    this.folder = null;
    this.seen = '';
    if (!S) root.innerHTML = '';
  },
  // The result of a send stays until « OK ».
  resultKey: (d) => [d.state, d.files_done, d.bytes_done, d.message].join('|'),
  update() {
    const d = S.drop || {};
    const showResult = (d.state === 'done' || d.state === 'failed') && this.seen !== this.resultKey(d);
    // Done: a window with what arrived (below); failed: said in the page.
    const view = d.state === 'sending' ? 'sending' : showResult && d.state === 'failed' ? 'result' : 'rest';
    const shape = [view, d.state === 'preparing' || d.state === 'asking', S.connected, !!S.device].join('|');
    if (shape !== this.shape) {
      this.shape = shape;
      this.root.innerHTML = `<main class="wrap enter">
        <header><h1 class="h1">Drop</h1><p class="sub">Les photos, vidéos et fichiers de l’iPhone, en qualité d’origine, vérifiés et sans doublon.</p></header>
        <section class="card drop-now${view === 'rest' ? ' dsim-card' : ''}"><div class="dstage">${this.body(view, d)}</div></section>
        <section class="card">
          <div class="row" style="justify-content:space-between">
            <div><span class="lbl">Rangées dans</span><div class="mono" style="margin-top:8px;font-size:15px">${settings.drop_setup_done ? esc(settings.photos_dir) : 'Choisi au premier envoi'}</div></div>
            <div class="row">${settings.drop_setup_done ? `<button class="btn sm" type="button" data-act="open">${I.folder}Ouvrir</button>` : ''}<a class="btn sm" href="#settings">Changer</a></div>
          </div>
          <div class="months" id="d-months"></div>
        </section>
      </main>`;
    }
    this.confirmBox(d);
    this.doneBox(d, showResult && d.state === 'done');
    this.fill(d);
    this.simRun(view === 'rest');
  },
  unmount() {
    this.simRun(false);
  },
  // Plays the steps one after the other, SIM_MS each (the CSS follows data-s).
  simRun(on) {
    const el = $('#d-sim');
    if (!on || !el) {
      clearInterval(this.simT);
      this.simT = 0;
      return;
    }
    if (this.simT && this.simEl === el) return;
    clearInterval(this.simT);
    this.simEl = el;
    this.simAt = -1;
    const next = () => this.simShow((this.simAt + 1) % SIM_STEPS.length);
    next();
    this.simT = setInterval(next, SIM_MS);
  },
  simShow(i) {
    const el = $('#d-sim');
    if (!el) return;
    this.simAt = i;
    el.dataset.s = String(i);
    el.querySelectorAll('.sim-rail li').forEach((li, k) => {
      li.classList.toggle('on', k === i);
      li.classList.toggle('done', k < i);
      // Restart the bar of the current step.
      if (k === i) { li.classList.remove('on'); void li.offsetWidth; li.classList.add('on'); }
    });
  },
  body(view, d) {
    if (view === 'sending') {
      // E10: the percentage lives here, the PC knows what really arrived.
      const wire = '<span class="wire"><i></i><i></i><i></i></span>';
      return `<div class="dsend">
        <div class="dring"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="bg" cx="60" cy="60" r="52"/><circle class="fg" id="d-ring" cx="60" cy="60" r="52" pathLength="100" stroke-dasharray="0 100"/></svg>
          <div class="dpct"><span class="mono" id="d-pct">0</span><small>%</small></div></div>
        <div class="dsend-r">
          <span class="lbl">Réception depuis ${esc(devName())}</span>
          <div class="dflow" aria-hidden="true"><span class="node">${I.phone}<em>iPhone</em></span>${wire}<span class="node pc">${I.pc}<em>Vérifié</em></span>${wire}<span class="node fold">${I.folder}<em>Rangé</em></span></div>
          <div class="dfacts">
            <div><small>Reçu</small><b class="mono" id="d-bytes">—</b></div>
            <div><small>Éléments</small><b class="mono" id="d-items">—</b></div>
            <div><small>Vitesse</small><b class="mono" id="d-rate">—</b></div>
            <div><small>Reste</small><b class="mono" id="d-left">—</b></div>
          </div>
          <div class="dcur"><span class="dlive"></span><span id="d-cur"></span><span class="sub" id="d-already" style="margin:0 0 0 auto"></span></div>
          <div class="row" style="margin-top:16px"><button class="btn sm bad" type="button" data-act="cancel">${I.close}Annuler</button></div>
        </div>
      </div>`;
    }
    if (view === 'result') {
      const ok = d.state === 'done';
      const kept = `${d.items_done} élément${d.items_done > 1 ? 's' : ''} · ${bytes(d.bytes_done)}`;
      const extra = [d.already ? `${d.already} déjà sur le PC` : '', d.failed ? `${d.failed} non envoyé${d.failed > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ');
      const head = ok
        ? `<div class="dresult"><span class="dpop">${I.check}</span><div><div class="dtitle">${d.items_done ? `${kept} · vérifiés` : 'Tout est déjà sur le PC'}</div><div class="sub">${extra || 'Rangés par date de prise.'}</div></div></div>`
        : `<div class="ban bad">${I.alert}<span>${esc(d.message)}${d.items_done ? ` <strong>Déjà rangés : ${kept}.</strong>` : ''}</span></div>`;
      return `${head}<div class="row" style="margin-top:20px">
        ${d.files_done ? `<button class="btn cy" type="button" data-act="openLast">${I.folder}Ouvrir le dossier</button>` : ''}
        <button class="btn" type="button" data-act="seen">OK</button></div>`;
    }
    // At rest: a quick simulation of the steps, iPhone to PC (ADR-0030).
    const wait = d.state === 'preparing' || d.state === 'asking';
    const status = !S.device ? '<span class="dlive off"></span>Relie d’abord ton iPhone'
      : wait ? `<span class="dlive"></span>${esc(devName())} prépare un envoi…`
        : S.connected ? `<span class="dlive"></span>${esc(devName())} est prêt` : '<span class="dlive off"></span>iPhone hors ligne : ouvre Hyphn dessus';
    const tiles = '<i></i>'.repeat(6);
    return `<div class="dsim" id="d-sim" data-s="0">
        <div class="dsim-head">
          <div><span class="lbl">Pour commencer</span><h2 class="dtitle dlg">Tout part de ton iPhone</h2></div>
          <span class="dstatus">${status}</span>
        </div>
        <div class="sim-stage" aria-hidden="true">
          <div class="sim-phone"><div class="scr">
            <div class="sc s0"><div class="h">Hyphn</div><div class="m">Accueil · Cam · Drop</div><div class="tabs4"><i></i><i></i><i class="on"></i><i></i></div><span class="tap"></span></div>
            <div class="sc s1"><div class="h">Que veux-tu envoyer ?</div><div class="rows4"><i></i><i></i><i></i><i></i></div><span class="tap"></span></div>
            <div class="sc s2"><div class="h">Envoyer 48 éléments ?</div><div class="thumbs6">${tiles}</div><div class="m">32 photos · 16 vidéos · 1,2 Go</div><div class="sbtn">Envoyer</div><span class="tap"></span></div>
            <div class="sc s3"><div class="swait">${I.pc}</div><div class="h" style="text-align:center">Confirme sur ton PC</div></div>
            <div class="sc s4"><div class="h">Envoi en cours</div><div class="sim-big">64 %</div><div class="sbar"><b></b></div><div class="m">38 Mo/s · reste ≈ 1 min</div></div>
          </div></div>
          <div class="sim-link"><em>Wi-Fi · chiffré</em><span></span><span></span><span></span></div>
          <div class="sim-pc"><div class="mon"><div class="scr">
            <div class="sc p0"><div class="pidle"><span class="plogo"></span><div class="h">Hyphn</div><div class="m">En attente de l’iPhone</div></div></div>
            <div class="sc p3"><div class="pdlg"><div class="m">${esc(devName())} veut envoyer</div><div class="h">48 éléments · 1,2 Go</div><div class="thumbs6">${tiles}</div><div class="pbtns"><b>Accepter</b><b>Refuser</b></div></div><span class="tap"></span></div>
            <div class="sc p4"><div class="pfolder"><div class="m">${esc(settings.drop_setup_done ? settings.photos_dir : 'Images › Hyphn')} › 2026 › 10</div><div class="drop6">${tiles}</div><div class="h">Vérifiés · sans doublon</div></div></div>
          </div></div><div class="stand"></div><div class="base"></div></div>
        </div>
        <ol class="sim-rail">${SIM_STEPS.map((n, i) => `<li data-act="simGo" data-v="${i}"><b>0${i + 1}</b><span>${n}</span></li>`).join('')}</ol>
      </div>`;
  },
  // E10: what arrived, over the page, until « OK ».
  doneBox(d, on) {
    if (!on) {
      if (this.doneKey) {
        this.doneKey = '';
        if (d.state !== 'asking') layer.innerHTML = '';
      }
      return;
    }
    const key = this.resultKey(d) + '|' + (this.thumbs || []).length;
    if (key === this.doneKey) return;
    if (this.doneThumbs !== this.resultKey(d)) {
      // The thumbnails sent with the plan: the first items that arrived. Once.
      this.doneThumbs = this.resultKey(d);
      invoke('drop_previews').then((t) => { this.thumbs = t; this.update(); });
    }
    this.doneKey = key;
    const all = this.thumbs || [];
    const list = d.items_done > all.length ? all.slice(0, 7) : all;
    const rest = d.items_done - list.length;
    const thumbs = list.map((src, i) => `<img src="${src}" alt="" style="animation-delay:${(0.25 + i * 0.06).toFixed(2)}s">`).join('');
    const kinds = [[d.photos, 'photo'], [d.videos, 'vidéo'], [d.docs, 'fichier']].filter(([n]) => n).map(([n, w]) => `${n} ${w}${n > 1 ? 's' : ''}`).join(' · ');
    const extra = [d.already ? `${d.already} déjà sur le PC` : '', d.failed ? `${d.failed} non envoyé${d.failed > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ');
    layer.innerHTML = `<div class="scrim" style="cursor:default"></div>
      <div class="modal dask ddone" role="dialog" aria-label="Transfert terminé">
        <div class="dask-head"><span class="dpop">${I.check}</span>
          <div><span class="lbl">Reçu de ${esc(devName())}</span>
            <div class="dtitle dlg">${d.items_done ? `${d.items_done} élément${d.items_done > 1 ? 's' : ''} · ${bytes(d.bytes_done)}` : 'Tout était déjà là'}</div></div></div>
        ${thumbs && d.items_done ? `<div class="dthumbs">${thumbs}${rest > 0 ? `<i>+${rest}</i>` : ''}</div>` : ''}
        <div class="sub dkinds">${[d.items_done ? `${kinds ? kinds + ' · ' : ''}vérifiés un par un` : '', extra, d.folder ? `Dans ${esc(d.folder)}` : ''].filter(Boolean).join('<br>')}</div>
        <div class="row" style="margin-top:22px">
          ${d.files_done ? `<button class="btn cy" type="button" data-act="openLast">${I.folder}Ouvrir le dossier</button>` : ''}
          <button class="btn" type="button" data-act="seen">OK</button>
        </div>
      </div>`;
  },
  // The confirmation, over the page, while the iPhone waits (ADR-0030).
  confirmBox(d) {
    if (d.state !== 'asking') {
      if (this.ask) {
        this.ask = '';
        this.askShape = '';
        layer.innerHTML = '';
      }
      return;
    }
    if (!this.ask) {
      this.ask = settings.drop_setup_done ? 'accept' : 'folder';
      this.folder = null;
      this.thumbs = [];
      invoke('drop_previews').then((t) => {
        this.thumbs = t;
        this.askShape = '';
        this.confirmBox(S.drop || {});
      });
    }
    const shape = [this.ask, this.folder && this.folder.path, (this.thumbs || []).length].join('|');
    if (shape === this.askShape) return;
    this.askShape = shape;
    const names = settings.drop_setup_done && this.ask === 'accept' ? [] : ['Dossier', 'Rangement', 'Accord'];
    const at = { folder: 0, confirm: 0, sort: 1, accept: 2 }[this.ask];
    const dots = names.length ? `<ol class="dsteps sm">${names.map((n, k) => `<li class="${k < at ? 'done' : k === at ? 'on' : ''}"><b>${k < at ? I.check : k + 1}</b>${n}</li>`).join('')}</ol>` : '';
    layer.innerHTML = `<div class="scrim" style="cursor:default"></div>
      <div class="modal dask" role="dialog" aria-label="Confirmer l’envoi">${dots}<div class="dstage">${this.askBody(d)}</div></div>`;
  },
  askBody(d) {
    const who = esc(devName());
    if (this.ask === 'folder') {
      return `<div class="dq"><span class="lbl">Première fois · ${who} veut envoyer</span><h2 class="dtitle dlg">Où ranger tes photos sur ce PC ?</h2></div>
        <div class="choices">
          <button class="choice dtip" type="button" data-act="suggest"><span class="ic">${I.bolt}</span><span><b>Laisser Hyphn choisir</b><small>Un dossier propre, sur le disque qui a le plus de place.</small></span><em>Conseillé</em></button>
          <button class="choice" type="button" data-act="pickDir"><span class="ic">${I.folder}</span><span><b>Choisir un dossier</b><small>Tu le choisis dans Windows.</small></span></button>
        </div>
        <div class="row" style="margin-top:18px"><button class="btn sm bad" type="button" data-act="refuse">Refuser l’envoi</button></div>`;
    }
    if (this.ask === 'confirm') {
      const f = this.folder || {};
      return `<div class="dq"><span class="lbl">Dossier</span><h2 class="dtitle dlg">C’est bon pour toi ?</h2></div>
        <div class="dpath"><span class="ic">${I.folder}</span><div><div class="mono">${esc(f.path)}</div><div class="sub">${f.free != null ? `${bytes(f.free)} libres sur ce disque` : 'Place libre inconnue'}</div></div></div>
        <div class="row" style="margin-top:22px">
          <button class="btn cy" type="button" data-act="okDir">${I.check}C’est bon</button>
          <button class="btn" type="button" data-act="pickDir">Choisir un autre</button>
        </div>`;
    }
    if (this.ask === 'sort') {
      return `<div class="dq"><span class="lbl">Rangement</span><h2 class="dtitle dlg">Comment les ranger ?</h2></div>
        <div class="choices three">${SORTS.map(([k, n, ex, tip]) => `<button class="choice${tip ? ' dtip' : ''}" type="button" data-act="sort" data-v="${k}"><span><b>${n}</b><small class="mono">${ex}</small></span>${tip ? '<em>Conseillé</em>' : ''}</button>`).join('')}</div>
        <p class="sub" style="margin-top:16px">Selon la date où la photo a été prise. Tu pourras changer ça dans les Réglages.</p>`;
    }
    const kinds = [[d.photos, 'photo'], [d.videos, 'vidéo'], [d.docs, 'fichier']].filter(([n]) => n).map(([n, w]) => `${n} ${w}${n > 1 ? 's' : ''}`).join(' · ');
    const more = [kinds, d.already ? `${d.already} déjà sur le PC, pas renvoyé${d.already > 1 ? 's' : ''}` : '', `Vers ${esc(settings.photos_dir)}, ${SORT_NAME[settings.sort] || ''}`].filter(Boolean);
    // One line of 8: the last tile counts the rest.
    const all = this.thumbs || [];
    const list = d.items > all.length ? all.slice(0, 7) : all;
    const thumbs = list.map((src, i) => `<img src="${src}" alt="" style="animation-delay:${(i * 0.05).toFixed(2)}s">`).join('');
    const rest = d.items - list.length;
    return `<div class="dask-head"><span class="ic">${I.phone}</span>
        <div><span class="lbl">Aperçu · ${who} veut envoyer</span>
          <div class="dtitle dlg">${d.items} élément${d.items > 1 ? 's' : ''} · ${bytes(d.bytes)}</div></div></div>
      ${thumbs ? `<div class="dthumbs">${thumbs}${rest > 0 ? `<i>+${rest}</i>` : ''}</div>` : ''}
      <div class="sub dkinds">${more.join('<br>')}</div>
      <div class="row" style="margin-top:22px">
        <button class="btn cy" type="button" data-act="accept">${I.check}Accepter</button>
        <button class="btn" type="button" data-act="refuse">Refuser</button>
      </div>`;
  },
  fill(d) {
    const set = (id, t) => { const el = $(id); if (el && el.textContent !== t) el.textContent = t; };
    if (d.state === 'sending') {
      const pct = d.bytes ? Math.min(100, Math.floor(d.bytes_done / d.bytes * 100)) : 0;
      set('#d-pct', String(pct));
      const ring = $('#d-ring');
      if (ring) ring.setAttribute('stroke-dasharray', `${pct} 100`);
      set('#d-bytes', `${bytes(d.bytes_done)} sur ${bytes(d.bytes)}`);
      set('#d-items', `${d.items_done} sur ${d.items}`);
      set('#d-rate', d.rate ? `${bytes(d.rate)}/s` : 'calcul…');
      const left = d.rate ? Math.max(0, d.bytes - d.bytes_done) / d.rate : 0;
      set('#d-left', !d.rate ? 'calcul…' : left < 60 ? '< 1 min' : `≈ ${Math.ceil(left / 60)} min`);
      set('#d-cur', d.current ? d.current : 'Le transfert démarre…');
      set('#d-already', d.already ? `${d.already} déjà sur le PC` : '');
    }
    const months = S.drop_months || [];
    const key = JSON.stringify(months);
    const box = $('#d-months');
    if (box && box.dataset.k !== key) {
      box.dataset.k = key;
      box.innerHTML = months.length
        ? months.map((m) => `<div class="month"><span>${esc(m.label)}</span><span class="mono sub" style="margin:0">${m.files} fichier${m.files > 1 ? 's' : ''} · ${bytes(m.bytes)}</span></div>`).join('')
        : '<div class="sub">Rien encore.</div>';
    }
  },
  askStep(step) {
    this.ask = step;
    this.confirmBox(S.drop || {});
  },
  acts: {
    suggest: async () => {
      Drop.folder = await invoke('drop_suggest_dir');
      Drop.askStep('confirm');
    },
    pickDir: async () => {
      const path = await invoke('pick_photos_dir');
      if (!path) return;
      Drop.folder = { path, free: await invoke('drop_dir_free', { path }) };
      Drop.askStep('confirm');
    },
    okDir: () => Drop.askStep('sort'),
    sort: async (el) => {
      Object.assign(settings, { photos_dir: Drop.folder.path, sort: el.dataset.v, drop_setup_done: true });
      await saveSettings();
      Drop.shape = '';
      Drop.askStep('accept');
    },
    simGo: (el) => {
      Drop.simRun(false);
      Drop.simShow(Number(el.dataset.v));
      Drop.simRun(true);
      Drop.simShow(Number(el.dataset.v));
    },
    accept: () => {
      layer.innerHTML = '';
      invoke('drop_answer', { yes: true });
    },
    refuse: () => {
      layer.innerHTML = '';
      invoke('drop_answer', { yes: false });
    },
    seen: () => {
      Drop.seen = Drop.resultKey(S.drop || {});
      // Kept by the PC too: a reload of the window does not show it again.
      invoke('drop_dismiss');
      layer.innerHTML = '';
      Drop.doneKey = '';
      Drop.update();
    },
    cancel: () => invoke('drop_cancel'),
    open: () => invoke('open_photos_dir').catch((e) => toast(String(e), 'info')),
    openLast: () => {
      invoke('open_drop_folder').catch((e) => toast(String(e), 'info'));
      Drop.acts.seen();
    },
  },
};

// ===================================================================
// Réglages
// ===================================================================
const Settings = {
  key: () => (S && S.device ? S.device.fingerprint : 'none'),
  mount(root) {
    this.asking = false;
    this.root = root;
    this.vkey = JSON.stringify(S && S.vcam);
    this.paint();
  },
  async install(uninstall) {
    this.installing = true;
    this.paint();
    try {
      await invoke('vcam_install', { uninstall });
      toast(uninstall ? 'Webcam retirée' : 'Webcam Windows prête');
    } catch (e) {
      toast(String(e), 'info');
    }
    this.installing = false;
    await refresh();
    this.paint();
  },
  paint() {
    const s = settings;
    const d = S && S.device;
    const tog = (k, label, hint) => `<button class="tg" type="button" data-act="toggle" data-k="${k}" aria-pressed="${s[k]}"><span>${esc(label)}${hint ? `<span class="h" style="display:block;font-size:12px;color:var(--tx3);margin-top:2px">${esc(hint)}</span>` : ''}</span><span class="sw${s[k] ? ' on' : ''}"></span></button>`;
    const device = d
      ? `<div class="line"><span>${esc(d.name)}<span class="h">Relié le ${dateFr(d.paired_at)} · pour toujours, jusqu’à « Oublier » · empreinte <span class="mono">${esc(d.fingerprint)}</span></span></span><button class="btn bad sm" type="button" data-act="ask">Oublier</button></div>
        ${this.asking ? `<div class="confirm" role="alertdialog" aria-label="Confirmer l’oubli">
          <span><strong>Oublier ${esc(d.name)} ?</strong> Il faudra scanner un nouveau QR pour le relier.</span>
          <div class="row" style="gap:8px"><button class="btn badf sm" type="button" data-act="forget">Oublier</button><button class="btn sm" type="button" data-act="cancel">Annuler</button></div>
        </div>` : ''}
        <div class="line"><span>Connexion<span class="h">${S && S.connected ? 'Reliée' : 'En attente de l’iPhone'}</span></span><button class="btn sm" type="button" data-act="reconnect">Reconnecter</button></div>
        <div class="line"><span>Relier un autre iPhone<span class="h">Il remplace celui-ci</span></span><a class="btn sm" href="#pair">Relier</a></div>`
      : `<div class="line"><span>Aucun iPhone relié</span><a class="btn pri sm" href="#pair">Relier un iPhone</a></div>`;
    this.root.innerHTML = `
      <main class="wrap enter" style="max-width:1080px">
        <h1 class="h1" style="font-size:40px;letter-spacing:-.05em">Réglages</h1>
        <section class="card priv">
          <span class="shield">${I.shield}</span>
          <div><div style="font-size:20px;font-weight:600;letter-spacing:-.03em">Rien ne sort de chez toi.</div><div style="font-size:14px;color:var(--tx2);margin-top:4px">Hyphn parle seulement à ton iPhone, sur ton réseau, et tout est chiffré.</div></div>
          <div class="pills"><span class="pl"><b>0</b>compte</span><span class="pl"><b>0</b>serveur</span><span class="pl"><b>0</b>octet vers internet</span></div>
        </section>
        <div class="sgrid">
          <section class="scard" style="--c:var(--li)"><div class="ct">${I.phone}Appareils</div>${device}</section>
          <section class="scard" style="--c:var(--tx)">
            <div class="ct">${I.pc}Général</div>
            ${tog('launch_at_startup', 'Lancer Hyphn avec Windows')}
            ${tog('close_to_tray', 'Rester près de l’horloge quand on ferme')}
            <div class="line"><span>Thème</span><div class="seg" role="group" aria-label="Thème">${[['system', 'Comme Windows'], ['dark', 'Sombre'], ['light', 'Clair']].map(([k, n]) => `<button type="button" class="${s.theme === k ? 'on' : ''}" data-act="theme" data-v="${k}">${n}</button>`).join('')}</div></div>
          </section>
          <section class="scard" style="--c:var(--co)">
            <div class="ct">${I.cam}Cam</div>
            ${this.vcamLines()}
            <div class="line"><span>Réglages de l’image</span><a class="btn sm" href="#cam">Ouvrir Cam</a></div>
          </section>
          <section class="scard" style="--c:var(--cy)">
            <div class="ct">${I.swap}Drop</div>
            <div class="line"><span>Dossier des photos</span><button class="btn mono sm" type="button" data-act="pick">${esc(s.photos_dir)}</button></div>
            <div class="line"><label for="rg">Rangement</label><select id="rg" class="sel" data-change="sort">${[['year_month', 'Année / Mois'], ['year', 'Année'], ['flat', 'Tout ensemble']].map(([k, n]) => `<option value="${k}"${s.sort === k ? ' selected' : ''}>${n}</option>`).join('')}</select></div>
          </section>
          <section class="scard" style="--c:var(--am)">
            <div class="ct">${I.bolt}Alertes</div>
            ${tog('low_battery_alert', 'Prévenir sous 15 % de batterie', 'Quand l’iPhone n’est pas en charge')}
          </section>
        </div>
        <div class="mono" style="text-align:center;font-size:12px;color:var(--tx3)">Hyphn ${S ? S.version : ''} · protocole v1 · ${esc(S ? S.pc_name : '')} · empreinte ${esc(S ? S.pc_fingerprint : '')}</div>
      </main>`;
  },

  // Windows webcam and OBS source: one install as admin, then always there.
  vcamLines() {
    const v = (S && S.vcam) || {};
    const busy = this.installing;
    const cam = v.camera
      ? `<div class="line"><span>Webcam Windows<span class="h">${v.in_use ? (v.in_use > 1 ? v.in_use + ' apps l’utilisent' : 'Une app l’utilise') : '« Hyphn » dans Discord, Teams, OBS…'}</span></span><span class="okc">${I.check}Prête</span></div>`
      : v.installed
        ? `<div class="line"><span>Webcam Windows<span class="h">${esc(v.error || 'Démarrage…')}</span></span><button class="btn sm" type="button" data-act="vinstall" ${busy ? 'disabled' : ''}>Réparer</button></div>`
        : `<div class="line"><span>Webcam Windows<span class="h">${v.can_install ? 'Windows demande l’accord administrateur, une seule fois' : 'Fichiers de la webcam absents de cette version'}</span></span><button class="btn pri sm" type="button" data-act="vinstall" ${busy || !v.can_install ? 'disabled' : ''}>${busy ? 'Installation…' : 'Installer'}</button></div>`;
    const obs = !v.obs_present ? ''
      : `<div class="line"><span>OBS<span class="h">${v.obs ? 'Source « Hyphn » dans OBS' : 'S’installe avec la webcam'}</span></span>${v.obs ? `<span class="okc">${I.check}Prêt</span>` : ''}</div>`;
    const remove = v.installed ? `<div class="line"><span class="h" style="margin:0">Retirer la webcam et le plugin OBS</span><button class="btn bad sm" type="button" data-act="vremove" ${busy ? 'disabled' : ''}>Retirer</button></div>` : '';
    return cam + obs + remove;
  },
  update() {
    const k = JSON.stringify(S && S.vcam);
    if (k !== this.vkey) {
      this.vkey = k;
      this.paint();
    }
  },

  acts: {
    vinstall: () => Settings.install(false),
    vremove: () => Settings.install(true),
    toggle: async (el) => {
      const k = el.dataset.k;
      settings[k] = !settings[k];
      await saveSettings();
      settings = await invoke('get_settings');
      Settings.paint();
    },
    theme: async (el) => {
      settings.theme = el.dataset.v;
      applyTheme();
      await saveSettings();
      Settings.paint();
    },
    sort: async (el) => {
      settings.sort = el.value;
      await saveSettings();
    },
    pick: async () => {
      const dir = await invoke('pick_photos_dir');
      if (!dir) return;
      settings.photos_dir = dir;
      await saveSettings();
      Settings.paint();
    },
    ask: () => {
      Settings.asking = true;
      Settings.paint();
    },
    cancel: () => {
      Settings.asking = false;
      Settings.paint();
    },
    forget: async () => {
      await invoke('forget_device');
      await refresh();
      mount(true);
    },
  },
};

const PAGES = { home: Home, pair: Pair, cam: Cam, drop: Drop, settings: Settings };

// ---------- Live data ----------
async function refresh() {
  onSnapshot(await invoke('get_snapshot'));
}
function onSnapshot(snap) {
  S = snap;
  paintHeader();
  const r = route();
  const key = r + ':' + (PAGES[r].key ? PAGES[r].key() : '');
  if (key !== pageKey) mount(true);
  else if (page && page.update) page.update();
}

(async function start() {
  settings = await invoke('get_settings');
  applyTheme();
  S = await invoke('get_snapshot');
  paintHeader();
  mount(true);
  listen('snapshot', (e) => onSnapshot(e.payload));
  listen('pair', (e) => Pair.onPair(e.payload));
  // Installed by itself at launch (one admin « Oui »).
  listen('vcam_installed', () => toast('Webcam Windows prête'));
  // « Afficher » touched on the iPhone: the PC shows the picture at once.
  listen('cam_phone_live', () => { if (route() !== 'cam') go('cam'); });
  // The iPhone asks to send (ADR-0030): its confirmation shows here.
  listen('drop_ask', () => { if (route() !== 'drop') go('drop'); });
  // Evan picked a quality on the iPhone: the PC keeps it (spec `Cam - Flux v1`, E4).
  listen('cam_quality', (e) => {
    const c = Object.assign({}, CAM_DEFAULTS, settings.cam || {});
    const r = RES.indexOf(e.payload.height), f = FPS.indexOf(e.payload.fps);
    if (r >= 0) c.res = r;
    if (f >= 0) c.fps = f;
    settings.cam = c;
    saveSettings();
    if (page === Cam) {
      Cam.cs = c;
      Cam.changed(false);
    }
  });
})();
