// Hyphn PC interface. Design V2 (ADR-0016). Every iPhone value comes from the
// Rust side (`link`), which talks to the real iPhone app over TLS.
'use strict';

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Info bubbles (RULES, PC): every setting, icon button and number explains
// itself in plain words: [title, what it does, advice]. A new setting comes
// with its text here.
const TIPS = {
  // Cam › Réglages
  profile: ['Profil', 'Règle tout d’un coup, selon ce que tu fais.', 'Max pour la plus belle image. Appel pour Discord ou Teams. Économie si l’iPhone n’est pas branché.'],
  adjclose: ['Fermer', 'Cache le panneau pour voir l’image entière. Les réglages restent appliqués.'],
  manual: ['Auto ou Manuel', 'Auto : l’iPhone règle tout seul selon la scène. Manuel : c’est toi qui choisis, et ça ne bouge plus.', 'Auto convient presque toujours.'],
  reset: ['Remettre', 'Remet ce réglage comme au départ.'],
  greset: ['Remettre la catégorie', 'Remet tous les réglages de cette catégorie comme au départ.'],
  allreset: ['Tout remettre', 'Remet toute la caméra comme au départ : profil Max, tout en Auto.'],
  update: ['App iPhone à jour', 'Cette version de l’app iPhone ne dit pas encore ce que sa caméra sait faire. Installe la dernière pour avoir tous les réglages.'],
  power: ['Si l’iPhone chauffe', 'Ce que fait Hyphn quand l’iPhone chauffe ou que sa batterie baisse.', 'S’il devient très chaud, l’image passe toujours en 1080p : sinon iOS couperait la caméra.'],
  ev: ['Plus sombre ou plus clair', 'L’iPhone règle la lumière tout seul ; ce curseur la corrige un peu. Vers la droite, l’image est plus claire. Le chiffre compte en « crans » de lumière : +1 donne deux fois plus de lumière.', 'Devant une fenêtre, ton visage est sombre : pousse vers la droite.'],
  iso: ['Sensibilité', 'Rend l’image plus claire, mais ajoute du grain (des petits points).', '100 à 400 de jour, 800 et plus dans une pièce sombre.'],
  shutter: ['Vitesse', 'Le temps pendant lequel chaque image prend la lumière. Plus long : plus clair, mais flou quand tu bouges.', '1/50 ou 1/100 : les lampes ne clignotent pas à l’image.'],
  focusP: ['Distance', 'À quelle distance l’image est nette, en Manuel.', 'Une personne devant son bureau : vers 30 %.'],
  wbK: ['Chaleur des couleurs', 'Vers la gauche, l’image devient plus bleue ; vers la droite, plus orange.', 'Sous une lampe jaune, va vers la gauche.'],
  tint: ['Teinte', 'Corrige une image trop verte ou trop rose.', 'Utile sous des néons. Sinon, laisse au milieu.'],
  zoom: ['Zoom', 'Rapproche l’image, en plus de l’objectif choisi en bas.', 'Au-delà de 2×, l’image est moins nette : prends plutôt l’objectif suivant.'],
  poi: ['Point suivi', 'Clique sur l’image : la netteté et la lumière suivent ce point.', 'Pratique pour montrer un objet à la caméra.'],
  stab: ['Anti-tremblement', 'Calme l’image quand l’iPhone bouge.', 'Coupé si l’iPhone est sur un pied : pas de retard en plus.'],
  hdr: ['Contre-jour', 'Garde les détails dans les parties très claires et très sombres, par exemple une fenêtre derrière toi.', 'Coupé par défaut : il fait chauffer l’iPhone.'],
  torch: ['Lampe', 'Allume la lampe à l’arrière de l’iPhone.', 'Elle chauffe et use la batterie.'],
  res: ['Taille de l’image', 'Plus grand : plus net, mais plus lourd à envoyer et un peu plus de retard.', 'Discord et Teams ne montrent pas plus que 1080p.'],
  fps: ['Fluidité', 'Combien d’images par seconde.', '60 pour des gestes fluides ; 30 pour un appel, l’iPhone chauffe moins.'],
  codec: ['Compression', 'Comment l’image est rendue plus légère avant l’envoi.', 'HEVC est deux fois plus léger. H.264 seulement si l’image ne s’affiche pas.'],
  rate: ['Débit', 'Combien de données partent chaque seconde. Plus : image plus fine.', 'Auto convient. Trop haut en Wi-Fi donne des saccades.'],
  msg: ['Message de pause', 'Le texte que voient Discord et OBS quand la caméra est en pause.'],
  multi: ['Toutes les langues', 'Le message défile en 18 langues, traduit sur ce PC.', 'Le moteur de traduction de Firefox : il se télécharge une fois, puis tout reste sur ce PC.'],
  wst: ['Style', 'Animé : l’enseigne néon bouge. Calme : la même, immobile.'],
  cat_profile: ['Profil', 'Règle la taille, la fluidité et la protection de l’iPhone d’un seul clic.'],
  cat_light: ['Lumière', 'Image plus claire ou plus sombre.'],
  cat_sharp: ['Netteté', 'Ce qui est net dans l’image.'],
  cat_color: ['Couleurs', 'Couleurs plus chaudes ou plus froides.'],
  cat_frame: ['Cadrage', 'Zoom, anti-tremblement, contre-jour et lampe.'],
  cat_stream: ['Envoi', 'Taille, fluidité et compression de l’image envoyée par l’iPhone.'],
  cat_wait: ['Pause', 'Ce que voient Discord et OBS quand la caméra est en pause.'],
  // Cam › barre du bas
  pause: ['Pause ou Afficher', 'Envoie l’image ou la met en pause. En pause, Discord voit l’écran de pause et l’iPhone se repose.'],
  lens: ['Objectif', '0,5× : très large. 1× : le principal, le plus net. 2× et 5× : zoom.', 'Changer d’objectif coupe l’image une demi-seconde.'],
  mirror: ['Miroir', 'Retourne l’image comme dans un miroir, pour toi et pour Discord. Le texte de l’écran de pause reste lisible.'],
  turn: ['Tourner', 'Tourne l’image d’un quart de tour à chaque clic, si l’iPhone est posé de travers.'],
  flipcam: ['Changer de caméra', 'Passe de la caméra arrière (la meilleure) à la caméra avant, et inversement.'],
  peek: ['Aperçu', 'Montre ou cache l’image sur ce PC pendant la pause. Discord ne la voit jamais.'],
  info: ['Infos du flux', 'Ce que l’iPhone envoie, l’état du lien et le retard de l’image, étape par étape.'],
  set: ['Réglages', 'Les réglages de la caméra, par-dessus l’image en direct.'],
  full: ['Plein écran', 'L’image prend tout l’écran. F11 ou Échap pour sortir.'],
  // Cam › en-tête de l’image
  hudq: ['Qualité', 'Taille et images par seconde envoyées en ce moment par l’iPhone.'],
  hudused: ['Webcam utilisée', 'Une app (Discord, Teams, OBS…) affiche en ce moment la webcam Hyphn.'],
  battery: ['Batterie', 'La batterie de l’iPhone. L’éclair : il est en charge.'],
  heat: ['Chaleur', 'La chaleur de l’iPhone selon iOS : Normale, Tiède, Chaude ou Très chaude.', 'Chaude : Hyphn baisse un peu l’image si ton profil le demande. Très chaude : 1080p, toujours.'],
  ping: ['Réponse du lien', 'Le temps pour qu’un message aille à l’iPhone et revienne.', 'Ce n’est pas le retard de l’image : il est dans Infos du flux.'],
  storage: ['Stockage', 'Place libre sur l’iPhone pour les photos et vidéos.'],
  // Cam › Infos du flux
  i_health: ['État du flux', 'Le résumé : tout va bien, ou ce qui ralentit l’image.'],
  i_sent: ['Image envoyée', 'Taille et images par seconde que l’iPhone envoie vraiment.', 'Plus bas que demandé : l’iPhone chauffe ou ton profil le baisse.'],
  i_codec: ['Compression', 'Le format de l’image en ce moment. HEVC est le plus léger.'],
  i_rate: ['Débit', 'Données reçues pendant la dernière seconde, en mégabits par seconde. La courbe montre les 40 dernières secondes.'],
  i_fps: ['Images reçues', 'Images arrivées pendant la dernière seconde.', 'Moins que demandé : l’iPhone ou le lien ne suit pas.'],
  i_ping: ['Réponse du lien', 'Le temps d’un aller-retour de message. Il mesure le lien, pas l’image.'],
  i_drop: ['Images sautées', 'Images jetées parce que l’affichage était en retard.', '0 ou presque : parfait.'],
  i_keys: ['Images complètes', 'Images envoyées en entier en une minute. Elles sont lourdes.', 'Environ 15 : normal.'],
  i_queue: ['Attente dans l’iPhone', 'Les données qui attendent de partir.', 'Plus de 0 ms : le lien ne suit pas, baisse le débit.'],
  i_delay: ['Retard de l’image', 'Le temps entre la vraie scène et l’image sur ce PC, étape par étape. Il manque quelques ms (capteur, écran).', 'Par câble : environ 80 ms en 720p et 130 ms en 4K.'],
  i_enc: ['Compression', 'Sur l’iPhone : de la prise de vue à l’image compressée.'],
  i_link: ['Trajet', 'De l’iPhone jusqu’au PC, par câble ou en Wi-Fi.'],
  i_dec: ['Décompression', 'Sur ce PC : la carte graphique décompresse l’image.'],
  i_draw: ['Affichage', 'L’attente du prochain rafraîchissement de l’écran.'],
  i_phone: ['iPhone', 'Batterie et chaleur de l’iPhone.'],
  // Réglages du PC
  launch_at_startup: ['Démarrer avec Windows', 'Hyphn se lance discrètement près de l’horloge, et l’iPhone se reconnecte tout seul.'],
  close_to_tray: ['Garder près de l’horloge', 'Fermer la fenêtre garde Hyphn ouvert : la webcam et la liaison continuent.', 'Coupé : fermer quitte Hyphn.'],
  theme: ['Apparence', 'Les couleurs de l’app. « Comme Windows » suit le mode clair ou sombre de Windows.'],
  low_battery_alert: ['Batterie faible', 'Prévient quand l’iPhone passe sous 15 % sans être en charge.'],
  photos_dir: ['Dossier', 'Où Drop range les photos et fichiers reçus.'],
  sort: ['Rangement', 'Comment Drop range les photos dans le dossier.'],
  reconnect: ['Reconnecter', 'Coupe et refait la liaison avec l’iPhone, si quelque chose bloque.'],
  forget: ['Oublier', 'Supprime la liaison avec cet iPhone : il faudra scanner un nouveau QR code.'],
  vcam: ['Webcam Windows', 'La caméra « Hyphn » que voient Discord, Teams, OBS… Installée une fois, avec l’accord administrateur.'],
  obs: ['OBS', 'La source « Hyphn » dans OBS : l’image arrive sans passer par la webcam Windows.'],
  fingerprint: ['Empreinte', 'Le code unique de la liaison. Le même sur l’iPhone : personne d’autre ne peut se faire passer pour lui.'],
};
const tipText = (k) => (TIPS[k] || []).join(' ');
/// A small « i » that shows its bubble on hover, focus or click.
const tip = (k) => (TIPS[k] ? `<span class="tip" tabindex="0" role="img" aria-label="${esc(tipText(k))}" data-tip="${k}">i</span>` : '');
/// The bubble on the element itself (icon buttons, chips).
const tipAttr = (k) => (TIPS[k] ? ` data-tip="${k}"` : '');

// One bubble for the whole app, placed above (or below) its element and
// kept inside the window: the title, the plain explanation, then the advice.
const Bubble = {
  el: null,
  at: null,
  show(target) {
    const t = TIPS[target.dataset.tip];
    if (!t) return;
    if (!this.el) {
      this.el = document.createElement('div');
      this.el.className = 'bubble';
      this.el.setAttribute('role', 'tooltip');
      document.body.appendChild(this.el);
    }
    this.at = target;
    const [title, body, advice] = t;
    this.el.innerHTML = `<b>${esc(title)}</b>${body ? `<span>${esc(body)}</span>` : ''}${advice ? `<em>${esc(advice)}</em>` : ''}`;
    this.el.classList.remove('on', 'below');
    const r = target.getBoundingClientRect();
    const b = this.el.getBoundingClientRect();
    const pad = 12;
    let top = r.top - b.height - 12;
    const below = top < pad;
    if (below) top = r.bottom + 12;
    const left = Math.min(Math.max(pad, r.left + r.width / 2 - b.width / 2), window.innerWidth - b.width - pad);
    this.el.style.left = left + 'px';
    this.el.style.top = top + 'px';
    this.el.style.setProperty('--ax', Math.min(Math.max(16, r.left + r.width / 2 - left), b.width - 16) + 'px');
    this.el.classList.toggle('below', below);
    requestAnimationFrame(() => this.el && this.el.classList.add('on'));
  },
  hide() {
    this.at = null;
    if (this.el) this.el.classList.remove('on');
  },
};
document.addEventListener('pointerover', (e) => {
  const t = e.target.closest('[data-tip]');
  if (t && t !== Bubble.at) Bubble.show(t);
  else if (!t && Bubble.at) Bubble.hide();
});
document.addEventListener('focusin', (e) => {
  const t = e.target.closest('[data-tip]');
  if (t) Bubble.show(t);
});
document.addEventListener('focusout', () => Bubble.hide());
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') Bubble.hide(); });
document.addEventListener('scroll', () => Bubble.hide(), true);
// Clicking an « i » only shows its bubble: it never toggles the setting it sits in.
document.addEventListener('click', (e) => {
  const t = e.target.closest('.tip');
  if (!t) return;
  e.preventDefault();
  e.stopPropagation();
  Bubble.show(t);
}, true);
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
  cable: svg('<path d="M9 2v5M15 2v5M7 7h10v4a5 5 0 0 1-10 0zM12 16v6"/>'),
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
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  target: svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>'),
  palette: svg('<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-1.2-.9-1.6-.9-2.6 0-.9.7-1.6 1.6-1.6H17a4 4 0 0 0 4-4c0-4.3-4-7.8-9-7.8z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7.5" r="1"/><circle cx="14.5" cy="7.5" r="1"/>'),
  frame: svg('<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><circle cx="12" cy="12" r="3"/>'),
  moon: svg('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>'),
  spark: svg('<path d="M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z"/>'),
  expand: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  shrink: svg('<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>'),
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

// « Par câble » / « Wi-Fi » next to the green dot (spec `Core - Liaison par cable`, E9).
const onCable = () => !!(S && S.connected && S.link === 'cable');
const linkName = () => (onCable() ? 'par câble' : 'en Wi-Fi');

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
  const state = S.connected ? `${linkName()}` + (S.latency_ms == null ? '' : ` · ${S.latency_ms} ms`) : 'en veille';
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
  // Cam is edge to edge: the top bar floats over the picture.
  document.documentElement.classList.toggle('cam-full', r === 'cam');
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
        <span class="eyebrow"><span class="led"></span>${name} · <span id="h-via">relié ${linkName()}</span></span>
        <h1 class="big-h"><span class="w">Tout</span> <span class="w" style="animation-delay:.08s">est</span> <span class="w" style="animation-delay:.16s">prêt.</span></h1>
        <p class="lead">Lance la caméra pour tes appels et tes streams, ou récupère tes photos en un clic.</p>
        <div class="row" style="gap:12px">
          <a class="btn cam xl" href="#cam">${I.cam}Ouvrir Cam</a>
          <a class="btn xl" href="#drop">${I.down}Ouvrir Drop</a>
        </div>`;
    } else if (k === 'veille') {
      left = `
        <span class="eyebrow"><span class="led off"></span>${name} · <span id="h-seen">${ago(S.device.last_seen)}</span></span>
        <h1 class="big-h"><span class="w">En attente</span><br><span class="w" style="animation-delay:.1s">de l’iPhone.</span></h1>
        <p class="lead">Ouvre Hyphn sur l’iPhone : il se reconnecte tout seul, sans scanner.</p>
        <button class="btn xl" type="button" data-act="reconnect">${I.refresh}Reconnecter</button>`;
    } else {
      left = `
        <span class="eyebrow">Bienvenue dans Hyphn</span>
        <h1 class="big-h"><span class="w">Relie</span> <span class="w" style="animation-delay:.08s">ton</span> <span class="w" style="animation-delay:.16s">iPhone.</span></h1>
        <p class="lead">Un QR code à scanner, une seule fois. Ensuite tout se fait tout seul.</p>
        <a class="btn pri xl" href="#pair">Relier un iPhone</a>`;
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
          <div class="fact" style="--c:var(--li)"><span class="ic">${I.bolt}</span><div><div class="k">Batterie${tip('battery')}</div><div class="v" id="f-bat">inconnu</div></div></div>
          <div class="fact" style="--c:var(--li)"><span class="ic">${I.temp}</span><div><div class="k">Chaleur${tip('heat')}</div><div class="v" id="f-heat">inconnu</div></div></div>
          <div class="fact" style="--c:var(--cy)"><span class="ic">${I.wifi}</span><div><div class="k">Connexion${tip('ping')}</div><div class="v" id="f-link">inconnu</div></div></div>
          <div class="fact" style="--c:var(--cy)"><span class="ic">${I.disk}</span><div><div class="k">Stockage${tip('storage')}</div><div class="v" id="f-disk">inconnu</div></div></div>
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
    $('#f-link').textContent = S.connected ? `${linkQuality(S.latency_ms)} · ${linkName()}` : 'Hors ligne';
    $('#f-disk').textContent = p.storage_free_gb == null ? 'inconnu' : `${nf.format(Math.round(p.storage_free_gb))} Go libres`;
    const q = S.cam.effective.quality;
    $('#h-camtag').textContent = S.connected ? `Prête · ${resName(q.height)}${q.fps}` : 'Hors ligne';
    const via = $('#h-via');
    if (via) via.textContent = 'relié ' + linkName();
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
// One list (ADR-0032): [name, res index, fps index, power, what it is for]. Index 6 = Personnalisé.
const PROFILES = [['Max', 0, 3, 'max', 'La plus belle image · 4K 60'], ['Équilibré', 2, 3, 'balanced', '1080p 60 · chauffe moins'],
  ['Économie', 3, 2, 'eco', '720p 30 · tient longtemps'], ['Appel', 2, 2, 'balanced', '1080p 30 · Discord, Teams'],
  ['Stream', 0, 3, 'balanced', '4K 60 · OBS'], ['Cours', 3, 2, 'balanced', '720p 30 · léger']];
const CUSTOM = 6;
const POWER = [['max', 'Ne rien baisser', 'Plus belle image'], ['balanced', 'Baisser un peu', 'Moins de chaleur'], ['eco', 'Économiser', 'Batterie']];
const CAM_DEFAULTS = {
  res: 0, fps: 3, codec: 0, rate: 0, power: 'max',
  ev: 0, focus: 50, wb: 5600, afA: true, wbA: true, torch: false, stab: 0,
  aeA: true, iso: 200, shutter: 10000, tint: 0, zoom: 100, hdr: false, poi: null,
  msg: 'Je reviens bientôt', multi: true, wst: 0, prof: 0, lens: 1, front: false, mirror: false, turn: 0,
};
// Stops offered by the stepped sliders, cut to what the iPhone allows.
const ISO_STOPS = [20, 25, 32, 40, 50, 64, 80, 100, 125, 160, 200, 250, 320, 400, 500, 640, 800, 1000, 1250, 1600, 2000, 2500, 3200, 4000, 5000, 6400, 8000, 10000, 12800];
const SHUTTER_DEN = [8000, 6400, 5000, 4000, 3200, 2500, 2000, 1600, 1250, 1000, 800, 640, 500, 400, 320, 250, 200, 160, 125, 100, 60, 50, 30, 25, 24];
// What each Reset puts back, and the categories of the panel.
const RESETS = {
  exp: ['aeA', 'ev', 'iso', 'shutter'], focus: ['afA', 'focus'], wb: ['wbA', 'wb', 'tint'], zoom: ['zoom'], poi: ['poi'],
  stab: ['stab'], hdr: ['hdr'], torch: ['torch'], res: ['res'], fps: ['fps'], codec: ['codec'], rate: ['rate'], power: ['power'],
  msg: ['msg'], multi: ['multi'], wst: ['wst'],
};
const GROUPS = { light: ['exp'], sharp: ['focus', 'poi'], color: ['wb'], frame: ['zoom', 'stab', 'hdr', 'torch'], stream: ['res', 'fps', 'codec', 'rate', 'power'], wait: ['msg', 'multi', 'wst'] };
// The « Auto » half of each Auto / Manuel switch: [setting, value meaning Auto].
const AUTOS = { exp: ['aeA', true], focus: ['afA', true], wb: ['wbA', true] };
// Settings that make the iPhone camera work again (sent at once).
const SENT = ['res', 'fps', 'rate', 'codec', 'stab', 'power', 'aeA', 'ev', 'iso', 'shutter', 'afA', 'focus', 'wbA', 'wb', 'tint', 'zoom', 'hdr', 'poi', 'torch'];
// Slider value shown for a setting key.
const VK = { wb: 'wbK', focus: 'focusP' };
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
  pendingAt: 0,
  raf: 0,
  // Time per step in this window (spec E2): arrival → decoded → drawn.
  arrived: new Map(),
  dec_ms: [0, 0],
  draw_ms: [0, 0],
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
        const now = performance.now();
        for (const [ts, at] of this.arrived) {
          this.arrived.delete(ts);
          if (ts === frame.timestamp) {
            this.dec_ms[0] += now - at;
            this.dec_ms[1]++;
            break;
          }
        }
        if (this.pending) this.pending.close();
        this.pending = frame;
        this.pendingAt = now;
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
      this.draw_ms[0] += this.lastFrame - this.pendingAt;
      this.draw_ms[1]++;
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
    // A burst of a couple of frames is fine (the graphics card catches up);
    // more means old pictures, seen late: start again from a fresh keyframe.
    if (this.dec.decodeQueueSize > 3) {
      this.drops++;
      this.waitKey = true;
      return this.key();
    }
    this.waitKey = false;
    this.arrived.set(pts, performance.now());
    if (this.arrived.size > 120) this.arrived.delete(this.arrived.keys().next().value);
    try {
      this.dec.decode(new EncodedVideoChunk({ type: key ? 'key' : 'delta', timestamp: pts, data: u8.subarray(18) }));
    } catch (e) {
      this.waitKey = true;
      this.key();
    }
  },
  // Averages since the last call (once a second), null = no frame.
  takeSteps() {
    const avg = (a) => (a[1] ? a[0] / a[1] : null);
    this.steps = { decode: avg(this.dec_ms), draw: avg(this.draw_ms) };
    this.dec_ms = [0, 0];
    this.draw_ms = [0, 0];
  },
  steps: { decode: null, draw: null },
  // A picture arrived in the last 1.5 s.
  fresh: () => performance.now() - Video.lastFrame < 1500,
};
Video.detect();

const LENS_L = ['0,5×', '1×', '2×', '5×'];

// The waiting screen (ADR-0018): what Discord and OBS see while paused. The
// Windows webcam draws the same design itself (apps/desktop-vcam).
function waitScreen(c, sub) {
  // The default message has its own words; Evan's own message rolls once
  // translated (ADR-0033), a missing language keeping his text.
  const own = c.msg !== CAM_DEFAULTS.msg;
  const tr = own && c.tr && c.tr.msg === c.msg ? c.tr.t : null;
  const cycle = c.multi && (!own || !!tr);
  const list = own ? LANGS.map(([l]) => [l, (tr && tr[l]) || c.msg]) : LANGS;
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
    ? `<div class="wmsg" aria-label="${esc(c.msg)}">${list.map(line).join('')}</div>`
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

// Categories of the settings panel, in order: [id, name, icon].
const CATS = [['profile', 'Profil', 'spark'], ['light', 'Lumière', 'sun'], ['sharp', 'Netteté', 'target'], ['color', 'Couleurs', 'palette'],
  ['frame', 'Cadrage', 'frame'], ['stream', 'Envoi', 'up'], ['wait', 'Pause', 'moon']];

// Offline translation (ADR-0033): Rust brings the files (downloaded once
// from Mozilla), a worker runs Firefox's engine. One worker for the app.
const Translator = {
  worker: null,
  seq: 0,
  wait: {},
  call(msg, transfer = []) {
    if (!this.worker) {
      this.worker = new Worker('translate-worker.js');
      this.worker.onmessage = ({ data }) => {
        const w = this.wait[data.id];
        delete this.wait[data.id];
        if (w) data.error ? w[1](new Error(data.error)) : w[0](data.result);
      };
    }
    const id = ++this.seq;
    return new Promise((ok, ko) => {
      this.wait[id] = [ok, ko];
      this.worker.postMessage(Object.assign({ id }, msg), transfer);
    });
  },
  async bytes(path) {
    const b = await invoke('translate_read', { path });
    return b instanceof ArrayBuffer ? b : new Uint8Array(b).buffer;
  },
  // French text → { lang: text } for LANGS; a language without a model is left out.
  async run(text, step) {
    const plan = await invoke('translate_prepare', { langs: LANGS.map(([l]) => l) });
    if (!plan || !plan.pairs['fr-en']) throw new Error('pas de modèle français → anglais');
    step('Démarrage du traducteur…');
    const wasm = await this.bytes(plan.wasm);
    await this.call({ type: 'start', wasm }, [wasm]);
    for (const [pair, files] of Object.entries(plan.pairs)) {
      const list = [];
      for (const f of files) list.push({ kind: f.kind, name: f.name, bytes: await this.bytes(f.path) });
      await this.call({ type: 'load', pair, files: list }, list.map((f) => f.bytes));
    }
    const out = { fr: text };
    for (const [l] of LANGS) {
      const code = l === 'zh' ? 'zh-Hans' : l;
      if (l === 'fr' || (l !== 'en' && !plan.pairs['en-' + code])) continue;
      step(`Traduction… ${Object.keys(out).length + 1} / ${LANGS.length}`);
      out[l] = await this.call({ type: 'translate', text, to: code });
    }
    return out;
  },
};

const Cam = {
  key: () => '',
  mount(root) {
    this.cs = Object.assign({}, CAM_DEFAULTS, settings.cam || {});
    if (this.cs.wst > 1) this.cs.wst = 0;
    // Saved before the power profiles (ADR-0032): its quality is kept, as « Personnalisé ».
    if (settings.cam && Object.keys(settings.cam).length && !('power' in settings.cam)) Object.assign(this.cs, { power: 'max', prof: CUSTOM });
    // The point is chosen on the live picture, never kept from one time to the next.
    this.cs.poi = null;
    // The iPhone's own lens wins over the one saved here.
    const ph = S && S.cam.phone;
    if (ph) Object.assign(this.cs, { front: ph.front, lens: ph.lens });
    this.panel = '';
    this.spark = [];
    this.overlayKey = '';
    this.dockKey = '';
    this.phoneKey = '';
    root.innerHTML = `
      <main class="cam-wrap">
        <div class="pv" id="c-pv">
          <div class="vbox" id="c-vbox">
            <canvas class="scene vid" id="c-scene" role="img" aria-label="Image de la caméra de l’iPhone"></canvas>
            <span class="ptag">Aperçu · toi seul</span>
            <button class="pclose" type="button" aria-label="Cacher l’aperçu" title="Cacher l’aperçu" data-act="peek">${I.close}</button>
            <span class="poi" id="c-poi" aria-hidden="true"></span>
          </div>
          <div id="c-wait"></div>
          <div class="hud l" id="c-hudl"></div>
          <div class="hud r" id="c-hudr"></div>
          <div id="c-notice"></div>
          <div class="dock" role="toolbar" aria-label="Commandes de la caméra" id="c-dock"></div>
          <aside class="adj" id="c-adj" aria-label="Panneau de la caméra"></aside>
        </div>
      </main>`;
    Video.start($('#c-scene'));
    // Panel open: a click on the live picture picks the focus and exposure point.
    $('#c-vbox').addEventListener('click', (e) => this.pickPoint(e));
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
    // Edge to edge: the top bar, the dock and the chips fade out when the
    // mouse rests, and come back as soon as it moves.
    this.wake = () => {
      document.documentElement.classList.remove('idle');
      clearTimeout(this.idleT);
      this.idleT = setTimeout(() => {
        if (!this.panel && !document.querySelector('.dock:hover, .top:hover, .bubble.on')) document.documentElement.classList.add('idle');
      }, 2600);
    };
    this.onKey = (e) => {
      if (e.key === 'F11' || (e.key === 'Escape' && this.full)) {
        e.preventDefault();
        Cam.acts.full();
      }
    };
    document.addEventListener('pointermove', this.wake);
    document.addEventListener('keydown', this.onKey);
    this.wake();
    // A message of Evan's not translated yet: done now, by itself.
    this.translate();
  },
  unmount() {
    // The camera keeps going: Discord or OBS may be using the Windows webcam.
    document.removeEventListener('visibilitychange', this.onVis);
    document.removeEventListener('pointermove', this.wake);
    document.removeEventListener('keydown', this.onKey);
    clearTimeout(this.idleT);
    document.documentElement.classList.remove('idle');
    if (this.full) Cam.acts.full();
    // The panel lives in the picture; the next visit starts with it closed.
    this.panel = '';
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
        height: RES[c.res], fps: FPS[c.fps], bitrate_mbps: RATE[c.rate], power: c.power,
        codec: c.codec === 1 || !Video.hevc ? 'h264' : 'hevc',
        ev: c.ev, focus: c.afA ? null : c.focus, wb: c.wbA ? null : c.wb, torch: c.torch, stab: c.stab,
        exposure: c.aeA ? null : [c.iso, c.shutter], tint: c.tint, zoom: c.zoom, hdr: c.hdr, poi: c.poi,
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
    const key = [show, conn, c.wst, c.multi, c.msg, JSON.stringify(c.tr || null), live, phone && phone.open, !!(S && S.device)].join('|');
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
      <button class="pz ${live ? 'live' : 'paused'}" type="button" data-act="pause"${tipAttr('pause')} ${conn ? '' : 'disabled'}>${live ? I.pause + 'Pause' : I.play + 'Afficher la caméra'}</button>
      <div class="lens" role="group" aria-label="Objectif"${tipAttr('lens')}>${LENS_L.map((n, i) => `<button type="button" class="${i === c.lens && !c.front ? 'on' : ''}" data-act="set" data-k="lens" data-v="${i}" ${c.front ? 'disabled' : ''}>${n}</button>`).join('')}</div>
      <button class="db${c.mirror ? ' on' : ''}" type="button" aria-label="Miroir" aria-pressed="${!!c.mirror}"${tipAttr('mirror')} data-act="mirror">${I.mirror}</button>
      <button class="db${c.turn ? ' on' : ''}" type="button" aria-label="Tourner de 90°"${tipAttr('turn')} data-act="turn">${I.turn}</button>
      <button class="db" type="button" aria-label="Changer de caméra"${tipAttr('flipcam')} data-act="flipcam">${I.flip}</button>
      ${live ? '' : `<button class="db${this.peekOn() ? ' on' : ''}" type="button" aria-label="${this.peekOn() ? 'Cacher' : 'Montrer'} l’aperçu" aria-pressed="${this.peekOn()}"${tipAttr('peek')} data-act="peek">${this.peekOn() ? I.eye : I.eyeOff}</button>`}
      <span class="sep"></span>
      <button class="db${this.panel === 'info' ? ' on' : ''}" type="button" aria-label="Infos du flux"${tipAttr('info')} data-act="panel" data-v="info">${I.info}</button>
      <button class="db${this.panel === 'set' ? ' on' : ''}" type="button" aria-label="Réglages de la caméra"${tipAttr('set')} data-act="panel" data-v="set">${I.sliders}</button>
      <button class="db" type="button" aria-label="${this.full ? 'Quitter le plein écran' : 'Plein écran'}"${tipAttr('full')} data-act="full">${this.full ? I.shrink : I.expand}</button>`;
  },
  paintHud() {
    const conn = this.connected();
    const live = this.isLive() && conn;
    const q = S.cam.effective.quality;
    const ph = S.cam.phone;
    const qual = ph && ph.height && live ? `${resName(Math.min(ph.width, ph.height))} · ${ph.fps}` : `${resName(q.height)} · ${q.fps}`;
    const used = S.vcam && S.vcam.in_use ? `<span class="chip"${tipAttr('hudused')}>${I.cam}${S.vcam.in_use > 1 ? S.vcam.in_use + ' apps' : 'Webcam utilisée'}</span>` : '';
    $('#c-hudl').innerHTML = (live
      ? '<span class="chip" style="color:#FFB3A6"><span class="rec"></span>EN DIRECT</span>'
      : `<span class="chip">${I.pause}En pause</span>`) + `<span class="chip mono"${tipAttr('hudq')}>${qual}</span>` + used;
    const p = S.status;
    if (!S.device || !p) {
      $('#c-hudr').innerHTML = '';
    } else {
      const low = p.battery != null && p.battery < 15 && p.charge === 'unplugged';
      const bc = low ? '#FF7A66' : '#B9F25A';
      $('#c-hudr').innerHTML = `
        <span class="chip" style="color:${bc}"${tipAttr('battery')}><span class="batt" aria-hidden="true"><i style="width:${p.battery ?? 0}%"></i></span><span class="mono">${p.battery ?? '—'} %</span>${p.charge !== 'unplugged' ? svg('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>', ' aria-label="en charge"') : ''}</span>
        <span class="chip"${tipAttr('heat')}><span class="tdot" style="background:${HEAT_COLOR[p.thermal] || '#868F9D'}"></span>${p.thermal ? HEAT[p.thermal] : 'inconnu'}</span>
        <span class="chip"${tipAttr('ping')}>${onCable() ? I.cable : I.wifi}<span class="mono">${conn ? (S.latency_ms == null ? '—' : S.latency_ms + ' ms') : 'hors ligne'}</span></span>`;
    }
    const e = S.cam.effective;
    const why = { battery: 'Batterie faible', low_power: 'Mode économie d’iOS' }[e.reason];
    $('#c-notice').innerHTML = !conn ? '' : e.alert
      ? '<div class="notice hot">iPhone très chaud : 1080p 30 pour garder l’image</div>'
      : e.lowered && e.reason === 'hot' ? '<div class="notice">iPhone chaud : 30 images/s pour garder l’image</div>'
        : e.lowered && why ? `<div class="notice">${why} : 1080p 30 (profil Économie)</div>`
          : e.reason === 'hot' ? '<div class="notice">iPhone chaud · ton profil garde la qualité</div>' : '';
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
    const dockKey = [this.connected(), this.isLive(), this.cs.front, this.cs.lens, this.cs.mirror, this.cs.turn, this.peekOn(), this.full].join('|');
    if (dockKey !== this.dockKey) {
      this.dockKey = dockKey;
      this.paintDock();
    }
    this.paintWait();
    this.paintHud();
    const caps = this.caps();
    const capsKey = JSON.stringify([caps, !!(S.cam.phone), this.cs.front, this.connected()]);
    if (this.panel === 'set' && capsKey !== this.capsKey) this.paintAdj();
    this.capsKey = capsKey;
    this.spark.push(S.cam.stats.bitrate_mbps);
    Video.takeSteps();
    if (this.spark.length > 40) this.spark.shift();
    if (this.panel === 'info') this.paintInfo();
  },
  // Infos du flux, in the side panel (the picture stays in view): a summary
  // first, then the picture, the delay step by step, the link, the iPhone.
  paintInfo(fresh) {
    const el = $('#c-adj');
    if (!el || this.panel !== 'info') return;
    if (fresh || !$('#c-info', el)) {
      el.innerHTML = `<div class="ahd"><div class="aht">${I.info}Infos du flux</div>
        <button class="ib" type="button" aria-label="Fermer" data-act="close"${tipAttr('adjclose')}>${I.close}</button></div>
        <div class="abody" id="c-info"></div>`;
    }
    const st = S.cam.stats, q = S.cam.effective.quality, p = S.status || {}, ph = S.cam.phone, e = S.cam.effective;
    const conn = this.connected(), live = this.isLive() && conn;
    const sp = st.steps || {};
    const ms = (v) => (v == null ? 'inconnu' : Math.round(v) + ' ms');
    const steps = [['Compression', sp.encode_ms, 'i_enc', 'sa'], ['Trajet', sp.link_ms, 'i_link', 'sb'],
      ['Décompression', Video.steps.decode, 'i_dec', 'sc'], ['Affichage', Video.steps.draw, 'i_draw', 'sd']];
    const known = steps.every(([, v]) => v != null);
    const total = steps.reduce((a, [, v]) => a + (v || 0), 0);
    const asked = ph && ph.fps ? ph.fps : q.fps;
    // The summary, in plain words, with what to do.
    const [state, title, say] = !conn ? ['off', 'iPhone hors ligne', 'Ouvre Hyphn sur l’iPhone : il se reconnecte tout seul.']
      : !live ? ['off', 'En pause', 'Rien n’est envoyé. Appuie sur « Afficher la caméra ».']
        : (sp.queue_ms || 0) > 30 ? ['bad', 'Le lien ne suit pas', onCable() ? 'Baisse le débit ou la taille de l’image.' : 'Branche le câble, ou baisse le débit ou la taille de l’image.']
          : e.alert ? ['bad', 'iPhone très chaud', 'L’image est passée en 1080p 30 pour que la caméra ne soit pas coupée.']
            : st.fps > 0 && st.fps < asked * 0.8 ? ['warn', 'Moins d’images que prévu', 'L’iPhone ou le lien ne suit pas : essaie 30 images/s.']
              : ['ok', 'Tout va bien', known ? `Image fluide, ${Math.round(total)} ms de retard.` : 'Image fluide.'];
    const max = Math.max(1, ...this.spark);
    const bars = Array.from({ length: 40 }, (_, i) => this.spark[i - (40 - this.spark.length)] ?? 0)
      .map((v) => `<i style="height:${Math.max(4, Math.round(v / max * 100))}%"></i>`).join('');
    const tile = (k, v, t, sub) => `<div class="tile"><div class="k">${k}${tip(t)}</div><div class="v">${v}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div>`;
    const codec = Video.codec === 2 ? 'H.264' : Video.codec === 1 ? 'HEVC' : '—';
    const body = `
      <div class="health ${state}"><span class="hd"></span><div><b>${title}${tip('i_health')}</b><small>${say}</small></div></div>
      <section class="isec"><h4>Image</h4>
        <div class="tiles">
          ${tile('Image envoyée', ph && ph.height ? `${ph.width} × ${ph.height}` : resName(q.height), 'i_sent', `${resName(ph && ph.height ? Math.min(ph.width, ph.height) : q.height)} · ${ph && ph.fps ? ph.fps : q.fps} images/s`)}
          ${tile('Compression', codec, 'i_codec', codec === 'HEVC' ? 'Le plus léger' : codec === 'H.264' ? 'Compatible' : '')}
          ${tile('Images reçues', `${n1(st.fps)}<small> / s</small>`, 'i_fps', `sur ${asked} demandées`)}
          ${tile('Débit', `${n1(st.bitrate_mbps)}<small> Mb/s</small>`, 'i_rate')}
        </div>
        <div class="spark" aria-hidden="true">${bars}</div>
      </section>
      <section class="isec"><h4>Retard de l’image${tip('i_delay')}</h4>
        <div class="delay"><span class="mono">${known ? Math.round(total) : '—'}</span><small>ms au total</small></div>
        <div class="dbar" aria-hidden="true">${known && total > 0 ? steps.map(([, v, , c2]) => `<i class="${c2}" style="flex:${Math.max(v, 1)}"></i>`).join('') : '<i class="none"></i>'}</div>
        <div class="dlist">${steps.map(([n, v, t, c2]) => `<div><span class="dot ${c2}"></span>${n}${tip(t)}<b class="mono">${ms(v)}</b></div>`).join('')}</div>
      </section>
      <section class="isec"><h4>Lien</h4>
        <div class="tiles">
          ${tile(onCable() ? 'Par câble' : 'En Wi-Fi', S.latency_ms == null ? 'inconnu' : `${S.latency_ms}<small> ms</small>`, 'i_ping', 'réponse du lien')}
          ${tile('Attente dans l’iPhone', ms(sp.queue_ms), 'i_queue', (sp.queue_ms || 0) > 30 ? 'trop : baisse le débit' : 'rien ne bloque')}
          ${tile('Images sautées', String(st.dropped + Video.drops), 'i_drop')}
          ${tile('Images complètes', `${sp.keys_per_min ?? 0}<small> / min</small>`, 'i_keys')}
        </div>
      </section>
      <section class="isec"><h4>iPhone${tip('i_phone')}</h4>
        <div class="tiles">
          ${tile('Batterie', p.battery == null ? 'inconnu' : `${p.battery}<small> %</small>`, 'battery', p.charge ? CHARGE[p.charge] : '')}
          ${tile('Chaleur', p.thermal ? HEAT[p.thermal] : 'inconnu', 'heat')}
        </div>
      </section>`;
    $('#c-info').innerHTML = body;
  },
  openPanel(name) {
    this.panel = this.panel === name ? '' : name;
    this.paintDock();
    // The panels sit on the live picture (spec `Cam - Reglages avances`, E1).
    $('#c-pv').classList.toggle('adj-on', !!this.panel);
    $('#c-adj').innerHTML = '';
    if (this.panel === 'set') {
      this.paintAdj();
      this.placePoint();
    } else if (this.panel === 'info') {
      this.paintInfo(true);
    }
    this.wake();
  },
  // Abilities of the iPhone camera in use; null = unknown (older app or no iPhone).
  caps: () => (S && S.cam.phone && S.cam.phone.caps) || null,
  // An older iPhone app: it does not say what its camera can do.
  old: () => !!(S && S.cam.phone && !S.cam.phone.caps),
  // Whether a setting can be used now (E7). What cannot be used is not shown.
  can(k) {
    const k2 = this.caps();
    if (!k2) return k === 'stab' || (k === 'torch' && !this.cs.front) || (!this.old() && !['tint', 'zoom', 'hdr', 'poi'].includes(k));
    return { exp: k2.exposure, focus: k2.focus, wb: k2.wb, tint: k2.wb, zoom: k2.zoom_max_pct > 100, hdr: k2.hdr, poi: k2.poi, torch: k2.torch }[k] ?? true;
  },
  isoStops() {
    const k = this.caps();
    const list = k ? ISO_STOPS.filter((v) => v >= k.iso[0] && v <= k.iso[1]) : ISO_STOPS.filter((v) => v <= 3200);
    return list.length ? list : ISO_STOPS;
  },
  // Exposure times in µs, short to long; never longer than one frame.
  shutterStops() {
    const k = this.caps();
    const frame = 1e6 / FPS[this.cs.fps];
    const lo = k ? k.shutter_us[0] : 0, hi = k ? Math.min(k.shutter_us[1], frame) : frame;
    const list = SHUTTER_DEN.map((d) => Math.round(1e6 / d)).filter((us) => us >= lo && us <= hi + 1);
    return list.length ? list : [Math.round(frame)];
  },
  near: (list, v) => list.reduce((b, x, i) => (Math.abs(x - v) < Math.abs(list[b] - v) ? i : b), 0),
  // Shown next to each slider and setting.
  valueOf(k) {
    const c = this.cs;
    const sign = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + n1(Math.abs(v));
    return {
      ev: c.ev === 0 ? 'normal' : sign(c.ev),
      iso: 'ISO ' + c.iso,
      shutter: '1/' + Math.round(1e6 / c.shutter) + ' s',
      focusP: c.focus + ' %',
      wbK: c.wb + ' K',
      tint: c.tint === 0 ? 'neutre' : (c.tint > 0 ? '+' : '−') + Math.abs(c.tint),
      zoom: n1(c.zoom / 100) + '×',
    }[k] ?? '';
  },
  // The settings panel on the live picture (spec `Cam - Reglages avances`):
  // a menu of categories on top, one long list below; what the iPhone in use
  // cannot do is not shown.
  paintAdj() {
    const el = $('#c-adj');
    if (!el || this.panel !== 'set') return;
    const c = this.cs;
    const prev = $('.abody', el);
    const scroll = prev ? prev.scrollTop : 0;
    const changed = (k) => (RESETS[k] || []).some((f) => JSON.stringify(c[f]) !== JSON.stringify(CAM_DEFAULTS[f]));
    const resetBtn = (k, label) => (changed(k) ? `<button type="button" class="rb" data-act="reset" data-k="${k}" aria-label="Remettre ${esc(label)}"${tipAttr('reset')}>${I.refresh}</button>` : '');
    // Big choices with a short caption under each.
    const opts = (k, list, cur = c[k], act = 'set') => `<div class="opts">${list.map(([v, n, sub]) => `<button type="button" class="opt${cur === v ? ' on' : ''}" data-act="${act}" data-k="${k}" data-v="${v}" aria-pressed="${cur === v}"><b>${esc(n)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</button>`).join('')}</div>`;
    const tog = (k, on, off) => `<button class="tg" type="button" data-act="toggle" data-k="${k}" aria-pressed="${!!c[k]}"><span>${esc(c[k] ? on : off)}</span><span class="sw${c[k] ? ' on' : ''}"></span></button>`;
    // A slider with its words at both ends; `steps` makes it pick among those values.
    const range = (k, label, o) => {
      const steps = o.steps;
      const v = steps ? this.near(steps, c[k]) : c[k];
      const lo = steps ? 0 : o.min, hi = steps ? steps.length - 1 : o.max;
      const p = hi > lo ? ((v - lo) / (hi - lo) * 100).toFixed(1) : 0;
      return `<div class="sl">
          ${label ? `<div class="r"><span>${esc(label)}${tip(o.tip || VK[k] || k)}</span><span class="val" id="v-${k}">${esc(this.valueOf(VK[k] || k))}</span></div>` : ''}
          <input type="range" min="${lo}" max="${hi}" step="${steps ? 1 : o.step}" value="${v}" data-input="slide" data-change="slid" data-k="${k}"${steps ? ` data-steps="${k}"` : ''} style="--p:${p}%" aria-label="${esc(label || o.aria)}">
          ${o.ends ? `<div class="ends"><span>${esc(o.ends[0])}</span><span>${esc(o.ends[1])}</span></div>` : ''}
        </div>`;
    };
    const mode = (k) => {
      const [key, on] = AUTOS[k];
      const auto = c[key] === on;
      return `<div class="seg2" role="group" aria-label="Auto ou manuel"${tipAttr('manual')}>
          <button type="button" class="${auto ? 'on' : ''}" data-act="auto" data-k="${k}" data-v="1" aria-pressed="${auto}">Auto</button>
          <button type="button" class="${auto ? '' : 'on'}" data-act="auto" data-k="${k}" data-v="0" aria-pressed="${!auto}">Manuel</button></div>`;
    };
    // One setting of a category: name, value, Reset when changed, then its control.
    const row = (k, label, body, val = '') => `<div class="ar">
        <div class="ah"><span class="an">${esc(label)}${tip(k)}</span>${val ? `<span class="av" id="v-${k}">${esc(val)}</span>` : ''}${resetBtn(k, label)}</div>
        ${body}</div>`;
    // A category: its icon and name, the Auto / Manuel switch when it has one,
    // Reset when something in it changed, then its rows. Empty: not shown.
    const sec = (id, title, rows, head = '') => (!rows ? '' : `<section class="ag" id="cat-${id}" data-cat="${id}">
        <div class="agh"><span class="gi">${I[CATS.find(([x]) => x === id)[2]]}</span><h3>${title}</h3>${tip('cat_' + id)}
          ${GROUPS[id] && GROUPS[id].some(changed) ? `<button type="button" class="rb" data-act="greset" data-v="${id}" aria-label="Remettre ${esc(title)}"${tipAttr('greset')}>${I.refresh}</button>` : ''}
          ${head}</div>
        ${rows}</section>`);
    const zoomMax = this.caps() ? Math.max(100, this.caps().zoom_max_pct) : 500;
    const profile = `<div class="pgrid">${PROFILES.map(([n, , , , d], i) => `<button type="button" class="pcard${c.prof === i ? ' on' : ''}" data-act="profile" data-v="${i}" aria-pressed="${c.prof === i}"><b>${n}</b><small>${d}</small></button>`).join('')}</div>
      ${c.prof === CUSTOM ? '<div class="hint">Personnalisé : tu as changé la taille, la fluidité ou l’envoi à la main.</div>' : ''}`;
    const light = c.aeA || !this.can('exp')
      ? range('ev', 'Plus sombre ou plus clair', { min: -2, max: 2, step: 0.1, ends: ['Plus sombre', 'Plus clair'] })
      : range('iso', 'Sensibilité', { steps: this.isoStops(), ends: ['Moins de grain', 'Plus clair'] })
        + range('shutter', 'Vitesse', { steps: this.shutterStops(), ends: ['Net quand ça bouge', 'Plus clair'] });
    const sharp = (this.can('focus') && !c.afA ? range('focus', 'Distance', { min: 0, max: 100, step: 1, ends: ['Tout près', 'Au loin'] }) : '')
      + (this.can('focus') && c.afA ? '<div class="hint">L’iPhone fait la netteté tout seul sur ce qui est devant lui.</div>' : '')
      + (this.can('poi') ? row('poi', 'Point suivi', `<div class="hint">${c.poi ? 'Point choisi : clique ailleurs pour le déplacer.' : 'Clique sur l’image pour choisir ce qui doit être net et bien éclairé.'}</div>`, c.poi ? 'choisi' : 'centre') : '');
    const color = !this.can('wb') ? '' : c.wbA
      ? '<div class="hint">L’iPhone suit la couleur de la lumière de la pièce.</div>'
      : range('wb', 'Chaleur', { min: 2500, max: 8000, step: 100, ends: ['Plus bleu', 'Plus orange'] })
        + (this.can('tint') ? range('tint', 'Teinte', { min: -150, max: 150, step: 5, ends: ['Plus vert', 'Plus rose'] }) : '');
    const frame = (this.can('zoom') ? row('zoom', 'Zoom', range('zoom', '', { min: 100, max: zoomMax, step: 10, ends: ['1×', n1(zoomMax / 100) + '×'], aria: 'Zoom' }), this.valueOf('zoom')) : '')
      + row('stab', 'Anti-tremblement', opts('stab', [[0, 'Coupé', 'Sur un pied'], [1, 'Léger', 'En main'], [2, 'Fort', 'En marchant']]))
      + (this.can('hdr') ? row('hdr', 'Contre-jour', tog('hdr', 'Activé', 'Coupé')) : '')
      + (this.can('torch') ? row('torch', 'Lampe', tog('torch', 'Allumée', 'Éteinte')) : '');
    const stream = row('res', 'Taille de l’image', opts('res', RES_L.map((n, i) => [i, n, ['Le plus net', 'Très net', 'Appels', 'Léger', 'Très léger'][i]])))
      + row('fps', 'Fluidité', opts('fps', FPS.map((n, i) => [i, String(n), ['Cinéma', 'Télé', 'Appel', 'Fluide', 'Très fluide'][i]])))
      + row('power', 'Si l’iPhone chauffe', opts('power', POWER, c.power, 'power'))
      + row('codec', 'Compression', opts('codec', [[0, 'HEVC', 'Conseillé'], [1, 'H.264', 'Compatible']]))
      + row('rate', 'Débit', opts('rate', RATE.map((v, i) => [i, i ? String(v) : 'Auto', i ? 'Mb/s' : 'Conseillé'])));
    const tr = this.trState();
    const wait = row('msg', 'Message', `<input class="txt" type="text" maxlength="60" value="${esc(c.msg)}" data-change="msg" aria-label="Message de pause">`)
      + row('multi', 'Toutes les langues', tog('multi', 'Oui', 'Non') + (c.multi && tr ? `<div class="hint${tr.bad ? ' warn' : ''}" id="c-tr">${esc(tr.text)}</div>` : ''))
      + row('wst', 'Style', opts('wst', [[0, 'Animé', 'L’enseigne bouge'], [1, 'Calme', 'Immobile']]))
      + `<div class="wprev">${waitScreen(c, '')}</div>`;
    const sections = [
      sec('profile', 'Profil', profile),
      sec('light', 'Lumière', light, this.can('exp') ? mode('exp') : ''),
      sec('sharp', 'Netteté', sharp, this.can('focus') ? mode('focus') : ''),
      sec('color', 'Couleurs', color, this.can('wb') ? mode('wb') : ''),
      sec('frame', 'Cadrage', frame),
      sec('stream', 'Envoi', stream),
      sec('wait', 'Pause', wait),
    ];
    const shown = CATS.filter((_, i) => sections[i]);
    el.innerHTML = `
      <div class="ahd"><div class="aht">${I.sliders}Réglages</div>
        <button class="ib" type="button" aria-label="Cacher les réglages" data-act="close"${tipAttr('adjclose')}>${I.close}</button></div>
      <nav class="anav" aria-label="Catégories">${shown.map(([id, n, ic]) => `<button type="button" data-act="jump" data-v="${id}">${I[ic]}<span>${n}</span></button>`).join('')}</nav>
      <div class="abody">
        ${this.old() ? `<div class="upd">${I.info}<span>Mets à jour l’app iPhone pour avoir tous les réglages.</span>${tip('update')}</div>` : ''}
        ${sections.join('')}
        <button type="button" class="allr" data-act="allreset"${tipAttr('allreset')}>${I.refresh}Tout remettre comme au départ</button>
      </div>`;
    const body = $('.abody', el);
    body.scrollTop = scroll;
    body.addEventListener('scroll', () => this.spy(), { passive: true });
    this.spy();
  },
  // The category on screen is lit in the menu.
  spy() {
    const body = $('#c-adj .abody');
    if (!body) return;
    let on = '';
    for (const s of body.querySelectorAll('.ag')) if (s.offsetTop - body.scrollTop <= 60) on = s.dataset.cat;
    if (!on) on = (body.querySelector('.ag') || { dataset: {} }).dataset.cat;
    for (const b of document.querySelectorAll('#c-adj .anav button')) {
      b.classList.toggle('on', b.dataset.v === on);
      // The lit one stays in view in the menu.
      if (b.dataset.v === on && on !== this.spied) b.parentNode.scrollTo({ left: b.offsetLeft - 18, behavior: 'smooth' });
    }
    this.spied = on;
  },
  // Res, fps, power, rate and codec as one of the profiles, or « Personnalisé ».
  matchProfile() {
    const c = this.cs;
    const i = PROFILES.findIndex(([, r, f, p]) => r === c.res && f === c.fps && p === c.power);
    c.prof = i >= 0 && c.rate === 0 && c.codec === 0 ? i : CUSTOM;
  },
  // The point as sent: 0..1000 on the picture, letterbox left out.
  pickPoint(e) {
    if (this.panel !== 'set' || !this.can('poi') || $('#c-vbox').classList.contains('peek')) return;
    const r = this.pictureRect();
    if (!r) return;
    const x = Math.round((e.clientX - r.left) / r.width * 1000), y = Math.round((e.clientY - r.top) / r.height * 1000);
    if (x < 0 || y < 0 || x > 1000 || y > 1000) return;
    this.cs.poi = [x, y];
    this.placePoint(true);
    this.changed(true, false);
  },
  // Where the picture is drawn in the canvas (object-fit: contain).
  pictureRect() {
    const cv = $('#c-scene');
    if (!cv || !cv.width || !cv.height) return null;
    const b = cv.getBoundingClientRect();
    const s = Math.min(b.width / cv.width, b.height / cv.height);
    const w = cv.width * s, h = cv.height * s;
    return { left: b.left + (b.width - w) / 2, top: b.top + (b.height - h) / 2, width: w, height: h };
  },
  placePoint(pulse) {
    const dot = $('#c-poi'), r = this.pictureRect(), p = this.cs.poi;
    if (!dot) return;
    dot.classList.toggle('on', !!(p && r));
    if (!p || !r) return;
    const box = $('#c-vbox').getBoundingClientRect();
    dot.style.left = (r.left - box.left + p[0] / 1000 * r.width) + 'px';
    dot.style.top = (r.top - box.top + p[1] / 1000 * r.height) + 'px';
    if (pulse) {
      dot.classList.remove('pulse');
      void dot.offsetWidth; // restarts the animation
      dot.classList.add('pulse');
    }
  },
  // `wait`: the change touches the waiting screen (message, style…); mirror,
  // turn and lens never do, so it stays as it is.
  changed(send, wait = true) {
    if (wait) {
      this.overlayKey = '';
      this.paintWait();
    }
    if (this.panel === 'set') this.paintAdj();
    if (send) this.push();
    this.save();
  },
  resetKeys(keys) {
    for (const k of keys) for (const f of RESETS[k] || []) this.cs[f] = CAM_DEFAULTS[f];
    if (keys.includes('poi')) this.placePoint();
    this.matchProfile();
    this.changed(true, keys.some((k) => GROUPS.wait.includes(k)));
    if (keys.includes('msg')) this.translate();
  },
  // The waiting message in 18 languages (ADR-0033): translated once on this
  // PC, kept with the settings. `tr` = { msg, t: { lang: text } }.
  trState() {
    const c = this.cs;
    if (c.msg === CAM_DEFAULTS.msg) return null;
    if (this.trBusy) return { text: this.trBusy };
    if (c.tr && c.tr.msg === c.msg) {
      const n = LANGS.filter(([l]) => c.tr.t[l]).length;
      return { text: n >= LANGS.length ? 'Traduit dans les 18 langues.' : `Traduit dans ${n} langues sur 18 ; les autres gardent ton texte.` };
    }
    if (this.trErr) return { text: this.trErr, bad: true };
    return { text: 'Pas encore traduit.' };
  },
  // Shows where the translation is, without rebuilding the panel.
  trStep(text) {
    this.trBusy = text;
    const el = $('#c-tr');
    if (el) el.textContent = text;
  },
  // Download progress of the engine and models, from Rust (first time only).
  trProgress([done, total]) {
    if (!this.trBusy || !total || done >= total) return;
    this.trStep(`Téléchargement du traducteur, une seule fois : ${Math.round(done / 1e6)} / ${Math.round(total / 1e6)} Mo`);
  },
  async translate() {
    const c = this.cs;
    if (this.trBusy || !c.multi || c.msg === CAM_DEFAULTS.msg || (c.tr && c.tr.msg === c.msg)) return;
    const msg = c.msg;
    this.trErr = '';
    this.trBusy = 'Préparation de la traduction…';
    if (this.panel === 'set') this.paintAdj();
    try {
      const t = await Translator.run(msg, (s) => this.trStep(s));
      if (this.cs.msg === msg) this.cs.tr = { msg, t };
    } catch (e) {
      this.trErr = 'Traduction impossible : ' + (e && e.message ? e.message : String(e));
    }
    this.trBusy = '';
    if (page === Cam) this.changed(false);
    else this.save();
    // Typed again meanwhile: that one too.
    if (this.cs.msg !== msg) this.translate();
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
      if (['res', 'fps', 'rate', 'codec'].includes(k)) Cam.matchProfile();
      Cam.changed(SENT.includes(k), RESETS.wst.includes(k));
    },
    toggle: (el) => {
      const k = el.dataset.k;
      Cam.cs[k] = !Cam.cs[k];
      Cam.changed(SENT.includes(k), k === 'multi');
      if (k === 'multi') Cam.translate();
    },
    profile: (el) => {
      const i = Number(el.dataset.v);
      const [, res, fps, power] = PROFILES[i];
      // A profile sets the whole stream: rate and codec back to their Auto.
      Object.assign(Cam.cs, { prof: i, res, fps, power, rate: 0, codec: 0 });
      Cam.changed(true, false);
    },
    power: (el) => {
      Cam.cs.power = el.dataset.v;
      Cam.matchProfile();
      Cam.changed(true, false);
    },
    // Auto / Manuel of a category.
    auto: (el) => {
      const [key, on] = AUTOS[el.dataset.k];
      Cam.cs[key] = el.dataset.v === '1' ? on : !on;
      Cam.changed(true, false);
    },
    jump: (el) => {
      const body = $('#c-adj .abody'), s = $('#cat-' + el.dataset.v);
      if (body && s) body.scrollTo({ top: s.offsetTop - 8, behavior: 'smooth' });
    },
    reset: (el) => Cam.resetKeys([el.dataset.k]),
    greset: (el) => Cam.resetKeys(GROUPS[el.dataset.v]),
    allreset: () => Cam.resetKeys(Object.keys(RESETS)),
    panel: (el) => Cam.openPanel(el.dataset.v),
    full: async () => {
      try {
        Cam.full = await invoke('toggle_fullscreen');
      } catch (e) {
        toast(String(e), 'info');
      }
      Cam.dockKey = '';
      if ($('#c-dock')) Cam.paintDock();
    },
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
      const steps = { iso: () => Cam.isoStops(), shutter: () => Cam.shutterStops() }[el.dataset.steps];
      Cam.cs[k] = steps ? steps()[Number(el.value)] : Number(el.value);
      const min = Number(el.min), max = Number(el.max);
      el.style.setProperty('--p', ((Number(el.value) - min) / (max - min || 1) * 100).toFixed(1) + '%');
      const v = $('#v-' + k);
      if (v) v.textContent = Cam.valueOf(VK[k] || k);
      // Sent while sliding (throttled), so the iPhone follows the finger.
      clearTimeout(Cam.slideT);
      Cam.slideT = setTimeout(() => Cam.push(), 120);
    },
    slid: () => {
      Cam.push();
      Cam.save();
      // The Reset buttons appear or go.
      Cam.paintAdj();
    },
    close: () => Cam.openPanel(Cam.panel),
    msg: (el) => {
      Cam.cs.msg = el.value.trim() || CAM_DEFAULTS.msg;
      Cam.changed(false);
      Cam.translate();
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
// The PC settings: a menu of categories on the left, one list on the right.
const SET_CATS = [['iphone', 'iPhone', 'phone'], ['webcam', 'Webcam et OBS', 'cam'], ['drop', 'Drop', 'swap'],
  ['general', 'Général', 'pc'], ['alerts', 'Alertes', 'bolt'], ['privacy', 'Confidentialité', 'shield']];
const Settings = {
  key: () => (S && S.device ? S.device.fingerprint : 'none'),
  mount(root) {
    this.asking = false;
    this.root = root;
    this.vkey = JSON.stringify([S && S.vcam, S && S.connected, S && S.link]);
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
    const row = (title, desc, ctl, t = '') => `<div class="srow"><div class="stx"><b>${title}${tip(t)}</b>${desc ? `<small>${desc}</small>` : ''}</div><div class="sct">${ctl}</div></div>`;
    const sw = (k, label) => `<button class="swb" type="button" data-act="toggle" data-k="${k}" aria-pressed="${!!s[k]}" aria-label="${esc(label)}"><span class="sw${s[k] ? ' on' : ''}"></span></button>`;
    const sec = (id, body) => {
      const [, name, ic] = SET_CATS.find(([x]) => x === id);
      return `<section class="ssec" id="s-${id}"><h2><span class="gi">${I[ic]}</span>${name}</h2><div class="slist">${body}</div></section>`;
    };
    const p = (S && S.status) || {};
    const iphone = d
      ? `<div class="dcard">
          <span class="dic${S.connected ? ' on' : ''}">${I.phone}</span>
          <div class="dtx"><b>${esc(d.name)}</b><small><span class="led${S.connected ? '' : ' off'}"></span>${S.connected ? 'Relié ' + linkName() + (S.latency_ms == null ? '' : ` · répond en ${S.latency_ms} ms`) : 'En attente de l’iPhone'}</small></div>
          ${p.battery == null ? '' : `<div class="dbat"><span class="mono">${p.battery} %</span><small>${CHARGE[p.charge] || ''}</small></div>`}
        </div>`
        + row('Reconnecter', 'Si quelque chose bloque, refait la liaison.', `<button class="btn" type="button" data-act="reconnect">${I.refresh}Reconnecter</button>`, 'reconnect')
        + (S.cable_service === false ? row('Câble USB', 'Installe « Apple Devices » (Microsoft Store) ou iTunes pour relier l’iPhone par câble. Le Wi-Fi marche sans.', '') : '')
        + row('Relier un autre iPhone', 'Il remplacera celui-ci.', '<a class="btn" href="#pair">Relier</a>')
        + row('Oublier cet iPhone', `Relié le ${dateFr(d.paired_at)}. Empreinte <span class="mono">${esc(d.fingerprint)}</span>${tip('fingerprint')}`, `<button class="btn bad" type="button" data-act="ask">Oublier</button>`, 'forget')
        + (this.asking ? `<div class="confirm" role="alertdialog" aria-label="Confirmer l’oubli">
            <span><strong>Oublier ${esc(d.name)} ?</strong> Il faudra scanner un nouveau QR code pour le relier.</span>
            <div class="row" style="gap:8px"><button class="btn badf" type="button" data-act="forget">Oublier</button><button class="btn" type="button" data-act="cancel">Annuler</button></div>
          </div>` : '')
      : row('Aucun iPhone relié', 'Un QR code à scanner, une seule fois.', '<a class="btn pri" href="#pair">Relier un iPhone</a>');
    const sorts = [['year_month', 'Par mois', '2026 › 11'], ['year', 'Par année', '2026'], ['flat', 'Tout ensemble', 'un dossier']];
    this.root.innerHTML = `
      <main class="wrap setw enter">
        <h1 class="h1">Réglages</h1>
        <div class="sgrid2">
          <nav class="snav" aria-label="Catégories">${SET_CATS.map(([id, n, ic], i) => `<button type="button" class="${i === (this.cat || 0) ? 'on' : ''}" data-act="jump" data-v="${id}" data-i="${i}">${I[ic]}${n}</button>`).join('')}</nav>
          <div class="scol">
            ${sec('iphone', iphone)}
            ${sec('webcam', this.vcamRows(row) + row('Réglages de l’image', 'Lumière, couleurs, taille, écran de pause…', `<a class="btn" href="#cam">${I.sliders}Ouvrir Cam</a>`))}
            ${sec('drop', row('Dossier', 'Où arrivent les photos et fichiers.', `<button class="btn mono path" type="button" data-act="pick" title="${esc(s.photos_dir)}">${I.folder}<span>${esc(s.photos_dir)}</span></button>`, 'photos_dir')
              + row('Rangement', 'Comment les photos sont classées dans le dossier.', `<div class="opts sm">${sorts.map(([k, n, ex]) => `<button type="button" class="opt${s.sort === k ? ' on' : ''}" data-act="sort" data-v="${k}" aria-pressed="${s.sort === k}"><b>${n}</b><small>${ex}</small></button>`).join('')}</div>`, 'sort'))}
            ${sec('general', row('Démarrer avec Windows', 'Hyphn se lance tout seul, discret près de l’horloge.', sw('launch_at_startup', 'Démarrer avec Windows'), 'launch_at_startup')
              + row('Garder près de l’horloge', 'Fermer la fenêtre laisse la webcam marcher.', sw('close_to_tray', 'Garder près de l’horloge'), 'close_to_tray')
              + row('Apparence', '', `<div class="seg" role="group" aria-label="Apparence">${[['system', 'Comme Windows'], ['dark', 'Sombre'], ['light', 'Clair']].map(([k, n]) => `<button type="button" class="${s.theme === k ? 'on' : ''}" data-act="theme" data-v="${k}">${n}</button>`).join('')}</div>`, 'theme'))}
            ${sec('alerts', row('Batterie faible', 'Prévenir sous 15 %, quand l’iPhone n’est pas en charge.', sw('low_battery_alert', 'Batterie faible'), 'low_battery_alert'))}
            ${sec('privacy', `<div class="priv2">
                <span class="shield">${I.shield}</span>
                <div><b>Rien ne sort de chez toi.</b><small>Hyphn parle seulement à ton iPhone, sur ton réseau, et tout est chiffré.</small></div>
                <div class="pills"><span class="pl"><b>0</b>compte</span><span class="pl"><b>0</b>serveur</span><span class="pl"><b>0</b>donnée envoyée</span></div>
              </div>
              <div class="sver mono">Hyphn ${S ? esc(S.version) : ''} · ${esc(S ? S.pc_name : '')} · empreinte du PC ${esc(S ? S.pc_fingerprint : '')}</div>`)}
          </div>
        </div>
      </main>`;
  },

  // Windows webcam and OBS source: one install as admin, then always there.
  vcamRows(row) {
    const v = (S && S.vcam) || {};
    const busy = this.installing;
    const ok = (t) => `<span class="okc">${I.check}${t}</span>`;
    const cam = v.camera
      ? row('Webcam Windows', v.in_use ? (v.in_use > 1 ? v.in_use + ' apps l’utilisent en ce moment.' : 'Une app l’utilise en ce moment.') : '« Hyphn » dans Discord, Teams, OBS…', ok('Prête'), 'vcam')
      : v.installed
        ? row('Webcam Windows', esc(v.error || 'Démarrage…'), `<button class="btn" type="button" data-act="vinstall" ${busy ? 'disabled' : ''}>Réparer</button>`, 'vcam')
        : row('Webcam Windows', v.can_install ? 'Windows demande l’accord administrateur, une seule fois.' : 'Fichiers de la webcam absents de cette version.', `<button class="btn pri" type="button" data-act="vinstall" ${busy || !v.can_install ? 'disabled' : ''}>${busy ? 'Installation…' : 'Installer'}</button>`, 'vcam');
    const obs = !v.obs_present ? '' : row('OBS', v.obs ? 'Source « Hyphn » dans OBS.' : 'S’installe avec la webcam.', v.obs ? ok('Prêt') : '', 'obs');
    const remove = v.installed ? row('Retirer', 'Enlève la webcam et le plugin OBS de ce PC.', `<button class="btn bad" type="button" data-act="vremove" ${busy ? 'disabled' : ''}>Retirer</button>`) : '';
    return cam + obs + remove;
  },
  update() {
    const k = JSON.stringify([S && S.vcam, S && S.connected, S && S.link]);
    if (k !== this.vkey) {
      this.vkey = k;
      this.paint();
    }
  },

  acts: {
    vinstall: () => Settings.install(false),
    vremove: () => Settings.install(true),
    jump: (el) => {
      Settings.cat = Number(el.dataset.i);
      for (const b of document.querySelectorAll('.snav button')) b.classList.toggle('on', b === el);
      $('#s-' + el.dataset.v).scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
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
      settings.sort = el.dataset.v;
      await saveSettings();
      Settings.paint();
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
  listen('translate_progress', (e) => Cam.trProgress(e.payload));
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
