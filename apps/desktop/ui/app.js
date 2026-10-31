// Hyphn PC interface. Design V2 (ADR-0016). Every iPhone value comes from the
// Rust side; the iPhone itself is simulated there for now (ADR-0019).
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
  swap: svg('<path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4"/>'),
  flask: svg('<path d="M9 3h6M10 3v6L4 19a1 1 0 0 0 1 2h14a1 1 0 0 0 1-2l-6-10V3"/>'),
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
  const state = S.connected ? `${S.latency_ms} ms` : 'en veille';
  el.innerHTML = `<span class="led${S.connected ? '' : ' off'}"></span>${esc(S.device.name)} · ${state}<span class="demo-tag" title="iPhone simulé (ADR-0019)">démo</span>`;
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
          <a class="btn" href="#drop">${I.down}Recevoir les photos</a>
        </div>`;
    } else if (k === 'veille') {
      left = `
        <span class="eyebrow"><span class="led off"></span>${name} · <span id="h-seen">${ago(S.device.last_seen)}</span></span>
        <h1 class="big-h"><span class="w">En attente</span><br><span class="w" style="animation-delay:.1s">de l’iPhone.</span></h1>
        <p class="lead">Ouvre Hyphn sur l’iPhone : il se reconnecte tout seul, sans scanner.</p>`;
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
            <div><h3>Drop</h3><p id="h-drop">—</p><span class="go">Recevoir${I.arrow}</span></div>
          </a>
        </section>`}
      </main>`;
    if (arrive) toast(`${devName()} est lié à ce PC`);
  },
  update() {
    if (!S.device) return;
    const p = S.pulse || {};
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
    const t = S.transfer;
    $('#h-drop').textContent = t && t.state !== 'done'
      ? `Transfert en cours : ${Math.floor(t.bytes_done / t.bytes_total * 100)} %.`
      : S.new_photos > 0
        ? `${nf.format(S.new_photos)} nouvelles photos et vidéos sur l’iPhone.`
        : S.connected ? 'Tout est déjà sur ce PC.' : 'Ouvre Hyphn sur l’iPhone pour voir ses photos.';
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
    if (tr) tr.style.width = (this.left / 120 * 100).toFixed(1) + '%';
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
          <div class="qr" role="img" aria-label="QR code d’appairage">${this.offer.svg}</div>
          <span class="beam"></span>
        </div>
        <div>
          <span class="lbl">Étape 1 sur 2</span>
          <div class="steps">
            <div class="st"><b>1</b>Ouvre Hyphn sur l’iPhone</div>
            <div class="st"><b>2</b>Touche « Scanner le QR code »</div>
            <div class="st"><b>3</b>Vise ce code, c’est tout</div>
          </div>
          <div class="timer">
            <div class="row" style="justify-content:space-between;font-size:13px;color:var(--tx2)"><span>Usage unique · expire dans</span><span class="mono" id="p-clock" style="color:var(--tx);font-size:20px">2:00</span></div>
            <div class="track"><span id="p-track" style="width:100%"></span></div>
          </div>
          ${this.err ? `<div class="ban bad" style="margin-bottom:18px">${I.alert}<span>${esc(this.err)}</span></div>` : ''}
          <div class="row">
            <button class="btn pri" type="button" data-act="scan">Simuler le scan<span class="demo-tag">démo</span></button>
            <button class="btn" type="button" data-act="renew">${I.refresh}Nouveau QR</button>
          </div>
        </div>
      </div>`;
    } else if (this.step === 'code') {
      const d = this.code.split('');
      body = `<div class="stage" style="grid-template-columns:1fr;text-align:center;padding:56px 36px">
        <div>
          <span class="lbl">Étape 2 sur 2 · ${esc(this.device)} trouvé</span>
          <h2 style="margin:16px 0 36px;font-size:36px;letter-spacing:-.04em;font-weight:600">Le même code s’affiche sur l’iPhone ?</h2>
          <div class="digits" aria-label="Code ${d.join(' ')}">${d.map((x, i) => `<span class="dg" style="animation-delay:${i * 0.12}s">${x}</span>`).join('')}</div>
          <p style="margin:26px auto;max-width:520px;color:var(--tx2);font-size:14px;line-height:1.55">Ce code vient des empreintes des deux appareils. S’il est différent, quelqu’un a peut-être affiché un faux QR : refuse.</p>
          <div class="row" style="justify-content:center">
            <button class="btn pri" type="button" data-act="yes" style="min-width:180px">Oui, relier</button>
            <button class="btn" type="button" data-act="no" style="min-width:140px">Non</button>
          </div>
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
  acts: {
    renew: () => {
      Pair.err = '';
      Pair.newOffer();
    },
    scan: async () => {
      try {
        const r = await invoke('demo_scan', { uri: Pair.offer.uri });
        Pair.code = r.code;
        Pair.device = r.device_name;
        Pair.step = 'code';
        Pair.err = '';
      } catch (e) {
        Pair.err = String(e);
      }
      Pair.paint();
    },
    yes: async () => {
      try {
        await invoke('pair_answer', { accept: true });
      } catch (e) {
        Pair.err = String(e);
        Pair.newOffer();
        return;
      }
      Pair.step = 'linked';
      Pair.paint();
      // E8: about 8 s of « liés », then slide to the home page.
      Pair.t1 = setTimeout(() => Pair.leave(), 8000);
    },
    no: async () => {
      await invoke('pair_answer', { accept: false });
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
const RATIO_L = ['16:9', '4:3', '1:1', '9:16'];
const RATIO_CSS = ['16 / 9', '4 / 3', '1 / 1', '9 / 16'];
const RATE = [0, 8, 20, 40, 80];
const PROFILES = [['Appel', 2, 2], ['Stream', 0, 3], ['Cours', 3, 2]];
const CAM_DEFAULTS = {
  res: 0, fps: 3, ratio: 0, codec: 0, rate: 0, hdr: false, autoq: true,
  ev: 0, iso: 400, wb: 5600, focus: 50, zoom: 10, stab: 1, isoA: true, wbA: true, afA: true, torch: false, mirror: false,
  lut: 0, blur: 35, light: 50, ct: 50, sat: 50, temp: 0, sharp: 30, vig: 20, frame: false,
  msg: 'Je reviens bientôt', multi: true, wst: 0, prof: 1, lens: 1, front: false,
};
const LANGS = ['Je reviens bientôt', 'Be right back', 'Vuelvo enseguida', 'Bin gleich zurück', 'Torno subito', 'Volto já', 'すぐ戻ります', '곧 돌아올게요'];

const Cam = {
  key: () => '',
  mount(root) {
    this.cs = Object.assign({}, CAM_DEFAULTS, settings.cam || {});
    this.live = false; // ADR-0018: Cam always starts paused
    this.panel = '';
    this.tab = 0;
    this.spark = [];
    this.overlayKey = '';
    root.innerHTML = `
      <main class="cam-wrap enter">
        <div class="pv" id="c-pv">
          <div class="scene" id="c-scene" role="img" aria-label="Aperçu de la caméra (simulé)">
            <div class="bgl" id="c-bgl">
              <span class="bk" style="left:6%;top:12%;width:150px;height:150px;background:#FFB547"></span>
              <span class="bk" style="left:72%;top:6%;width:190px;height:190px;background:#FF7A66;animation-delay:-3s"></span>
              <span class="bk" style="left:84%;top:52%;width:100px;height:100px;background:#5FD4F4;opacity:.35;animation-delay:-6s"></span>
              <span class="bk" style="left:18%;top:62%;width:120px;height:120px;background:#FFD7A8;opacity:.25;animation-delay:-2s"></span>
              <span class="shelf"></span><span class="plant"></span>
            </div>
            <div class="person"><span class="hd"></span><span class="bd"></span></div>
          </div>
          <div class="tint" id="c-tint"></div>
          <div class="vig" id="c-vig"></div>
          <div id="c-crop"></div>
          <div id="c-wait"></div>
          <div class="hud" style="left:18px;top:18px" id="c-hudl"></div>
          <div class="hud" style="right:18px;top:18px" id="c-hudr"></div>
          <div id="c-notice"></div>
          <div class="dock" role="toolbar" aria-label="Commandes de la caméra" id="c-dock"></div>
        </div>
        <div class="under">
          <span>Webcam Windows et plugin OBS : <b>pas encore installés</b> · <span id="c-camname"></span> · aperçu simulé</span>
          <span>Batterie, chaleur et réseau : visibles ici seulement, jamais dans l’image envoyée.</span>
        </div>
      </main>`;
    this.paintScene();
    this.paintDock();
    this.push();
  },
  unmount() {
    // Leaving the page pauses the camera: nothing is sent while nobody looks.
    this.live = false;
    this.push();
  },
  connected: () => !!(S && S.connected),
  push() {
    const c = this.cs;
    invoke('cam_set', {
      live: this.live,
      quality: { height: RES[c.res], fps: FPS[c.fps], bitrate_mbps: RATE[c.rate], adapt: c.autoq },
    });
  },
  save() {
    clearTimeout(this.saveT);
    this.saveT = setTimeout(() => {
      settings.cam = this.cs;
      saveSettings();
    }, 400);
  },
  paintScene() {
    const c = this.cs;
    let f = `brightness(${(1 + (c.light - 50) / 160 + c.ev * 0.12).toFixed(2)}) contrast(${(1 + (c.ct - 50) / 90 + c.sharp / 1000).toFixed(2)}) saturate(${(c.lut === 5 ? 0 : c.sat / 50).toFixed(2)})`;
    if (c.lut === 1) f += ' contrast(.92) brightness(1.05)';
    if (c.lut === 2) f += ' contrast(1.15) saturate(.8)';
    if (c.lut === 3) f += ' sepia(.28)';
    if (c.lut === 4) f += ' hue-rotate(-14deg)';
    const sc = [0.84, 1, 1.35, 1.9][c.lens] * (c.zoom / 10);
    const scene = $('#c-scene');
    if (!scene) return;
    scene.style.filter = f;
    scene.style.transform = `scale(${sc.toFixed(3)})${c.mirror ? ' scaleX(-1)' : ''}`;
    $('#c-bgl').style.filter = `blur(${(c.blur / 100 * 16).toFixed(1)}px)`;
    $('#c-tint').style.background = c.temp >= 0 ? `rgba(255,140,50,${(c.temp / 50 * 0.35).toFixed(2)})` : `rgba(80,160,255,${(-c.temp / 50 * 0.35).toFixed(2)})`;
    $('#c-vig').style.opacity = (c.vig / 100).toFixed(2);
    $('#c-crop').innerHTML = c.ratio ? `<div class="crop" style="aspect-ratio:${RATIO_CSS[c.ratio]}"></div>` : '';
    $('#c-camname').textContent = c.front ? 'caméra avant' : 'caméra arrière';
  },
  paintWait() {
    const c = this.cs;
    const conn = this.connected();
    const show = !this.live || !conn;
    const key = [show, conn, c.wst, c.multi, c.msg].join('|');
    if (key === this.overlayKey) return;
    this.overlayKey = key;
    if (!show) {
      $('#c-wait').innerHTML = '';
      return;
    }
    const cycle = c.multi && c.msg === CAM_DEFAULTS.msg;
    const text = cycle
      ? `<div class="langs" aria-label="${esc(c.msg)}">${LANGS.map((l, i) => `<span class="lg" style="animation-delay:${i * 2.4}s">${esc(l)}</span>`).join('')}</div>`
      : `<div class="static">${esc(c.msg)}</div>`;
    const sub = !S || !S.device
      ? `<div class="wait-sub">Aucun iPhone relié. <a href="#pair" style="color:var(--li)">Relier un iPhone</a></div>`
      : conn ? '' : '<div class="wait-sub">Ouvre Hyphn sur l’iPhone pour afficher la caméra.</div>';
    $('#c-wait').innerHTML = `<div class="wait${c.wst === 2 ? ' blur' : ''}">
      ${c.wst === 0 ? `<svg class="tr" viewBox="0 0 400 300" preserveAspectRatio="none" aria-hidden="true">${waves(12, 40, 20, 0.3)}</svg>` : ''}
      <div class="bigmark" aria-hidden="true"><span class="d"></span><span class="b"></span><span class="d"></span></div>
      ${text}<div class="dots3" aria-hidden="true"><i></i><i></i><i></i></div>${sub}</div>`;
  },
  paintDock() {
    const c = this.cs;
    const conn = this.connected();
    const live = this.live && conn;
    $('#c-dock').innerHTML = `
      <button class="pz ${live ? 'live' : 'paused'}" type="button" data-act="pause" ${conn ? '' : 'disabled'}>${live ? I.pause + 'Pause' : I.play + 'Afficher la caméra'}</button>
      <div class="lens" role="group" aria-label="Objectif">${['0,5×', '1×', '2×', '5×'].map((n, i) => `<button type="button" class="${i === c.lens ? 'on' : ''}" data-act="set" data-k="lens" data-v="${i}">${n}</button>`).join('')}</div>
      <button class="db" type="button" aria-label="Retourner la caméra" data-act="flipcam">${I.flip}</button>
      <button class="db" type="button" aria-label="Prendre une photo 48 Mpx" data-act="shot">${I.photo}</button>
      <span class="sep"></span>
      <button class="db${this.panel === 'info' ? ' on' : ''}" type="button" aria-label="Infos du flux" data-act="panel" data-v="info">${I.info}</button>
      <button class="db${this.panel === 'set' ? ' on' : ''}" type="button" aria-label="Réglages de la caméra" data-act="panel" data-v="set">${I.sliders}</button>`;
  },
  paintHud() {
    const conn = this.connected();
    const live = this.live && conn;
    const q = S.cam.effective.quality;
    const qual = `${resName(q.height)} · ${q.fps} · ${this.cs.codec === 0 ? 'HEVC' : 'H.264'}`;
    $('#c-hudl').innerHTML = (live
      ? '<span class="chip" style="color:#FFB3A6"><span class="rec"></span>EN DIRECT</span>'
      : `<span class="chip">${I.pause}En pause · tes apps voient l’écran d’attente</span>`) + `<span class="chip mono">${qual}</span>`;
    const p = S.pulse;
    if (!S.device || !p) {
      $('#c-hudr').innerHTML = '';
    } else {
      const low = p.battery != null && p.battery < 15 && p.charge === 'unplugged';
      const bc = low ? '#FF7A66' : '#B9F25A';
      $('#c-hudr').innerHTML = `
        <span class="chip" style="color:${bc}"><span class="batt" aria-hidden="true"><i style="width:${p.battery ?? 0}%"></i></span><span class="mono">${p.battery ?? '—'} %</span>${p.charge !== 'unplugged' ? svg('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>', ' aria-label="en charge"') : ''}</span>
        <span class="chip"><span class="tdot" style="background:${HEAT_COLOR[p.thermal] || '#868F9D'}"></span>${p.thermal ? HEAT[p.thermal] : 'inconnu'}</span>
        <span class="chip">${I.wifi}<span class="mono">${conn ? S.latency_ms + ' ms' : 'hors ligne'}</span></span>`;
    }
    const e = S.cam.effective;
    $('#c-notice').innerHTML = !conn ? '' : e.alert
      ? '<div class="notice hot">iPhone très chaud : Hyphn passe en 1080p30 pour garder le flux</div>'
      : e.lowered ? '<div class="notice">iPhone chaud : Hyphn passe à 30 images/s pour garder le flux</div>' : '';
  },
  update() {
    if (!this.connected() && this.live) {
      this.live = false;
      this.push();
    }
    const dockKey = this.connected() + '|' + this.live;
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
    const st = S.cam.stats, q = S.cam.effective.quality, p = S.pulse || {};
    const max = Math.max(1, ...this.spark);
    const bars = Array.from({ length: 40 }, (_, i) => this.spark[i - (40 - this.spark.length)] ?? 0)
      .map((v) => `<i style="height:${Math.max(4, Math.round(v / max * 90))}%"></i>`).join('');
    const body = `
      <div class="spark" aria-hidden="true">${bars}</div>
      <div class="ig">
        <div class="icell"><div class="k">Image envoyée</div><div class="v">${resName(q.height)} · ${q.fps}</div><div class="h">encodage matériel sur l’iPhone</div></div>
        <div class="icell"><div class="k">Débit réseau</div><div class="v">${n1(st.bitrate_mbps)} Mb/s</div><div class="h">chiffré</div></div>
        <div class="icell"><div class="k">Images par seconde</div><div class="v">${n1(st.fps)}</div><div class="h">reçues par le PC</div></div>
        <div class="icell"><div class="k">Latence</div><div class="v">${st.latency_ms} ms</div><div class="h">de l’objectif à l’écran</div></div>
        <div class="icell"><div class="k">Images perdues</div><div class="v">${st.dropped}</div><div class="h">depuis le début</div></div>
        <div class="icell"><div class="k">iPhone</div><div class="v">${p.battery ?? '—'} % · ${p.thermal ? HEAT[p.thermal] : 'inconnu'}</div><div class="h">${p.charge ? CHARGE[p.charge] : 'inconnu'}</div></div>
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
            <div><div style="font-size:20px;font-weight:600;letter-spacing:-.03em">Infos du flux <span class="demo-tag">démo</span></div><div class="muted" style="margin-top:2px">Mis à jour chaque seconde</div></div>
            <button class="ib" type="button" aria-label="Fermer" data-act="close">${I.close}</button>
          </div>
          <div id="c-info"></div>
        </div>`;
      this.paintInfo();
    } else {
      layer.innerHTML = `<button class="scrim" type="button" aria-label="Fermer les réglages" data-act="close"></button>
        <aside class="drawer" aria-label="Réglages de la caméra">
          <div class="dh">
            <div><div style="font-size:20px;font-weight:600;letter-spacing:-.03em">Réglages de la caméra</div><div class="muted" style="margin-top:2px">Tout s’applique en direct</div></div>
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
    const slider = (k, label, min, max, step, fmt) => {
      const p = ((c[k] - min) / (max - min) * 100).toFixed(1);
      return `<label class="sl"><span class="r"><span>${esc(label)}</span><span class="val" id="v-${k}">${fmt(c[k])}</span></span>
        <input type="range" min="${min}" max="${max}" step="${step}" value="${c[k]}" data-input="slide" data-change="slid" data-k="${k}" style="background:linear-gradient(90deg,var(--co) ${p}%,color-mix(in srgb,var(--tx) 12%,transparent) ${p}%)"></label>`;
    };
    this.fmt = {
      ev: (v) => (v > 0 ? '+' : '') + Number(v).toFixed(1) + ' EV',
      iso: (v) => (c.isoA ? 'auto' : String(v)),
      wb: (v) => (c.wbA ? 'auto' : v + ' K'),
      focus: (v) => (c.afA ? 'auto' : v + ' %'),
      zoom: (v) => (v / 10).toFixed(1) + '×',
      temp: (v) => (v > 0 ? '+' : '') + v,
      pct: (v) => v + ' %',
    };
    const F = this.fmt;
    let body = '';
    if (this.tab === 0) {
      body = `
        <div class="grp"><span class="gl">Résolution</span>${chips(RES_L, 'res')}</div>
        <div class="grp"><span class="gl">Images par seconde</span>${chips(FPS.map(String), 'fps')}<span class="muted" style="font-size:12px">120 images/s seulement en 1080p et moins.</span></div>
        <div class="grp"><span class="gl">Format de l’image</span>${chips(RATIO_L, 'ratio')}</div>
        <div class="grp"><span class="gl">Codec</span>${chips(['HEVC', 'H.264'], 'codec')}</div>
        <div class="grp"><span class="gl">Débit (Mb/s)</span>${chips(['Auto', '8', '20', '40', '80'], 'rate')}</div>
        <div class="grp">${tog('hdr', 'HDR (consomme plus)')}${tog('autoq', 'Baisser la qualité si l’iPhone chauffe')}</div>`;
    } else if (this.tab === 1) {
      body = slider('ev', 'Exposition', -2, 2, 0.1, F.ev) + slider('iso', 'ISO', 32, 3200, 1, F.iso) + slider('wb', 'Balance des blancs', 2500, 8000, 100, F.wb)
        + slider('focus', 'Mise au point', 0, 100, 1, F.focus) + slider('zoom', 'Zoom fin', 10, 60, 1, F.zoom)
        + `<div class="grp"><span class="gl">Stabilisation</span>${chips(['Off', 'Standard', 'Cinéma'], 'stab')}</div>
        <div class="grp">${tog('isoA', 'ISO automatique')}${tog('wbA', 'Balance des blancs auto')}${tog('afA', 'Mise au point auto (suit le visage)')}${tog('torch', 'Lampe de l’iPhone')}${tog('mirror', 'Miroir')}</div>`;
    } else if (this.tab === 2) {
      body = `<div class="gl">Effets<span class="gpu">calculés par la carte graphique du PC</span></div>
        <div class="grp"><span class="gl">Filtre</span>${chips(['Naturel', 'Doux', 'Ciné', 'Chaud', 'Froid', 'N&B'], 'lut')}</div>`
        + slider('blur', 'Flou d’arrière-plan', 0, 100, 1, F.pct) + slider('light', 'Lumière du visage', 0, 100, 1, F.pct)
        + slider('ct', 'Contraste', 0, 100, 1, F.pct) + slider('sat', 'Couleurs', 0, 100, 1, F.pct)
        + slider('temp', 'Chaleur des couleurs', -50, 50, 1, F.temp) + slider('sharp', 'Netteté', 0, 100, 1, F.pct)
        + slider('vig', 'Vignette', 0, 100, 1, F.pct)
        + `<div class="grp">${tog('frame', 'Cadrage auto (te garde au centre)')}</div>`;
    } else {
      body = `<label class="grp"><span class="gl">Message de l’écran d’attente</span><input class="txt" type="text" maxlength="60" value="${esc(c.msg)}" data-change="msg"></label>
        <div class="grp">${tog('multi', 'Afficher le message dans toutes les langues')}</div>
        <div class="grp"><span class="gl">Style</span>${chips(['Trame', 'Minimal', 'Scène floutée'], 'wst')}</div>
        <span style="font-size:13px;color:var(--tx2);line-height:1.5">La caméra démarre toujours en pause : Discord ou OBS voient cet écran tant que tu n’as pas cliqué « Afficher la caméra ».</span>`;
    }
    const el = $('#c-drawer');
    if (!el) return;
    el.style.cssText = 'display:flex;flex-direction:column;flex:1;min-height:0';
    el.innerHTML = `
      <div style="padding:0 22px 14px"><div class="chips">${PROFILES.map(([n], i) => `<button type="button" class="cp${c.prof === i ? ' on' : ''}" data-act="profile" data-v="${i}">${n}</button>`).join('')}</div></div>
      <div class="tabs" role="tablist">${['Qualité', 'Caméra', 'Effets', 'Pause'].map((n, i) => `<button type="button" role="tab" aria-selected="${i === this.tab}" class="${i === this.tab ? 'on' : ''}" data-act="tab" data-v="${i}">${n}</button>`).join('')}</div>
      <div class="dbody">${body}</div>`;
  },
  changed(quality) {
    this.paintScene();
    this.paintWait();
    if (this.panel === 'set') {
      const scroll = $('.dbody') ? $('.dbody').scrollTop : 0;
      this.paintDrawer();
      if ($('.dbody')) $('.dbody').scrollTop = scroll;
    }
    if (quality) this.push();
    this.save();
  },
  acts: {
    pause: () => {
      Cam.live = !Cam.live;
      Cam.push();
      Cam.update();
    },
    set: (el) => {
      const k = el.dataset.k;
      Cam.cs[k] = Number(el.dataset.v);
      if (k === 'lens') Cam.paintDock();
      Cam.changed(['res', 'fps', 'rate'].includes(k));
    },
    toggle: (el) => {
      const k = el.dataset.k;
      Cam.cs[k] = !Cam.cs[k];
      Cam.changed(k === 'autoq');
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
    flipcam: () => {
      Cam.cs.front = !Cam.cs.front;
      Cam.changed(false);
    },
    shot: () => toast('Photo 48 Mpx : arrive avec l’app iPhone', 'info'),
    slide: (el) => {
      const k = el.dataset.k;
      Cam.cs[k] = Number(el.value);
      const min = Number(el.min), max = Number(el.max);
      const p = ((Cam.cs[k] - min) / (max - min) * 100).toFixed(1);
      el.style.background = `linear-gradient(90deg,var(--co) ${p}%,color-mix(in srgb,var(--tx) 12%,transparent) ${p}%)`;
      const f = Cam.fmt[k] || Cam.fmt.pct;
      $('#v-' + k).textContent = f(Cam.cs[k]);
      Cam.paintScene();
    },
    slid: () => Cam.save(),
    msg: (el) => {
      Cam.cs.msg = el.value.trim() || CAM_DEFAULTS.msg;
      Cam.changed(false);
    },
  },
};

// ===================================================================
// Drop
// ===================================================================
const GRADS = [['#FFB547', '#FF7A66'], ['#5FD4F4', '#2D6CDF'], ['#B9F25A', '#3E9B4F'], ['#F3D9C0', '#A0705A'], ['#8E7CFF', '#4A3BB5'], ['#FFB547', '#D2552F'], ['#5FD4F4', '#0E8C80'], ['#EEF1F5', '#7C8594']];
const grad = (i) => `linear-gradient(135deg,${GRADS[i % 8][0]},${GRADS[i % 8][1]})`;

const Drop = {
  key() {
    if (!S) return '';
    const t = S.transfer;
    return [!!S.device, S.connected, t ? t.direction + t.state : 'none', S.new_photos > 0].join('|');
  },
  mount(root) {
    const t = S && S.transfer;
    const conn = S && S.connected;
    let ban = '';
    if (t && t.state === 'waiting') ban = `<div class="ban w">${I.wifiOff}<span><strong>En pause, l’iPhone ne répond plus.</strong> Ça reprend tout seul quand Hyphn est rouvert sur l’iPhone, sans rien renvoyer.</span></div>`;
    if (t && t.state === 'done') {
      const dup = t.direction === 'in' && t.duplicates ? ` ${t.duplicates} doublons ignorés.` : '';
      ban = `<div class="ban ok">${I.check}<span><strong>C’est fini.</strong> ${nf.format(t.items_total)} éléments ${t.direction === 'in' ? 'reçus' : 'envoyés'} et vérifiés un par un.${dup}</span></div>`;
    }
    const moving = t && t.state === 'running';
    const flightCls = 'flight' + (t && t.direction === 'out' ? ' rev' : '') + (t ? (moving ? '' : ' stop') : ' idle');
    let right;
    if (t) {
      const btns = t.state === 'done'
        ? `${t.direction === 'in' ? `<button class="btn cy" type="button" data-act="open">${I.folder}Ouvrir le dossier</button>` : ''}<button class="btn" type="button" data-act="dismiss">OK</button>`
        : `<button class="btn" type="button" data-act="pause">${t.state === 'paused' ? 'Reprendre' : 'Pause'}</button><button class="btn" type="button" data-act="cancel">Annuler</button>`;
      right = `<span class="lbl" id="d-phase">—</span>
        <div class="big" style="margin-top:10px" id="d-pct">0<small>%</small></div>
        <div class="prog"><i id="d-bar" style="width:0%"></i></div>
        <div class="say" id="d-say">—</div>
        <div class="row" style="margin-top:20px">${btns}</div>`;
    } else if (!S || !S.device) {
      right = `<span class="lbl">Drop</span><div class="say" style="margin-top:12px;font-size:18px">Relie d’abord ton iPhone pour échanger des photos et des fichiers.</div>
        <div class="row" style="margin-top:20px"><a class="btn pri" href="#pair">Relier un iPhone</a></div>`;
    } else if (!conn) {
      right = `<span class="lbl">iPhone en veille</span><div class="say" style="margin-top:12px;font-size:18px">Ouvre Hyphn sur l’iPhone pour recevoir tes photos.</div>`;
    } else if (S.new_photos > 0) {
      right = `<span class="lbl">Sur l’iPhone <span class="demo-tag">démo</span></span>
        <div class="big" style="margin-top:10px">${nf.format(S.new_photos)}</div>
        <div class="say" style="margin-top:12px">nouvelles photos et vidéos, rangées par date à l’arrivée.</div>
        <div class="row" style="margin-top:20px"><button class="btn cy" type="button" data-act="receive">${I.down}Recevoir les photos</button></div>`;
    } else {
      right = `<span class="lbl">Sur l’iPhone</span><div class="say" style="margin-top:12px;font-size:18px">Tout est déjà sur ce PC.</div>`;
    }
    const sortTxt = { year_month: 'Rangé tout seul par année et par mois, selon la vraie date de la photo.', year: 'Rangé tout seul par année, selon la vraie date de la photo.', flat: 'Tout dans le même dossier.' }[settings.sort];
    root.innerHTML = `
      <main class="wrap enter">
        ${ban}
        <section class="card">
          <div class="dhero">
            <div class="${flightCls}">
              <svg class="pth" viewBox="0 0 560 200" aria-hidden="true"><path d="M 76 150 C 200 0, 360 0, 484 150" style="stroke:color-mix(in srgb,var(--cy) 35%,transparent);stroke-width:1.5;stroke-dasharray:4 7"/></svg>
              <div class="end" style="left:0">${I.phone}</div>
              <div class="end pc" style="left:484px">${I.folder}</div>
              ${GRADS.map((_, i) => `<span class="ph" style="background:${grad(i)};animation-delay:${i * 0.4}s"></span>`).join('')}
            </div>
            <div>${right}</div>
          </div>
        </section>
        <div class="two">
          <section class="card">
            <div class="row" style="justify-content:space-between;gap:12px">
              <span class="lbl">Où vont tes photos</span>
              <button class="btn mono sm" type="button" data-act="pick" title="Changer de dossier">${esc(settings.photos_dir)}</button>
            </div>
            <div style="margin-top:10px" id="d-sum"><div class="muted">Lecture du dossier…</div></div>
            <p class="muted" style="margin:12px 0 0">${sortTxt}</p>
          </section>
          <section class="card">
            <span class="lbl">Envoyer vers l’iPhone</span>
            <button class="zone" id="d-zone" type="button" data-act="files" ${conn && !(t && t.state !== 'done') ? '' : 'disabled'}>
              ${I.up}
              <div class="t">Glisse des fichiers ici</div>
              <div style="font-size:13px;margin-top:6px">ou clique pour choisir · photos et vidéos → app Photos, le reste → app Fichiers</div>
            </button>
          </section>
        </div>
        <section class="card">
          <span class="lbl">Derniers envois</span>
          <div class="hist" id="d-hist"></div>
        </section>
      </main>`;
    this.loadSummary();
  },
  async loadSummary() {
    const rows = await invoke('drop_summary');
    const el = $('#d-sum');
    if (!el) return;
    el.innerHTML = rows.length
      ? rows.map((r, i) => `<div class="mrow"><span class="stack" aria-hidden="true">${[0, 1, 2].map((j) => `<i style="background:${grad(i * 3 + j)}"></i>`).join('')}</span>${esc(r.label)}<span class="n mono">${nf.format(r.files)} · ${bytes(r.bytes)}</span></div>`).join('')
      : '<div class="mrow muted">Le dossier est vide pour l’instant.</div>';
  },
  update() {
    const t = S.transfer;
    if (t && $('#d-pct')) {
      const pct = t.bytes_done / t.bytes_total * 100;
      $('#d-pct').innerHTML = `${Math.floor(pct)}<small>%</small>`;
      $('#d-bar').style.width = pct.toFixed(1) + '%';
      const what = t.direction === 'in' ? 'photos et vidéos' : 'fichiers';
      $('#d-phase').textContent = t.state === 'done' ? 'Terminé' : t.state === 'running' ? (t.direction === 'in' ? 'Réception depuis l’iPhone' : 'Envoi vers l’iPhone') : 'En pause';
      const left = (t.bytes_total - t.bytes_done) / t.speed_bps / 60;
      const eta = t.state === 'done' ? 'Terminé.' : t.state !== 'running' ? 'En pause.'
        : left < 1 ? 'Encore moins d’une minute.' : `Encore environ ${Math.ceil(left)} min, à ${Math.round(t.speed_bps / 1e6)} Mo/s.`;
      $('#d-say').innerHTML = `<b>${nf.format(t.items_done)}</b> sur ${nf.format(t.items_total)} ${what} · <b>${bytes(t.bytes_done)}</b> sur ${bytes(t.bytes_total)}<br>${eta}`;
    }
    const h = $('#d-hist');
    if (h) {
      const html = S.history.length
        ? S.history.slice(0, 6).map((e) => `<div class="hr"><span class="d mono">${when(e.at)}</span><span>${e.direction === 'in' ? 'iPhone → PC' : 'PC → iPhone'}</span><span class="mono">${nf.format(e.items)} élément${e.items > 1 ? 's' : ''} · ${bytes(e.bytes)}</span><span class="ok">${I.check}tout vérifié</span></div>`).join('')
        : '<div class="hr muted">Rien pour l’instant.</div>';
      if (h.innerHTML !== html) h.innerHTML = html;
    }
  },
  acts: {
    receive: () => invoke('drop_action', { action: 'receive' }).then(refresh),
    pause: () => invoke('drop_action', { action: 'pause' }).then(refresh),
    cancel: () => invoke('drop_action', { action: 'cancel' }).then(refresh),
    dismiss: () => invoke('drop_action', { action: 'dismiss' }).then(refresh),
    open: () => invoke('open_photos_dir').catch((e) => toast(String(e), 'info')),
    pick: async () => {
      const dir = await invoke('pick_photos_dir');
      if (!dir) return;
      settings.photos_dir = dir;
      await saveSettings();
      mount(true);
    },
    files: async () => {
      const paths = await invoke('drop_pick_files');
      if (paths.length) {
        await invoke('drop_send', { paths });
        refresh();
      }
    },
  },
};

// Files dragged from Windows onto the window (Tauri gives real paths).
try {
  window.__TAURI__.webview.getCurrentWebview().onDragDropEvent(async (e) => {
    const zone = $('#d-zone');
    if (!zone || zone.disabled) return;
    const type = e.payload.type;
    zone.classList.toggle('over', type === 'enter' || type === 'over');
    if (type === 'drop' && e.payload.paths.length) {
      await invoke('drop_send', { paths: e.payload.paths });
      refresh();
    }
  });
} catch (err) {
  console.warn('drag and drop unavailable', err);
}

// ===================================================================
// Réglages
// ===================================================================
const Settings = {
  key: () => (S && S.device ? S.device.fingerprint : 'none'),
  mount(root) {
    this.asking = false;
    this.root = root;
    this.paint();
  },
  paint() {
    const s = settings;
    const d = S && S.device;
    const tog = (k, label, hint) => `<button class="tg" type="button" data-act="toggle" data-k="${k}" aria-pressed="${s[k]}"><span>${esc(label)}${hint ? `<span class="h" style="display:block;font-size:12px;color:var(--tx3);margin-top:2px">${esc(hint)}</span>` : ''}</span><span class="sw${s[k] ? ' on' : ''}"></span></button>`;
    const device = d
      ? `<div class="line"><span>${esc(d.name)} <span class="demo-tag">démo</span><span class="h">Relié le ${dateFr(d.paired_at)} · pour toujours, jusqu’à « Oublier » · empreinte <span class="mono">${esc(d.fingerprint)}</span></span></span><button class="btn bad sm" type="button" data-act="ask">Oublier</button></div>
        ${this.asking ? `<div class="confirm" role="alertdialog" aria-label="Confirmer l’oubli">
          <span><strong>Oublier ${esc(d.name)} ?</strong> Il faudra scanner un nouveau QR pour le relier.</span>
          <div class="row" style="gap:8px"><button class="btn badf sm" type="button" data-act="forget">Oublier</button><button class="btn sm" type="button" data-act="cancel">Annuler</button></div>
        </div>` : ''}
        <div class="line"><span>Relier un autre iPhone<span class="h">Il remplace celui-ci</span></span><a class="btn sm" href="#pair">Relier</a></div>`
      : `<div class="line"><span>Aucun iPhone relié</span><a class="btn pri sm" href="#pair">Relier un iPhone</a></div>`;
    const p = (S && S.pulse) || {};
    const demo = d ? `
      <section class="scard" style="--c:var(--am)">
        <div class="ct">${I.flask}iPhone simulé <span class="demo-tag">démo</span></div>
        <p class="muted" style="margin:0 0 8px">En attendant l’app iPhone, ces boutons jouent son rôle (ADR-0019).</p>
        <button class="tg" type="button" data-act="demo" data-k="open" aria-pressed="${S.connected}">Hyphn ouvert sur l’iPhone<span class="sw${S.connected ? ' on' : ''}"></span></button>
        <div class="line"><label for="dm-heat">Chaleur</label><select id="dm-heat" class="sel" data-change="demoheat">${Object.entries(HEAT).map(([k, v]) => `<option value="${k}"${p.thermal === k ? ' selected' : ''}>${v}</option>`).join('')}</select></div>
        <div class="line"><label for="dm-bat">Batterie</label><span class="row"><input id="dm-bat" class="range" type="range" min="1" max="100" value="${p.battery ?? 50}" data-change="demobat"><span class="mono" id="dm-batv" style="width:44px;text-align:right">${p.battery ?? '—'} %</span></span></div>
        <button class="tg" type="button" data-act="demo" data-k="charging" aria-pressed="${p.charge !== 'unplugged'}">En charge<span class="sw${p.charge !== 'unplugged' ? ' on' : ''}"></span></button>
      </section>` : '';
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
            <div class="line"><span>Webcam Windows<span class="h">Les apps la verront sous le nom « Hyphn Cam »</span></span><span class="todo">pas encore (phase 5)</span></div>
            <div class="line"><span>Plugin OBS</span><span class="todo">pas encore (phase 5)</span></div>
            <div class="line"><span>Réglages de l’image<span class="h">Qualité, caméra, effets, écran d’attente</span></span><a class="btn sm" href="#cam">Ouvrir Cam</a></div>
          </section>
          <section class="scard" style="--c:var(--cy)">
            <div class="ct">${I.swap}Drop</div>
            <div class="line"><span>Dossier des photos</span><button class="btn mono sm" type="button" data-act="pick">${esc(s.photos_dir)}</button></div>
            <div class="line"><label for="rg">Rangement</label><select id="rg" class="sel" data-change="sort">${[['year_month', 'Année / Mois'], ['year', 'Année'], ['flat', 'Tout ensemble']].map(([k, n]) => `<option value="${k}"${s.sort === k ? ' selected' : ''}>${n}</option>`).join('')}</select></div>
            <div class="line"><span>Vérification<span class="h">Chaque fichier est comparé à l’arrivée</span></span><span class="ok">${I.check}toujours</span></div>
          </section>
          <section class="scard" style="--c:var(--am)">
            <div class="ct">${I.bolt}Alertes</div>
            ${tog('low_battery_alert', 'Prévenir sous 15 % de batterie', 'Quand l’iPhone n’est pas en charge')}
          </section>
          ${demo}
        </div>
        <div class="mono" style="text-align:center;font-size:12px;color:var(--tx3)">Hyphn ${S ? S.version : ''} · protocole v1 · ${esc(S ? S.pc_name : '')} · empreinte ${esc(S ? S.pc_fingerprint : '')}</div>
      </main>`;
  },
  update() {
    // Only the demo battery value moves on its own; the rest changes on click.
    const v = $('#dm-batv');
    if (v && S.pulse && document.activeElement !== $('#dm-bat')) {
      v.textContent = `${S.pulse.battery} %`;
      $('#dm-bat').value = S.pulse.battery;
    }
  },
  demoControls(over) {
    const p = S.pulse || {};
    return Object.assign({ open: S.connected, thermal: p.thermal || 'nominal', battery: p.battery ?? 50, charging: p.charge !== 'unplugged' }, over);
  },
  async demoSet(over) {
    await invoke('demo_set', { controls: this.demoControls(over) });
    await refresh();
    this.paint();
  },
  acts: {
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
    demo: (el) => {
      const k = el.dataset.k;
      const cur = Settings.demoControls({});
      Settings.demoSet({ [k]: !cur[k] });
    },
    demoheat: (el) => Settings.demoSet({ thermal: el.value }),
    demobat: (el) => Settings.demoSet({ battery: Number(el.value) }),
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
})();
