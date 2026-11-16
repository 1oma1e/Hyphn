// Hyphn PC interface. Design V2 (ADR-0016). Every iPhone value comes from the
// Rust side (`link`), which talks to the real iPhone app over TLS.
'use strict';

// Language of the window (ADR-0042): English, or French from Settings. Texts are written in English; fr.js holds the French.
let LANG = 'en';
const t = (en, vars) => { let s = (LANG === 'fr' && FR[en]) || en; if (vars) for (const k in vars) s = s.split('{' + k + '}').join(vars[k]); return s; };
// A count with its word: French puts the plural from 2, English from everything but 1.
const plural = (n, one, many) => t((LANG === 'fr' ? n > 1 : n !== 1) ? many : one, { n });

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Info bubbles (RULES, PC): every setting, icon button and number explains
// itself in plain words: [title, what it does, advice]. A new setting comes
// with its text here.
const TIPS = {
  // Update (ADR-0040)
  upd_go: ['Install', 'Downloads the new version from GitHub, checks its signature, installs it and restarts Hyphn.', 'Settings, paired iPhone and languages are kept. Windows asks for “Yes” once.'],
  upd_later: ['Later', 'Hides this card. Hyphn shows it again next time it starts.'],
  // Cam › Settings
  profile: ['Profile', 'Sets everything at once, for what you are doing.', 'Max for the best picture. Call for Discord or Teams. Saver if the iPhone is not plugged in.'],
  adjclose: ['Close', 'Hides the panel to see the whole picture. The settings stay on.'],
  manual: ['Auto or Manual', 'Auto: the iPhone sets it by itself for the scene. Manual: you choose, and it stays put.', 'Auto is right almost always.'],
  reset: ['Reset', 'Puts this setting back as it was at the start.'],
  greset: ['Reset the category', 'Puts every setting of this category back as it was at the start.'],
  allreset: ['Reset everything', 'Puts the whole camera back as it was at the start: Max profile, everything on Auto.'],
  update: ['Update the iPhone app', 'This version of the iPhone app does not yet say what its camera can do. Install the latest one to get every setting.'],
  power: ['If the iPhone gets hot', 'What Hyphn does when the iPhone gets hot or its battery runs low.', 'If it gets very hot, the picture always drops to 1080p: otherwise iOS would stop the camera.'],
  ev: ['Darker or brighter', 'The iPhone sets the light by itself; this slider corrects it a little. To the right, the picture is brighter. The number counts in light “stops”: +1 gives twice as much light.', 'In front of a window, your face is dark: push to the right.'],
  iso: ['Sensitivity', 'Makes the picture brighter, but adds grain (small dots).', '100 to 400 by day, 800 and more in a dark room.'],
  shutter: ['Shutter speed', 'How long each picture takes in light. Longer: brighter, but blurry when you move.', '1/50 or 1/100: lamps do not flicker on the picture.'],
  focusP: ['Distance', 'At what distance the picture is sharp, in Manual.', 'Someone at their desk: about 30%.'],
  wbK: ['Color warmth', 'To the left, the picture gets bluer; to the right, more orange.', 'Under a yellow lamp, go to the left.'],
  tint: ['Tint', 'Fixes a picture that is too green or too pink.', 'Useful under neon lights. Otherwise, leave it in the middle.'],
  zoom: ['Zoom', 'Brings the picture closer, on top of the lens chosen below.', 'Past 2×, the picture is less sharp: take the next lens instead.'],
  poi: ['Tracked point', 'Click the picture: focus and light follow that point.', 'Handy to show an object to the camera.'],
  stab: ['Stabilization', 'Calms the picture when the iPhone moves.', 'Off if the iPhone is on a stand: no extra delay.'],
  hdr: ['Backlight', 'Keeps the details in very bright and very dark parts, for example a window behind you.', 'Off by default: it makes the iPhone hot.'],
  torch: ['Flashlight', 'Turns on the light on the back of the iPhone.', 'It gets hot and drains the battery.'],
  res: ['Picture size', 'Bigger: sharper, but heavier to send and a little more delay.', 'Discord and Teams show no more than 1080p.'],
  fps: ['Smoothness', 'How many pictures per second.', '60 for smooth moves; 30 for a call, the iPhone stays cooler.'],
  codec: ['Compression', 'How the picture is made lighter before it is sent.', 'HEVC is twice as light. H.264 only if the picture does not show.'],
  rate: ['Bitrate', 'How much data leaves every second. More: a finer picture.', 'Auto is fine. Too high on Wi-Fi gives stutters.'],
  msg: ['Pause message', 'The text Discord and OBS see while the camera is paused.'],
  multi: ['Several languages', 'The message rolls through the chosen languages, translated on this PC.', 'Firefox’s translation engine: downloaded once, then everything stays on this PC.'],
  langs: ['Languages', 'The languages the message rolls through, 2.6 seconds each. 58 to choose from.', 'Each extra language makes the round longer; 18 take about 47 seconds.'],
  wst: ['Style', 'Animated: the neon sign moves. Calm: the same, still.'],
  cat_profile: ['Profile', 'Sets the size, the smoothness and the iPhone’s protection in one click.'],
  cat_light: ['Lighting', 'A brighter or darker picture.'],
  cat_sharp: ['Focus', 'What is sharp in the picture.'],
  cat_color: ['Colors', 'Warmer or cooler colors.'],
  cat_frame: ['Framing', 'Zoom, stabilization, backlight and flashlight.'],
  cat_stream: ['Sending', 'Size, smoothness and compression of the picture the iPhone sends.'],
  cat_wait: ['Pause', 'What Discord and OBS see while the camera is paused.'],
  // Cam › Effects (spec `Cam - Filtres et effets`)
  fx: ['Effects', 'Color filters, emojis on your face, blurred or replaced background, touch-up. What you see here, Discord and Teams see too.'],
  fx_filter: ['Filters', 'Changes the colors of the whole picture: Instagram-style filters, then movie, film, season, black and white or crazier looks. Worked out by the PC’s graphics card.', 'Each thumbnail already shows your picture with the filter. Click it again to remove it.'],
  fx_amount: ['Filter strength', 'To the left, the filter is light; to the right, it is full.'],
  fx_mask: ['Emojis', 'Over 100 emojis that follow your face, like on Snapchat or Messenger: Microsoft’s Fluent Emoji 3D, sorted by family.', 'Open your mouth wide with Rainbow, Tongue, Fire breather or Bubbles.'],
  fx_3d: ['3D', 'Real 3D objects on your head: hats, helmets, crowns, glasses, ears. They turn with you, and your head hides what goes behind it.', 'Free models (CC0 or CC-BY), credited in Settings. An emoji and a 3D object do not go together: the last one chosen stays.'],
  fx_touch: ['Touch-up', 'Smooth skin and soft light on your face, set to the percent.'],
  fx_search: ['Search', 'Searches every filter, emoji, 3D object and background at once. Accents do not matter.', 'Try “hat”, “cat”, “snow” or “cine”.'],
  fx_searchclr: ['Clear', 'Empties the search and goes back to the tab.'],
  fx_fav: ['Favorite', 'The star puts this effect in “Favorites”, at the top of its tab. Click again to remove it.'],
  fx_group: ['Family', 'Click to open or close this family. The number says how many effects it holds; the name next to it, the one chosen.'],
  fx_chip: ['Effect in use', 'Click to remove only this effect; the others stay.'],
  fx_bg: ['Background', 'Blurs what is behind you, or replaces it with a scene (real royalty-free photos) or your own picture. Your face and body stay sharp.', 'A picture of yours: “Your picture”, then pick a file.'],
  fx_smooth: ['Smooth skin', 'Softens the skin of your face. Eyes and mouth stay sharp.', 'Around 30%: natural.'],
  fx_light: ['Soft light', 'Lights up your face a little, like a lamp in front of you.'],
  fx_off: ['Remove all', 'Removes every effect: the picture is the iPhone’s again.'],
  fx_webcam: ['To Discord', 'With an effect, the webcam gets the picture drawn here. With no effect, it gets the iPhone’s picture as it is, with the least delay.'],
  // Cam › bottom bar
  pause: ['Pause or Show', 'Sends the picture or pauses it. Paused, Discord sees the pause screen and the iPhone rests.'],
  lens: ['Lens', '0.5×: very wide. 1×: the main one, the sharpest. 2× and 5×: zoom.', 'Switching lens cuts the picture for half a second.'],
  mirror: ['Mirror', 'Flips the picture like a mirror, for you and for Discord. The text of the pause screen stays readable.'],
  turn: ['Rotate', 'Turns the picture a quarter turn on each click, if the iPhone sits sideways.'],
  flipcam: ['Switch camera', 'Goes from the back camera (the best one) to the front camera, and back.'],
  peek: ['Preview', 'Shows or hides the picture on this PC while paused. Discord never sees it.'],
  info: ['Stream info', 'What the iPhone sends, the state of the link and the delay of the picture, step by step.'],
  set: ['Settings', 'The camera settings, over the live picture.'],
  full: ['Full screen', 'The picture takes the whole screen. F11 or Esc to leave.'],
  // Cam › top of the picture
  hudq: ['Quality', 'Size and pictures per second the iPhone is sending right now.'],
  hudused: ['Webcam in use', 'An app (Discord, Teams, OBS…) is showing the Hyphn webcam right now.'],
  battery: ['Battery', 'The iPhone’s battery. The lightning bolt: it is charging.'],
  heat: ['Heat', 'How hot the iPhone is according to iOS: Normal, Warm, Hot or Very hot.', 'Hot: Hyphn lowers the picture a little if your profile asks for it. Very hot: 1080p, always.'],
  ping: ['Link response', 'The time for a message to reach the iPhone and come back.', 'This is not the picture delay: that one is in Stream info.'],
  storage: ['Storage', 'Free space on the iPhone for photos and videos.'],
  // Cam › Stream info
  i_health: ['Stream state', 'The summary: all is well, or what slows the picture down.'],
  i_sent: ['Picture sent', 'Size and pictures per second the iPhone really sends.', 'Lower than asked: the iPhone is hot or your profile lowers it.'],
  i_codec: ['Compression', 'The format of the picture right now. HEVC is the lightest.'],
  i_rate: ['Bitrate', 'Data received in the last second, in megabits per second. The chart shows the last 40 seconds.'],
  i_fps: ['Pictures received', 'Pictures that arrived in the last second.', 'Fewer than asked: the iPhone or the link cannot keep up.'],
  i_ping: ['Link response', 'The time of a message round trip. It measures the link, not the picture.'],
  i_drop: ['Skipped pictures', 'Pictures thrown away because the display was late.', '0 or almost: perfect.'],
  i_keys: ['Full pictures', 'Pictures sent whole in one minute. They are heavy.', 'About 15: normal.'],
  i_queue: ['Waiting in the iPhone', 'The data waiting to leave.', 'More than 0 ms: the link cannot keep up, lower the bitrate.'],
  i_delay: ['Picture delay', 'The time between the real scene and the picture on this PC, step by step. A few ms are missing (sensor, screen).', 'With a cable: about 80 ms in 720p and 130 ms in 4K.'],
  i_enc: ['Compression', 'On the iPhone: from the shot to the compressed picture.'],
  i_link: ['Network', 'From the iPhone to the PC, by cable or Wi-Fi.'],
  i_dec: ['Decoding', 'On this PC: the graphics card unpacks the picture.'],
  i_draw: ['Display', 'Waiting for the next screen refresh.'],
  i_phone: ['iPhone', 'Battery and heat of the iPhone.'],
  // PC settings
  lang: ['Language', 'The language of Hyphn on this PC: the window, its messages and the menu near the clock.', 'The window reloads to switch; nothing else changes.'],
  launch_at_startup: ['Start with Windows', 'Hyphn starts quietly near the clock, and the iPhone reconnects by itself.'],
  close_to_tray: ['Keep near the clock', 'Closing the window keeps Hyphn open: the webcam and the link go on.', 'Off: closing quits Hyphn.'],
  theme: ['Appearance', 'The colors of the app. “Like Windows” follows Windows’ light or dark mode.'],
  low_battery_alert: ['Low battery', 'Warns when the iPhone drops below 15% and is not charging.'],
  photos_dir: ['Folder', 'Where Drop puts the photos and files it receives.'],
  sort: ['Sorting', 'How Drop sorts the photos in the folder.'],
  reconnect: ['Reconnect', 'Ends and redoes the link with the iPhone, if something is stuck.'],
  forget: ['Forget', 'Deletes the link with this iPhone: you will need to scan a new QR code.'],
  vcam: ['Windows webcam', 'The “Hyphn” camera that Discord, Teams, OBS… see. Installed once, with the administrator’s approval.'],
  obs: ['OBS', 'The “Hyphn” source in OBS: the picture arrives without going through the Windows webcam.'],
  fingerprint: ['Fingerprint', 'The unique code of the link. The same on the iPhone: nobody else can pretend to be it.'],
};
// The tip of a key in the window's language (French in fr.js).
const tipOf = (k) => (LANG === 'fr' && TIPS_FR[k]) || TIPS[k];
const tipText = (k) => (tipOf(k) || []).join(' ');
/// A small « i » that shows its bubble on hover, focus or click.
const tip = (k) => (tipOf(k) ? `<span class="tip" tabindex="0" role="img" aria-label="${esc(tipText(k))}" data-tip="${k}">i</span>` : '');
/// The bubble on the element itself (icon buttons, chips).
const tipAttr = (k) => (tipOf(k) ? ` data-tip="${k}"` : '');

// One bubble for the whole app, placed above (or below) its element and
// kept inside the window: the title, the plain explanation, then the advice.
const Bubble = {
  el: null,
  at: null,
  show(target) {
    const text = tipOf(target.dataset.tip);
    if (!text) return;
    if (!this.el) {
      this.el = document.createElement('div');
      this.el.className = 'bubble';
      this.el.setAttribute('role', 'tooltip');
      document.body.appendChild(this.el);
    }
    this.at = target;
    const [title, body, advice] = text;
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
  wand: svg('<path d="M4 20l10-10"/><path d="M15 3.5l.9 2 2 .9-2 .9-.9 2-.9-2-2-.9 2-.9z"/><path d="M19.5 10l.5 1.1 1.1.5-1.1.5-.5 1.1-.5-1.1-1.1-.5 1.1-.5z"/>'),
  smile: svg('<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0M9 9.5v.5M15 9.5v.5"/>'),
  layers: svg('<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>'),
  globe: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  expand: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  shrink: svg('<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>'),
  search: svg('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>'),
  star: svg('<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/>'),
  chev: svg('<path d="M6 9l6 6 6-6"/>'),
  cube: svg('<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>'),
};

// ---------- Formatting ----------
const locale = () => (LANG === 'fr' ? 'fr-FR' : 'en-US');
const nf = (x) => x.toLocaleString(locale());
const n1 = (x) => x.toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
// A percentage: « 12 % » in French, « 12% » in English.
const perc = (x) => x + (LANG === 'fr' ? ' %' : '%');
function bytes(b) {
  if (b >= 1e9) return n1(b / 1e9) + ' ' + t('GB');
  if (b >= 1e6) return Math.round(b / 1e6) + ' ' + t('MB');
  if (b >= 1e3) return Math.round(b / 1e3) + ' ' + t('KB');
  return b + ' ' + t('B');
}
function ago(unix) {
  if (!unix) return t('never seen');
  const s = Math.max(0, Date.now() / 1000 - unix);
  if (s < 60) return t('seen just now');
  if (s < 3600) return t('seen {n} min ago', { n: Math.floor(s / 60) });
  if (s < 86400) return t('seen {n} h ago', { n: Math.floor(s / 3600) });
  return t('seen {n} d ago', { n: Math.floor(s / 86400) });
}
function when(unix) {
  const d = new Date(unix * 1000), now = new Date();
  const hm = d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = (day(now) - day(d)) / 86400000;
  if (diff === 0) return t('Today {hm}', { hm });
  if (diff === 1) return t('Yesterday {hm}', { hm });
  return d.toLocaleDateString(locale(), { day: '2-digit', month: '2-digit' }) + ' ' + hm;
}
function dateStr(unix) {
  return new Date(unix * 1000).toLocaleDateString(locale(), { day: '2-digit', month: '2-digit', year: 'numeric' });
}
// Shown through t().
const HEAT = { nominal: 'Normal', fair: 'Warm', serious: 'Hot', critical: 'Very hot' };
const HEAT_COLOR = { nominal: 'var(--li)', fair: 'var(--li)', serious: 'var(--am)', critical: 'var(--co)' };
const CHARGE = { charging: 'charging', full: 'full', unplugged: 'on battery' };
const resName = (h) => (h >= 2160 ? '4K' : h + 'p');
function linkQuality(ms) {
  if (ms == null) return t('unknown');
  return t(ms < 10 ? 'Excellent' : ms < 30 ? 'Good' : 'Weak');
}

// « By cable » / « Wi-Fi » next to the green dot (spec `Core - Liaison par cable`, E9).
const onCable = () => !!(S && S.connected && S.link === 'cable');
const linkName = () => t(onCable() ? 'by cable' : 'on Wi-Fi');

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

// A card in the corner for what takes a moment (installing, translating,
// freeing space): it slides in, shows its progress, ends with a check.
const Popup = {
  el: null,
  key: '',
  hideT: 0,
  // pct: null = no bar, -1 = working (no number), 0..100 = progress.
  show({ icon = 'down', title, text = '', pct = null, done = false, bad = false }) {
    if (!this.el) {
      this.el = document.createElement('div');
      this.el.className = 'pop';
      this.el.setAttribute('role', 'status');
      document.body.appendChild(this.el);
    }
    clearTimeout(this.hideT);
    const el = this.el;
    const key = [title, done, bad, pct == null].join('|');
    if (key !== this.key || !el.classList.contains('on')) {
      this.key = key;
      el.innerHTML = `<span class="pic">${done ? I.check : bad ? I.alert : I[icon]}</span>
        <div class="ptx"><b>${esc(title)}</b><small></small>${pct == null || done ? '' : '<div class="pbar"><i></i></div>'}</div>
        <span class="ppct mono"></span>`;
      el.className = `pop${done ? ' done' : ''}${bad ? ' bad' : ''}`;
      void el.offsetWidth; // restarts the entrance
      el.classList.add('on');
    }
    $('small', el).textContent = text;
    const bar = $('.pbar', el);
    if (bar) {
      bar.classList.toggle('busy', pct < 0);
      $('i', bar).style.width = (pct < 0 ? 35 : Math.max(3, Math.min(100, pct))) + '%';
    }
    $('.ppct', el).textContent = pct != null && pct >= 0 && !done ? perc(Math.round(pct)) : '';
    if (done || bad) this.hideT = setTimeout(() => this.hide(), bad ? 7000 : 3600);
  },
  hide() {
    if (this.el) this.el.classList.remove('on');
  },
  // One item after the other (languages to install or remove): its name, its
  // steps lit in turn, its own bar that never goes back, and a thin bar for
  // the whole list. { icon, name, i, n, steps, step, pct, sub }
  item(o) {
    if (!this.el) this.show({ title: '' });
    clearTimeout(this.hideT);
    const el = this.el;
    if (!el.classList.contains('item') || !el.classList.contains('on')) {
      this.key = '';
      el.className = 'pop item';
      el.innerHTML = `<span class="pic"></span>
        <div class="ptx"><div class="phead"><b></b><span class="pcount mono"></span></div>
          <div class="psteps"></div><div class="pbar"><i></i></div><small></small><div class="pall"><i></i></div></div>`;
      void el.offsetWidth;
      el.classList.add('on');
    }
    // A new item: its name slides in and its bar starts from zero.
    const id = o.name + '|' + o.i;
    if (id !== this.itemId) {
      this.itemId = id;
      this.itemPct = 0;
      const b = $('.phead b', el);
      b.textContent = o.name;
      b.classList.remove('swap');
      void b.offsetWidth;
      b.classList.add('swap');
      $('.pbar i', el).style.transition = 'none';
      $('.pbar i', el).style.width = '0%';
      void el.offsetWidth;
      $('.pbar i', el).style.transition = '';
    }
    this.itemPct = Math.max(this.itemPct, Math.min(100, o.pct));
    $('.pic', el).innerHTML = I[o.icon || 'down'];
    $('.pcount', el).textContent = `${o.i} / ${o.n}`;
    $('.psteps', el).innerHTML = o.steps.map((st, k) => `<span class="${k < o.step ? 'done' : k === o.step ? 'now' : ''}">${k < o.step ? I.check : ''}${esc(st)}</span>`).join('<em>›</em>');
    $('.pbar i', el).style.width = Math.max(2, this.itemPct) + '%';
    $('small', el).textContent = o.sub || '';
    // The whole list: never goes back either.
    const all = ((o.i - 1) + this.itemPct / 100) / o.n * 100;
    this.allPct = o.i === 1 && this.itemPct === 0 ? 0 : Math.max(this.allPct || 0, all);
    $('.pall i', el).style.width = this.allPct + '%';
  },
};
const langName = (l) => (LANG_NAMES[l] ? t(LANG_NAMES[l]) : l);
const langList = (ls) => (ls.length > 3 ? t('{list} and {n} more', { list: ls.slice(0, 3).map(langName).join(', '), n: ls.length - 3 }) : ls.map(langName).join(', '));

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
// The fixed texts of index.html (written in English): menu labels and aria-labels.
function translateStatic() {
  for (const a of document.querySelectorAll('.navp a')) {
    const n = a.lastChild;
    if (n && n.nodeType === 3) n.textContent = t(n.textContent);
  }
  for (const el of document.querySelectorAll('.top [aria-label]')) el.setAttribute('aria-label', t(el.getAttribute('aria-label')));
}
function paintHeader() {
  const el = $('#devc');
  if (!S || !S.device) {
    el.innerHTML = `<span class="led off"></span>${t('No device')}`;
    return;
  }
  const state = S.connected ? `${linkName()}` + (S.latency_ms == null ? '' : ` · ${S.latency_ms} ms`) : t('asleep');
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
    toast(t('Reconnecting…'), 'info');
  },
};

// ===================================================================
// Home
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
        <span class="eyebrow"><span class="led"></span>${name} · <span id="h-via">${t('linked {via}', { via: linkName() })}</span></span>
        <h1 class="big-h">${t('All set.').split(' ').map((w, i) => `<span class="w" style="animation-delay:${(i * 0.08).toFixed(2)}s">${w}</span>`).join(' ')}</h1>
        <p class="lead">${t('Start the camera for your calls and streams, or get your photos in one click.')}</p>
        <div class="row" style="gap:12px">
          <a class="btn cam xl" href="#cam">${I.cam}${t('Open Cam')}</a>
          <a class="btn xl" href="#drop">${I.down}${t('Open Drop')}</a>
        </div>`;
    } else if (k === 'veille') {
      left = `
        <span class="eyebrow"><span class="led off"></span>${name} · <span id="h-seen">${ago(S.device.last_seen)}</span></span>
        <h1 class="big-h"><span class="w">${t('Waiting')}</span><br><span class="w" style="animation-delay:.1s">${t('for the iPhone.')}</span></h1>
        <p class="lead">${t('Open Hyphn on the iPhone: it reconnects by itself, no scan needed.')}</p>
        <button class="btn xl" type="button" data-act="reconnect">${I.refresh}${t('Reconnect')}</button>`;
    } else {
      left = `
        <span class="eyebrow">${t('Welcome to Hyphn')}</span>
        <h1 class="big-h">${t('Pair your iPhone.').split(' ').map((w, i) => `<span class="w" style="animation-delay:${(i * 0.08).toFixed(2)}s">${w}</span>`).join(' ')}</h1>
        <p class="lead">${t('One QR code to scan, just once. Then everything happens by itself.')}</p>
        <a class="btn pri xl" href="#pair">${t('Pair an iPhone')}</a>`;
    }
    const dim = k === 'on' ? '' : ' dim';
    root.innerHTML = `
      <main class="wrap ${arrive ? 'arrive' : 'enter'}">
        <div id="h-low"></div>
        <section class="hero">
          <div>${left}</div>
          <div class="orbit${dim}" role="img" id="h-orbit" aria-label="${t('iPhone battery')}">
            <div class="spin"><span class="sat"></span></div>
            <svg class="ring" viewBox="0 0 340 340" aria-hidden="true">
              <defs><linearGradient id="bg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E7FFB8"/><stop offset="1" stop-color="#B9F25A"/></linearGradient></defs>
              <circle cx="170" cy="170" r="163" style="stroke:color-mix(in srgb, var(--tx) 7%, transparent);stroke-width:10"/>
              <circle class="arc" id="h-arc" cx="170" cy="170" r="163" style="stroke:url(#bg1);stroke-width:10;stroke-dasharray:0 1025"/>
            </svg>
            <div class="core">
              ${I.phone}
              <span class="pct" id="h-pct">—</span>
              <span style="font-size:13px;color:var(--tx2)" id="h-charge">${k === 'none' ? t('no iPhone') : ''}</span>
            </div>
          </div>
        </section>
        ${k === 'none' ? '' : `
        <section class="facts${dim}" aria-label="${t('iPhone state')}">
          <div class="fact" style="--c:var(--li)"><span class="ic">${I.bolt}</span><div><div class="k">${t('Battery')}${tip('battery')}</div><div class="v" id="f-bat">${t('unknown')}</div></div></div>
          <div class="fact" style="--c:var(--li)"><span class="ic">${I.temp}</span><div><div class="k">${t('Heat')}${tip('heat')}</div><div class="v" id="f-heat">${t('unknown')}</div></div></div>
          <div class="fact" style="--c:var(--cy)"><span class="ic">${I.wifi}</span><div><div class="k">${t('Connection')}${tip('ping')}</div><div class="v" id="f-link">${t('unknown')}</div></div></div>
          <div class="fact" style="--c:var(--cy)"><span class="ic">${I.disk}</span><div><div class="k">${t('Storage')}${tip('storage')}</div><div class="v" id="f-disk">${t('unknown')}</div></div></div>
        </section>
        <section class="acts${dim}">
          <a class="act" style="--c:var(--co)" href="#cam">
            <div class="thumb" aria-hidden="true">
              <span class="bk" style="left:6%;top:10%;width:60px;height:60px;background:#FFB547"></span>
              <span class="bk" style="left:64%;top:4%;width:74px;height:74px;background:#FF7A66;animation-delay:-3s"></span>
              <div class="mini"><span class="h"></span><span class="s"></span></div>
              <span class="tag" id="h-camtag">${t('Ready')}</span>
            </div>
            <div><h3>Cam</h3><p>${t('Your iPhone becomes the PC’s webcam, for Discord, Teams or OBS.')}</p><span class="go">${t('Open')}${I.arrow}</span></div>
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
            <div><h3>Drop</h3><p>${t('Photos and files between the iPhone and the PC. Coming soon.')}</p><span class="go">${t('See')}${I.arrow}</span></div>
          </a>
        </section>`}
      </main>`;
    if (arrive) toast(t('{name} is paired with this PC', { name: devName() }));
  },
  update() {
    if (!S.device) return;
    const p = S.status || {};
    const pct = p.battery;
    $('#h-pct').innerHTML = pct == null ? '—' : `${pct}<small>%</small>`;
    $('#h-arc').style.strokeDasharray = `${pct == null ? 0 : (1024 * pct / 100).toFixed(0)} 1025`;
    $('#h-orbit').setAttribute('aria-label', pct == null ? t('Battery unknown') : t('iPhone battery: {pct}', { pct: perc(pct) }));
    $('#h-charge').textContent = p.charge ? t('battery') + ' · ' + t(CHARGE[p.charge]) : t('battery');
    $('#f-bat').textContent = pct == null ? t('unknown') : perc(pct) + (p.charge ? ' · ' + t(CHARGE[p.charge]) : '');
    $('#f-heat').textContent = p.thermal ? t(HEAT[p.thermal]) : t('unknown');
    $('#f-link').textContent = S.connected ? `${linkQuality(S.latency_ms)} · ${linkName()}` : t('Offline');
    $('#f-disk').textContent = p.storage_free_gb == null ? t('unknown') : t('{n} GB free', { n: nf(Math.round(p.storage_free_gb)) });
    const q = S.cam.effective.quality;
    $('#h-camtag').textContent = S.connected ? `${t('Ready')} · ${resName(q.height)}${q.fps}` : t('Offline');
    const via = $('#h-via');
    if (via) via.textContent = t('linked {via}', { via: linkName() });
    const seen = $('#h-seen');
    if (seen) seen.textContent = ago(S.device.last_seen);
    const low = pct != null && pct < 15 && p.charge === 'unplugged' && settings && settings.low_battery_alert;
    $('#h-low').innerHTML = low
      ? `<div class="ban bad">${I.alert}<span><strong>${t('Low battery: {pct}.', { pct: perc(pct) })}</strong> ${t('Plug in the iPhone; Hyphn lowers the quality to last.')}</span></div>`
      : '';
  },
};

// ===================================================================
// Pairing
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
        <h2 style="margin:0;font-size:28px;letter-spacing:-.03em">${t('No QR code for now')}</h2>
        <p class="sub" style="max-width:520px;line-height:1.55">${esc(this.offer.problem)}</p>
        <button class="btn pri" type="button" data-act="renew">${I.refresh}${t('Try again')}</button></div>`;
    } else if (this.step === 'qr') {
      body = `<div class="stage">
        <div class="qrbox">
          <span class="corner a"></span><span class="corner b"></span><span class="corner c"></span><span class="corner e"></span>
          <div class="qr" role="img" aria-label="${t('Pairing QR code')}"><canvas id="p-qr"></canvas></div>
        </div>
        <div>
          <span class="lbl">${t('Step 1 of 2')}</span>
          <div class="steps">
            <div class="st"><b>1</b>${t('Open Hyphn on the iPhone')}</div>
            <div class="st"><b>2</b>${t('Hold it about 20 cm from the screen')}</div>
            <div class="st"><b>3</b>${t('Point at this code, that’s all')}</div>
          </div>
          <div class="timer">
            <div class="row" style="justify-content:space-between;font-size:13px;color:var(--tx2)"><span>${t('Single use · expires in')}</span><span class="mono" id="p-clock" style="color:var(--tx);font-size:20px">1:00</span></div>
            <div class="track"><span id="p-track" style="width:100%"></span></div>
          </div>
          ${this.err ? `<div class="ban bad" style="margin-bottom:18px">${I.alert}<span>${esc(this.err)}</span></div>` : ''}
          <div class="row">
            <button class="btn" type="button" data-act="renew">${I.refresh}${t('New QR')}</button>
          </div>
        </div>
      </div>`;
    } else if (this.step === 'code') {
      const d = this.code.split('');
      body = `<div class="stage" style="grid-template-columns:1fr;text-align:center;padding:56px 36px">
        <div>
          <span class="lbl">${t('Step 2 of 2 · {name} found', { name: esc(this.device) })}</span>
          <h2 style="margin:16px 0 36px;font-size:36px;letter-spacing:-.04em;font-weight:600">${t('Confirm on the iPhone')}</h2>
          <div class="digits" aria-label="${t('Code {code}', { code: d.join(' ') })}">${d.map((x, i) => `<span class="dg" style="animation-delay:${i * 0.12}s">${x}</span>`).join('')}</div>
          <p style="margin:26px auto 0;max-width:520px;color:var(--tx2);font-size:14px;line-height:1.55">${t('Same code on the iPhone? Tap “Yes, Pair”.')}</p>
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
        <h2 class="lt">${t('This PC and {name} are paired', { name: esc(this.device) })}</h2>
        <div class="lchips">
          <span class="lchip" style="animation-delay:2.1s">${I.check}${t('Paired for good')}</span>
          <span class="lchip" style="animation-delay:2.3s">${I.check}${t('End-to-end encrypted')}</span>
          <span class="lchip" style="animation-delay:2.5s">${I.check}${t('Reconnects by itself')}</span>
        </div>
        <button class="btn auto" type="button" data-act="home">${t('Go to Home')}</button>
      </div>`;
    }
    const replace = `<p class="sub">${S && S.device ? t('Pairing a new iPhone replaces {name}.', { name: esc(S.device.name) }) : t('Just once. Then the iPhone and this PC find each other by themselves.')}</p>`;
    this.root.innerHTML = `
      <main class="wrap enter" id="p-main">
        <header class="row" style="justify-content:space-between;align-items:flex-end;gap:16px">
          <div><h1 class="h1">${t('Pair an iPhone')}</h1>${replace}</div>
          <a class="btn" href="#home">${t('Close')}</a>
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
      if (e.step === 'linked') toast(t('{name} is paired with this PC', { name: e.device_name }));
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
      // E8: about 8 s of « paired », then slide to the home page.
      Pair.t1 = setTimeout(() => Pair.leave(), 8000);
    } else if (Pair.step !== 'linked') {
      Pair.err = e.message || (Pair.step === 'code' ? t('The iPhone said no or disconnected. Here is a new QR code.') : '');
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
// One list (ADR-0032): [name, res index, fps index, power, what it is for]. Index 6 = Custom.
// Names and captions are shown through t().
const PROFILES = [['Max', 0, 3, 'max', 'The best picture · 4K 60'], ['Balanced', 2, 3, 'balanced', '1080p 60 · runs cooler'],
  ['Saver', 3, 2, 'eco', '720p 30 · lasts long'], ['Call', 2, 2, 'balanced', '1080p 30 · Discord, Teams'],
  ['Stream', 0, 3, 'balanced', '4K 60 · OBS'], ['Class', 3, 2, 'balanced', '720p 30 · light']];
const CUSTOM = 6;
const POWER = [['max', 'Lower nothing', 'Best picture'], ['balanced', 'Lower a little', 'Less heat'], ['eco', 'Save power', 'Battery']];
const CAM_DEFAULTS = {
  res: 0, fps: 3, codec: 0, rate: 0, power: 'max',
  ev: 0, focus: 50, wb: 5600, afA: true, wbA: true, torch: false, stab: 0,
  aeA: true, iso: 200, shutter: 10000, tint: 0, zoom: 100, hdr: false, poi: null, peekAt: null,
  msg: 'Be right back', multi: true, langs: null, wst: 0, prof: 0, lens: 1, front: false, mirror: false, turn: 0,
};
// Stops offered by the stepped sliders, cut to what the iPhone allows.
const ISO_STOPS = [20, 25, 32, 40, 50, 64, 80, 100, 125, 160, 200, 250, 320, 400, 500, 640, 800, 1000, 1250, 1600, 2000, 2500, 3200, 4000, 5000, 6400, 8000, 10000, 12800];
const SHUTTER_DEN = [8000, 6400, 5000, 4000, 3200, 2500, 2000, 1600, 1250, 1000, 800, 640, 500, 400, 320, 250, 200, 160, 125, 100, 60, 50, 30, 25, 24];
// What each Reset puts back, and the categories of the panel.
const RESETS = {
  exp: ['aeA', 'ev', 'iso', 'shutter'], focus: ['afA', 'focus'], wb: ['wbA', 'wb', 'tint'], zoom: ['zoom'], poi: ['poi'],
  stab: ['stab'], hdr: ['hdr'], torch: ['torch'], res: ['res'], fps: ['fps'], codec: ['codec'], rate: ['rate'], power: ['power'],
  msg: ['msg'], multi: ['multi'], langs: ['langs'], wst: ['wst'],
};
const GROUPS = { light: ['exp'], sharp: ['focus', 'poi'], color: ['wb'], frame: ['zoom', 'stab', 'hdr', 'torch'], stream: ['res', 'fps', 'codec', 'rate', 'power'], wait: ['msg', 'multi', 'langs', 'wst'] };
// The « Auto » half of each Auto / Manual switch: [setting, value meaning Auto].
const AUTOS = { exp: ['aeA', true], focus: ['afA', true], wb: ['wbA', true] };
// Settings that make the iPhone camera work again (sent at once).
const SENT = ['res', 'fps', 'rate', 'codec', 'stab', 'power', 'aeA', 'ev', 'iso', 'shutter', 'afA', 'focus', 'wbA', 'wb', 'tint', 'zoom', 'hdr', 'poi', 'torch'];
// Slider value shown for a setting key.
const VK = { wb: 'wbK', focus: 'focusP' };
// Languages of the waiting message (ADR-0033): the 18 with words written by
// hand for the default message (same list and order as kLangs in
// apps/desktop-vcam/src/feed.cpp), then every other language Mozilla
// translates into. 2.6 s each.
const BUILTIN = {
  en: 'Be right back', fr: 'Je reviens bientôt', es: 'Vuelvo enseguida', de: 'Bin gleich zurück',
  it: 'Torno subito', pt: 'Volto já', nl: 'Ben zo terug', pl: 'Zaraz wracam',
  tr: 'Hemen dönüyorum', ru: 'Скоро вернусь', uk: 'Скоро повернуся', ar: 'سأعود قريبًا',
  hi: 'थोड़ी देर में वापस', zh: '马上回来', ja: 'すぐ戻ります', ko: '곧 돌아올게요',
  vi: 'Quay lại ngay', id: 'Segera kembali',
};
const DEFAULT_LANGS = Object.keys(BUILTIN);
// Both built-in defaults count as « no own message »: switching the window's
// language keeps a default message, in the new language (CAM_DEFAULTS.msg).
const isDefaultMsg = (m) => m === BUILTIN.en || m === BUILTIN.fr;
const sameMsg = (a, b) => a === b || (isDefaultMsg(a) && isDefaultMsg(b));
// What the translator reads (it translates from French): the French default for a default message.
const trSource = (m) => (isDefaultMsg(m) ? BUILTIN.fr : m);
// The Cam settings as saved, with a default message in the window's language.
function camSettings() {
  const c = Object.assign({}, CAM_DEFAULTS, settings.cam || {});
  if (isDefaultMsg(c.msg)) c.msg = CAM_DEFAULTS.msg;
  return c;
}
// Shown through langName() (t()).
const LANG_NAMES = {
  en: 'English', fr: 'French', es: 'Spanish', de: 'German', it: 'Italian', pt: 'Portuguese', nl: 'Dutch', pl: 'Polish',
  tr: 'Turkish', ru: 'Russian', uk: 'Ukrainian', ar: 'Arabic', hi: 'Hindi', zh: 'Simplified Chinese', ja: 'Japanese', ko: 'Korean',
  vi: 'Vietnamese', id: 'Indonesian', af: 'Afrikaans', sq: 'Albanian', az: 'Azerbaijani', eu: 'Basque', bn: 'Bengali', be: 'Belarusian',
  bs: 'Bosnian', bg: 'Bulgarian', ca: 'Catalan', 'zh-Hant': 'Traditional Chinese', hr: 'Croatian', da: 'Danish', et: 'Estonian',
  fi: 'Finnish', gl: 'Galician', el: 'Greek', gu: 'Gujarati', he: 'Hebrew', hu: 'Hungarian', is: 'Icelandic', kn: 'Kannada',
  lv: 'Latvian', lt: 'Lithuanian', ms: 'Malay', ml: 'Malayalam', mr: 'Marathi', nb: 'Norwegian', ug: 'Uyghur', ur: 'Urdu',
  fa: 'Persian', ro: 'Romanian', sr: 'Serbian', sk: 'Slovak', sl: 'Slovenian', sv: 'Swedish', tl: 'Tagalog', ta: 'Tamil',
  cs: 'Czech', te: 'Telugu', th: 'Thai',
};
const ALL_LANGS = Object.keys(LANG_NAMES);
// Right to left, and joined letters shown whole instead of letter by letter.
const RTL = new Set(['ar', 'fa', 'ur', 'ug', 'he']);
const WHOLE = new Set(['ar', 'fa', 'ur', 'ug', 'he', 'hi', 'mr', 'bn', 'gu', 'ta', 'te', 'kn', 'ml', 'th']);
const LOCALE = { fr: 'fr-fr', en: 'en-us', es: 'es-es', de: 'de-de', it: 'it-it', pt: 'pt-pt', nl: 'nl-nl', pl: 'pl-pl', tr: 'tr-tr',
  ru: 'ru-ru', uk: 'uk-ua', ar: 'ar-sa', hi: 'hi-in', zh: 'zh-cn', 'zh-Hant': 'zh-tw', ja: 'ja-jp', ko: 'ko-kr', vi: 'vi-vn', id: 'id-id' };
const chosenLangs = (c) => (Array.isArray(c.langs) && c.langs.length ? c.langs : DEFAULT_LANGS).filter((l) => LANG_NAMES[l]);
// The lines that roll: [lang, text] for each chosen language that has its words.
function waitLines(c) {
  const own = !isDefaultMsg(c.msg);
  const tr = c.tr && sameMsg(c.tr.msg, c.msg) ? c.tr.t : {};
  return chosenLangs(c).map((l) => [l, own ? (l === 'fr' ? c.msg : tr[l]) : BUILTIN[l] || tr[l]]).filter(([, t]) => t);
}
// A language needs its model from Mozilla to show the message in use.
const needsModel = (c, l) => l !== 'fr' && (!isDefaultMsg(c.msg) || !BUILTIN[l]);
// Languages still to translate for the message in use.
function untranslated(c) {
  const own = !isDefaultMsg(c.msg);
  const tr = c.tr && sameMsg(c.tr.msg, c.msg) ? c.tr.t : {};
  const failed = (typeof Cam !== 'undefined' && Cam.trFailed) || new Set();
  return chosenLangs(c).filter((l) => l !== 'fr' && !failed.has(l) && !(own ? tr[l] : BUILTIN[l] || tr[l]));
}
// One set of keyframes per number of languages: each one shows for 2.6 s of the round.
function rollKeyframes(n) {
  const id = 'nw-ch-' + n;
  if (!document.getElementById(id)) {
    const T = n * 2.6, pc = (sec) => (sec / T * 100).toFixed(3) + '%';
    const st = document.createElement('style');
    st.id = id;
    st.textContent = `@keyframes ${id} { 0% { opacity: 0; filter: blur(1.9cqh); transform: translateY(1.9cqh); } ${pc(0.936)}, ${pc(2.106)} { opacity: 1; filter: blur(0); transform: none; } ${pc(2.527)}, 100% { opacity: 0; filter: blur(1.9cqh); transform: translateY(-1.1cqh); } }`;
    document.head.appendChild(st);
  }
  return id;
}

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
    ws.onclose = () => setTimeout(() => { if (gen === this.gen && this.ws === ws) this.connect(url, gen); }, 800);
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
  // Off the page (effects for the webcam): decoding goes on, nothing on screen.
  detach() {
    this.canvas = null;
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
        // Out of sight (effects for the webcam): no screen refresh to wait for.
        if (document.hidden || !this.canvas) this.paint();
        else if (!this.raf) this.raf = requestAnimationFrame(() => this.paint());
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
    const dpr = window.devicePixelRatio || 1;
    const box = c ? c.getBoundingClientRect() : { width: 0, height: 0 };
    // With effects, the picture is drawn by them first (fx.js), once.
    let src = f, sw = f.displayWidth, sh = f.displayHeight;
    if (Effects.active()) {
      try {
        src = Effects.render(f, { w: box.width * dpr });
        sw = src.width;
        sh = src.height;
      } catch (e) {
        console.warn('effects', e);
      }
    }
    if (c) {
      // Drawn at the size shown on screen, not at the 4K of the stream.
      const scale = Math.min(1, (box.width * dpr) / sw, (box.height * dpr) / sh) || 1;
      const w = Math.max(2, Math.round(sw * scale)), h = Math.max(2, Math.round(sh * scale));
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
      this.ctx.drawImage(src, 0, 0, w, h);
    }
    this.lastFrame = performance.now();
    this.draw_ms[0] += this.lastFrame - this.pendingAt;
    this.draw_ms[1]++;
    f.close();
  },
  packet(u8) {
    if (!this.ws || u8.length < 18) return;
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

const LENS_L = ['0.5×', '1×', '2×', '5×']; // shown through t()

// A sentence wider than the picture shrinks until it fits, on one line, like
// the webcam does (feed.cpp). Runs whenever a waiting screen is put on screen.
function fitWait(root) {
  for (const wl of root.querySelectorAll('.wmsg .wl:not(.still)')) {
    wl.style.transform = '';
    let l = Infinity, r = -Infinity;
    for (const ch of wl.children) {
      const b = ch.getBoundingClientRect();
      l = Math.min(l, b.left);
      r = Math.max(r, b.right);
    }
    const k = wl.getBoundingClientRect().width / (r - l);
    if (k < 1) wl.style.transform = `scale(${k.toFixed(3)})`;
  }
}
new MutationObserver((list) => {
  for (const m of list) {
    for (const n of m.addedNodes) {
      if (n.nodeType === 1 && (n.classList.contains('wait2') || n.querySelector('.wait2'))) document.fonts.ready.then(() => fitWait(n));
    }
  }
}).observe(document.body, { childList: true, subtree: true });

// The waiting screen (ADR-0018): what Discord and OBS see while paused. The
// Windows webcam draws the same design itself (apps/desktop-vcam).
function waitScreen(c, sub) {
  // The chosen languages roll once they have their words (ADR-0033).
  const list = waitLines(c);
  const cycle = c.multi && list.length > 1;
  // The languages follow the Windows clock (2.6 s each), like the webcam
  // (feed.cpp): Discord shows the same one.
  const phase = (Date.now() % (list.length * 2600)) / 1000;
  const anim = rollKeyframes(list.length);
  // Letter by letter, 30 ms apart; joined letters (Arabic, Hindi…) stay whole.
  const line = ([lang, t], i) => {
    const parts = WHOLE.has(lang) ? [t] : Array.from(t);
    return `<div class="wl" lang="${lang}"${RTL.has(lang) ? ' dir="rtl"' : ''}>${parts.map((ch, j) =>
      `<span style="animation-name:${anim};animation-duration:${(list.length * 2.6).toFixed(1)}s;animation-delay:${(i * 2.6 + j * 0.03 - phase).toFixed(3)}s">${ch === ' ' ? '&nbsp;' : esc(ch)}</span>`).join('')}</div>`;
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

// Categories of the settings panel, in order: [id, name (through t()), icon].
const CATS = [['profile', 'Profile', 'spark'], ['light', 'Lighting', 'sun'], ['sharp', 'Focus', 'target'], ['color', 'Colors', 'palette'],
  ['frame', 'Framing', 'frame'], ['stream', 'Sending', 'up'], ['wait', 'Pause', 'moon']];

// Offline translation (ADR-0033): Rust brings the files (downloaded once
// from Mozilla), a worker runs Firefox's engine. One worker for the app.
const Translator = {
  worker: null,
  seq: 0,
  wait: {},
  started: false,
  call(msg, transfer = []) {
    if (!this.worker) {
      this.worker = new Worker('translate-worker.js');
      this.worker.onmessage = ({ data }) => {
        const w = this.wait[data.id];
        delete this.wait[data.id];
        if (w) data.error ? w[1](new Error(data.error)) : w[0](data.result);
      };
      // The engine died (memory…): the next time starts it again.
      this.worker.onerror = () => {
        this.worker.terminate();
        this.worker = null;
        this.started = false;
        for (const id of Object.keys(this.wait)) this.wait[id][1](new Error(t('the translator stopped')));
        this.wait = {};
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
  async load(pair, files) {
    const list = [];
    for (const f of files) list.push({ kind: f.kind, name: f.name, bytes: await this.bytes(f.path) });
    await this.call({ type: 'load', pair, files: list }, list.map((f) => f.bytes));
  },
  // The engine and the French → English model, once.
  async start() {
    if (this.started) return;
    const plan = await invoke('translate_plan', { langs: ['en'] });
    if (!plan || !plan.pairs['fr-en']) throw new Error(t('no French → English model'));
    const wasm = await this.bytes(plan.wasm);
    await this.call({ type: 'start', wasm }, [wasm]);
    await this.load('fr-en', plan.pairs['fr-en']);
    this.started = true;
  },
  // One language: its model downloaded if needed, used, then let go, so the
  // memory never holds more than two models. null: no model for it.
  async one(text, l, translating = () => {}) {
    await this.start();
    if (l === 'en') {
      translating();
      return this.call({ type: 'translate', text, to: 'en' });
    }
    const code = l === 'zh' ? 'zh-Hans' : l;
    let plan = null;
    try {
      plan = await invoke('translate_plan', { langs: [l] });
    } catch (e) { /* not installed */ }
    const files = plan && plan.pairs['en-' + code];
    if (!files) return null;
    await this.load('en-' + code, files);
    translating();
    try {
      return await this.call({ type: 'translate', text, to: code });
    } finally {
      await this.call({ type: 'unload', pair: 'en-' + code });
    }
  },
};

// The effects panel's tabs: [tab, name (through t()), icon, tooltip].
const FX_TABS = [['filter', 'Filters', 'palette', 'fx_filter'], ['mask', 'Emojis', 'smile', 'fx_mask'], ['3d', '3D', 'cube', 'fx_3d'],
  ['bg', 'Background', 'layers', 'fx_bg'], ['touch', 'Touch-up', 'spark', 'fx_touch']];
// The families of a tab: [name, [[id, name, picture], ...]]. Names go through t().
function fxGroups(kind) {
  if (kind === 'filter') return [['Classics', FX_FILTERS.filter(([id]) => id !== 'none')], ...FX_LOOK_GROUPS];
  if (kind === 'mask') return FX_MASK_GROUPS;
  if (kind === '3d') return FX_3D_GROUPS;
  if (kind === 'bg') return [['Blur', FX_BG.filter(([id]) => id === 'blur' || id === 'strong')], ['Scenes', FX_PHOTOS], ['Yours', FX_BG.filter(([id]) => id === 'image')]];
  return [];
}
const fxKey = (kind) => (kind === 'filter' || kind === 'bg' ? kind : 'mask');
const fxChosen = (f, kind) => (kind === 'touch' ? f.smooth > 0 || f.light > 0 : fxGroups(kind).some(([, items]) => items.some(([id]) => id === f[fxKey(kind)])));
// What is on now, as [setting, label] for the chips.
function fxActive(f) {
  const name = (list, id) => { const n = (list.find(([x]) => x === id) || [])[1]; return n ? t(n) : id; };
  const out = [];
  if (f.filter !== 'none') out.push(['filter', name([...FX_FILTERS, ...FX_LOOKS], f.filter)]);
  if (f.mask !== 'none') out.push(['mask', name(FX_MASKS, f.mask)]);
  if (f.bg !== 'none') out.push(['bg', name(FX_BG, f.bg)]);
  if (f.smooth > 0) out.push(['smooth', t('Smooth skin {pct}', { pct: perc(f.smooth) })]);
  if (f.light > 0) out.push(['light', t('Soft light {pct}', { pct: perc(f.light) })]);
  return out;
}
function fxDefaultOpen(f) {
  const open = new Set();
  for (const [kind] of FX_TABS) {
    const groups = fxGroups(kind);
    if (!groups.length) continue;
    const i = groups.findIndex(([, items]) => items.some(([id]) => id === f[fxKey(kind)]));
    open.add(`${kind}:${groups[Math.max(0, i)][0]}`).add(kind + ':fav').add(kind + ':recent');
  }
  return open;
}
// Lower case, no accents: « Cinéma » is found with « cinema ».
const fxFold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, ' ').trim();

const Cam = {
  key: () => '',
  mount(root) {
    this.cs = camSettings();
    if (this.cs.wst > 1) this.cs.wst = 0;
    // Saved before the power profiles (ADR-0032): its quality is kept, as « Custom ».
    if (settings.cam && Object.keys(settings.cam).length && !('power' in settings.cam)) Object.assign(this.cs, { power: 'max', prof: CUSTOM });
    // The point is chosen on the live picture, never kept from one time to the next.
    this.cs.poi = null;
    this.cs.fx = Object.assign({}, FX_DEFAULTS, this.cs.fx || {});
    Effects.set(this.cs.fx);
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
            <canvas class="scene vid" id="c-scene" role="img" aria-label="${t('Picture from the iPhone camera')}"></canvas>
            <span class="ptag">${t('Preview · only you')}</span>
            <button class="pclose" type="button" aria-label="${t('Hide the preview')}" title="${t('Hide the preview')}" data-act="peek">${I.close}</button>
            <span class="poi" id="c-poi" aria-hidden="true"></span>
          </div>
          <div id="c-wait"></div>
          <div class="hud l" id="c-hudl"></div>
          <div class="hud r" id="c-hudr"></div>
          <div id="c-notice"></div>
          <div class="dock" role="toolbar" aria-label="${t('Camera controls')}" id="c-dock"></div>
          <aside class="adj" id="c-adj" aria-label="${t('Camera panel')}"></aside>
        </div>
      </main>`;
    Video.start($('#c-scene'));
    // Panel open: a click on the live picture picks the focus and exposure point.
    $('#c-vbox').addEventListener('click', (e) => this.pickPoint(e));
    $('#c-vbox').addEventListener('pointerdown', (e) => this.dragPeek(e));
    this.placePeek();
    this.paintDock();
    this.push();
    // While paused, the iPhone sends a small preview only while this page is
    // on screen (ADR-0027).
    this.pushPreview();
    // Hidden window (tray, minimized): no decoding for nobody to see.
    this.onVis = () => {
      this.pushPreview();
      // Hidden with effects in Discord: still drawn, for the webcam.
      if (!document.hidden) Video.start($('#c-scene'));
      else if (Effects.active() && S && S.vcam && S.vcam.in_use) Video.detach();
      else Video.stop();
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
    // The languages as they really are on disk; what is missing comes next.
    this.langsFetch();
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
    // Effects shown in Discord: the window keeps drawing them, out of sight.
    if (Effects.active() && S && S.vcam && S.vcam.in_use) Video.detach();
    else Video.stop();
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
      // The lines as they roll here, for the Windows webcam (feed.cpp).
      const c = this.cs;
      c.lines = c.multi ? waitLines(c).map(([l, t]) => [LOCALE[l] || l, WHOLE.has(l), t]) : [];
      c.linesFor = c.msg;
      settings.cam = c;
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
    const sub = !S || !S.device ? `${t('No iPhone paired')} · <a href="#pair">${t('Pair')}</a>`
      : !conn ? t('iPhone offline')
        : live ? t('The picture is coming…') : '';
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
      <button class="pz ${live ? 'live' : 'paused'}" type="button" data-act="pause"${tipAttr('pause')} ${conn ? '' : 'disabled'}>${live ? I.pause + t('Pause') : I.play + t('Show camera')}</button>
      <div class="lens" role="group" aria-label="${t('Lens')}"${tipAttr('lens')}>${LENS_L.map((n, i) => `<button type="button" class="${i === c.lens && !c.front ? 'on' : ''}" data-act="set" data-k="lens" data-v="${i}" ${c.front ? 'disabled' : ''}>${t(n)}</button>`).join('')}</div>
      <button class="db${c.mirror ? ' on' : ''}" type="button" aria-label="${t('Mirror')}" aria-pressed="${!!c.mirror}"${tipAttr('mirror')} data-act="mirror">${I.mirror}</button>
      <button class="db${c.turn ? ' on' : ''}" type="button" aria-label="${t('Rotate 90°')}"${tipAttr('turn')} data-act="turn">${I.turn}</button>
      <button class="db" type="button" aria-label="${t('Switch camera')}"${tipAttr('flipcam')} data-act="flipcam">${I.flip}</button>
      ${live ? '' : `<button class="db${this.peekOn() ? ' on' : ''}" type="button" aria-label="${t(this.peekOn() ? 'Hide the preview' : 'Show the preview')}" aria-pressed="${this.peekOn()}"${tipAttr('peek')} data-act="peek">${this.peekOn() ? I.eye : I.eyeOff}</button>`}
      <span class="sep"></span>
      <button class="db fxb${this.panel === 'fx' ? ' on' : ''}${Effects.active() ? ' lit' : ''}" type="button" aria-label="${t('Effects')}"${tipAttr('fx')} data-act="panel" data-v="fx">${I.wand}</button>
      <button class="db${this.panel === 'info' ? ' on' : ''}" type="button" aria-label="${t('Stream info')}"${tipAttr('info')} data-act="panel" data-v="info">${I.info}</button>
      <button class="db${this.panel === 'set' ? ' on' : ''}" type="button" aria-label="${t('Camera settings')}"${tipAttr('set')} data-act="panel" data-v="set">${I.sliders}</button>
      <button class="db" type="button" aria-label="${t(this.full ? 'Exit full screen' : 'Full screen')}"${tipAttr('full')} data-act="full">${this.full ? I.shrink : I.expand}</button>`;
  },
  paintHud() {
    const conn = this.connected();
    const live = this.isLive() && conn;
    const q = S.cam.effective.quality;
    const ph = S.cam.phone;
    const qual = ph && ph.height && live ? `${resName(Math.min(ph.width, ph.height))} · ${ph.fps}` : `${resName(q.height)} · ${q.fps}`;
    const used = S.vcam && S.vcam.in_use ? `<span class="chip"${tipAttr('hudused')}>${I.cam}${S.vcam.in_use > 1 ? t('{n} apps', { n: S.vcam.in_use }) : t('Webcam in use')}</span>` : '';
    $('#c-hudl').innerHTML = (live
      ? `<span class="chip" style="color:#FFB3A6"><span class="rec"></span>${t('LIVE')}</span>`
      : `<span class="chip">${I.pause}${t('Paused')}</span>`) + `<span class="chip mono"${tipAttr('hudq')}>${qual}</span>` + used;
    const p = S.status;
    if (!S.device || !p) {
      $('#c-hudr').innerHTML = '';
    } else {
      const low = p.battery != null && p.battery < 15 && p.charge === 'unplugged';
      const bc = low ? '#FF7A66' : '#B9F25A';
      $('#c-hudr').innerHTML = `
        <span class="chip" style="color:${bc}"${tipAttr('battery')}><span class="batt" aria-hidden="true"><i style="width:${p.battery ?? 0}%"></i></span><span class="mono">${p.battery == null ? '—' : perc(p.battery)}</span>${p.charge !== 'unplugged' ? svg('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>', ` aria-label="${t('charging')}"`) : ''}</span>
        <span class="chip"${tipAttr('heat')}><span class="tdot" style="background:${HEAT_COLOR[p.thermal] || '#868F9D'}"></span>${p.thermal ? t(HEAT[p.thermal]) : t('unknown')}</span>
        <span class="chip"${tipAttr('ping')}>${onCable() ? I.cable : I.wifi}<span class="mono">${conn ? (S.latency_ms == null ? '—' : S.latency_ms + ' ms') : t('offline')}</span></span>`;
    }
    const e = S.cam.effective;
    const why = { battery: 'Low battery', low_power: 'iOS Low Power Mode' }[e.reason];
    $('#c-notice').innerHTML = !conn ? '' : e.alert
      ? `<div class="notice hot">${t('iPhone very hot: 1080p 30 to keep the picture')}</div>`
      : e.lowered && e.reason === 'hot' ? `<div class="notice">${t('iPhone hot: 30 fps to keep the picture')}</div>`
        : e.lowered && why ? `<div class="notice">${t('{why}: 1080p 30 (Saver profile)', { why: t(why) })}</div>`
          : e.reason === 'hot' ? `<div class="notice">${t('iPhone hot · your profile keeps the quality')}</div>` : '';
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
    const dockKey = [this.connected(), this.isLive(), this.cs.front, this.cs.lens, this.cs.mirror, this.cs.turn, this.peekOn(), this.full, Effects.active()].join('|');
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
  // Stream info, in the side panel (the picture stays in view): a summary
  // first, then the picture, the delay step by step, the link, the iPhone.
  paintInfo(fresh) {
    const el = $('#c-adj');
    if (!el || this.panel !== 'info') return;
    if (fresh || !$('#c-info', el)) {
      el.innerHTML = `<div class="ahd"><div class="aht">${I.info}${t('Stream info')}</div>
        <button class="ib" type="button" aria-label="${t('Close')}" data-act="close"${tipAttr('adjclose')}>${I.close}</button></div>
        <div class="abody" id="c-info"></div>`;
    }
    const st = S.cam.stats, q = S.cam.effective.quality, p = S.status || {}, ph = S.cam.phone, e = S.cam.effective;
    const conn = this.connected(), live = this.isLive() && conn;
    const sp = st.steps || {};
    const ms = (v) => (v == null ? t('unknown') : Math.round(v) + ' ms');
    const steps = [[t('Compression'), sp.encode_ms, 'i_enc', 'sa'], [t('Network'), sp.link_ms, 'i_link', 'sb'],
      [t('Decoding'), Video.steps.decode, 'i_dec', 'sc'], [t('Display'), Video.steps.draw, 'i_draw', 'sd']];
    const known = steps.every(([, v]) => v != null);
    const total = steps.reduce((a, [, v]) => a + (v || 0), 0);
    const asked = ph && ph.fps ? ph.fps : q.fps;
    // The summary, in plain words, with what to do.
    const [state, title, say] = !conn ? ['off', t('iPhone offline'), t('Open Hyphn on the iPhone: it reconnects by itself.')]
      : !live ? ['off', t('Paused'), t('Nothing is sent. Press “Show camera”.')]
        : (sp.queue_ms || 0) > 30 ? ['bad', t('The link can’t keep up'), t(onCable() ? 'Lower the bitrate or the picture size.' : 'Plug in the cable, or lower the bitrate or the picture size.')]
          : e.alert ? ['bad', t('iPhone very hot'), t('The picture went down to 1080p 30 so the camera is not stopped.')]
            : st.fps > 0 && st.fps < asked * 0.8 ? ['warn', t('Fewer pictures than planned'), t('The iPhone or the link can’t keep up: try 30 fps.')]
              : ['ok', t('All good'), known ? t('Smooth picture, {n} ms of delay.', { n: Math.round(total) }) : t('Smooth picture.')];
    const max = Math.max(1, ...this.spark);
    const bars = Array.from({ length: 40 }, (_, i) => this.spark[i - (40 - this.spark.length)] ?? 0)
      .map((v) => `<i style="height:${Math.max(4, Math.round(v / max * 100))}%"></i>`).join('');
    const tile = (k, v, tk, sub) => `<div class="tile"><div class="k">${k}${tip(tk)}</div><div class="v">${v}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div>`;
    const codec = Video.codec === 2 ? 'H.264' : Video.codec === 1 ? 'HEVC' : '—';
    const body = `
      <div class="health ${state}"><span class="hd"></span><div><b>${title}${tip('i_health')}</b><small>${say}</small></div></div>
      <section class="isec"><h4>${t('Picture')}</h4>
        <div class="tiles">
          ${tile(t('Picture sent'), ph && ph.height ? `${ph.width} × ${ph.height}` : resName(q.height), 'i_sent', t('{res} · {fps} fps', { res: resName(ph && ph.height ? Math.min(ph.width, ph.height) : q.height), fps: ph && ph.fps ? ph.fps : q.fps }))}
          ${tile(t('Compression'), codec, 'i_codec', codec === 'HEVC' ? t('Lightest') : codec === 'H.264' ? t('Compatible') : '')}
          ${tile(t('Pictures received'), `${n1(st.fps)}<small> / s</small>`, 'i_fps', t('of {n} asked', { n: asked }))}
          ${tile(t('Bitrate'), `${n1(st.bitrate_mbps)}<small> Mb/s</small>`, 'i_rate')}
        </div>
        <div class="spark" aria-hidden="true">${bars}</div>
      </section>
      <section class="isec"><h4>${t('Picture delay')}${tip('i_delay')}</h4>
        <div class="delay"><span class="mono">${known ? Math.round(total) : '—'}</span><small>${t('ms in all')}</small></div>
        <div class="dbar" aria-hidden="true">${known && total > 0 ? steps.map(([, v, , c2]) => `<i class="${c2}" style="flex:${Math.max(v, 1)}"></i>`).join('') : '<i class="none"></i>'}</div>
        <div class="dlist">${steps.map(([n, v, tk, c2]) => `<div><span class="dot ${c2}"></span>${n}${tip(tk)}<b class="mono">${ms(v)}</b></div>`).join('')}</div>
      </section>
      <section class="isec"><h4>${t('Link')}</h4>
        <div class="tiles">
          ${tile(t(onCable() ? 'By cable' : 'On Wi-Fi'), S.latency_ms == null ? t('unknown') : `${S.latency_ms}<small> ms</small>`, 'i_ping', t('link response'))}
          ${tile(t('Waiting in the iPhone'), ms(sp.queue_ms), 'i_queue', t((sp.queue_ms || 0) > 30 ? 'too much: lower the bitrate' : 'nothing is stuck'))}
          ${tile(t('Skipped pictures'), String(st.dropped + Video.drops), 'i_drop')}
          ${tile(t('Full pictures'), `${sp.keys_per_min ?? 0}<small> / min</small>`, 'i_keys')}
        </div>
      </section>
      <section class="isec"><h4>iPhone${tip('i_phone')}</h4>
        <div class="tiles">
          ${tile(t('Battery'), p.battery == null ? t('unknown') : `${p.battery}<small>${LANG === 'fr' ? ' %' : '%'}</small>`, 'battery', p.charge ? t(CHARGE[p.charge]) : '')}
          ${tile(t('Heat'), p.thermal ? t(HEAT[p.thermal]) : t('unknown'), 'heat')}
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
    clearInterval(this.thumbT);
    if (this.panel === 'set') {
      this.paintAdj();
      this.placePoint();
      this.langsFetch();
    } else if (this.panel === 'fx') {
      // The families open: the ones holding what is in use, then the first.
      if (!this.fxOpen) this.fxOpen = fxDefaultOpen(this.cs.fx);
      this.paintFx();
      // The filter previews follow the picture.
      this.thumbT = setInterval(() => this.fxThumbs(), 1500);
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
      ev: c.ev === 0 ? t('normal') : sign(c.ev),
      iso: 'ISO ' + c.iso,
      shutter: '1/' + Math.round(1e6 / c.shutter) + ' s',
      focusP: perc(c.focus),
      wbK: c.wb + ' K',
      tint: c.tint === 0 ? t('neutral') : (c.tint > 0 ? '+' : '−') + Math.abs(c.tint),
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
    // Labels, captions and slider ends are written in English and shown through t().
    const resetBtn = (k, label) => (changed(k) ? `<button type="button" class="rb" data-act="reset" data-k="${k}" aria-label="${esc(t('Reset {name}', { name: t(label) }))}"${tipAttr('reset')}>${I.refresh}</button>` : '');
    // Big choices with a short caption under each.
    const opts = (k, list, cur = c[k], act = 'set') => `<div class="opts">${list.map(([v, n, sub]) => `<button type="button" class="opt${cur === v ? ' on' : ''}" data-act="${act}" data-k="${k}" data-v="${v}" aria-pressed="${cur === v}"><b>${esc(t(n))}</b>${sub ? `<small>${esc(t(sub))}</small>` : ''}</button>`).join('')}</div>`;
    const tog = (k, on, off) => `<button class="tg" type="button" data-act="toggle" data-k="${k}" aria-pressed="${!!c[k]}"><span>${esc(t(c[k] ? on : off))}</span><span class="sw${c[k] ? ' on' : ''}"></span></button>`;
    // A slider with its words at both ends; `steps` makes it pick among those values.
    const range = (k, label, o) => {
      const steps = o.steps;
      const v = steps ? this.near(steps, c[k]) : c[k];
      const lo = steps ? 0 : o.min, hi = steps ? steps.length - 1 : o.max;
      const p = hi > lo ? ((v - lo) / (hi - lo) * 100).toFixed(1) : 0;
      return `<div class="sl">
          ${label ? `<div class="r"><span>${esc(t(label))}${tip(o.tip || VK[k] || k)}</span><span class="val" id="v-${k}">${esc(this.valueOf(VK[k] || k))}</span></div>` : ''}
          <input type="range" min="${lo}" max="${hi}" step="${steps ? 1 : o.step}" value="${v}" data-input="slide" data-change="slid" data-k="${k}"${steps ? ` data-steps="${k}"` : ''} style="--p:${p}%" aria-label="${esc(t(label || o.aria))}">
          ${o.ends ? `<div class="ends"><span>${esc(t(o.ends[0]))}</span><span>${esc(t(o.ends[1]))}</span></div>` : ''}
        </div>`;
    };
    const mode = (k) => {
      const [key, on] = AUTOS[k];
      const auto = c[key] === on;
      return `<div class="seg2" role="group" aria-label="${t('Auto or manual')}"${tipAttr('manual')}>
          <button type="button" class="${auto ? 'on' : ''}" data-act="auto" data-k="${k}" data-v="1" aria-pressed="${auto}">Auto</button>
          <button type="button" class="${auto ? '' : 'on'}" data-act="auto" data-k="${k}" data-v="0" aria-pressed="${!auto}">${t('Manual')}</button></div>`;
    };
    // One setting of a category: name, value, Reset when changed, then its control.
    const row = (k, label, body, val = '') => `<div class="ar">
        <div class="ah"><span class="an">${esc(t(label))}${tip(k)}</span>${val ? `<span class="av" id="v-${k}">${esc(val)}</span>` : ''}${resetBtn(k, label)}</div>
        ${body}</div>`;
    // A category: its icon and name, the Auto / Manual switch when it has one,
    // Reset when something in it changed, then its rows. Empty: not shown.
    const sec = (id, title, rows, head = '') => (!rows ? '' : `<section class="ag" id="cat-${id}" data-cat="${id}">
        <div class="agh"><span class="gi">${I[CATS.find(([x]) => x === id)[2]]}</span><h3>${t(title)}</h3>${tip('cat_' + id)}
          ${GROUPS[id] && GROUPS[id].some(changed) ? `<button type="button" class="rb" data-act="greset" data-v="${id}" aria-label="${esc(t('Reset {name}', { name: t(title) }))}"${tipAttr('greset')}>${I.refresh}</button>` : ''}
          ${head}</div>
        ${rows}</section>`);
    const zoomMax = this.caps() ? Math.max(100, this.caps().zoom_max_pct) : 500;
    const profile = `<div class="pgrid">${PROFILES.map(([n, , , , d], i) => `<button type="button" class="pcard${c.prof === i ? ' on' : ''}" data-act="profile" data-v="${i}" aria-pressed="${c.prof === i}"><b>${t(n)}</b><small>${t(d)}</small></button>`).join('')}</div>
      ${c.prof === CUSTOM ? `<div class="hint">${t('Custom: you changed the size, the smoothness or the sending by hand.')}</div>` : ''}`;
    const light = c.aeA || !this.can('exp')
      ? range('ev', 'Darker or brighter', { min: -2, max: 2, step: 0.1, ends: ['Darker', 'Brighter'] })
      : range('iso', 'Sensitivity', { steps: this.isoStops(), ends: ['Less grain', 'Brighter'] })
        + range('shutter', 'Shutter speed', { steps: this.shutterStops(), ends: ['Sharp when moving', 'Brighter'] });
    const sharp = (this.can('focus') && !c.afA ? range('focus', 'Distance', { min: 0, max: 100, step: 1, ends: ['Very close', 'Far away'] }) : '')
      + (this.can('focus') && c.afA ? `<div class="hint">${t('The iPhone focuses by itself on what is in front of it.')}</div>` : '')
      + (this.can('poi') ? row('poi', 'Tracked point', `<div class="hint">${t(c.poi ? 'Point chosen: click elsewhere to move it.' : 'Click the picture to choose what must be sharp and well lit.')}</div>`, t(c.poi ? 'chosen' : 'center')) : '');
    const color = !this.can('wb') ? '' : c.wbA
      ? `<div class="hint">${t('The iPhone follows the color of the room’s light.')}</div>`
      : range('wb', 'Warmth', { min: 2500, max: 8000, step: 100, ends: ['Bluer', 'More orange'] })
        + (this.can('tint') ? range('tint', 'Tint', { min: -150, max: 150, step: 5, ends: ['Greener', 'Pinker'] }) : '');
    const frame = (this.can('zoom') ? row('zoom', 'Zoom', range('zoom', '', { min: 100, max: zoomMax, step: 10, ends: ['1×', n1(zoomMax / 100) + '×'], aria: 'Zoom' }), this.valueOf('zoom')) : '')
      + row('stab', 'Stabilization', opts('stab', [[0, 'Off', 'On a stand'], [1, 'Gentle', 'Handheld'], [2, 'Strong', 'Walking']]))
      + (this.can('hdr') ? row('hdr', 'Backlight', tog('hdr', 'On', 'Off')) : '')
      + (this.can('torch') ? row('torch', 'Flashlight', tog('torch', 'Light on', 'Light off')) : '');
    const stream = row('res', 'Picture size', opts('res', RES_L.map((n, i) => [i, n, ['Sharpest', 'Very sharp', 'Calls', 'Small', 'Tiny'][i]])))
      + row('fps', 'Smoothness', opts('fps', FPS.map((n, i) => [i, String(n), ['Cinema', 'TV', 'Call', 'Smooth', 'Very smooth'][i]])))
      + row('power', 'If the iPhone gets hot', opts('power', POWER, c.power, 'power'))
      + row('codec', 'Compression', opts('codec', [[0, 'HEVC', 'Recommended'], [1, 'H.264', 'Compatible']]))
      + row('rate', 'Bitrate', opts('rate', RATE.map((v, i) => [i, i ? String(v) : 'Auto', i ? 'Mb/s' : 'Recommended'])));
    const tr = this.trState();
    const wait = row('msg', 'Message', `<input class="txt" type="text" maxlength="60" value="${esc(c.msg)}" data-change="msg" aria-label="${t('Pause message')}">`)
      + row('multi', 'Several languages', tog('multi', 'Yes', 'No') + (c.multi && tr ? `<div class="hint${tr.bad ? ' warn' : ''}" id="c-tr">${esc(tr.text)}</div>` : ''))
      + (c.multi ? row('langs', 'Languages', `<div class="hint">${t('{n} chosen of {all}. About 25 MB to download per new language, just once.', { n: chosenLangs(c).length, all: ALL_LANGS.length })}</div>
          <div class="lchoice">${ALL_LANGS.map((l) => `<button type="button" class="lc${chosenLangs(c).includes(l) ? ' on' : ''}" data-act="lang" data-v="${l}" aria-pressed="${chosenLangs(c).includes(l)}" ${l === 'fr' ? 'disabled' : ''}><i aria-hidden="true"></i>${esc(langName(l))}</button>`).join('')}</div>
          <div class="row" style="gap:6px"><button type="button" class="lc" data-act="langs" data-v="default">${t('The 18 to start with')}</button><button type="button" class="lc" data-act="langs" data-v="all">${t('All')}</button></div>`) : '')
      + row('wst', 'Style', opts('wst', [[0, 'Animated', 'The sign moves'], [1, 'Calm', 'Still']]))
      + `<div class="wprev">${waitScreen(c, '')}</div>`;
    const sections = [
      sec('profile', 'Profile', profile),
      sec('light', 'Lighting', light, this.can('exp') ? mode('exp') : ''),
      sec('sharp', 'Focus', sharp, this.can('focus') ? mode('focus') : ''),
      sec('color', 'Colors', color, this.can('wb') ? mode('wb') : ''),
      sec('frame', 'Framing', frame),
      sec('stream', 'Sending', stream),
      sec('wait', 'Pause', wait),
    ];
    const shown = CATS.filter((_, i) => sections[i]);
    el.innerHTML = `
      <div class="ahd"><div class="aht">${I.sliders}${t('Settings')}</div>
        <button class="ib" type="button" aria-label="${t('Hide the settings')}" data-act="close"${tipAttr('adjclose')}>${I.close}</button></div>
      <nav class="anav" aria-label="${t('Categories')}">${shown.map(([id, n, ic]) => `<button type="button" data-act="jump" data-v="${id}">${I[ic]}<span>${t(n)}</span></button>`).join('')}</nav>
      <div class="abody">
        ${this.old() ? `<div class="upd">${I.info}<span>${t('Update the iPhone app to get every setting.')}</span>${tip('update')}</div>` : ''}
        ${sections.join('')}
        <button type="button" class="allr" data-act="allreset"${tipAttr('allreset')}>${I.refresh}${t('Reset everything to the start')}</button>
      </div>`;
    const body = $('.abody', el);
    body.scrollTop = scroll;
    body.addEventListener('scroll', () => this.spy(), { passive: true });
    this.spy();
    this.paintLangs();
  },
  // The effects panel (spec `Cam - Filtres et effets`): a search over
  // everything, one tab per kind, families that fold, favourites and recent
  // ones on top, and the effects in use, each removable in one click.
  paintFx() {
    const el = $('#c-adj');
    if (!el || this.panel !== 'fx') return;
    const f = this.cs.fx;
    const tab = this.fxTab || 'filter';
    const prev = $('.abody', el);
    const scroll = prev && this.fxPainted === tab ? prev.scrollTop : 0;
    const search = $('.fxsearch input', el);
    const focused = search && document.activeElement === search;
    const q = this.fxQuery || '';
    const used = FX_TABS.filter(([kind]) => fxChosen(f, kind));
    const chips = fxActive(f).map(([k, n]) => `<button type="button" class="fxchip" data-act="fxclear" data-k="${k}"${tipAttr('fx_chip')}><span>${esc(n)}</span>${I.close}</button>`).join('');
    el.innerHTML = `
      <div class="ahd"><div class="aht">${I.wand}${t('Effects')}</div>
        <button class="ib" type="button" aria-label="${t('Close the effects')}" data-act="close"${tipAttr('adjclose')}>${I.close}</button></div>
      <div class="fxtop">
        <label class="fxsearch"${tipAttr('fx_search')}>${I.search}<input type="search" placeholder="${t('Search: hat, cine, cat…')}" value="${esc(q)}" data-input="fxsearch" aria-label="${t('Search for an effect')}" autocomplete="off" spellcheck="false">
          <button type="button" class="x${q ? '' : ' off'}" data-act="fxsearchclr" aria-label="${t('Clear the search')}"${tipAttr('fx_searchclr')}>${I.close}</button></label>
        <nav class="fxtabs${q ? ' dim' : ''}" role="tablist" aria-label="${t('Kinds of effects')}">${FX_TABS.map(([kind, n, ic, tk]) => `<button type="button" role="tab" aria-selected="${kind === tab}" class="${kind === tab ? 'on' : ''}" data-act="fxtab" data-v="${kind}"${tipAttr(tk)}>${used.some(([u]) => u === kind) ? '<i class="dot" aria-hidden="true"></i>' : ''}${I[ic]}<span>${t(n)}</span></button>`).join('')}</nav>
        <div class="fxchips">${chips || `<span class="fxnone">${t('No effect: the picture goes out as it is.')}</span>`}${chips ? `<button type="button" class="clr" data-act="fxoff"${tipAttr('fx_off')}>${t('Remove all')}</button>` : ''}</div>
      </div>
      <div class="abody fxbody"></div>
      <input type="file" accept="image/*" id="fx-file" hidden data-change="fxfile">`;
    // Enter or Space on a card picks it, as a click does.
    el.onkeydown = (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role="button"][data-act]')) {
        e.preventDefault();
        e.target.click();
      }
    };
    this.paintFxBody();
    $('.abody', el).scrollTop = scroll;
    this.fxPainted = tab;
    if (focused) {
      const s = $('.fxsearch input', el);
      s.focus();
      s.setSelectionRange(s.value.length, s.value.length);
    }
  },
  // The list under the tabs: the search results, or the chosen tab.
  paintFxBody() {
    const body = $('#c-adj .fxbody');
    if (!body) return;
    const f = this.cs.fx;
    const tab = this.fxTab || 'filter';
    const q = fxFold(this.fxQuery || '');
    const fav = new Set(this.cs.fxFav || []);
    // Effect, family and tab names are written in English and shown through t().
    const card = (kind, [id, n, pic]) => {
      const k = fxKey(kind);
      const on = f[k] === id;
      const name = esc(t(n));
      const star = `<button type="button" class="fav${fav.has(k + ':' + id) ? ' on' : ''}" data-act="fxfav" data-v="${k}:${id}" aria-label="${t('Favorite: {name}', { name })}" aria-pressed="${fav.has(k + ':' + id)}"${tipAttr('fx_fav')}>${I.star}</button>`;
      const attrs = `role="button" tabindex="0" data-act="${id === 'image' ? 'fxpick' : 'fx'}" data-k="${k}" data-v="${id}" aria-pressed="${on}" aria-label="${name}"`;
      if (kind === 'filter') return `<div class="fcard${on ? ' on' : ''}" ${attrs}><canvas width="160" height="90" data-thumb="${id}"></canvas><b>${name}</b>${star}</div>`;
      if (kind === 'bg') {
        const icon = { blur: '💧', strong: '🌫️', image: '🖼️' }[id];
        return `<div class="ecard${icon ? '' : ' photo'}${on ? ' on' : ''}" ${attrs}>${icon ? `<i aria-hidden="true">${icon}</i>` : `<img src="vendor/backgrounds/${id}.jpg" alt="" loading="lazy">`}<b>${name}</b>${star}</div>`;
      }
      return `<div class="ecard${kind === '3d' ? ' m3' : ''}${on ? ' on' : ''}" ${attrs}><img src="${fxPicture(pic)}" alt="" loading="lazy"><b>${name}</b>${star}</div>`;
    };
    const grid = (kind, list) => `<div class="${kind === 'filter' ? 'fgrid' : 'egrid'}">${list.map((it) => card(kind, it)).join('')}</div>`;
    const acc = (key, title, kind, list, lead = '') => {
      const k = fxKey(kind);
      const pick = list.find(([id]) => f[k] === id);
      const open = q || this.fxOpen.has(key);
      return `<section class="acc${open ? ' open' : ''}" data-acc="${esc(key)}">
          <button type="button" class="acch" data-act="fxacc" data-v="${esc(key)}" aria-expanded="${!!open}"${tipAttr('fx_group')}>
            <span>${esc(t(title))}</span>${pick ? `<small>${esc(t(pick[1]))}</small>` : ''}<em>${list.length}</em>${I.chev}</button>
          <div class="accb"><div><div class="acci">${lead}${grid(kind, list)}</div></div></div></section>`;
    };
    const range = (k, label, ends) => `<div class="sl"><div class="r"><span>${esc(t(label))}${tip('fx_' + k)}</span><span class="val" id="fv-${k}">${perc(f[k])}</span></div>
        <input type="range" min="0" max="100" step="1" value="${f[k]}" data-input="fxslide" data-change="fxslid" data-k="${k}" style="--p:${f[k]}%" aria-label="${esc(t(label))}">
        <div class="ends"><span>${esc(t(ends[0]))}</span><span>${esc(t(ends[1]))}</span></div></div>`;
    const status = Effects.error ? `<div class="hint warn">${esc(Effects.error)}</div>`
      : (Effects.needsFace() || f.bg !== 'none') && !Effects.face ? `<div class="hint">${t('Getting face detection ready…')}</div>` : '';
    const webcam = S && S.vcam && S.vcam.in_use
      ? (S.vcam.fx_size ? `<div class="upd ok">${I.check}<span>${t('Discord, Teams or OBS sees these effects.')}</span>${tip('fx_webcam')}</div>` : `<div class="upd">${I.info}<span>${t('This webcam does not get the effects yet: install the new webcam (Settings).')}</span></div>`)
      : '';
    let html = webcam + status;
    if (q) {
      // Everything whose name matches, kind by kind, or whose family starts
      // with the word (« hat » finds the 3D hats, not every pair of glasses).
      // Names are matched as shown, so French is searched in French.
      let found = 0;
      for (const [kind, n] of FX_TABS) {
        if (kind === 'touch') continue;
        const list = fxGroups(kind).flatMap(([g, items]) => items.filter(([, name]) => fxFold(t(name)).includes(q) || fxFold(t(g)).startsWith(q)));
        found += list.length;
        if (list.length) html += acc('q:' + kind, n, kind, list);
      }
      if (!found) html += `<div class="fxempty">${I.search}<b>${t('Nothing for “{q}”', { q: esc(this.fxQuery) })}</b><span>${t('Try another word: hat, cat, snow, cine…')}</span></div>`;
    } else if (tab === 'touch') {
      html += `<div class="fxcard">${range('smooth', 'Smooth skin', ['Natural', 'Smoothest'])}${range('light', 'Soft light', ['None', 'Bright'])}</div>`;
    } else {
      const k = fxKey(tab);
      const all = fxGroups(tab).flatMap(([, items]) => items);
      const byId = (id) => all.find(([x]) => x === id);
      const favs = (this.cs.fxFav || []).filter((x) => x.startsWith(k + ':')).map((x) => byId(x.slice(k.length + 1))).filter(Boolean);
      const recent = (this.cs.fxRecent || []).filter((x) => x.startsWith(k + ':')).map((x) => byId(x.slice(k.length + 1))).filter(Boolean).slice(0, 8);
      if (tab === 'filter' && f.filter !== 'none') html += `<div class="fxcard">${range('amount', 'Filter strength', ['Subtle', 'Full'])}</div>`;
      if (favs.length) html += acc(tab + ':fav', '★ Favorites', tab, favs);
      if (recent.length) html += acc(tab + ':recent', 'Recent', tab, recent);
      for (const [g, items] of fxGroups(tab)) html += acc(tab + ':' + g, g, tab, items);
    }
    body.innerHTML = html;
    this.fxThumbs();
  },
  // Each filter shown on the current picture.
  fxThumbs() {
    // Always the picture as it comes, never one already filtered.
    const raw = Effects.active() && Effects.canvases.small;
    const src = raw && raw.width ? raw : $('#c-scene');
    if (!src || !src.width || this.panel !== 'fx') return;
    // Only the families that are open: the folded ones cost nothing.
    for (const cv of document.querySelectorAll('#c-adj .acc.open canvas[data-thumb]')) {
      const look = FX_LOOKS.find(([id]) => id === cv.dataset.thumb);
      const f = FX_FILTERS.find(([id]) => id === cv.dataset.thumb) || FX_FILTERS[0];
      const g = cv.getContext('2d');
      const s = Math.max(cv.width / src.width, cv.height / src.height);
      g.filter = f[2];
      g.drawImage(src, (cv.width - src.width * s) / 2, (cv.height - src.height * s) / 2, src.width * s, src.height * s);
      g.filter = 'none';
      if (look) {
        const out = Looks.thumbs.apply(cv, cv.width, cv.height, look, 1);
        if (out) g.drawImage(out, 0, 0);
      }
      if (f[3]) {
        g.globalCompositeOperation = f[3][1];
        g.globalAlpha = f[3][2];
        g.fillStyle = f[3][0];
        g.fillRect(0, 0, cv.width, cv.height);
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = 1;
      }
    }
  },
  fxChanged() {
    Effects.set(this.cs.fx);
    this.dockKey = '';
    this.paintDock();
    this.paintFx();
    this.save();
  },
  // The category on screen is lit in the menu.
  spy() {
    const body = $('#c-adj .abody');
    if (!body) return;
    let on = '';
    const all = body.querySelectorAll('.ag');
    for (const s of all) if (s.offsetTop - body.scrollTop <= 60) on = s.dataset.cat;
    if (!on) on = (all[0] || { dataset: {} }).dataset.cat;
    // At the bottom, the last categories cannot reach the top: the one asked
    // for (or the last) is lit.
    const bottom = body.scrollTop + body.clientHeight >= body.scrollHeight - 4;
    if (!bottom && Date.now() - (this.jumpedAt || 0) > 900) this.jumped = '';
    if (bottom) on = this.jumped || (all[all.length - 1] || { dataset: {} }).dataset.cat;
    if (this.jumped && Date.now() - this.jumpedAt < 900) on = this.jumped;
    for (const b of document.querySelectorAll('#c-adj .anav button')) {
      b.classList.toggle('on', b.dataset.v === on);
      // The lit one stays in view in the menu.
      if (b.dataset.v === on && on !== this.spied) b.parentNode.scrollTo({ left: b.offsetLeft - 18, behavior: 'smooth' });
    }
    this.spied = on;
  },
  // Res, fps, power, rate and codec as one of the profiles, or « Custom ».
  matchProfile() {
    const c = this.cs;
    const i = PROFILES.findIndex(([, r, f, p]) => r === c.res && f === c.fps && p === c.power);
    c.prof = i >= 0 && c.rate === 0 && c.codec === 0 ? i : CUSTOM;
  },
  // The paused preview goes where it was dragged: [x, y] from the bottom right
  // corner, 0..1 of the free room, so it stays inside at any window size.
  placePeek() {
    const box = $('#c-vbox');
    const at = this.cs.peekAt;
    box.classList.toggle('moved', !!at);
    if (!at) return;
    box.style.setProperty('--fx', at[0]);
    box.style.setProperty('--fy', at[1]);
  },
  dragPeek(e) {
    const box = $('#c-vbox');
    if (e.button !== 0 || !box.classList.contains('peek') || e.target.closest('.pclose')) return;
    e.preventDefault();
    const pv = $('#c-pv').getBoundingClientRect();
    const b = box.getBoundingClientRect();
    const dx = e.clientX - b.left, dy = e.clientY - b.top;
    const clamp = (v) => Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000;
    let at = null;
    const move = (ev) => {
      at = [clamp((pv.right - (ev.clientX - dx + b.width)) / (pv.width - b.width)),
        clamp((pv.bottom - (ev.clientY - dy + b.height)) / (pv.height - b.height))];
      this.cs.peekAt = at;
      this.placePeek();
    };
    const up = () => {
      box.classList.remove('drag');
      box.removeEventListener('pointermove', move);
      box.removeEventListener('pointerup', up);
      box.removeEventListener('pointercancel', up);
      if (at) this.save();
    };
    box.setPointerCapture(e.pointerId);
    box.classList.add('drag');
    box.addEventListener('pointermove', move);
    box.addEventListener('pointerup', up);
    box.addEventListener('pointercancel', up);
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
  // Languages unticked are uninstalled (their files deleted, their
  // translation forgotten); ticked ones are installed. In line, step by step.
  langsChanged(removed, added) {
    if (this.cs.tr && removed.length) {
      const t = Object.assign({}, this.cs.tr.t);
      for (const l of removed) delete t[l];
      this.cs.tr = { msg: this.cs.tr.msg, t };
    }
    this.changed(false);
    const rm = removed.filter((l) => l !== 'fr' && (this.ls ? this.ls.installed.includes(l) || this.ls.queue.some(([, x]) => x === l) : true));
    if (rm.length) this.ask('remove', rm);
    const add = added.filter((l) => needsModel(this.cs, l));
    if (add.length) this.ask('install', add);
    if (!rm.length && !add.length) this.pump();
  },
  resetKeys(keys) {
    const before = chosenLangs(this.cs);
    for (const k of keys) for (const f of RESETS[k] || []) this.cs[f] = CAM_DEFAULTS[f];
    const after = chosenLangs(this.cs);
    if (before.join() !== after.join()) this.langsChanged(before.filter((l) => !after.includes(l)), after.filter((l) => !before.includes(l)));
    if (keys.includes('poi')) this.placePoint();
    this.matchProfile();
    this.changed(true, keys.some((k) => GROUPS.wait.includes(k)));
    if (keys.includes('msg')) this.pump();
  },
  // The waiting message in the chosen languages (ADR-0033). One step at a
  // time, never two together: installs and removals (Rust, `langs.rs`, they
  // go on through a reload), then the translation (here). Asked meanwhile:
  // it waits for the step in progress to end.
  trState() {
    const c = this.cs, st = this.ls;
    if (this.trBusy) return { text: this.trBusy };
    if (st && st.current) {
      const name = langName(st.current.lang);
      return { text: st.current.op === 'install' ? t('Installing {name}… The translation will follow.', { name }) : t('Removing {name}…', { name }) };
    }
    if (this.trErr) return { text: this.trErr, bad: true };
    const n = waitLines(c).length, all = chosenLangs(c).length;
    if (isDefaultMsg(c.msg) && !untranslated(c).length) return { text: t('Ready in {n} languages.', { n }) };
    if (!untranslated(c).length) return { text: t('Ready in {n} languages.', { n }) };
    return { text: n > 1 ? t('Ready in {n} languages of {all}; the others are coming.', { n, all }) : t('Not translated yet.') };
  },
  trStep(text) {
    this.trBusy = text;
    const el = $('#c-tr');
    if (el) el.textContent = text;
  },
  // The state of the languages, read from the disk by Rust.
  async langsFetch() {
    try {
      this.onLangs(await invoke('langs_status'));
    } catch (e) { /* older app */ }
  },
  onLangs(st) {
    this.ls = st;
    this.langsCard(st);
    this.paintLangs();
    this.pump();
  },
  // The corner card for the install or removal in hand.
  langsCard(st) {
    const c = st.current;
    const mo = (b) => Math.round(b / 1e6);
    if (c) {
      const inst = c.op === 'install';
      Popup.item({
        icon: inst ? (c.stage === 0 ? 'down' : 'check') : 'trash',
        name: langName(c.lang),
        i: st.batch_done + 1,
        n: Math.max(st.batch_total, st.batch_done + 1),
        steps: inst ? [t('Download'), t('Check'), t('Installed')] : [t('Removal'), t('Space freed')],
        step: inst ? c.stage : c.stage >= 2 ? 1 : 0,
        pct: inst ? (c.stage === 0 ? (c.total ? (c.done / c.total) * 90 : 2) : c.stage === 1 ? 95 : 100) : c.stage >= 2 ? 100 : 45,
        sub: inst ? (c.stage === 0 ? (c.total ? `${mo(c.done)} / ${mo(c.total)} ${t('MB')}` : t('Connecting to Mozilla…')) : c.stage === 1 ? t('Checking the fingerprint…') : t('Installed'))
          : c.stage >= 2 ? t('Files deleted') : t('Deleting the files…'),
      });
      return;
    }
    // A batch just ended: its summary, once.
    const key = [st.batch_total, st.batch_done, st.freed, st.failed.join()].join('|');
    if (!st.batch_total || st.batch_done < st.batch_total || key === this.lsSummary) return;
    this.lsSummary = key;
    if (st.failed.length) Popup.show({ title: t('Some languages could not be added'), text: langList(st.failed), bad: true });
    else if (st.freed) Popup.show({ icon: 'trash', title: t('Space freed'), text: t('{n} MB freed', { n: mo(st.freed) }), done: true });
    else Popup.show({ title: t('Languages installed'), text: t('The message translation follows.'), done: true });
  },
  // The next step, only when nothing is going on: queued asks first, then
  // the chosen languages still missing, then the translation.
  pump() {
    const st = this.ls;
    if (!st || this.trBusy || st.current || st.queue.length) return;
    if (this.asks && this.asks.length) {
      const asks = this.asks;
      this.asks = [];
      for (const [op, list] of asks) invoke('langs_ask', { op, list });
      return;
    }
    const c = this.cs;
    // Mozilla has no model for some languages: they keep the typed text and
    // are not asked again at every launch.
    const known = (l) => !st.known || !st.known.length || st.known.includes(l);
    const missing = c.multi ? chosenLangs(c).filter((l) => needsModel(c, l) && known(l) && !st.installed.includes(l) && !st.failed.includes(l)) : [];
    if (missing.length) {
      invoke('langs_ask', { op: 'install', list: missing });
      return;
    }
    // Unticked but still on disk (a removal cut short): freed now. English
    // stays while another language needs it (Rust keeps it).
    const extra = c.multi ? st.installed.filter((l) => l !== 'en' && !chosenLangs(c).includes(l) && !st.failed.includes(l)) : [];
    if (extra.length) {
      invoke('langs_ask', { op: 'remove', list: extra });
      return;
    }
    this.translate();
  },
  // A language ticked or unticked: in line behind the step in progress.
  ask(op, list) {
    const st = this.ls;
    // Still waiting in Rust's line: changed there at once (not a second step).
    const queued = list.filter((l) => st && st.queue.some(([, x]) => x === l));
    if (queued.length) invoke('langs_ask', { op, list: queued });
    const rest = list.filter((l) => !queued.includes(l));
    if (rest.length) (this.asks = this.asks || []).push([op, rest]);
    this.pump();
    this.paintLangs();
  },
  // The language chips follow the disk and the line, without rebuilding the panel.
  paintLangs() {
    const st = this.ls;
    for (const b of document.querySelectorAll('#c-adj .lc[data-v]')) {
      const l = b.dataset.v;
      const cur = st && st.current && st.current.lang === l ? st.current : null;
      const waiting = (st && st.queue.some(([, x]) => x === l)) || (this.asks || []).some(([, ls]) => ls.includes(l));
      const ready = !needsModel(this.cs, l) || (st && st.installed.includes(l));
      b.classList.toggle('inst', !!ready && !cur);
      b.classList.toggle('busy', !!cur);
      b.classList.toggle('wait', !cur && waiting);
      b.style.setProperty('--lp', cur && cur.total ? Math.round((cur.done / cur.total) * 100) + '%' : '0%');
    }
    const h = $('#c-tr');
    const t = this.trState();
    if (h && t) h.textContent = t.text;
  },
  // Installed languages still to translate, one after the other.
  async translate() {
    const c = this.cs;
    const st = this.ls;
    if (this.trBusy || !c.multi || !st || st.current || st.queue.length) return;
    const need = untranslated(c).filter((l) => !needsModel(c, l) || st.installed.includes(l));
    if (!need.length) return;
    const msg = c.msg;
    this.trErr = '';
    this.trStep(t('Translating the message…'));
    let ok = 0;
    const failed = [];
    try {
      for (let i = 0; i < need.length; i++) {
        const l = need[i];
        if (this.cs.msg !== msg || !this.cs.multi) break;
        if (!chosenLangs(this.cs).includes(l)) continue;
        const step = (k, pct, sub) => Popup.item({ icon: k ? 'check' : 'globe', name: langName(l), i: i + 1, n: need.length, steps: [t('Translation'), t('Ready')], step: k, pct, sub });
        step(0, 40, t('Translating the message…'));
        this.trStep(t('Translating into {lang}… ({i} of {n})', { lang: langName(l), i: i + 1, n: need.length }));
        let out = null;
        try {
          out = await Translator.one(trSource(msg), l);
        } catch (e) {
          this.trErr = t('One language could not be translated: {why}', { why: e && e.message ? t(e.message) : String(e) });
        }
        if (out == null || this.cs.msg !== msg) {
          failed.push(l);
          continue;
        }
        this.cs.tr = { msg, t: Object.assign({}, this.cs.tr && sameMsg(this.cs.tr.msg, msg) ? this.cs.tr.t : {}, { [l]: out }) };
        ok++;
        this.save();
        if (page === Cam) {
          this.overlayKey = '';
          this.paintWait();
        }
        step(1, 100, t('Ready'));
        await new Promise((r) => setTimeout(r, 300));
      }
      Popup.show(failed.length && !ok
        ? { title: t('Translation failed'), text: langList(failed), bad: true }
        : { title: t('Message translated'), text: t('{n} languages ready', { n: waitLines(this.cs).length }), done: true });
    } catch (e) {
      this.trErr = t('Translation failed: {why}', { why: e && e.message ? t(e.message) : String(e) });
      Popup.show({ title: t('Translation failed'), text: this.trErr, bad: true });
    }
    this.trBusy = '';
    if (page === Cam) this.changed(false);
    else this.save();
    // The next step (asked meanwhile), now that this one is over. A language
    // that failed here is not tried again until the message changes.
    if (failed.length) this.trFailed = new Set([...(this.trFailed || []), ...failed]);
    this.pump();
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
      if (k === 'multi') Cam.pump();
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
    // Auto / Manual of a category.
    auto: (el) => {
      const [key, on] = AUTOS[el.dataset.k];
      Cam.cs[key] = el.dataset.v === '1' ? on : !on;
      Cam.changed(true, false);
    },
    jump: (el) => {
      Cam.jumped = el.dataset.v;
      Cam.jumpedAt = Date.now();
      el.blur();
      const body = $('#c-adj .abody'), s = $('#cat-' + el.dataset.v);
      if (body && s) body.scrollTo({ top: s.offsetTop - 8, behavior: 'smooth' });
      Cam.spy();
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
    // A card: picks it, or takes it off when it is already on.
    fx: (el) => {
      const { k, v } = el.dataset;
      const off = Cam.cs.fx[k] === v;
      Cam.cs.fx[k] = off ? 'none' : v;
      if (!off) Cam.cs.fxRecent = [k + ':' + v, ...(Cam.cs.fxRecent || []).filter((x) => x !== k + ':' + v)].slice(0, 16);
      Cam.fxChanged();
    },
    fxtab: (el) => {
      Cam.fxTab = el.dataset.v;
      Cam.fxQuery = '';
      Cam.paintFx();
    },
    // A family folds or unfolds, with no repaint (its animation plays).
    fxacc: (el) => {
      const key = el.dataset.v;
      const open = !Cam.fxOpen.has(key);
      open ? Cam.fxOpen.add(key) : Cam.fxOpen.delete(key);
      el.setAttribute('aria-expanded', open);
      el.closest('.acc').classList.toggle('open', open);
      if (open) Cam.fxThumbs();
    },
    fxfav: (el) => {
      const v = el.dataset.v;
      const fav = new Set(Cam.cs.fxFav || []);
      fav.has(v) ? fav.delete(v) : fav.add(v);
      Cam.cs.fxFav = [...fav];
      Cam.fxOpen.add((Cam.fxTab || 'filter') + ':fav');
      const body = $('#c-adj .fxbody');
      const top = body ? body.scrollTop : 0;
      Cam.paintFxBody();
      if (body) body.scrollTop = top;
      Cam.save();
    },
    fxsearch: (el) => {
      Cam.fxQuery = el.value;
      el.parentNode.querySelector('.x').classList.toggle('off', !el.value);
      $('#c-adj .fxtabs').classList.toggle('dim', !!el.value);
      Cam.paintFxBody();
      $('#c-adj .fxbody').scrollTop = 0;
    },
    fxsearchclr: () => {
      Cam.fxQuery = '';
      Cam.paintFx();
      $('#c-adj .fxsearch input').focus();
    },
    // A chip: only that effect goes.
    fxclear: (el) => {
      const k = el.dataset.k;
      Cam.cs.fx[k] = k === 'smooth' || k === 'light' ? 0 : 'none';
      Cam.fxChanged();
    },
    fxslide: (el) => {
      Cam.cs.fx[el.dataset.k] = Number(el.value);
      el.style.setProperty('--p', el.value + '%');
      const v = $('#fv-' + el.dataset.k);
      if (v) v.textContent = perc(el.value);
      Effects.set(Cam.cs.fx);
    },
    fxslid: () => Cam.fxChanged(),
    fxoff: () => {
      Cam.cs.fx = Object.assign({}, FX_DEFAULTS, { bgImg: Cam.cs.fx.bgImg });
      Cam.fxChanged();
    },
    // « Your picture »: the one already chosen, or a file to pick.
    fxpick: () => {
      if (Cam.cs.fx.bgImg && Cam.cs.fx.bg !== 'image') {
        Cam.cs.fx.bg = 'image';
        return Cam.fxChanged();
      }
      $('#fx-file').click();
    },
    fxfile: (el) => {
      const file = el.files && el.files[0];
      if (!file) return;
      const img = new Image();
      img.onload = () => {
        // Kept small in the settings: 1920 wide at most, JPEG.
        const s = Math.min(1, 1920 / img.naturalWidth);
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * s);
        c.height = Math.round(img.naturalHeight * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        Object.assign(Cam.cs.fx, { bg: 'image', bgImg: c.toDataURL('image/jpeg', 0.85) });
        URL.revokeObjectURL(img.src);
        Cam.fxChanged();
      };
      img.src = URL.createObjectURL(file);
    },
    // A language of the waiting message, on or off; French is the message itself.
    lang: (el) => {
      const set = new Set(chosenLangs(Cam.cs));
      const l = el.dataset.v;
      const off = set.has(l);
      off ? set.delete(l) : set.add(l);
      Cam.cs.langs = ALL_LANGS.filter((x) => set.has(x));
      if (Cam.trFailed) Cam.trFailed.delete(l);
      Cam.langsChanged(off ? [l] : [], off ? [] : [l]);
    },
    langs: (el) => {
      const before = chosenLangs(Cam.cs);
      Cam.cs.langs = el.dataset.v === 'all' ? ALL_LANGS.slice() : null;
      const after = chosenLangs(Cam.cs);
      Cam.langsChanged(before.filter((l) => !after.includes(l)), after.filter((l) => !before.includes(l)));
    },
    msg: (el) => {
      Cam.cs.msg = el.value.trim() || CAM_DEFAULTS.msg;
      Cam.trFailed = new Set();
      Cam.changed(false);
      Cam.pump();
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
// Names, steps and sort words are shown through t().
const SORTS = [
  ['year_month', 'Year, then month', '2026 › 10 › IMG_1234.HEIC', true],
  ['year', 'Year', '2026 › IMG_1234.HEIC', false],
  ['flat', 'All together', 'IMG_1234.HEIC', false],
];
// Time on each step; the CSS animations follow (--simd in app.css).
const SIM_MS = 4500;
const SIM_STEPS = ['Open Drop on the iPhone', 'Pick: photos, album, files…', 'See the preview and send', 'Confirm on this PC', 'Sorted and checked'];
const SORT_NAME = { year_month: 'by year then by month', year: 'by year', flat: 'all together' };
// What a send holds: « 3 photos · 1 video ».
const kindsOf = (d) => [[d.photos, '{n} photo', '{n} photos'], [d.videos, '{n} video', '{n} videos'], [d.docs, '{n} file', '{n} files']]
  .filter(([n]) => n).map(([n, one, many]) => plural(n, one, many)).join(' · ');
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
        <header><h1 class="h1">Drop</h1><p class="sub">${t('The iPhone’s photos, videos and files, in original quality, checked and with no duplicates.')}</p></header>
        <section class="card drop-now${view === 'rest' ? ' dsim-card' : ''}"><div class="dstage">${this.body(view, d)}</div></section>
        <section class="card">
          <div class="row" style="justify-content:space-between">
            <div><span class="lbl">${t('Sorted into')}</span><div class="mono" style="margin-top:8px;font-size:15px">${settings.drop_setup_done ? esc(settings.photos_dir) : t('Chosen on the first send')}</div></div>
            <div class="row">${settings.drop_setup_done ? `<button class="btn sm" type="button" data-act="open">${I.folder}${t('Open')}</button>` : ''}<a class="btn sm" href="#settings">${t('Change')}</a></div>
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
          <span class="lbl">${t('Receiving from {name}', { name: esc(devName()) })}</span>
          <div class="dflow" aria-hidden="true"><span class="node">${I.phone}<em>iPhone</em></span>${wire}<span class="node pc">${I.pc}<em>${t('Checked')}</em></span>${wire}<span class="node fold">${I.folder}<em>${t('Sorted')}</em></span></div>
          <div class="dfacts">
            <div><small>${t('Received')}</small><b class="mono" id="d-bytes">—</b></div>
            <div><small>${t('Items')}</small><b class="mono" id="d-items">—</b></div>
            <div><small>${t('Speed')}</small><b class="mono" id="d-rate">—</b></div>
            <div><small>${t('Left')}</small><b class="mono" id="d-left">—</b></div>
          </div>
          <div class="dcur"><span class="dlive"></span><span id="d-cur"></span><span class="sub" id="d-already" style="margin:0 0 0 auto"></span></div>
          <div class="row" style="margin-top:16px"><button class="btn sm bad" type="button" data-act="cancel">${I.close}${t('Cancel')}</button></div>
        </div>
      </div>`;
    }
    if (view === 'result') {
      const ok = d.state === 'done';
      const kept = `${plural(d.items_done, '{n} item', '{n} items')} · ${bytes(d.bytes_done)}`;
      const extra = [d.already ? t('{n} already on the PC', { n: d.already }) : '', d.failed ? plural(d.failed, '{n} item not sent', '{n} items not sent') : ''].filter(Boolean).join(' · ');
      const head = ok
        ? `<div class="dresult"><span class="dpop">${I.check}</span><div><div class="dtitle">${d.items_done ? t('{kept} · checked', { kept }) : t('Everything is already on the PC')}</div><div class="sub">${extra || t('Sorted by the date taken.')}</div></div></div>`
        : `<div class="ban bad">${I.alert}<span>${esc(d.message)}${d.items_done ? ` <strong>${t('Already sorted: {kept}.', { kept })}</strong>` : ''}</span></div>`;
      return `${head}<div class="row" style="margin-top:20px">
        ${d.files_done ? `<button class="btn cy" type="button" data-act="openLast">${I.folder}${t('Open the folder')}</button>` : ''}
        <button class="btn" type="button" data-act="seen">OK</button></div>`;
    }
    // At rest: a quick simulation of the steps, iPhone to PC (ADR-0030).
    const wait = d.state === 'preparing' || d.state === 'asking';
    const status = !S.device ? `<span class="dlive off"></span>${t('Pair your iPhone first')}`
      : wait ? `<span class="dlive"></span>${t('{name} is getting a send ready…', { name: esc(devName()) })}`
        : S.connected ? `<span class="dlive"></span>${t('{name} is ready', { name: esc(devName()) })}` : `<span class="dlive off"></span>${t('iPhone offline: open Hyphn on it')}`;
    const tiles = '<i></i>'.repeat(6);
    return `<div class="dsim" id="d-sim" data-s="0">
        <div class="dsim-head">
          <div><span class="lbl">${t('To start')}</span><h2 class="dtitle dlg">${t('It all starts on your iPhone')}</h2></div>
          <span class="dstatus">${status}</span>
        </div>
        <div class="sim-stage" aria-hidden="true">
          <div class="sim-phone"><div class="scr">
            <div class="sc s0"><div class="h">Hyphn</div><div class="m">${t('Home')} · Cam · Drop</div><div class="tabs4"><i></i><i></i><i class="on"></i><i></i></div><span class="tap"></span></div>
            <div class="sc s1"><div class="h">${t('What do you want to send?')}</div><div class="rows4"><i></i><i></i><i></i><i></i></div><span class="tap"></span></div>
            <div class="sc s2"><div class="h">${t('Send 48 items?')}</div><div class="thumbs6">${tiles}</div><div class="m">${t('32 photos · 16 videos · 1.2 GB')}</div><div class="sbtn">${t('Send')}</div><span class="tap"></span></div>
            <div class="sc s3"><div class="swait">${I.pc}</div><div class="h" style="text-align:center">${t('Confirm on your PC')}</div></div>
            <div class="sc s4"><div class="h">${t('Sending now')}</div><div class="sim-big">${perc(64)}</div><div class="sbar"><b></b></div><div class="m">${t('38 MB/s · ≈ 1 min left')}</div></div>
          </div></div>
          <div class="sim-link"><em>${t('Wi-Fi · encrypted')}</em><span></span><span></span><span></span></div>
          <div class="sim-pc"><div class="mon"><div class="scr">
            <div class="sc p0"><div class="pidle"><span class="plogo"></span><div class="h">Hyphn</div><div class="m">${t('Waiting for the iPhone')}</div></div></div>
            <div class="sc p3"><div class="pdlg"><div class="m">${t('{name} wants to send', { name: esc(devName()) })}</div><div class="h">${t('48 items · 1.2 GB')}</div><div class="thumbs6">${tiles}</div><div class="pbtns"><b>${t('Accept')}</b><b>${t('Decline')}</b></div></div><span class="tap"></span></div>
            <div class="sc p4"><div class="pfolder"><div class="m">${esc(settings.drop_setup_done ? settings.photos_dir : t('Pictures › Hyphn'))} › 2026 › 10</div><div class="drop6">${tiles}</div><div class="h">${t('Checked · no duplicates')}</div></div></div>
          </div></div><div class="stand"></div><div class="base"></div></div>
        </div>
        <ol class="sim-rail">${SIM_STEPS.map((n, i) => `<li data-act="simGo" data-v="${i}"><b>0${i + 1}</b><span>${t(n)}</span></li>`).join('')}</ol>
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
    const kinds = kindsOf(d);
    const extra = [d.already ? t('{n} already on the PC', { n: d.already }) : '', d.failed ? plural(d.failed, '{n} item not sent', '{n} items not sent') : ''].filter(Boolean).join(' · ');
    layer.innerHTML = `<div class="scrim" style="cursor:default"></div>
      <div class="modal dask ddone" role="dialog" aria-label="${t('Transfer done')}">
        <div class="dask-head"><span class="dpop">${I.check}</span>
          <div><span class="lbl">${t('Received from {name}', { name: esc(devName()) })}</span>
            <div class="dtitle dlg">${d.items_done ? `${plural(d.items_done, '{n} item', '{n} items')} · ${bytes(d.bytes_done)}` : t('Everything was already there')}</div></div></div>
        ${thumbs && d.items_done ? `<div class="dthumbs">${thumbs}${rest > 0 ? `<i>+${rest}</i>` : ''}</div>` : ''}
        <div class="sub dkinds">${[d.items_done ? `${kinds ? kinds + ' · ' : ''}${t('checked one by one')}` : '', extra, d.folder ? t('In {folder}', { folder: esc(d.folder) }) : ''].filter(Boolean).join('<br>')}</div>
        <div class="row" style="margin-top:22px">
          ${d.files_done ? `<button class="btn cy" type="button" data-act="openLast">${I.folder}${t('Open the folder')}</button>` : ''}
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
    const names = settings.drop_setup_done && this.ask === 'accept' ? [] : [t('Folder'), t('Sorting'), t('Approval')];
    const at = { folder: 0, confirm: 0, sort: 1, accept: 2 }[this.ask];
    const dots = names.length ? `<ol class="dsteps sm">${names.map((n, k) => `<li class="${k < at ? 'done' : k === at ? 'on' : ''}"><b>${k < at ? I.check : k + 1}</b>${n}</li>`).join('')}</ol>` : '';
    layer.innerHTML = `<div class="scrim" style="cursor:default"></div>
      <div class="modal dask" role="dialog" aria-label="${t('Confirm the send')}">${dots}<div class="dstage">${this.askBody(d)}</div></div>`;
  },
  askBody(d) {
    const who = esc(devName());
    if (this.ask === 'folder') {
      return `<div class="dq"><span class="lbl">${t('First time · {name} wants to send', { name: who })}</span><h2 class="dtitle dlg">${t('Where should your photos go on this PC?')}</h2></div>
        <div class="choices">
          <button class="choice dtip" type="button" data-act="suggest"><span class="ic">${I.bolt}</span><span><b>${t('Let Hyphn choose')}</b><small>${t('A clean folder, on the drive with the most space.')}</small></span><em>${t('Recommended')}</em></button>
          <button class="choice" type="button" data-act="pickDir"><span class="ic">${I.folder}</span><span><b>${t('Choose a folder')}</b><small>${t('You pick it in Windows.')}</small></span></button>
        </div>
        <div class="row" style="margin-top:18px"><button class="btn sm bad" type="button" data-act="refuse">${t('Decline the send')}</button></div>`;
    }
    if (this.ask === 'confirm') {
      const f = this.folder || {};
      return `<div class="dq"><span class="lbl">${t('Folder')}</span><h2 class="dtitle dlg">${t('Is this OK for you?')}</h2></div>
        <div class="dpath"><span class="ic">${I.folder}</span><div><div class="mono">${esc(f.path)}</div><div class="sub">${f.free != null ? t('{size} free on this drive', { size: bytes(f.free) }) : t('Free space unknown')}</div></div></div>
        <div class="row" style="margin-top:22px">
          <button class="btn cy" type="button" data-act="okDir">${I.check}${t('Looks good')}</button>
          <button class="btn" type="button" data-act="pickDir">${t('Choose another')}</button>
        </div>`;
    }
    if (this.ask === 'sort') {
      return `<div class="dq"><span class="lbl">${t('Sorting')}</span><h2 class="dtitle dlg">${t('How should they be sorted?')}</h2></div>
        <div class="choices three">${SORTS.map(([k, n, ex, best]) => `<button class="choice${best ? ' dtip' : ''}" type="button" data-act="sort" data-v="${k}"><span><b>${t(n)}</b><small class="mono">${ex}</small></span>${best ? `<em>${t('Recommended')}</em>` : ''}</button>`).join('')}</div>
        <p class="sub" style="margin-top:16px">${t('By the date the photo was taken. You can change this in Settings.')}</p>`;
    }
    const kinds = kindsOf(d);
    const more = [kinds, d.already ? plural(d.already, '{n} item already on the PC, not resent', '{n} items already on the PC, not resent') : '', t('To {dir}, {sort}', { dir: esc(settings.photos_dir), sort: SORT_NAME[settings.sort] ? t(SORT_NAME[settings.sort]) : '' })].filter(Boolean);
    // One line of 8: the last tile counts the rest.
    const all = this.thumbs || [];
    const list = d.items > all.length ? all.slice(0, 7) : all;
    const thumbs = list.map((src, i) => `<img src="${src}" alt="" style="animation-delay:${(i * 0.05).toFixed(2)}s">`).join('');
    const rest = d.items - list.length;
    return `<div class="dask-head"><span class="ic">${I.phone}</span>
        <div><span class="lbl">${t('Preview · {name} wants to send', { name: who })}</span>
          <div class="dtitle dlg">${plural(d.items, '{n} item', '{n} items')} · ${bytes(d.bytes)}</div></div></div>
      ${thumbs ? `<div class="dthumbs">${thumbs}${rest > 0 ? `<i>+${rest}</i>` : ''}</div>` : ''}
      <div class="sub dkinds">${more.join('<br>')}</div>
      <div class="row" style="margin-top:22px">
        <button class="btn cy" type="button" data-act="accept">${I.check}${t('Accept')}</button>
        <button class="btn" type="button" data-act="refuse">${t('Decline')}</button>
      </div>`;
  },
  fill(d) {
    const set = (id, text) => { const el = $(id); if (el && el.textContent !== text) el.textContent = text; };
    if (d.state === 'sending') {
      const pct = d.bytes ? Math.min(100, Math.floor(d.bytes_done / d.bytes * 100)) : 0;
      set('#d-pct', String(pct));
      const ring = $('#d-ring');
      if (ring) ring.setAttribute('stroke-dasharray', `${pct} 100`);
      set('#d-bytes', t('{done} of {total}', { done: bytes(d.bytes_done), total: bytes(d.bytes) }));
      set('#d-items', t('{done} of {total}', { done: d.items_done, total: d.items }));
      set('#d-rate', d.rate ? `${bytes(d.rate)}/s` : t('working out…'));
      const left = d.rate ? Math.max(0, d.bytes - d.bytes_done) / d.rate : 0;
      set('#d-left', !d.rate ? t('working out…') : left < 60 ? '< 1 min' : `≈ ${Math.ceil(left / 60)} min`);
      set('#d-cur', d.current ? d.current : t('The transfer is starting…'));
      set('#d-already', d.already ? t('{n} already on the PC', { n: d.already }) : '');
    }
    const months = S.drop_months || [];
    const key = JSON.stringify(months);
    const box = $('#d-months');
    if (box && box.dataset.k !== key) {
      box.dataset.k = key;
      box.innerHTML = months.length
        ? months.map((m) => `<div class="month"><span>${esc(m.label)}</span><span class="mono sub" style="margin:0">${plural(m.files, '{n} file', '{n} files')} · ${bytes(m.bytes)}</span></div>`).join('')
        : `<div class="sub">${t('Nothing yet.')}</div>`;
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
// Settings
// ===================================================================
// The PC settings: a menu of categories on the left, one list on the right.
// Names are shown through t().
const SET_CATS = [['iphone', 'iPhone', 'phone'], ['webcam', 'Webcam and OBS', 'cam'], ['drop', 'Drop', 'swap'],
  ['general', 'General', 'pc'], ['alerts', 'Alerts', 'bolt'], ['privacy', 'Privacy', 'shield']];
// The window's languages, each named in its own language (ADR-0042).
const UI_LANGS = [['en', 'English'], ['fr', 'Fran\u00e7ais']];
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
      toast(t(uninstall ? 'Webcam removed' : 'Windows webcam ready'));
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
    const row = (title, desc, ctl, tk = '') => `<div class="srow"><div class="stx"><b>${title}${tip(tk)}</b>${desc ? `<small>${desc}</small>` : ''}</div><div class="sct">${ctl}</div></div>`;
    const sw = (k, label) => `<button class="swb" type="button" data-act="toggle" data-k="${k}" aria-pressed="${!!s[k]}" aria-label="${esc(label)}"><span class="sw${s[k] ? ' on' : ''}"></span></button>`;
    const sec = (id, body) => {
      const [, name, ic] = SET_CATS.find(([x]) => x === id);
      return `<section class="ssec" id="s-${id}"><h2><span class="gi">${I[ic]}</span>${t(name)}</h2><div class="slist">${body}</div></section>`;
    };
    const p = (S && S.status) || {};
    const iphone = d
      ? `<div class="dcard">
          <span class="dic${S.connected ? ' on' : ''}">${I.phone}</span>
          <div class="dtx"><b>${esc(d.name)}</b><small><span class="led${S.connected ? '' : ' off'}"></span>${!S.connected ? t('Waiting for the iPhone') : S.latency_ms == null ? t('Linked {via}', { via: linkName() }) : t('Linked {via} · answers in {n} ms', { via: linkName(), n: S.latency_ms })}</small></div>
          ${p.battery == null ? '' : `<div class="dbat"><span class="mono">${perc(p.battery)}</span><small>${p.charge ? t(CHARGE[p.charge]) : ''}</small></div>`}
        </div>`
        + row(t('Reconnect'), t('If something is stuck, redo the link.'), `<button class="btn" type="button" data-act="reconnect">${I.refresh}${t('Reconnect')}</button>`, 'reconnect')
        + (S.cable_service === false ? row(t('USB cable'), t('Install “Apple Devices” (Microsoft Store) or iTunes to link the iPhone by cable. Wi-Fi works without it.'), '') : '')
        + row(t('Pair another iPhone'), t('It will replace this one.'), `<a class="btn" href="#pair">${t('Pair')}</a>`)
        + row(t('Forget this iPhone'), t('Paired on {date}. Fingerprint {fp}', { date: dateStr(d.paired_at), fp: `<span class="mono">${esc(d.fingerprint)}</span>` }) + tip('fingerprint'), `<button class="btn bad" type="button" data-act="ask">${t('Forget')}</button>`, 'forget')
        + (this.asking ? `<div class="confirm" role="alertdialog" aria-label="${t('Confirm forgetting')}">
            <span><strong>${t('Forget {name}?', { name: esc(d.name) })}</strong> ${t('You will need to scan a new QR code to pair it again.')}</span>
            <div class="row" style="gap:8px"><button class="btn badf" type="button" data-act="forget">${t('Forget')}</button><button class="btn" type="button" data-act="cancel">${t('Cancel')}</button></div>
          </div>` : '')
      : row(t('No iPhone paired'), t('One QR code to scan, just once.'), `<a class="btn pri" href="#pair">${t('Pair an iPhone')}</a>`);
    const sorts = [['year_month', 'By month', '2026 › 11'], ['year', 'By year', '2026'], ['flat', 'All together', 'one folder']];
    const seg = (label, act, cur, list) => `<div class="seg" role="group" aria-label="${label}">${list.map(([k, n]) => `<button type="button" class="${cur === k ? 'on' : ''}" data-act="${act}" data-v="${k}">${n}</button>`).join('')}</div>`;
    this.root.innerHTML = `
      <main class="wrap setw enter">
        <h1 class="h1">${t('Settings')}</h1>
        <div class="sgrid2">
          <nav class="snav" aria-label="${t('Categories')}">${SET_CATS.map(([id, n, ic], i) => `<button type="button" class="${i === (this.cat || 0) ? 'on' : ''}" data-act="jump" data-v="${id}" data-i="${i}">${I[ic]}${t(n)}</button>`).join('')}</nav>
          <div class="scol">
            ${sec('iphone', iphone)}
            ${sec('webcam', this.vcamRows(row) + row(t('Picture settings'), t('Lighting, colors, size, pause screen…'), `<a class="btn" href="#cam">${I.sliders}${t('Open Cam')}</a>`))}
            ${sec('drop', row(t('Folder'), t('Where photos and files arrive.'), `<button class="btn mono path" type="button" data-act="pick" title="${esc(s.photos_dir)}">${I.folder}<span>${esc(s.photos_dir)}</span></button>`, 'photos_dir')
              + row(t('Sorting'), t('How photos are sorted in the folder.'), `<div class="opts sm">${sorts.map(([k, n, ex]) => `<button type="button" class="opt${s.sort === k ? ' on' : ''}" data-act="sort" data-v="${k}" aria-pressed="${s.sort === k}"><b>${t(n)}</b><small>${t(ex)}</small></button>`).join('')}</div>`, 'sort'))}
            ${sec('general', row(t('Language'), '', seg(t('Language'), 'lang', LANG, UI_LANGS), 'lang')
              + row(t('Start with Windows'), t('Hyphn starts by itself, quietly near the clock.'), sw('launch_at_startup', t('Start with Windows')), 'launch_at_startup')
              + row(t('Keep near the clock'), t('Closing the window keeps the webcam running.'), sw('close_to_tray', t('Keep near the clock')), 'close_to_tray')
              + row(t('Appearance'), '', seg(t('Appearance'), 'theme', s.theme, [['system', t('Like Windows')], ['dark', t('Dark')], ['light', t('Light')]]), 'theme'))}
            ${sec('alerts', row(t('Low battery'), t('Warn below {pct}, when the iPhone is not charging.', { pct: perc(15) }), sw('low_battery_alert', t('Low battery')), 'low_battery_alert'))}
            ${sec('privacy', `<div class="priv2">
                <span class="shield">${I.shield}</span>
                <div><b>${t('Nothing leaves your home.')}</b><small>${t('Hyphn only talks to your iPhone, on your network, and everything is encrypted.')}</small></div>
                <div class="pills"><span class="pl"><b>0</b>${t('account')}</span><span class="pl"><b>0</b>${t('server')}</span><span class="pl"><b>0</b>${t('data sent')}</span></div>
              </div>
              <div class="scred"><b>${t('Credits')}</b> ${t('Translation: Firefox’s engine and models (Mozilla, MPL-2.0). Effects: MediaPipe (Google, Apache-2.0), three.js (MIT), MindAR’s method (MIT), Fluent Emoji (Microsoft, MIT). 3D models (CC-BY-4.0): “Thug Life | Cool glasses” by MR EXPERT, “Clown Hat” by PatelDev, “Earring Jade” by Softmind Game Factory (Sketchfab); 27 3D objects from Poly Pizza (CC-BY 3.0: Poly by Google, J-Toastie, jeremy, Michael Fuchs; CC0: Quaternius, iPoly3D), full list in vendor/models3d/CREDITS.txt. Backgrounds: CC0 and public domain photos (Wikimedia Commons, NASA).')}</div>
              <div class="sver mono">Hyphn ${S ? esc(S.version) : ''} · ${esc(S ? S.pc_name : '')} · ${t('PC fingerprint {fp}', { fp: esc(S ? S.pc_fingerprint : '') })}</div>`)}
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
      ? row(t('Windows webcam'), v.in_use ? (v.in_use > 1 ? t('{n} apps are using it right now.', { n: v.in_use }) : t('An app is using it right now.')) : t('“Hyphn” in Discord, Teams, OBS…'), ok(t('Ready')), 'vcam')
      : v.installed
        ? row(t('Windows webcam'), v.error ? esc(v.error) : t('Starting…'), `<button class="btn" type="button" data-act="vinstall" ${busy ? 'disabled' : ''}>${t('Repair')}</button>`, 'vcam')
        : row(t('Windows webcam'), t(v.can_install ? 'Windows asks for administrator approval, just once.' : 'The webcam files are missing from this version.'), `<button class="btn pri" type="button" data-act="vinstall" ${busy || !v.can_install ? 'disabled' : ''}>${t(busy ? 'Installing…' : 'Install')}</button>`, 'vcam');
    const obs = !v.obs_present ? '' : row('OBS', t(v.obs ? '“Hyphn” source in OBS.' : 'Installed with the webcam.'), v.obs ? ok(t('Ready to use')) : '', 'obs');
    const remove = v.installed ? row(t('Remove'), t('Removes the webcam and the OBS plugin from this PC.'), `<button class="btn bad" type="button" data-act="vremove" ${busy ? 'disabled' : ''}>${t('Remove')}</button>`) : '';
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
    // The whole window is drawn again in the new language; the route (#settings) stays.
    lang: async (el) => {
      settings.lang = el.dataset.v;
      await saveSettings();
      location.reload();
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
// A newer Hyphn on GitHub (ADR-0040): a card offers it at launch; one click
// downloads, checks and installs it, then Hyphn restarts by itself.
const Update = {
  async check() {
    let u = null;
    try {
      u = await invoke('update_check');
    } catch (e) {
      console.warn('update check:', e); // offline or no release yet: nothing to show
      return;
    }
    if (!u) return;
    const el = document.createElement('div');
    el.className = 'pop upd';
    el.setAttribute('role', 'dialog');
    el.innerHTML = `<span class="pic">${I.down}</span>
      <div class="ptx"><b>${t('Hyphn {version} is available', { version: esc(u.version) })}</b><small>${t('Your settings and iPhone are kept.')}</small>
        <div class="pact"><button class="btn sm" type="button" data-k="later"${tipAttr('upd_later')}>${t('Later')}</button>
        <button class="btn sm pri" type="button" data-k="go"${tipAttr('upd_go')}>${t('Install')}</button></div></div>`;
    document.body.appendChild(el);
    void el.offsetWidth;
    el.classList.add('on');
    el.addEventListener('click', (e) => {
      const k = e.target.closest('[data-k]')?.dataset.k;
      if (k === 'later') el.classList.remove('on');
      if (k === 'go') this.install(el, u.version);
    });
  },
  async install(el, version) {
    $('.ptx', el).innerHTML = `<b>${t('Installing {version}…', { version: esc(version) })}</b><small>${t('Hyphn will close and open again.')}</small><div class="pbar"><i></i></div>`;
    listen('update_progress', (e) => {
      const [done, total] = e.payload;
      if (total) $('.pbar i', el).style.width = Math.max(3, (100 * done) / total) + '%';
    });
    try {
      await invoke('update_install');
    } catch (err) {
      el.remove();
      toast(String(err), 'info');
    }
  },
};

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
  // The language first: everything below is drawn in it.
  LANG = settings.lang === 'fr' ? 'fr' : 'en';
  document.documentElement.lang = LANG;
  CAM_DEFAULTS.msg = BUILTIN[LANG];
  translateStatic();
  applyTheme();
  S = await invoke('get_snapshot');
  paintHeader();
  mount(true);
  listen('snapshot', (e) => onSnapshot(e.payload));
  listen('pair', (e) => Pair.onPair(e.payload));
  // Installed by itself at launch (one admin « Yes »).
  listen('vcam_installed', () => toast(t('Windows webcam ready')));
  Update.check();
  listen('langs', (e) => {
    Cam.cs = Cam.cs || camSettings();
    Cam.onLangs(e.payload);
  });
  // Installs or a translation left half done (app closed, reload): picked up.
  Cam.cs = Cam.cs || camSettings();
  // The language changed with a default waiting message: the webcam gets
  // the new language's default too (ADR-0033).
  if (settings.cam && settings.cam.msg !== Cam.cs.msg) Cam.save();
  Cam.langsFetch();
  // « Show » touched on the iPhone: the PC shows the picture at once.
  listen('cam_phone_live', () => { if (route() !== 'cam') go('cam'); });
  // The iPhone asks to send (ADR-0030): its confirmation shows here.
  listen('drop_ask', () => { if (route() !== 'drop') go('drop'); });
  // Evan picked a quality on the iPhone: the PC keeps it (spec `Cam - Flux v1`, E4).
  listen('cam_quality', (e) => {
    const c = camSettings();
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
