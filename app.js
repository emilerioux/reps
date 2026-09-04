/* ============================================================
   Mes Workouts v2 — prototype de l'écran « Séance »
   Aucune dépendance. Le moteur d'animation est un ressort
   (amortissement + réponse, comme SwiftUI) : interruptible par
   construction, il repart toujours de la valeur affichée.
   Données isolées sous le préfixe wt2- : l'app d'origine n'est
   jamais lue ni écrite.
   ============================================================ */

/* ── 0. Préférences système ───────────────────────────────── */
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)");

/* ── 1. Moteur de ressorts ────────────────────────────────── */
const running = new Set();
let rafId = 0, lastT = 0;

function frame(now) {
  const dt = Math.min((now - lastT) / 1000, 1 / 30);
  lastT = now;
  for (const s of [...running]) s._advance(dt);
  rafId = running.size ? requestAnimationFrame(frame) : 0;
}
function wake() {
  if (!rafId) { lastT = performance.now(); rafId = requestAnimationFrame(frame); }
}

class Spring {
  constructor(value, opts = {}) {
    this.x = value; this.t = value; this.v = 0;
    this.response = opts.response ?? 0.4;   // secondes pour rejoindre la cible
    this.damping  = opts.damping  ?? 1.0;   // 1.0 = pas de dépassement
    this.rest     = opts.restDelta ?? 0.004;
    this.onUpdate = opts.onUpdate || (() => {});
    this.onRest   = opts.onRest || null;
  }
  /* Nouvelle cible. On garde x et v : c'est ça, l'interruptibilité. */
  to(target, o = {}) {
    if (o.response !== undefined) this.response = o.response;
    if (o.damping  !== undefined) this.damping  = o.damping;
    this.t = target;
    if (o.velocity !== undefined) this.v = o.velocity;   // relais de vitesse du geste
    if (REDUCED.matches) {
      this.x = target; this.v = 0; running.delete(this);
      this.onUpdate(this.x); if (this.onRest) this.onRest();
      return;
    }
    running.add(this); wake();
  }
  /* Pendant un geste, le doigt écrit directement dans le ressort. */
  hold(value, velocity = 0) {
    running.delete(this);
    this.x = value; this.t = value; this.v = velocity;
    this.onUpdate(this.x);
  }
  _advance(dt) {
    const w = (2 * Math.PI) / this.response, z = this.damping;
    const steps = Math.max(1, Math.ceil(dt * 240));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const a = -w * w * (this.x - this.t) - 2 * z * w * this.v;
      this.v += a * h;
      this.x += this.v * h;
    }
    if (Math.abs(this.v) < this.rest * 12 && Math.abs(this.t - this.x) < this.rest) {
      this.x = this.t; this.v = 0;
      running.delete(this);
      this.onUpdate(this.x);
      if (this.onRest) this.onRest();
      return;
    }
    this.onUpdate(this.x);
  }
}

/* ── 2. Physique du geste ─────────────────────────────────── */

/* Où le mouvement s'arrêterait tout seul (décélération exponentielle,
   la formule du code d'exemple « Designing Fluid Interfaces »). */
const project = (v, d = 0.998) => (v / 1000) * d / (1 - d);

/* Résistance progressive au-delà d'une limite, au lieu d'un mur. */
const rubberband = (over, dim, c = 0.55) => (over * dim * c) / (dim + c * Math.abs(over));

/* Historique court de positions → vitesse au relâchement. */
function tracker() {
  let pts = [];
  return {
    add(x, t) { pts.push([x, t]); if (pts.length > 8) pts.shift(); },
    velocity() {
      if (pts.length < 2) return 0;
      const end = pts[pts.length - 1];
      let start = pts[0];
      for (const p of pts) { if (end[1] - p[1] <= 90) { start = p; break; } }
      const dt = (end[1] - start[1]) / 1000;
      return dt > 0.004 ? (end[0] - start[0]) / dt : 0;
    },
  };
}

/* La capture peut échouer si le pointeur a déjà disparu : ça ne doit
   jamais casser le geste en cours. */
function capture(el, id) { try { el.setPointerCapture(id); } catch (_) {} }
function uncapture(el, id) { try { if (el.hasPointerCapture(id)) el.releasePointerCapture(id); } catch (_) {} }

/* Haptique : réservée aux moments qui comptent (§13). */
const buzz = (p) => { if (navigator.vibrate) { try { navigator.vibrate(p); } catch (_) {} } };

/* Petit rebond d'échelle, réutilisable. */
function pop(el, from = 1.07, damping = 0.55) {
  if (REDUCED.matches) return;
  if (!el._pop) {
    el._pop = new Spring(1, { response: 0.34, damping, restDelta: 0.002,
      onUpdate: (v) => { el.style.transform = `scale(${v})`; } });
  }
  el._pop.damping = damping;
  el._pop.hold(from);
  el._pop.to(1);
}

/* ── 3. Données (isolées sous wt2-) ───────────────────────── */
const K = { sessions: "wt2-sessions", prs: "wt2-prs", hint: "wt2-hint-seen" };

const load = (k, f) => { try { return JSON.parse(localStorage.getItem(k)) ?? f; } catch (_) { return f; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };

const PROGRAM = {
  name: "Push Day",
  exercises: [
    { name: "Développé couché",           sets: 4, reps: "8–10",  w: 135, r: 10, group: null },
    { name: "Développé incliné haltères", sets: 3, reps: "10–12", w: 45,  r: 11, group: null },
    { name: "Développé militaire",        sets: 4, reps: "8",     w: 85,  r: 8,  group: "A" },
    { name: "Élévations latérales",       sets: 3, reps: "12–15", w: 20,  r: 13, group: "A" },
    { name: "Dips lestés",                sets: 3, reps: "8–10",  w: 25,  r: 9,  group: null },
    { name: "Extension triceps poulie",   sets: 3, reps: "12",    w: 50,  r: 12, group: null },
  ],
};

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/* Amorce du prototype : un historique plausible pour que le streak et
   les records aient quelque chose à comparer. Rien à voir avec tes
   vraies données — tout est sous wt2- et le bouton Réinitialiser efface. */
function seed() {
  if (!localStorage.getItem(K.sessions)) {
    const days = [], today = new Date();
    for (let i = 1; i <= 33; i++) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const wd = d.getDay();
      if (wd === 1 || wd === 2 || wd === 4 || wd === 5) days.push(iso(d));
    }
    save(K.sessions, days);
  }
  if (!localStorage.getItem(K.prs)) {
    const p = {};
    PROGRAM.exercises.forEach((e) => { p[e.name] = e.w; });
    p["Élévations latérales"] = 17.5;   // volontairement sous la valeur par défaut :
    save(K.prs, p);                     // la 1re série validée déclenche un record.
  }
}
seed();

let PRS = load(K.prs, {});
const SESSIONS = new Set(load(K.sessions, []));

/* ── 4. État de la séance ─────────────────────────────────── */
const state = PROGRAM.exercises.map((ex) => ({ done: [], draft: { weight: ex.w, reps: ex.r } }));
const beatenPRs = [];
const startedAt = Date.now();
let idx = 0;

const totalSets = PROGRAM.exercises.reduce((n, e) => n + e.sets, 0);
const doneSets  = () => state.reduce((n, s) => n + s.done.length, 0);
const exDone    = (i) => state[i].done.length >= PROGRAM.exercises[i].sets;
const allDone   = () => state.every((_, i) => exDone(i));

const fmt = (v) => (Math.round(v * 10) % 10 === 0 ? String(Math.round(v)) : v.toFixed(1));

/* ── 5. DOM ───────────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);
const stack = $("stack"), dotsEl = $("dots"), commitBtn = $("commit");
const CHECK = '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7"/></svg>';

const cards = PROGRAM.exercises.map((ex, i) => {
  const el = document.createElement("article");
  el.className = "card";
  el.innerHTML =
    `<div class="card-inner">` +
    (ex.group ? `<span class="badge">Superset ${ex.group}</span>` : "") +
    `<h2 class="ex-name">${ex.name}</h2>` +
    `<p class="ex-target"><span><b>${ex.sets}</b> séries · <b>${ex.reps}</b> reps</span><span class="dot-sep"></span><span>dernière fois <b>${fmt(ex.w)} lb</b></span></p>` +
    `<ol class="sets"></ol>` +
    `</div>`;
  stack.appendChild(el);
  return { el, sets: el.querySelector(".sets") };
});

const dots = PROGRAM.exercises.map(() => {
  const d = document.createElement("span");
  d.className = "dot";
  dotsEl.appendChild(d);
  return d;
});

/* ── 6. Rendu des séries ──────────────────────────────────── */
function renderSets(i) {
  const ex = PROGRAM.exercises[i], st = state[i], ol = cards[i].sets;
  ol.innerHTML = "";
  for (let j = 0; j < ex.sets; j++) {
    const li = document.createElement("li");
    const rec = st.done[j];
    const isActive = j === st.done.length;
    li.className = "set" + (rec ? " done" : isActive ? " active" : "");

    let vals;
    if (rec) {
      vals = `<span class="num">${fmt(rec.weight)}</span><span class="unit">lb</span><span class="times">×</span><span class="num">${rec.reps}</span>`;
    } else if (isActive) {
      vals = `<span class="num" data-k="weight">${fmt(st.draft.weight)}</span><span class="unit">lb</span><span class="times">×</span><span class="num" data-k="reps">${st.draft.reps}</span>`;
    } else {
      vals = `<span class="num">—</span><span class="unit">lb</span><span class="times">×</span><span class="num">—</span>`;
    }

    li.innerHTML =
      `<span class="set-idx">${j + 1}</span>` +
      `<span class="set-vals">${vals}</span>` +
      `<span class="set-check">${CHECK}</span>` +
      (isActive ? `<p class="scrub-hint">Tire un chiffre vers le haut ou le bas pour l'ajuster</p>` : "");

    ol.appendChild(li);
    if (isActive) li.querySelectorAll(".num[data-k]").forEach((n) => bindScrub(n, n.dataset.k, i));
  }
}
PROGRAM.exercises.forEach((_, i) => renderSets(i));

/* ── 7. Molette verticale sur un chiffre (manipulation directe) ── */
function bindScrub(el, kind, i) {
  let g = null;
  el.addEventListener("pointerdown", (e) => {
    e.stopPropagation();                       // la carte ne doit pas partir en glissé
    capture(el, e.pointerId);
    el.classList.add("scrubbing");
    g = { id: e.pointerId, y0: e.clientY, base: state[i].draft[kind], moved: false };
    buzz(5);
  });
  el.addEventListener("pointermove", (e) => {
    if (!g || e.pointerId !== g.id) return;
    const dy = g.y0 - e.clientY;               // vers le haut = plus
    if (!g.moved && Math.abs(dy) < 5) return;
    g.moved = true;
    dismissHint();
    const step = kind === "weight" ? 2.5 : 1;
    const per  = kind === "weight" ? 13 : 17;  // px par cran
    const lo   = kind === "weight" ? 0 : 1;
    const hi   = kind === "weight" ? 600 : 60;
    const v = Math.max(lo, Math.min(hi, g.base + Math.round(dy / per) * step));
    if (v !== state[i].draft[kind]) {
      state[i].draft[kind] = v;
      el.textContent = kind === "weight" ? fmt(v) : String(v);
      buzz(4);                                  // un cran = un tic
      pop(el, 1.06, 0.7);
    }
  });
  const end = (e) => {
    if (!g || e.pointerId !== g.id) return;
    el.classList.remove("scrubbing");
    uncapture(el, e.pointerId);
    g = null;
  };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
}

/* ── 8. La pile de cartes ─────────────────────────────────── */
let pageW = 1;

const pos = new Spring(0, { response: 0.42, damping: 1.0, restDelta: 0.0015, onUpdate: paint });

function paint(p) {
  for (let i = 0; i < cards.length; i++) {
    const d = i - p, ad = Math.min(Math.abs(d), 1.4);
    const el = cards[i].el;
    el.style.transform = `translate3d(${d * pageW}px,0,0) scale(${1 - 0.055 * ad})`;
    el.style.opacity = String(Math.max(0, 1 - 0.75 * ad));
    el.style.visibility = ad >= 1.3 ? "hidden" : "visible";
    el.style.pointerEvents = Math.abs(d) < 0.5 ? "auto" : "none";
  }
  for (let i = 0; i < dots.length; i++) {
    const t = Math.max(0, 1 - Math.abs(i - p));
    const base = exDone(i) ? "rgba(48,209,88,.45)" : "rgba(255,255,255,.22)";
    dots[i].style.transform = `scale(${1 + 0.95 * t})`;
    dots[i].style.background = t > 0.02 ? `color-mix(in srgb, var(--green) ${Math.round(t * 100)}%, ${base})` : base;
  }
}

function layout() { pageW = stack.clientWidth || 1; paint(pos.x); }
addEventListener("resize", layout);

let drag = null;

stack.addEventListener("pointerdown", (e) => {
  if (e.target.closest(".num[data-k]")) return;
  layout();
  drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, from: pos.x, at: idx, axis: null, tr: tracker() };
  drag.tr.add(e.clientX, e.timeStamp);
});

stack.addEventListener("pointermove", (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;

  /* On observe les deux axes, puis on tranche une fois l'intention claire (§10). */
  if (!drag.axis) {
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
    if (Math.abs(dx) <= Math.abs(dy)) { drag = null; return; }   // verticale → au navigateur
    drag.axis = "x";
    capture(stack, e.pointerId);
    dismissHint();
  }

  drag.tr.add(e.clientX, e.timeStamp);
  let p = drag.from - dx / pageW;
  const max = cards.length - 1;
  if (p < 0)   p = -rubberband(-p * pageW, pageW) / pageW;
  if (p > max) p = max + rubberband((p - max) * pageW, pageW) / pageW;
  pos.hold(p);                                   // 1:1 avec le doigt
});

function release(e) {
  if (!drag || e.pointerId !== drag.id) return;
  const wasX = drag.axis === "x", vPx = drag.tr.velocity(), from = drag.at;
  drag = null;
  if (!wasX) return;

  const vIdx = -vPx / pageW;                     // px/s → index/s
  const projected = pos.x + project(vIdx);       // où le geste allait
  let target = Math.round(projected);
  target = Math.max(from - 1, Math.min(from + 1, target));      // une carte à la fois
  target = Math.max(0, Math.min(cards.length - 1, target));

  const flick = Math.abs(vIdx) > 0.35;
  pos.to(target, { velocity: vIdx, damping: flick ? 0.8 : 1.0, response: 0.4 });
  setIndex(target);
}
stack.addEventListener("pointerup", release);
stack.addEventListener("pointercancel", release);

function goTo(i) {
  pos.to(i, { velocity: 0, damping: 1.0, response: 0.42 });
  setIndex(i);
}

function setIndex(i) {
  if (i === idx) return;
  idx = i;
  buzz(7);
  $("head-count").textContent = `${i + 1} sur ${cards.length}`;
  updateButton();
}

/* ── 9. Progression, bouton ───────────────────────────────── */
const progress = new Spring(0, { response: 0.5, damping: 1.0, restDelta: 0.001,
  onUpdate: (v) => { $("progress-fill").style.transform = `scaleX(${v})`; } });

const fill = new Spring(0, { response: 0.38, damping: 1.0, restDelta: 0.002,
  onUpdate: (v) => { const f = $("primary-fill"); f.style.transform = `scaleY(${v})`; f.style.opacity = String(v); } });

function updateButton() {
  const st = state[idx], ex = PROGRAM.exercises[idx];
  let label, go;
  if (st.done.length < ex.sets) { label = `Valider la série ${st.done.length + 1}`; go = false; }
  else if (allDone())           { label = "Terminer la séance"; go = true; }
  else                          { label = "Exercice suivant"; go = true; }
  $("commit-label").textContent = label;
  commitBtn.classList.toggle("go", go);
  fill.to(go ? 1 : 0);
}

function nextIncomplete() {
  for (let k = 1; k <= cards.length; k++) {
    const i = (idx + k) % cards.length;
    if (!exDone(i)) return i;
  }
  return idx;
}

commitBtn.addEventListener("click", () => {
  if (state[idx].done.length < PROGRAM.exercises[idx].sets) commitSet();
  else if (allDone()) openSheet();
  else goTo(nextIncomplete());
});

/* ── 10. Valider une série + record personnel ─────────────── */
function commitSet() {
  const ex = PROGRAM.exercises[idx], st = state[idx];
  const entry = { ...st.draft };
  const prev = PRS[ex.name] ?? 0;
  const isPR = entry.weight > prev;

  st.done.push(entry);
  const row = cards[idx].sets.children[st.done.length - 1];
  const numEl = row ? row.querySelector(".num") : null;

  renderSets(idx);
  const newRow = cards[idx].sets.children[st.done.length - 1];
  if (newRow) pop(newRow, 1.045, 0.5);

  if (isPR) {
    PRS[ex.name] = entry.weight;
    save(K.prs, PRS);
    const found = beatenPRs.find((p) => p.name === ex.name);
    if (found) { found.weight = entry.weight; } else { beatenPRs.push({ name: ex.name, weight: entry.weight, prev }); }
    celebrate(ex.name, entry.weight, newRow);
    buzz([14, 45, 22]);
  } else {
    buzz(11);
  }

  progress.to(doneSets() / totalSets);
  paint(pos.x);
  updateButton();
  dismissHint();

  /* Exercice bouclé : on propose la suite sans jamais l'imposer (§16 agency). */
  if (exDone(idx) && !allDone()) setTimeout(() => { if (exDone(idx)) goTo(nextIncomplete()); }, isPR ? 900 : 420);
}

const banner = $("pr-banner");
let bannerTimer = 0;
const bannerS = new Spring(0, { response: 0.42, damping: 0.8, restDelta: 0.003, onUpdate: (v) => {
  banner.style.transform = `translate3d(0,${(v - 1) * 140}%,0)`;
  banner.style.opacity = String(Math.max(0, Math.min(1, v * 1.6)));
} });

function celebrate(name, weight, row) {
  $("pr-detail").textContent = `${name} · ${fmt(weight)} lb`;
  bannerS.to(1, { damping: 0.78, response: 0.44 });
  clearTimeout(bannerTimer);
  /* Il repart par où il est venu : même chemin à l'aller et au retour (§7). */
  bannerTimer = setTimeout(() => bannerS.to(0, { damping: 1.0, response: 0.4 }), 2300);

  if (!row || REDUCED.matches) return;
  const num = row.querySelector(".num");
  if (!num) return;
  const glow = document.createElement("span");
  glow.className = "num-glow";
  num.appendChild(glow);
  const g = new Spring(0, { response: 0.62, damping: 1.0, restDelta: 0.004,
    onUpdate: (v) => { glow.style.transform = `scale(${0.5 + v * 1.7})`; glow.style.opacity = String(Math.max(0, 1 - v) * 0.9); },
    onRest: () => glow.remove() });
  g.to(1);
}

/* ── 11. Coach-mark ───────────────────────────────────────── */
const hint = $("hint");
const hintS = new Spring(0, { response: 0.4, damping: 0.85, restDelta: 0.004, onUpdate: (v) => {
  hint.style.transform = `translate3d(0,${(1 - v) * 16}px,0) scale(${0.97 + 0.03 * v})`;
  hint.style.opacity = String(v);
}, onRest: () => { if (hintS.t === 0) hint.hidden = true; } });

let hintShown = false;
function showHint() {
  if (localStorage.getItem(K.hint)) return;
  hint.hidden = false; hintShown = true;
  hintS.to(1, { damping: 0.82, response: 0.45 });
  setTimeout(dismissHint, 6000);
}
function dismissHint() {
  if (!hintShown) return;
  hintShown = false;
  localStorage.setItem(K.hint, "1");
  hintS.to(0, { damping: 1.0, response: 0.34 });
}

/* ── 12. Chrono ───────────────────────────────────────────── */
const mmss = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
setInterval(() => { $("clock").textContent = mmss(Date.now() - startedAt); }, 1000);

/* ── 13. Feuille de fin de séance ─────────────────────────── */
const sheet = $("sheet"), scrim = $("scrim"), scroller = sheet.querySelector(".sheet-scroll");
let sheetH = 1, closing = false;

const sheetY = new Spring(0, { response: 0.42, damping: 0.85, restDelta: 0.4, onUpdate: (y) => {
  const p = Math.max(0, Math.min(1, 1 - y / sheetH));
  sheet.style.transform = `translate3d(0,${y}px,0) scale(${0.97 + 0.03 * p})`;
  scrim.style.opacity = String(p);
  /* Le matériau arrive, il ne fait pas que s'allumer (§12). */
  const b = 8 + 24 * p;
  sheet.style.backdropFilter = `blur(${b}px) saturate(180%)`;
  sheet.style.webkitBackdropFilter = `blur(${b}px) saturate(180%)`;
}, onRest: () => { if (closing) { sheet.hidden = true; scrim.hidden = true; closing = false; } } });

function openSheet() {
  /* La séance du jour compte avant qu'on dessine le calendrier. */
  SESSIONS.add(iso(new Date()));
  save(K.sessions, [...SESSIONS]);
  fillSummary();
  sheet.hidden = false; scrim.hidden = false; closing = false;
  sheetH = sheet.offsetHeight || 1;
  sheetY.hold(sheetH);
  sheetY.to(0, { velocity: 0, damping: 0.82, response: 0.46 });
  buzz([10, 40, 10, 40, 18]);
}
function closeSheet(velocity = 0) {
  closing = true;
  sheetY.to(sheetH, { velocity, damping: 1.0, response: 0.34 });
}

$("sheet-close").addEventListener("click", () => closeSheet());
scrim.addEventListener("click", () => closeSheet());

let sd = null;
sheet.addEventListener("pointerdown", (e) => {
  if (e.target.closest("button")) return;
  sd = { id: e.pointerId, y0: e.clientY, from: sheetY.x, armed: false, tr: tracker() };
  sd.tr.add(e.clientY, e.timeStamp);
});
sheet.addEventListener("pointermove", (e) => {
  if (!sd || e.pointerId !== sd.id) return;
  const dy = e.clientY - sd.y0;
  if (!sd.armed) {
    if (Math.abs(dy) < 10) return;
    if (dy < 0 || scroller.scrollTop > 0) { sd = null; return; }   // le scroll garde la priorité
    sd.armed = true;
    capture(sheet, e.pointerId);
  }
  sd.tr.add(e.clientY, e.timeStamp);
  let y = sd.from + dy;
  if (y < 0) y = -rubberband(-y, sheetH);
  sheetY.hold(y);
});
function sheetRelease(e) {
  if (!sd || e.pointerId !== sd.id) return;
  const armed = sd.armed, v = sd.tr.velocity();
  sd = null;
  if (!armed) return;
  const projected = sheetY.x + project(v);
  if (projected > sheetH * 0.4) closeSheet(v);
  else sheetY.to(0, { velocity: v, damping: 0.8, response: 0.42 });
}
sheet.addEventListener("pointerup", sheetRelease);
sheet.addEventListener("pointercancel", sheetRelease);

function fillSummary() {
  $("stat-time").textContent = mmss(Date.now() - startedAt);
  const vol = state.reduce((n, s) => n + s.done.reduce((m, x) => m + x.weight * x.reps, 0), 0);
  $("stat-volume").textContent = Math.round(vol).toLocaleString("fr-CA");
  $("stat-sets").textContent = String(doneSets());

  const block = $("pr-block"), list = $("pr-list");
  block.hidden = beatenPRs.length === 0;
  list.innerHTML = beatenPRs.map((p) =>
    `<li><b>${p.name}</b><i>avant ${fmt(p.prev)}</i><span>${fmt(p.weight)} lb</span></li>`).join("");

  /* Calendrier 5 semaines, colonnes = jours de la semaine (lundi → dimanche) */
  const cal = $("cal"); cal.innerHTML = "";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const monday = new Date(today);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const start = new Date(monday); start.setDate(start.getDate() - 28);
  for (let i = 0; i < 35; i++) {
    const d = new Date(start); d.setDate(d.getDate() + i);
    const c = document.createElement("span");
    c.className = "cal-cell" + (SESSIONS.has(iso(d)) ? " on" : "") + (iso(d) === iso(today) ? " today" : "");
    cal.appendChild(c);
  }

  let streak = 0;
  for (let w = 0; w < 52; w++) {
    const ws = new Date(monday); ws.setDate(ws.getDate() - 7 * w);
    let any = false;
    for (let k = 0; k < 7; k++) { const d = new Date(ws); d.setDate(d.getDate() + k); if (SESSIONS.has(iso(d))) { any = true; break; } }
    if (any) streak++; else break;
  }
  $("streak-num").textContent = String(streak);
}

/* ── 14. Sortie / réinitialisation ────────────────────────── */
function resetProto() {
  [K.sessions, K.prs, K.hint].forEach((k) => localStorage.removeItem(k));
  location.reload();
}
$("reset").addEventListener("click", resetProto);
$("sheet-reset").addEventListener("click", resetProto);
$("quit").addEventListener("click", () => { if (doneSets() > 0) openSheet(); });

/* ── 15. Démarrage ────────────────────────────────────────── */
$("program-name").textContent = PROGRAM.name;
$("sheet-title").textContent = PROGRAM.name;
$("head-count").textContent = `1 sur ${cards.length}`;
layout();
updateButton();
progress.hold(0);
setTimeout(showHint, 700);
