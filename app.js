/* ===== BRCC Collaring — зэрлэг амьтан барих, хүзүүвчлэх бүртгэл =====
   Суурь: BRCC Mongolia аппын offline хадгалалт, Google Sheets (Apps Script) илгээлт, дохио, Excel экспорт. */
const { html, render, useState, useEffect, useRef, useMemo } = htmPreact;

const APP_VERSION = "0.5.2";
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad2 = n => String(n).padStart(2, "0");
const fmtHM = ms => { if (!ms) return ""; const d = new Date(ms); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`; };
const fmtDate = ms => { if (!ms) return ""; const d = new Date(ms); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
const fmtDT = ms => ms ? `${fmtDate(ms)} ${fmtHM(ms)}` : "";
const fmtDur = ms => { if (ms == null || isNaN(ms) || ms < 0) return ""; const s = Math.round(ms / 1000); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h ? `${h}:${pad2(m)}:${pad2(x)}` : `${pad2(m)}:${pad2(x)}`; };
const minOf = ms => ms == null || isNaN(ms) ? "" : Math.round(ms / 600) / 100; // минут, 2 оронтой
const kmOf = m => m == null ? "" : Math.round(m) / 1000;

/* ---------- алхмууд ---------- */
const STEPS = [
  { k: "chaseStart", b: "Хөөлт эхэллээ", s: "Хөөлт эхэлсэн" },
  { k: "dart", b: "Буудлаа", s: "Буудсан (хяналт эхэлсэн)" },
  { k: "vet", b: "Малын эмчийн үзлэг эхэллээ", s: "Эмчийн үзлэг эхэлсэн" },
  { k: "collarStart", b: "Хүзүүвчлэх эхэллээ", s: "Хүзүүвчилж эхэлсэн" },
  { k: "collarEnd", b: "Хүзүүвчилж дууслаа", s: "Хүзүүвчилж дууссан" },
  { k: "antidote", b: "Сэргээх тариа хийлээ", s: "Сэргээх тариа (хяналт эхэлсэн)" },
  { k: "monEnd", b: "Хяналт дууслаа", s: "Хяналт дууссан" },
];
const STEP_ICON = { chaseStart: "▶", dart: "🎯", vet: "🩺", collarStart: "📡", collarEnd: "✔", antidote: "💉", monEnd: "🏁" };
const STEP_SUB = { chaseStart: "секундомер + GPS зай", dart: "хөөлт зогсоно, хяналт эхэлнэ", vet: "үзлэг дуусмагц OK дарна", collarStart: "хүзүүвчлэх таймер эхэлнэ", collarEnd: "дараа нь сэргээх тариа", antidote: "сэргэлтийн хяналт эхэлнэ", monEnd: "бодгаль хаагдана" };
const STEP_IDX = Object.fromEntries(STEPS.map((s, i) => [s.k, i]));
const SIDE = { dart: [["down", "Унасан"], ["recumbent", "Хэвтсэн"], ["approached", "Ойртсон"]], antidote: [["stood", "Босов"], ["left", "Явсан"], ["joined", "Сүрэгтээ нийлсэн"]] };
const SPECIES = ["Хулан", "Цагаан зээр", "Хар сүүлт зээр", "Аргаль", "Янгир"];
const ROLES = ["Баг ахлагч", "Малын эмч", "Судлаач", "Буудагч", "Цаг хэмжигч", "Хүзүүвч зүүгч", "Дээж авагч", "Зурагчин", "Ажиглагч", "Жолооч", "Бусад"];
const SEX = ["Эр", "Эм"];
const DART_N = ["1", "2", "3+"], DART_SITE = ["Гуя", "Хаа", "Хүзүү", "Бусад"], LIE = ["Хэвлийгээр", "Хажуугаар"];
const REPRO = ["Хээлтэй", "Хөхүүл", "Хээлгүй / хөхүүлгүй", "Тодорхойгүй"];
const HABITAT = ["Говь цөл", "Цөлөрхөг хээр", "Хээр", "Хайрган тал", "Уулын бэл", "Заг, бут"];
const WEATHER = ["Цэлмэг", "Үүлшсэн", "Салхитай", "Хүчтэй салхи", "Цас", "Шуурга"];
const BEHAV = ["Тайван", "Түгшүүртэй", "Түрэмгий", "Сүрэгтэй", "Ганцаараа"];
const VETNOTE = ["Хэвийн", "Халуурсан", "Амьсгал удаашралтай", "Чичирсэн"];
const ENDNOTE = ["Хэвийн суллагдсан", "Удаан сэргэсэн", "Доголон", "Сүрэгтээ нийлсэн"];
const AGES = ["1", "2", "3", "4", "5", "6", "7", "8+"];
const BODY = ["Сайн", "Дунд", "Муу"];
const MUCOUS = ["Ягаан (хэвийн)", "Цайвар", "Хөхрөлттэй"];
const RECOVERY = ["Сайн", "Дунд", "Муу"];
const SAMPLE_TYPES = [["ЦУС", "Цус"], ["АРЧ", "Арчдас"], ["БААС", "Баас"], ["ҮС", "Үс"], ["БУС", "Бусад"]];
// BRCC-ийн Google Sheet (brcc.mongolia@gmail.com), 2026-11-05. Утас бүрт автоматаар холбогдоно.
const DEFAULT_SHEET = "https://script.google.com/macros/s/AKfycbzNHYnCtsl3fc6If_8aeRup1hdeRyXAtewL4JdhGjz_fo-q0HAKpFGlToughRp4t1wu/exec";
const DEFAULTS = { chaseWarnMin: 8, chaseStopMin: 10, chaseWarnKm: 4, chaseStopKm: 5, handleMin: 3, tempMin: 5, tempMax: 20, gpsMaxAcc: 25, gpsMaxKmh: 120 };

/* ---------- хадгалалт (IndexedDB, localStorage нөөц) ---------- */
const DB = (() => {
  let dbp = null; const mem = {};
  const open = () => dbp || (dbp = new Promise(res => {
    if (!window.indexedDB) return res(null);
    const rq = indexedDB.open("brcc-collaring", 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore("kv");
    rq.onsuccess = () => res(rq.result); rq.onerror = () => res(null);
  }));
  const tx = async (mode, fn) => { const db = await open(); if (!db) throw new Error("no idb"); return new Promise((res, rej) => { const r = fn(db.transaction("kv", mode).objectStore("kv")); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); };
  return {
    async get(k) { try { const v = await tx("readonly", st => st.get(k)); if (v !== undefined) return v; } catch (e) { } try { const s = localStorage.getItem("col:" + k); return s ? JSON.parse(s) : mem[k]; } catch (e) { return mem[k]; } },
    async set(k, v) { try { await tx("readwrite", st => st.put(v, k)); return; } catch (e) { } try { localStorage.setItem("col:" + k, JSON.stringify(v)); } catch (e) { mem[k] = v; } },
    async del(k) { try { await tx("readwrite", st => st.delete(k)); } catch (e) { } try { localStorage.removeItem("col:" + k); } catch (e) { } delete mem[k]; },
  };
})();
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });

const S = { surveys: {}, inds: {}, settings: { ...DEFAULTS, sheetsUrl: "", recorder: "", night: false }, queue: [], ready: false };
const subs = new Set(); const emit = () => subs.forEach(f => f());
let saveTimer = null; const dirty = new Set();
function persist(key) { dirty.add(key); clearTimeout(saveTimer); saveTimer = setTimeout(flushSave, 300); }
async function flushSave() { const ks = [...dirty]; dirty.clear(); for (const k of ks) await DB.set(k, S[k]); }
addEventListener("pagehide", flushSave);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushSave(); });

async function loadAll() {
  for (const k of ["surveys", "inds", "queue"]) { const v = await DB.get(k); if (v) S[k] = v; }
  const st = await DB.get("settings"); if (st) S.settings = { ...S.settings, ...st };
  if (!(S.settings.sheetsUrl || "").trim()) { S.settings.sheetsUrl = DEFAULT_SHEET; persist("settings"); }
  // 30 хоногоос дээш хогийн саванд байгааг бүрмөсөн устгана
  const lim = Date.now() - 30 * 864e5;
  for (const [id, x] of Object.entries(S.inds)) if (x.deletedAt && x.deletedAt < lim) { (x.photos || []).forEach(p => DB.del("photo:" + p.id)); delete S.inds[id]; }
  for (const [id, x] of Object.entries(S.surveys)) if (x.deletedAt && x.deletedAt < lim) delete S.surveys[id];
  // v0.4.6 хүртэл зургийн дараалал "collar"/"animal" төрөлтэй хадгалагдаж, илгээгдэлгүй хаягддаг байсан
  S.queue = (S.queue || []).map(q => q.kind === "collar" || q.kind === "animal" ? { ...q, kind: "photo", pkind: q.kind } : q);
  for (const x of Object.values(S.inds)) for (const p of x.photos || []) if (!x.deletedAt && !S.queue.some(q => q.kind === "photo" && q.id === p.id) && !(S.settings.sentPhotos || {})[p.id]) S.queue.push({ kind: "photo", id: p.id, indId: x.id, pkind: p.kind, at: Date.now() });
  // v0.1 → v0.2: «Буудсаны дараах хяналт», «Хяналт эхэллээ» алхам хасагдаж, «Сэргээх тариа» нэмэгдсэн
  for (const x of Object.values(S.inds)) { if (x.steps.monStart && !x.steps.antidote) x.steps.antidote = x.steps.monStart; delete x.steps.monStart; delete x.steps.postDart; }
  S.ready = true; document.body.classList.toggle("night", !!S.settings.night); document.body.classList.toggle("big", !!S.settings.big); emit();
  ChaseTracker.resume(); setTimeout(flushQueue, 2000);
}
function useStore() { const [, f] = useState(0); useEffect(() => { const cb = () => f(x => x + 1); subs.add(cb); if (S.ready) cb(); return () => subs.delete(cb); }, []); return S; } // ачаалал дуусчихсан бол шууд дахин зурна (эс бөгөөс «Ачаалж байна»-д гацдаг)
const setting = k => S.settings[k] ?? DEFAULTS[k];

function updSurvey(id, fn) { const s = { ...S.surveys[id] }; fn(s); s.updatedAt = Date.now(); S.surveys[id] = s; persist("surveys"); enqueue("survey", id); emit(); }
function updInd(id, fn, opts = {}) { const x = JSON.parse(JSON.stringify(S.inds[id])); fn(x); x.updatedAt = Date.now(); S.inds[id] = x; persist("inds"); if (!opts.noSync) enqueue("ind", id); emit(); }
const liveSurveys = () => Object.values(S.surveys).filter(s => !s.deletedAt).sort((a, b) => b.createdAt - a.createdAt);
const indsOf = sid => Object.values(S.inds).filter(x => x.surveyId === sid && !x.deletedAt).sort((a, b) => a.createdAt - b.createdAt);
const usedCollars = exceptId => new Set(Object.values(S.inds).filter(x => !x.deletedAt && x.collarId && x.id !== exceptId).map(x => x.collarId));

/* ---------- гео ---------- */
function haversine(a, b) { const R = 6371000, r = x => x * Math.PI / 180, dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng); const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); }
function getPosition(timeout = 15000) {
  return new Promise(res => {
    if (!navigator.geolocation) return res(null);
    navigator.geolocation.getCurrentPosition(p => res({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6), acc: Math.round(p.coords.accuracy) }), () => res(null), { enableHighAccuracy: true, timeout, maximumAge: 10000 });
  });
}
// Хөөлтийн үеийн сүүлийн цэгийг дахин ашиглана (буудсан цэг шууд гарна)
const lastFix = () => { const k = ChaseTracker.kept[ChaseTracker.kept.length - 1]; return k && Date.now() - k.t < 30000 ? { lat: k.lat, lng: k.lng, acc: k.acc } : null; }; // үсрэлтийг хассан сүүлийн цэг

/* ---------- дохио ---------- */
let audioCtx = null;
const primeAudio = () => { try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === "suspended") audioCtx.resume(); } catch (e) { } };
function beep(times = 3, freq = 880) {
  try { if (!audioCtx) primeAudio(); if (audioCtx) for (let i = 0; i < times; i++) { const o = audioCtx.createOscillator(), g = audioCtx.createGain(); o.connect(g); g.connect(audioCtx.destination); o.frequency.value = freq; g.gain.value = 0.35; const t0 = audioCtx.currentTime + i * 0.45; o.start(t0); o.stop(t0 + 0.3); } } catch (e) { }
  if (navigator.vibrate) navigator.vibrate(Array.from({ length: times * 2 - 1 }, (_, i) => i % 2 ? 150 : 350));
}
addEventListener("pointerdown", primeAudio, { passive: true });

let wakeLock = null;
async function keepAwake(on) { try { if (on && navigator.wakeLock && !wakeLock) { wakeLock = await navigator.wakeLock.request("screen"); wakeLock.addEventListener("release", () => { wakeLock = null; }); } if (!on && wakeLock) { wakeLock.release(); wakeLock = null; } } catch (e) { } }

/* ---------- хөөлтийн GPS (үсрэлт шүүх) ----------
   1) нарийвчлал муу (gpsMaxAcc м-ээс их) цэгийг хасна
   2) өмнөх цэгээс боломжгүй хурдтай (gpsMaxKmh-ээс их) бол үсрэлт гэж хасна
   3) нарийвчлалаас бага хөдөлгөөнийг (зогсож байхад чичрэх) тоолохгүй
   4) сүүлийн 3 цэгийн дунджаар зөөлрүүлж зай тооцно */
const ChaseTracker = {
  indId: null, watchId: null, kept: [], smooth: [], dist: 0, kmh: 0, maxKmh: 0, lastMove: 0, last: null, level: 0, lastAlarm: 0, tick: null, status: "",
  start(indId) {
    this.stop(); this.indId = indId; const x = S.inds[indId]; const c = x.chase || {};
    this.kept = []; this.rej = []; this.smooth = (c.track || []).map(p => ({ ...p })); this.dist = c.distM || 0; this.maxKmh = c.maxKmh || 0; this.kmh = 0; this.lastMove = 0; this.level = 0; this.status = "GPS хайж байна…";
    if (navigator.geolocation) this.watchId = navigator.geolocation.watchPosition(p => this.onPos(p), e => { this.status = "GPS алдаа: " + (e.message || e.code); emit(); }, { enableHighAccuracy: true, maximumAge: 1000, timeout: 30000 });
    else this.status = "GPS байхгүй";
    this.tick = setInterval(() => this.check(), 1000); keepAwake(true); emit();
  },
  resume() { const x = Object.values(S.inds).find(i => !i.deletedAt && i.steps.chaseStart && !i.steps.chaseStart.skipped && !i.steps.dart && !i.chaseAborted); if (x) this.start(x.id); },
  onPos(p) {
    const pt = { lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6), acc: Math.round(p.coords.accuracy), t: Date.now() };
    this.last = pt; this.status = `GPS ±${pt.acc} м`;
    if (p.timestamp && Date.now() - p.timestamp > 10000) { emit(); return; } // хуучин (кэшлэгдсэн) байршил
    if (pt.acc > setting("gpsMaxAcc")) { this.status = "GPS сул байна"; emit(); return; }
    const prev = this.kept[this.kept.length - 1];
    let jumpReset = false;
    if (prev) {
      const d = haversine(prev, pt), dt = (pt.t - prev.t) / 1000;
      if (dt <= 0) return;
      if (d / dt * 3.6 > setting("gpsMaxKmh")) {
        // Үсрэлт. Гэхдээ дараалсан 3 цэг хоорондоо ойр байвал буруу нь өмнөх цэг байсан гэж үзээд
        // тэндээс шинээр тоолж эхэлнэ (зайд нэмэхгүй). Ингэснээр км гэнэт үсрэхгүй.
        this.rej.push(pt);
        const r = this.rej.slice(-3);
        if (r.length < 3 || haversine(r[0], r[2]) > Math.max(60, r[2].acc * 3)) { emit(); return; }
        this.kept = r.slice(0, 2); jumpReset = true;
      } else if (d < Math.max(5, pt.acc)) { this.rej = []; emit(); return; }
    }
    this.rej = [];
    this.kept.push(pt); if (this.kept.length > 50) this.kept.shift();
    const k = this.kept.slice(-3); const sp = { lat: +(k.reduce((a, b) => a + b.lat, 0) / k.length).toFixed(6), lng: +(k.reduce((a, b) => a + b.lng, 0) / k.length).toFixed(6), t: pt.t };
    const ps = this.smooth[this.smooth.length - 1];
    if (jumpReset || !prev) { if (jumpReset && this.dist === 0) this.smooth = []; } // эхний/дахин тогтоосон цэгээс зай нэмэхгүй
    else if (ps) this.dist += haversine(ps, sp);
    if (jumpReset) sp.gap = true;
    this.smooth.push(sp);
    // Хурд: сүүлийн ≥4 секундын замаар (нэг цэгийн чичрэлтээс хамгаална)
    if (prev && !jumpReset) {
      let path = 0, i = this.smooth.length - 1;
      while (i > 0 && !this.smooth[i].gap && sp.t - this.smooth[i].t < 4000) { path += haversine(this.smooth[i - 1], this.smooth[i]); i--; }
      const dt = (sp.t - this.smooth[i].t) / 1000;
      if (dt >= 4 && dt <= 30) { this.kmh = path / dt * 3.6; this.lastMove = pt.t; if (this.kmh < setting("gpsMaxKmh") && this.kmh > this.maxKmh) this.maxKmh = this.kmh; }
    }
    if (this.indId && S.inds[this.indId]) updInd(this.indId, x => { x.chase = { track: this.smooth, distM: Math.round(this.dist), maxKmh: Math.round(this.maxKmh) }; }, { noSync: true });
  },
  speedNow() { return Date.now() - this.lastMove > 6000 ? 0 : this.kmh; },
  elapsed() { const x = S.inds[this.indId]; return x && x.steps.chaseStart ? Date.now() - x.steps.chaseStart.t : 0; },
  check() {
    if (!this.indId || !S.inds[this.indId]) return this.stop();
    const m = this.elapsed() / 60000, km = this.dist / 1000;
    const lvl = (m >= setting("chaseStopMin") || km >= setting("chaseStopKm")) ? 2 : (m >= setting("chaseWarnMin") || km >= setting("chaseWarnKm")) ? 1 : 0;
    if (lvl > this.level) { beep(lvl === 2 ? 6 : 3, lvl === 2 ? 1040 : 760); this.lastAlarm = Date.now(); }
    else if (lvl === 2 && Date.now() - this.lastAlarm > 10000) { beep(4, 1040); this.lastAlarm = Date.now(); }
    this.level = lvl; emit();
  },
  stop() { if (this.watchId != null && navigator.geolocation) navigator.geolocation.clearWatch(this.watchId); clearInterval(this.tick); this.watchId = null; this.tick = null; this.indId = null; this.level = 0; keepAwake(false); },
};

/* ---------- алхам бүртгэх ---------- */
const curStep = x => STEPS.findIndex(s => !x.steps[s.k]);
let lastPress = 0;
async function pressStep(id, k) {
  const t = Date.now();
  if (t - lastPress < 1500) return; // бээлийтэй, сэгсэрч яваа машинд санамсаргүй давхар дарахаас хамгаална
  lastPress = t;
  updInd(id, x => { x.steps[k] = { t }; if (k === "monEnd") x.status = "done"; });
  if (k === "chaseStart") { ChaseTracker.start(id); }
  if (k === "dart" && ChaseTracker.indId === id) { const f = lastFix(); ChaseTracker.stop(); if (f) updInd(id, x => Object.assign(x.steps.dart, f)); }
  if (k === "collarStart") showToast(`${setting("handleMin")} минутын таймер эхэллээ`);
  if (["collarStart", "antidote", "dart", "vet"].includes(k)) keepAwake(true);
  if (k === "monEnd") keepAwake(false);
  if (k === "dart" && S.inds[id].steps.dart.lat) return;
  const pos = lastFix() || await getPosition();
  if (pos && S.inds[id] && S.inds[id].steps[k] && !S.inds[id].steps[k].lat) updInd(id, x => Object.assign(x.steps[k], pos));
}
function undoStep(id) {
  const x = S.inds[id];
  if (x.chaseAborted) { // буудалгүй зогсоосон хөөлтийг сэргээнэ
    updInd(id, y => { for (const s of STEPS) if (y.steps[s.k] && y.steps[s.k].reason === "abort") delete y.steps[s.k]; delete y.steps.chaseStop; y.chaseAborted = false; y.status = "open"; });
    ChaseTracker.start(id); return;
  }
  let i = curStep(x); i = i < 0 ? STEPS.length - 1 : i - 1;
  if (i < 0) return;
  const o = x.steps[STEPS[i].k];
  if (o && o.skipped && o.reason === "vet") { // эмчийн «OK биш» шийдвэрийг буцаана
    updInd(id, y => { delete y.steps.collarStart; delete y.steps.collarEnd; y.vet.ok = undefined; delete y.vet.decidedAt; y.released = ""; y.status = "open"; }); return;
  }
  const k = STEPS[i].k;
  updInd(id, y => {
    for (let j = i; j < STEPS.length; j++) delete y.steps[STEPS[j].k];
    if (k === "vet") { y.vet = { ...(y.vet || {}), ok: undefined }; delete y.vet.decidedAt; }
    if (k === "chaseStart") { y.chase = null; y.chaseAborted = false; }
    y.status = "open";
  });
  if (k === "chaseStart" && ChaseTracker.indId === id) ChaseTracker.stop();
  if (k === "dart") ChaseTracker.start(id);
}
function vetDecision(id, ok) {
  updInd(id, x => {
    x.vet = { ...(x.vet || {}), ok, decidedAt: Date.now() };
    if (!ok) { x.steps.collarStart = { skipped: true, reason: "vet" }; x.steps.collarEnd = { skipped: true, reason: "vet" }; x.released = "Хүзүүвчлэлгүй сулласан"; }
  });
}
function abortChase(id) {
  ChaseTracker.stop();
  updInd(id, x => { x.chaseAborted = true; x.steps.chaseStop = { t: Date.now() }; x.status = "aborted"; for (const s of STEPS.slice(1)) x.steps[s.k] = x.steps[s.k] || { skipped: true, reason: "abort" }; });
}

/* ---------- тооцоо ---------- */
const st = (x, k) => x.steps[k] && !x.steps[k].skipped ? x.steps[k].t : null;
const diff = (a, b) => a && b ? b - a : null;
const avgKmh = m => m.chase && m.chaseM ? Math.round(m.chaseM / 1000 / (m.chase / 3600000)) : null;
function metrics(x) {
  const down = (x.side && (x.side.recumbent || x.side.down)) || null;
  const first = STEPS.map(s => st(x, s.k)).find(Boolean);
  return {
    chase: diff(st(x, "chaseStart"), st(x, "dart") || (x.chaseAborted && x.steps.chaseStop && x.steps.chaseStop.t)),
    chaseM: x.chase ? x.chase.distM : null,
    maxKmh: x.chase && x.chase.maxKmh ? x.chase.maxKmh : null,
    induction: diff(st(x, "dart"), down && down.t),
    vet: diff(st(x, "vet"), (x.vet && x.vet.decidedAt) || st(x, "collarStart")),
    handling: diff(st(x, "collarStart"), st(x, "collarEnd")),
    standUp: diff(st(x, "antidote"), x.side && x.side.stood && x.side.stood.t),
    monitoring: diff(st(x, "antidote"), st(x, "monEnd")),
    total: diff(first, st(x, "monEnd")),
  };
}
// Дутуу мэдээлэл (дараа бөглөж болно, улаанаар харуулна)
function missing(x) {
  const m = [];
  if (!x.aimag) m.push("аймаг"); if (!x.soum) m.push("сум"); if (!x.place) m.push("газрын нэр");
  if (x.airTemp === "" || x.airTemp == null) m.push("агаарын хэм");
  if (st(x, "vet") && !(x.vet && x.vet.body)) m.push("биеийн ерөнхий байдал");
  if (st(x, "collarStart")) {
    if (!x.collarId) m.push("хүзүүвчний дугаар"); if (!x.sex) m.push("хүйс"); if (x.age === "" || x.age == null) m.push("нас");
    if (!(x.photos || []).some(p => p.kind === "animal")) m.push("бодгалийн зураг");
  }
  if (x.status === "done" && !x.recovery) m.push("сэргэлт");
  return m;
}
const isMiss = (x, k) => missing(x).includes(k);
const label = x => x.collarId ? `Бодгаль ${x.no} · ${x.collarId}` : `Бодгаль ${x.no}`;
const fileLabel = x => x.collarId || `bodgal${x.no}`;
function statusTag(x) {
  if (x.status === "aborted") return html`<span class="tag mut">Хөөлт зогсоосон</span>`;
  if (x.vet && x.vet.ok === false) return html`<span class="tag bad">Хүзүүвчлээгүй</span>`;
  if (x.status === "done") return html`<span class="tag ok">Дууссан</span>`;
  const i = curStep(x); return html`<span class="tag warn">${i <= 0 ? "Шинэ" : STEPS[i - 1].s}</span>`;
}

/* ---------- зураг ---------- */
function resizeImage(file, max = 1600, q = 0.8) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => { const sc = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement("canvas"); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL("image/jpeg", q)); };
    img.onerror = rej; img.src = url;
  });
}
async function addPhoto(id, kind, file) {
  const data = await resizeImage(file); const pid = uid();
  await DB.set("photo:" + pid, data);
  updInd(id, x => { x.photos = [...(x.photos || []), { id: pid, kind, t: Date.now() }]; });
  enqueue("photo", pid, { indId: id, pkind: kind });
}
const photoKind = p => p.kind === "collar" ? "huzuuvch" : "bodgal";
function photoName(x, p) { const same = (x.photos || []).filter(q => photoKind(q) === photoKind(p)); return `${fileLabel(x)}_${photoKind(p)}_${same.findIndex(q => q.id === p.id) + 1}.jpg`; }
function PhotoThumb({ pid }) { const [src, setSrc] = useState(undefined); useEffect(() => { DB.get("photo:" + pid).then(v => setSrc(v || null)); }, [pid]); return src ? html`<img src=${src} alt="" />` : html`<div class="nophoto">${src === null ? "өөр утсанд" : "…"}</div>`; }

/* ---------- Google Sheet руу илгээх ---------- */
function enqueue(kind, id, extra) { S.queue = S.queue.filter(q => !(q.kind === kind && q.id === id)).concat([{ ...(extra || {}), kind, id, at: Date.now() }]); persist("queue"); clearTimeout(enqueue.t); enqueue.t = setTimeout(flushQueue, 1500); }
function surveyRow(s) { return { id: s.id, "Судалгаа": s.name, "Зүйл": s.species, "Баг": (s.team || []).map(m => `${m.name} (${m.role})`).join("; "), "Бүртгэгч": s.recorder || "", "Үүсгэсэн": fmtDT(s.createdAt), "Устгасан": s.deletedAt ? fmtDT(s.deletedAt) : "" }; }
function indRow(x) {
  const s = S.surveys[x.surveyId] || {}, m = metrics(x), v = x.vet || {}, r = { id: x.id };
  Object.assign(r, { "Судалгаа": s.name || "", "Зүйл": s.species || "", "№": x.no, "Хүзүүвч": x.collarId || "", "Iridium IMEI": x.imei || "", "Огноо": fmtDate(x.createdAt), "Аймаг": x.aimag || "", "Сум": x.soum || "", "Газрын нэр": x.place || "", "Амьдрах орчин": x.habitat || "",
    "Агаарын хэм (°C)": x.airTemp ?? "", "Цаг агаар": x.weather || "" });
  for (const sp of STEPS) { const o = x.steps[sp.k]; r[sp.s] = o ? (o.skipped ? "алгассан" : fmtHM(o.t)) : ""; }
  for (const k of ["chaseStart", "dart", "collarEnd"]) { const o = x.steps[k]; r[`${STEPS[STEP_IDX[k]].s} N`] = o && o.lat || ""; r[`${STEPS[STEP_IDX[k]].s} E`] = o && o.lng || ""; }
  r["Эмчийн үзлэг дууссан (OK)"] = x.vet && x.vet.decidedAt ? fmtHM(x.vet.decidedAt) : "";
  for (const [k, l] of [...SIDE.dart, ...SIDE.antidote]) r[l] = x.side && x.side[k] ? fmtHM(x.side[k].t) : "";
  Object.assign(r, { "Хөөсөн хугацаа (мин)": minOf(m.chase), "Хөөсөн зай (км)": kmOf(m.chaseM), "Дундаж хурд (км/ц)": avgKmh(m) ?? "", "Дээд хурд (км/ц)": m.maxKmh ?? "", "Хөөлт зогсоосон": x.chaseAborted ? "тийм" : "", "Буудсанаас хэвтэх (мин)": minOf(m.induction), "Эмчийн үзлэг (мин)": minOf(m.vet), "Хүзүүвчилсэн хугацаа (мин)": minOf(m.handling), "Босох хүртэл (мин)": minOf(m.standUp), "Хяналт (мин)": minOf(m.monitoring), "Нийт (мин)": minOf(m.total),
    "Эмчийн дүгнэлт": v.ok === true ? "OK" : v.ok === false ? "OK биш" : "", "Биеийн ерөнхий байдал": v.body || "", "Ил харагдах шарх сорви": v.inj === "Байхгүй" ? "байхгүй" : v.injuries || (v.inj === "Байгаа" ? "байгаа" : ""), "Эмчийн тэмдэглэл": v.notes || "",
    "Амин үзүүлэлт": (v.vitals || []).map(a => `${fmtHM(a.t)} амьс ${a.resp || "-"}, зүрх ${a.hr || "-"}, хэм ${a.temp || "-"}, салст ${a.mucous || "-"}`).join(" | "),
    "Хүйс": x.sex || "", "Нас": x.age || "", "Өсөлтийг тооцсон": x.growth ? "тийм" : "", "Өсөлтийн тэмдэглэл": x.ageNote || "", "Үржлийн байдал": x.repro || "", "Онцлох зан төрх": x.behaviour || "", "TRD соронз авсан": x.trd ? "тийм" : "", "Хоёр хуруу багтсан": x.fit2 ? "тийм" : "", "Нүд боосон, чих бөглөсөн": x.eyes ? "тийм" : "", "Хэвтүүлсэн байдал": x.lie || "", "Сумны тоо": x.dartN || "", "Сум туссан газар": x.dartSite || "",
    "Дээж": (x.samples || []).map(a => a.code).join(", "), "Зураг (тоо)": (x.photos || []).length, "Сэргэлт": x.recovery || "", "Суллалт": x.released || "", "Тэмдэглэл": x.notes || "", "Төлөв": x.status || "", "Устгасан": x.deletedAt ? fmtDT(x.deletedAt) : "", "Дутуу": missing(x).join(", "), "Шинэчилсэн": fmtDT(x.updatedAt) });
  return r;
}
let flushing = false;
async function flushQueue() {
  const url = (S.settings.sheetsUrl || "").trim();
  if (!url || flushing || !navigator.onLine || !S.queue.length) return;
  flushing = true; emit();
  try {
    const q = S.queue[0].kind === "photo" ? [S.queue[0]] : S.queue.filter(i => i.kind !== "photo").slice(0, 40);
    const items = [];
    for (const it of q) {
      if (it.kind === "survey" && S.surveys[it.id]) items.push({ kind: "survey", row: surveyRow(S.surveys[it.id]) });
      if (it.kind === "ind" && S.inds[it.id]) { items.push({ kind: "ind", row: indRow(S.inds[it.id]) }); const x = S.inds[it.id]; if (x.chase && x.chase.track && x.chase.track.length > 1) items.push({ kind: "track", id: x.id, name: label(x), points: x.chase.track.map(p => [p.lat, p.lng, fmtHM(p.t)]) });
        // Амин үзүүлэлт, дээжийг тусдаа хуудсанд (бодгалийн id-аар дахин бичнэ)
        const bs = buildSheets([x]); for (const n of ["Амин үзүүлэлт", "Дээж"]) { const sh = bs.find(b => b.name === n); items.push({ kind: "rows", sheet: n, id: x.id, header: sh ? sh.rows[0] : [], rows: sh ? sh.rows.slice(1) : [] }); } }
      if (it.kind === "photo") { const data = await DB.get("photo:" + it.id); const x = S.inds[it.indId]; if (x && (data || it.meta)) items.push({ kind: "photo", id: it.id, ind: x.id, meta: !!it.meta, name: photoName(x, (x.photos || []).find(p => p.id === it.id) || { id: it.id, kind: it.pkind }), note: ((x.photos || []).find(p => p.id === it.id) || {}).note || "", survey: (S.surveys[x.surveyId] || {}).name || "", data: it.meta ? "" : data }); }
    }
    const body = JSON.stringify({ app: "collaring", items });
    try { await fetch(url, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain;charset=utf-8" }, body }); }
    catch (e) { throw e; }
    const sent = new Set(q.map(i => i.kind + "|" + i.id + "|" + i.at));
    const ph = q.filter(i => i.kind === "photo"); if (ph.length) { S.settings.sentPhotos = { ...(S.settings.sentPhotos || {}) }; ph.forEach(i => { S.settings.sentPhotos[i.id] = 1; }); persist("settings"); }
    S.queue = S.queue.filter(i => !sent.has(i.kind + "|" + i.id + "|" + i.at)); persist("queue");
    S.lastSync = Date.now();
    if (S.queue.length) setTimeout(flushQueue, 800);
  } catch (e) { console.warn("sync failed", e); }
  finally { flushing = false; emit(); }
}
addEventListener("online", () => setTimeout(flushQueue, 1000));
setInterval(flushQueue, 60000);

/* ---------- Excel экспорт (BRCC аппын жижиг XLSX бичигч) ---------- */
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = u8 => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function makeZip(files) {
  const enc = new TextEncoder(), parts = [], central = []; let offset = 0;
  const u16 = n => [n & 255, (n >> 8) & 255], u32 = n => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
  const now = new Date(), dt = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1), dd = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const f of files) {
    const name = enc.encode(f.name), data = typeof f.data === "string" ? enc.encode(f.data) : f.data, crc = crc32(data);
    const head = new Uint8Array([0x50, 0x4b, 3, 4, ...u16(20), ...u16(0x800), ...u16(0), ...u16(dt), ...u16(dd), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0)]);
    parts.push(head, name, data);
    central.push(new Uint8Array([0x50, 0x4b, 1, 2, ...u16(20), ...u16(20), ...u16(0x800), ...u16(0), ...u16(dt), ...u16(dd), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), name);
    offset += head.length + name.length + data.length;
  }
  let cdLen = 0; for (const c of central) cdLen += c.length;
  const end = new Uint8Array([0x50, 0x4b, 5, 6, ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cdLen), ...u32(offset), ...u16(0)]);
  const all = [...parts, ...central, end], out = new Uint8Array(all.reduce((a, b) => a + b.length, 0)); let p = 0; for (const a of all) { out.set(a, p); p += a.length; } return out;
}
const xmlEsc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
function colName(n) { let s = ""; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
function sheetXml(rows) {
  let x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>';
  rows.forEach((row, ri) => { x += `<row r="${ri + 1}">`; row.forEach((v, ci) => { if (v === null || v === undefined || v === "") return; const ref = colName(ci) + (ri + 1), s = ri === 0 ? ' s="1"' : ""; x += typeof v === "number" && isFinite(v) ? `<c r="${ref}"${s}><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`; }); x += "</row>"; });
  return x + "</sheetData></worksheet>";
}
function makeXlsx(sheets) {
  const X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  return makeZip([
    { name: "[Content_Types].xml", data: X + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") + "</Types>" },
    { name: "_rels/.rels", data: X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: "xl/workbook.xml", data: X + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + sheets.map((s, i) => `<sheet name="${xmlEsc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") + "</sheets></workbook>" },
    { name: "xl/_rels/workbook.xml.rels", data: X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") + `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: "xl/styles.xml", data: X + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>' },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s.rows) })),
  ]);
}
const toRows = objs => { const keys = []; objs.forEach(o => Object.keys(o).forEach(k => { if (!keys.includes(k)) keys.push(k); })); return [keys, ...objs.map(o => keys.map(k => o[k]))]; };
async function saveFile(name, data, mime) {
  const blob = new Blob([data], { type: mime }), file = new File([blob], name, { type: mime });
  if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e && e.name === "AbortError") return; } }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}
function buildSheets(list) {
  const vit = [], smp = [], trk = [], pho = [];
  for (const x of list) {
    for (const a of (x.vet && x.vet.vitals) || []) vit.push({ "Хүзүүвч / бодгаль": label(x), "Цаг": fmtHM(a.t), "Үе шат": a.stage === "collarStart" ? "Хүзүүвчлэх үед" : a.stage === "vet" ? "Эмчийн үзлэг" : a.stage ? (STEPS[STEP_IDX[a.stage]] || {}).s || "" : "", "Амьсгал (/мин)": +a.resp || a.resp || "", "Зүрх (/мин)": +a.hr || a.hr || "", "Биеийн хэм (°C)": +a.temp || a.temp || "", "Салст": a.mucous || "" });
    for (const a of x.samples || []) smp.push({ "Дээжийн дугаар": a.code, "Төрөл": a.label, "Хүзүүвч / бодгаль": label(x), "Цаг": fmtDT(a.t) });
    for (const p of x.photos || []) pho.push({ "Файл": photoName(x, p), "Хүзүүвч / бодгаль": label(x), "Төрөл": p.kind === "collar" ? "Хүзүүвч" : "Бодгаль", "Цаг": fmtDT(p.t), "Тэмдэглэл": p.note || "" });
    for (const p of (x.chase && x.chase.track) || []) trk.push({ "Хүзүүвч / бодгаль": label(x), "Цаг": fmtHM(p.t), N: p.lat, E: p.lng });
  }
  const sheets = [{ name: "Бодгаль", rows: toRows(list.map(indRow)) }];
  if (vit.length) sheets.push({ name: "Амин үзүүлэлт", rows: toRows(vit) });
  if (smp.length) sheets.push({ name: "Дээж", rows: toRows(smp) });
  if (pho.length) sheets.push({ name: "Зураг", rows: toRows(pho) });
  if (trk.length) sheets.push({ name: "Хөөлтийн зам", rows: toRows(trk) });
  return sheets;
}
const safeName = n => (n || "bugd").replace(/[^\wА-Яа-яЁёӨөҮү-]+/g, "_");
function exportSurvey(sid) {
  const s = S.surveys[sid], list = sid ? indsOf(sid) : Object.values(S.inds).filter(x => !x.deletedAt);
  saveFile(`BRCC_Collaring_${safeName(s && s.name)}_${fmtDate(Date.now())}.xlsx`, makeXlsx(buildSheets(list)), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}

/* ---------- ZIP: Excel + KMZ + бүх зураг ---------- */
function b64ToBytes(dataUrl) { const b = atob(dataUrl.split(",")[1]); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
function buildKml(list, title) {
  const pm = (name, p, style, desc) => p && p.lat ? `<Placemark><name>${xmlEsc(name)}</name><styleUrl>#${style}</styleUrl><description>${xmlEsc(desc || "")}</description><Point><coordinates>${p.lng},${p.lat},0</coordinates></Point></Placemark>` : "";
  let k = `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${xmlEsc(title)}</name>
<Style id="chase"><LineStyle><color>ff2b53a9</color><width>4</width></LineStyle></Style>
<Style id="start"><IconStyle><color>ff7ab5f3</color><Icon><href>http://maps.google.com/mapfiles/kml/paddle/wht-circle.png</href></Icon></IconStyle></Style>
<Style id="dart"><IconStyle><Icon><href>http://maps.google.com/mapfiles/kml/paddle/red-stars.png</href></Icon></IconStyle></Style>
<Style id="release"><IconStyle><Icon><href>http://maps.google.com/mapfiles/kml/paddle/grn-circle.png</href></Icon></IconStyle></Style>`;
  for (const x of list) {
    const m = metrics(x), st2 = x.steps, desc = [x.sex, x.age ? x.age + " нас" : "", m.chase != null ? `хөөлт ${fmtDur(m.chase)}, ${kmOf(m.chaseM) || 0} км${avgKmh(m) ? `, дундаж ${avgKmh(m)} км/ц` : ""}${m.maxKmh ? `, дээд ${m.maxKmh} км/ц` : ""}` : ""].filter(Boolean).join(" · ");
    k += `<Folder><name>${xmlEsc(label(x))}</name>`;
    k += pm(`${label(x)} — хөөлт эхэлсэн`, st2.chaseStart, "start", fmtDT(st2.chaseStart && st2.chaseStart.t));
    k += pm(`${label(x)} — буудсан`, st2.dart, "dart", desc);
    k += pm(`${label(x)} — суллагдсан`, (st2.collarEnd && st2.collarEnd.lat ? st2.collarEnd : st2.monEnd), "release", desc);
    const tr = (x.chase && x.chase.track) || [];
    if (tr.length > 1) k += `<Placemark><name>${xmlEsc(label(x))} — хөөлтийн зам</name><styleUrl>#chase</styleUrl><LineString><tessellate>1</tessellate><coordinates>${tr.map(p => `${p.lng},${p.lat},0`).join(" ")}</coordinates></LineString></Placemark>`;
    k += "</Folder>";
  }
  return k + "</Document></kml>";
}
function saveChaseKmz(x) { saveFile(`${fileLabel(x)}_hooltiin_zam_${fmtDate(x.steps.chaseStart ? x.steps.chaseStart.t : Date.now())}.kmz`, makeZip([{ name: "doc.kml", data: buildKml([x], label(x)) }]), "application/vnd.google-earth.kmz"); }
async function exportZip(sid) {
  const s = S.surveys[sid], list = indsOf(sid), base = `BRCC_Collaring_${safeName(s.name)}_${fmtDate(Date.now())}`;
  showToast("ZIP бэлдэж байна…");
  const files = [{ name: base + ".xlsx", data: makeXlsx(buildSheets(list)) }, { name: base + ".kmz", data: makeZip([{ name: "doc.kml", data: buildKml(list, s.name) }]) }];
  let missing = 0;
  for (const x of list) { for (const p of x.photos || []) { const d = await DB.get("photo:" + p.id); if (!d) { missing++; continue; } files.push({ name: "zurag/" + photoName(x, p), data: b64ToBytes(d) }); } }
  await saveFile(base + ".zip", makeZip(files), "application/zip");
  if (missing) showToast(`${missing} зураг өөр утсанд байгаа тул ZIP-д ороогүй`);
}

/* ---------- QR-оор утас хооронд дамжуулах ----------
   Өгөгдлийг шахаж (deflate) хэсэглээд QR-уудыг ээлжлэн үзүүлнэ. Уншигч утас бүх хэсгийг цуглуулаад нэгтгэнэ. Зураг орохгүй. */
const QR_CHUNK = 420; // бага байх тусам QR сийрэг, уншихад амар
const bytesToB64 = u => { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
async function packData(obj) {
  const str = JSON.stringify(obj);
  if (window.CompressionStream) { const st = new Blob([str]).stream().pipeThrough(new CompressionStream("deflate-raw")); return "Z" + bytesToB64(new Uint8Array(await new Response(st).arrayBuffer())); }
  return "J" + bytesToB64(new TextEncoder().encode(str));
}
async function unpackData(s) {
  const raw = b64ToBytes("x," + s.slice(1));
  if (s[0] === "Z") { const st = new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw")); return JSON.parse(await new Response(st).text()); }
  return JSON.parse(new TextDecoder().decode(raw));
}
function transferPayload(scope) { // scope: {surveyId} | {indId} | null (бүгд)
  const thin = tr => { if (!tr || tr.length <= 150) return tr; const st = tr.length / 150; const o = []; for (let i = 0; i < tr.length; i += st) o.push(tr[Math.floor(i)]); o.push(tr[tr.length - 1]); return o; }; // QR-д зориулж замыг 150 цэг болгоно (зай нь хадгалагдсан)
  const strip = x => ({ ...x, chase: x.chase ? { ...x.chase, track: thin(x.chase.track) } : x.chase, photos: (x.photos || []).map(p => ({ id: p.id, kind: p.kind, t: p.t, note: p.note })) });
  let inds = Object.values(S.inds).filter(x => !x.deletedAt && S.surveys[x.surveyId] && !S.surveys[x.surveyId].deletedAt);
  if (scope && scope.surveyId) inds = inds.filter(x => x.surveyId === scope.surveyId);
  if (scope && scope.indId) inds = inds.filter(x => x.id === scope.indId);
  const sids = new Set(inds.map(x => x.surveyId)); if (scope && scope.surveyId) sids.add(scope.surveyId); if (!scope) liveSurveys().forEach(s => sids.add(s.id));
  return { app: "brcc-collaring", v: 1, from: S.settings.recorder || "", at: Date.now(), surveys: Object.fromEntries([...sids].map(id => [id, S.surveys[id]])), inds: Object.fromEntries(inds.map(x => [x.id, strip(x)])) };
}
function mergeIncoming(d) {
  if (!d || d.app !== "brcc-collaring") throw new Error("BRCC Collaring-ийн QR биш");
  const map = {}; let ns = 0, ni = 0, nu = 0;
  for (const s of Object.values(d.surveys || {})) {
    const local = (S.surveys[s.id] && !S.surveys[s.id].deletedAt) ? S.surveys[s.id] : liveSurveys().find(l => normMn(l.name).trim() === normMn(s.name).trim() && l.species === s.species);
    if (local) { map[s.id] = local.id; if (local.id === s.id && (local.updatedAt || 0) < (s.updatedAt || 0)) S.surveys[s.id] = { ...s }; }
    else { S.surveys[s.id] = { ...s }; map[s.id] = s.id; ns++; enqueue("survey", s.id); }
  }
  let lastId = null;
  for (const x of Object.values(d.inds || {})) {
    const y = { ...x, surveyId: map[x.surveyId] || x.surveyId }, cur = S.inds[x.id];
    if (!cur) {
      // өөр утсанд ижил дугаартай бодгаль байвал дараагийн дугаарыг өгнө
      const same = Object.values(S.inds).filter(z => z.surveyId === y.surveyId && z.id !== y.id);
      if (same.some(z => z.no === y.no)) y.no = same.reduce((a, z) => Math.max(a, z.no || 0), 0) + 1;
      S.inds[x.id] = y; ni++; lastId = x.id; enqueue("ind", x.id); }
    else if ((cur.updatedAt || 0) < (y.updatedAt || 0)) { if (Object.values(S.inds).some(z => z.surveyId === y.surveyId && z.id !== y.id && z.no === y.no)) y.no = cur.no; S.inds[x.id] = y; nu++; lastId = x.id; enqueue("ind", x.id); }
  }
  // нэг хүзүүвч хоёр өөр бодгальд бүртгэгдсэн эсэх
  const seen = {}, dup = new Set(); Object.values(S.inds).filter(x => !x.deletedAt && x.collarId).forEach(x => { if (seen[x.collarId]) dup.add(x.collarId); seen[x.collarId] = 1; });
  persist("surveys"); persist("inds"); emit();
  return { ns, ni, nu, dup: [...dup], lastId, single: Object.keys(d.inds || {}).length === 1 };
}

function QrShow({ scope, title, onClose }) {
  const [frames, setFrames] = useState(null), [i, setI] = useState(0), [speed, setSpeed] = useState(700), [err, setErr] = useState("");
  useEffect(() => { (async () => { try {
    const data = await packData(transferPayload(scope)), tid = uid().slice(-4), n = Math.ceil(data.length / QR_CHUNK) || 1;
    const fr = []; for (let k = 0; k < n; k++) { const qr = qrcode(0, "L"); qr.addData(`BC1|${tid}|${k}|${n}|` + data.slice(k * QR_CHUNK, (k + 1) * QR_CHUNK), "Byte"); qr.make(); fr.push(qr.createSvgTag({ cellSize: 4, margin: 3, scalable: true })); }
    setFrames(fr); keepAwake(true);
  } catch (e) { setErr(e.message); } })(); return () => keepAwake(false); }, []);
  useEffect(() => { if (!frames || frames.length < 2) return; const t = setInterval(() => setI(v => (v + 1) % frames.length), speed); return () => clearInterval(t); }, [frames, speed]);
  return html`<${Modal} title=${title || "QR үзүүлэх"} onClose=${onClose}>
    ${err ? html`<div class="panel warn">${err}</div>` : !frames ? html`<p class="center muted">Бэлдэж байна…</p>` : html`
      <div class="qrbox" dangerouslySetInnerHTML=${{ __html: frames[i] }}></div>
      <div class="center mt"><b>${i + 1} / ${frames.length}</b> <span class="muted small">· нөгөө утсаар «QR уншуулах» дарж камерыг энд чиглүүлнэ</span></div>
      ${frames.length > 1 && html`<div class="row mt" style="justify-content:center"><button class="btn ghost sm" onClick=${() => setSpeed(v => Math.min(2000, v + 300))}>Удаан</button><button class="btn ghost sm" onClick=${() => setSpeed(v => Math.max(300, v - 200))}>Хурдан</button></div>`}
      <p class="hint center">Зураг QR-д орохгүй. Зургийг ZIP эсвэл Google Sheet-ээр авна.</p>`}
  <//>`;
}
function QrScan({ onClose }) {
  const vid = useRef(null), [got, setGot] = useState({ n: 0, have: 0 }), [msg, setMsg] = useState("Камер асааж байна…"), [res, setRes] = useState(null);
  useEffect(() => {
    let stream = null, stop = false, parts = {}, tid = null, total = 0;
    const cv = document.createElement("canvas"), ctx = cv.getContext("2d", { willReadFrequently: true });
    const loop = async () => {
      if (stop) return; const v = vid.current;
      if (v && v.readyState >= 2 && v.videoWidth) {
        const sc = Math.min(1, 720 / v.videoWidth); cv.width = Math.round(v.videoWidth * sc); cv.height = Math.round(v.videoHeight * sc); ctx.drawImage(v, 0, 0, cv.width, cv.height);
        const c = jsQR(ctx.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height, { inversionAttempts: "dontInvert" });
        if (c && c.data.startsWith("BC1|")) {
          const [, t, k, n] = c.data.split("|", 4), body = c.data.slice(c.data.indexOf("|", c.data.indexOf("|", c.data.indexOf("|", 4) + 1) + 1) + 1);
          if (tid !== t) { tid = t; parts = {}; total = +n; }
          if (parts[k] === undefined) { parts[k] = body; if (navigator.vibrate) navigator.vibrate(30); setGot({ n: total, have: Object.keys(parts).length }); setMsg(""); }
          if (Object.keys(parts).length === total) {
            stop = true; if (stream) stream.getTracks().forEach(tr => tr.stop());
            try { const d = await unpackData(Array.from({ length: total }, (_, j) => parts[j]).join("")); const r = mergeIncoming(d); r.from = d.from; setRes(r); beep(1); }
            catch (e) { setMsg("Алдаа: " + e.message); }
            return;
          }
        }
      }
      setTimeout(loop, 120);
    };
    (async () => { try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false }); if (vid.current) { vid.current.srcObject = stream; await vid.current.play(); } setMsg("QR руу чиглүүлнэ үү"); loop(); }
      catch (e) { setMsg("Камер нээж чадсангүй: " + (e.message || e.name) + ". Тохиргооноос камерын зөвшөөрөл өгнө үү."); } })();
    return () => { stop = true; if (stream) stream.getTracks().forEach(tr => tr.stop()); };
  }, []);
  return html`<${Modal} title="QR уншуулах" onClose=${onClose}>
    ${res ? html`<div class="panel"><h3 class="mb">✓ Нэгтгэлээ${res.from ? ` (${res.from})` : ""}</h3>
        <div>Шинэ бодгаль: <b>${res.ni}</b> · Шинэчилсэн: <b>${res.nu}</b>${res.ns ? html` · Шинэ судалгаа: <b>${res.ns}</b>` : ""}</div>
        ${res.dup.length ? html`<div class="panel warn mt">⚠ Нэг хүзүүвч хоёр бодгальд бүртгэлтэй: ${res.dup.join(", ")}. Шалгаж, илүүг нь устгана уу.</div>` : ""}
        ${res.single && res.lastId ? html`<button class="btn pri block mt" onClick=${() => { onClose(); go("#/i/" + res.lastId); }}>Бодгалийг нээж үргэлжлүүлэх</button>` : html`<button class="btn pri block mt" onClick=${onClose}>Болсон</button>`}</div>`
      : html`<video ref=${vid} playsinline muted style="width:100%;border-radius:12px;background:#000;aspect-ratio:1;object-fit:cover"></video>
        <div class="center mt">${got.n ? html`<b>${got.have} / ${got.n}</b> хэсэг уншигдлаа` : ""} <span class="muted">${msg}</span></div>
        ${got.n ? html`<div class="bar"><i style=${`width:${got.have / got.n * 100}%`}></i></div>` : ""}`}
  <//>`;
}
function exportBackup() { saveFile(`BRCC_Collaring_noots_${fmtDate(Date.now())}.json`, JSON.stringify({ app: "brcc-collaring", v: APP_VERSION, surveys: S.surveys, inds: S.inds }), "application/json"); }
async function importBackup(file) {
  const d = JSON.parse(await file.text()); if (d.app !== "brcc-collaring") throw new Error("Энэ аппын нөөц файл биш");
  for (const [k, v] of Object.entries(d.surveys || {})) if (!S.surveys[k] || (S.surveys[k].updatedAt || 0) < (v.updatedAt || 0)) S.surveys[k] = v;
  for (const [k, v] of Object.entries(d.inds || {})) if (!S.inds[k] || (S.inds[k].updatedAt || 0) < (v.updatedAt || 0)) S.inds[k] = v;
  persist("surveys"); persist("inds"); emit();
}

/* ---------- UI туслахууд ---------- */
const confirmAll = msgs => msgs.every(m => confirm(m)); // хэд хэдэн удаа асууж баталгаажуулна
let toastT = null;
function showToast(msg) { S.toast = msg; emit(); clearTimeout(toastT); toastT = setTimeout(() => { S.toast = null; emit(); }, 2600); }
const go = h => { location.hash = h; };
function useRoute() { const [h, setH] = useState(location.hash || "#/"); useEffect(() => { const f = () => { setH(location.hash || "#/"); scrollTo(0, 0); }; addEventListener("hashchange", f); return () => removeEventListener("hashchange", f); }, []); return h.slice(1).split("/").filter(Boolean); }
function useTick(on = true, ms = 1000) { const [, f] = useState(0); useEffect(() => { if (!on) return; const t = setInterval(() => f(x => x + 1), ms); return () => clearInterval(t); }, [on, ms]); }
const Chips = ({ opts, val, on, cls = "" }) => html`<div class="chips">${opts.map(o => html`<button type="button" class=${"chip " + cls + (val === o ? " on" : "")} onClick=${() => on(val === o ? "" : o)}>${o}</button>`)}</div>`;
// Товч дарахад үг текстэд нэмэгдэнэ/хасагдана, текстийг гараар ч засаж болно
const QuickText = ({ val, on, opts, ph, area }) => { const parts = (val || "").split(",").map(t => t.trim()).filter(Boolean); const tog = o => on((parts.includes(o) ? parts.filter(p => p !== o) : [...parts, o]).join(", "));
  return html`<div class="chips mb">${opts.map(o => html`<button type="button" class=${"chip" + (parts.includes(o) ? " on" : "")} onClick=${() => tog(o)}>${o}</button>`)}</div><${TextIn} val=${val} on=${on} ph=${ph || "эсвэл өөрөө бичнэ"} area=${area} />`; };
const Field = ({ label, children, hint, miss }) => html`<div class=${"field" + (miss ? " miss" : "")}><label class="lbl">${label}${miss ? html`<span class="dutuu">дутуу</span>` : null}</label>${children}${hint && html`<div class="hint">${hint}</div>`}</div>`;
const TopBar = ({ title, sub, back, right }) => html`<div class="topbar">${back ? html`<button class="iconbtn" aria-label="Буцах" onClick=${() => go(back)}>‹</button>` : html`<img class="logo-sm" src="logo-small.png" alt="BRCC" />`}<div class="grow"><div class="tt">${title}</div>${sub && html`<div class="ts">${sub}</div>`}</div>${right}</div>`;
function Modal({ title, onClose, children }) { return html`<div class="modal-bg" onClick=${e => { if (e.target === e.currentTarget) onClose(); }}><div class="modal"><div class="row between mb"><h2>${title}</h2><button class="iconbtn" onClick=${onClose}>✕</button></div>${children}</div></div>`; }
// Текст талбар: бичих бүрт хадгална
const TextIn = ({ val, on, ph, area, type = "text", mode }) => area
  ? html`<textarea class="inp ta" placeholder=${ph || ""} value=${val || ""} onInput=${e => on(e.target.value)}></textarea>`
  : html`<input class="inp" type=${type} inputmode=${mode} placeholder=${ph || ""} value=${val ?? ""} onInput=${e => on(e.target.value)} />`;

/* ---------- Нүүр ---------- */
const OWNER_TEXT = "BRCC Collaring апп нь Биологийн Нөөцийг Хамгаалах Төвийн өмч бөгөөд төвийн судлаачдын зэрлэг амьтан барих, хүзүүвчлэх ажлын өгөгдөл цуглуулахад зориулагдсан. Зөвшөөрөлгүй хувилах, тараах, бусад зорилгоор ашиглахыг хориглоно. © Биологийн Нөөцийг Хамгаалах Төв, 2026.";
function Footer() {
  const n = Object.values(S.surveys).filter(x => x.deletedAt).length + Object.values(S.inds).filter(x => x.deletedAt).length;
  return html`<div class="foot"><div><a href="#/trash">Хогийн сав (${n})</a> · <a href="#/about">Тухай</a></div><p>${OWNER_TEXT}</p><p style="opacity:.7">Хувилбар ${APP_VERSION}</p></div>`;
}
function AboutView() {
  return html`<div class="page"><${TopBar} title="Тухай" back="#/" />
    <img class="logo-lg" src="logo-small.png" alt="BRCC" />
    <div class="hero"><h1>BRCC Collaring</h1><p>Зэрлэг амьтан барих, хүзүүвчлэх бүртгэл · v${APP_VERSION}</p></div>
    <div class="card"><p style="margin:0">${OWNER_TEXT}</p></div>
    <div class="card"><table class="kv"><tbody>
      <tr><td>Хөөлтийн хязгаар</td><td>${setting("chaseStopKm")} км эсвэл ${setting("chaseStopMin")} мин (CPORT, хээрийн удирдамж, JHA)</td></tr>
      <tr><td>Хүзүүвчлэх зорилт</td><td>${setting("handleMin")} мин</td></tr>
      <tr><td>Хүзүүвч</td><td>Lotek LiteTrack Iridium 750+, ${COLLARS.length} ширхэг</td></tr>
      <tr><td>Өгөгдөл</td><td>Утсанд хадгалагдаж, сүлжээтэй үед Google Sheet рүү илгээгдэнэ</td></tr>
    </tbody></table></div>
  </div>`;
}
function Home() {
  const [show, setShow] = useState(false), [scan, setScan] = useState(false), [qr, setQr] = useState(false); useStore();
  const list = liveSurveys();
  return html`<div class="page">
    <${TopBar} title="BRCC Collaring" sub="Зэрлэг амьтан барих, хүзүүвчлэх бүртгэл" right=${html`<button class="iconbtn" style="font-size:1.1rem;font-weight:800" aria-label="Том үсэг" onClick=${() => { S.settings = { ...S.settings, big: !S.settings.big }; persist("settings"); document.body.classList.toggle("big", !!S.settings.big); emit(); }}>Aa</button><button class="iconbtn" aria-label="Тохиргоо" onClick=${() => go("#/settings")}>⚙</button>`} />
    <img class="logo-lg" src="logo-small.png" alt="BRCC" />
    <div class="hero"><h1>BRCC Collaring</h1><p>Зэрлэг амьтан барих, хүзүүвчлэх бүртгэл</p></div>
    <button class="btn pri block" onClick=${() => setShow(true)}>+ Шинэ судалгаа</button>
    <div class="sec-h"><h2>Судалгаанууд</h2>${S.queue.length ? html`<span class="tag warn">Илгээгээгүй ${S.queue.length}</span>` : null}</div>
    ${list.length ? list.map(s => { const n = indsOf(s.id); const c = n.filter(x => x.collarId && x.steps.collarEnd && !x.steps.collarEnd.skipped).length;
      return html`<button class="card link" onClick=${() => go("#/s/" + s.id)}><div class="ct">${s.name}<span class="tag">${s.species}</span></div><div class="cs">${n.length} бодгаль · ${c} хүзүүвчилсэн · ${fmtDate(s.createdAt)}</div></button>`; })
      : html`<div class="empty">Судалгаа алга. «+ Шинэ судалгаа» дарж эхлээрэй.</div>`}
    <div class="sec-h"><h2>QR дамжуулалт</h2></div><div class="row"><button class="btn ghost" style="flex:1" onClick=${() => setScan(true)}>📷 Уншуулах</button><button class="btn ghost" style="flex:1" onClick=${() => setQr(true)}>▦ Үзүүлэх</button></div>
    <p class="hint">Бусад утасны өгөгдлийг өөрийн утсанд цуглуулах: тэр утсан дээр «QR үзүүлэх», энэ утсан дээр «QR уншуулах».</p>
    <${Footer} />
    ${show && html`<${SurveyModal} onClose=${() => setShow(false)} />`}
    ${scan && html`<${QrScan} onClose=${() => setScan(false)} />`}
    ${qr && html`<${QrShow} scope=${null} title="QR: бүх өгөгдөл" onClose=${() => setQr(false)} />`}
  </div>`;
}

function SurveyModal({ onClose, survey }) {
  const [f, setF] = useState(() => survey ? JSON.parse(JSON.stringify(survey)) : { name: "", species: "Хулан", team: [{ name: "", role: "Баг ахлагч" }], recorder: S.settings.recorder || "" });
  const set = (k, v) => setF(o => ({ ...o, [k]: v }));
  const setM = (i, k, v) => setF(o => ({ ...o, team: o.team.map((m, j) => j === i ? { ...m, [k]: v } : m) }));
  const save = () => {
    if (!f.name.trim()) return showToast("Судалгааны нэр бичнэ үү");
    const team = f.team.filter(m => m.name.trim());
    if (survey) updSurvey(survey.id, s => Object.assign(s, f, { team }));
    else { const id = uid(); S.surveys[id] = { ...f, team, id, createdAt: Date.now(), updatedAt: Date.now() }; persist("surveys"); enqueue("survey", id); if (f.recorder) { S.settings.recorder = f.recorder; persist("settings"); } emit(); go("#/s/" + id); }
    onClose();
  };
  return html`<${Modal} title=${survey ? "Судалгаа засах" : "Шинэ судалгаа"} onClose=${onClose}>
    <${Field} label="Судалгааны нэр"><${TextIn} val=${f.name} on=${v => set("name", v)} ph="ж: Хулан хүзүүвчлэлт 2026" /><//>
    <${Field} label="Амьтны зүйл"><${Chips} opts=${SPECIES} val=${f.species} on=${v => set("species", v)} />
      <input class="inp mt" placeholder="Бусад зүйл" value=${SPECIES.includes(f.species) ? "" : f.species} onInput=${e => set("species", e.target.value)} /><//>
    <${Field} label="Багийн бүрэлдэхүүн">
      ${f.team.map((m, i) => html`<div class="row mb"><input class="inp" style="flex:1.3" placeholder="Нэр" value=${m.name} onInput=${e => setM(i, "name", e.target.value)} />
        <select class="inp" style="flex:1" value=${m.role} onChange=${e => setM(i, "role", e.target.value)}>${ROLES.map(r => html`<option value=${r}>${r}</option>`)}</select>
        <button class="iconbtn" aria-label="Хасах" onClick=${() => setF(o => ({ ...o, team: o.team.filter((_, j) => j !== i) }))}>✕</button></div>`)}
      <button class="btn sec sm" onClick=${() => setF(o => ({ ...o, team: [...o.team, { name: "", role: "Малын эмч" }] }))}>+ Гишүүн нэмэх</button><//>
    <${Field} label="Өгөгдөл бүртгэгч"><${TextIn} val=${f.recorder} on=${v => set("recorder", v)} /><//>
    <button class="btn pri block" onClick=${save}>Хадгалах</button>
  <//>`;
}

/* ---------- Судалгаа ---------- */
function SurveyView({ id }) {
  useStore(); const s = S.surveys[id]; const [edit, setEdit] = useState(false); const [qr, setQr] = useState(false);
  if (!s || s.deletedAt) return html`<div class="page"><${TopBar} title="Олдсонгүй" back="#/" /></div>`;
  const list = indsOf(id);
  const groups = {}; list.forEach(x => { const g = [x.aimag, x.soum, x.place].filter(Boolean).join(" › ") || "Байршил оруулаагүй"; (groups[g] = groups[g] || []).push(x); });
  const newInd = () => {
    const prev = list[list.length - 1] || {}; const iid = uid();
    const no = Object.values(S.inds).filter(y => y.surveyId === id).reduce((a, y) => Math.max(a, y.no || 0), 0) + 1; // устгасан ч тооцно, дугаар давхардахгүй
    S.inds[iid] = { id: iid, surveyId: id, no, createdAt: Date.now(), updatedAt: Date.now(), steps: {}, side: {}, vet: { vitals: [] }, samples: [], photos: [], status: "open",
      aimag: prev.aimag || "", soum: prev.soum || "", place: prev.place || "", habitat: prev.habitat || "", airTemp: prev.airTemp ?? "", weather: prev.weather || "" };
    persist("inds"); enqueue("ind", iid); emit(); go("#/i/" + iid);
  };
  const del = () => { if (confirmAll([`«${s.name}» судалгааг устгах уу?`, `Доторх ${list.length} бодгаль цуг харагдахгүй болно. Үргэлжлүүлэх үү?`, "Сүүлийн удаа асууж байна: үнэхээр устгах уу? (Хогийн саванд 30 хоног хадгалагдана)"])) { updSurvey(id, x => { x.deletedAt = Date.now(); }); go("#/"); } };
  return html`<div class="page">
    <${TopBar} title=${s.name} sub=${`${s.species} · ${list.length} бодгаль`} back="#/" right=${html`<button class="iconbtn" aria-label="Засах" onClick=${() => setEdit(true)}>✎</button>`} />
    <button class="btn pri block" onClick=${newInd}>+ Шинэ бодгаль</button>
    ${list.length ? Object.entries(groups).map(([g, xs]) => html`<div class="group-h">📍 ${g}</div>${xs.map(x => html`<button class=${"card link" + (x.status === "done" ? " done" : x.status === "aborted" ? " abort" : "")} onClick=${() => go("#/i/" + x.id)}>
        <div class="ct">${label(x)} ${statusTag(x)}${missing(x).length && curStep(x) !== 0 ? html`<span class="tag bad">Дутуу ${missing(x).length}</span>` : null}</div><div class="cs">№${x.no} · ${[x.sex, x.age ? x.age + " нас" : ""].filter(Boolean).join(", ")}${x.sex || x.age ? " · " : ""}${fmtDT(x.createdAt)}${(() => { const m = metrics(x); return m.chase != null ? html`<br />🏃 ${fmtDur(m.chase)} · ${kmOf(m.chaseM) || 0} км${avgKmh(m) ? ` · дундаж ${avgKmh(m)} км/ц` : ""}${m.maxKmh ? ` · дээд ${m.maxKmh} км/ц` : ""}` : null; })()}</div></button>`)}`)
      : html`<div class="empty mt">Бодгаль алга. Амьтан харагдмагц «+ Шинэ бодгаль» дарна.</div>`}
    <div class="card mt"><table class="kv"><tbody>
      <tr><td>Баг</td><td>${(s.team || []).map(m => html`<div>${m.name} <span class="muted small">· ${m.role}</span></div>`)}</td></tr>
      <tr><td>Бүртгэгч</td><td>${s.recorder}</td></tr></tbody></table></div>
    <div class="row wrap mt"><button class="btn ghost" onClick=${() => exportZip(id)}>📦 ZIP илгээх</button><button class="btn ghost" onClick=${() => exportSurvey(id)}>⬇ Excel</button><button class="btn ghost" onClick=${() => setQr(true)}>▦ QR үзүүлэх</button><button class="btn danger" onClick=${del}>Устгах</button></div>
    <p class="hint">ZIP: Excel + KMZ (хөөлтийн зам, буудсан, суллагдсан цэг) + бүх зураг. QR: энэ судалгааг өөр утас руу дамжуулна.</p>
    ${qr && html`<${QrShow} scope=${{ surveyId: id }} title=${"QR: " + s.name} onClose=${() => setQr(false)} />`}
    ${edit && html`<${SurveyModal} survey=${s} onClose=${() => setEdit(false)} />`}
  </div>`;
}

/* ---------- Бодгаль: товчоор урагшилдаг цагийн шугам ---------- */
function IndView({ id }) {
  useStore(); const x = S.inds[id]; const [startPick, setStartPick] = useState(false); const [editT, setEditT] = useState(null); const [qr, setQr] = useState(false); const [showMiss, setShowMiss] = useState(false);
  const ci = x ? curStep(x) : -1; const running = x && ci >= 0;
  useTick(!!running);
  if (!x || x.deletedAt) return html`<div class="page"><${TopBar} title="Олдсонгүй" back="#/" /></div>`;
  const s = S.surveys[x.surveyId] || {};
  const lastK = ci < 0 ? "monEnd" : ci > 0 ? STEPS[ci - 1].k : null;
  const next = ci >= 0 ? STEPS[ci] : null;
  const vetBlock = next && next.k === "collarStart" && x.vet && x.vet.ok !== true && !(x.steps.vet && x.steps.vet.skipped); // эмч OK гэж хэлэхээс өмнө хүзүүвчлэхгүй
  const collarBlock = next && next.k === "collarEnd" && !x.collarId; // хүзүүвчний дугааргүйгээр дуусгахгүй
  const blocked = vetBlock || collarBlock;
  const startFrom = i => { updInd(id, y => { for (let j = 0; j < i; j++) y.steps[STEPS[j].k] = { skipped: true, reason: "start" }; }); setStartPick(false); pressStep(id, STEPS[i].k); };
  const del = () => { if (confirmAll([`${label(x)} бодгалийг устгах уу?`, "Үнэхээр устгах уу? (Хогийн саванд 30 хоног хадгалагдана)"])) { if (ChaseTracker.indId === id) ChaseTracker.stop(); updInd(id, y => { y.deletedAt = Date.now(); }); go("#/s/" + x.surveyId); } };
  const m = metrics(x);
  return html`<div class="page">
    <${TopBar} title=${label(x)} sub=${`${s.name || ""} · №${x.no}`} back=${"#/s/" + x.surveyId} />
    ${(ci < 0 || ci > 1) && missing(x).length ? (ci < 0 || ci >= 6 || showMiss ? html`<div class="missing" onClick=${() => setShowMiss(false)}>Дутуу: ${missing(x).join(", ")}<span> · дараа бөглөж болно</span></div>` : html`<button class="missing mini" onClick=${() => setShowMiss(true)}>Дутуу ${missing(x).length} · дараа бөглөнө ▾</button>`) : null}
    ${ci === 0 && !startPick && html`<${PlaceCard} x=${x} />`}
    ${lastK !== "chaseStart" && html`<${DartCard} x=${x} />`}

    ${lastK === "chaseStart" && !x.chaseAborted && html`<${ChasePanel} x=${x} />`}
    ${lastK === "dart" && html`<${TimerPanel} title="Буудсанаас хойш (хяналт)" from=${x.steps.dart.t} />`}
    ${(lastK === "dart" || lastK === "antidote") && html`<${SideButtons} x=${x} k=${lastK} />`}
    ${lastK === "vet" && html`<${VetPanel} x=${x} />`}
    ${lastK === "collarStart" && html`<${TimerPanel} title="Хүзүүвчилж эхэлснээс хойш" from=${x.steps.collarStart.t} limitMin=${setting("handleMin")} /><div class="card"><h3 class="mb">Амин үзүүлэлт (хүзүүвчлэх үед)</h3><${Vitals} x=${x} /></div><${CollarPanel} x=${x} />`}
    ${lastK === "antidote" && html`<${TimerPanel} title="Сэргээх тариа хийснээс хойш (хяналт)" from=${x.steps.antidote.t} />`}

    ${next && !x.chaseAborted && html`<div>
      ${next.k === "dart" && html`<button class="btn ghost block mt" onClick=${() => { if (confirm("Хөөлтийг буудалгүй зогсоох уу?")) abortChase(id); }}>Хөөлтийг зогсоох (буудаагүй)</button>`}
      ${ci === 0 && html`<button class="btn sec block mt" onClick=${() => setStartPick(!startPick)}>Өөр алхмаас эхлэх</button>`}
      ${startPick && html`<div class="card mt">${STEPS.slice(1).map((sp, i) => html`<button class="btn ghost block mb" onClick=${() => startFrom(i + 1)}>${sp.b}</button>`)}</div>`}
      <div class="nextbar"><div class="in">
        ${vetBlock && html`<div class="hint center">Малын эмчийн шийдвэр:</div><div class="row vetbar"><button class="btn okb bigbtn" onClick=${() => vetDecision(id, true)}>✓ OK<span class="sub">хүзүүвчилнэ</span></button><button class="btn badb bigbtn" onClick=${() => { if (confirm("OK биш: хүзүүвчлэхгүй суллана. Тийм үү?")) vetDecision(id, false); }}>✕ OK биш<span class="sub">хүзүүвчлэхгүй</span></button></div>`}
        ${collarBlock && html`<div class="hint center" style="color:var(--bad);font-weight:650">Хүзүүвчний дугаарыг заавал бичнэ.</div>`}
        ${!vetBlock && html`<button class=${"btn pri bigbtn" + (next.k === "chaseStart" ? " go" : next.k === "dart" ? " shoot" : "")} disabled=${blocked} onClick=${() => { pressStep(id, next.k); scrollTo({ top: 0, behavior: "smooth" }); }}><span class="stepno">${ci + 1}/${STEPS.length}</span><span class="ico">${STEP_ICON[next.k]}</span>${next.b}<span class="sub">${STEP_SUB[next.k]}</span></button>`}
      </div></div>
    </div>`}

    ${(ci < 0 || x.chaseAborted) && html`<${FinishPanel} x=${x} />`}
    ${lastK && lastK !== "collarStart" && (x.steps.collarEnd || ci < 0) && x.vet && x.vet.ok !== false && html`<${CollarPanel} x=${x} compact=${true} />`}

    <div class="sec-h"><h2>Цагийн шугам</h2>${Object.keys(x.steps).length ? html`<button class="btn ghost sm" onClick=${() => { if (confirm("Сүүлийн алхмыг буцаах уу?")) undoStep(id); }}>↶ Буцаах</button>` : null}</div>
    <div class="card"><ul class="tl">${STEPS.map((sp, i) => { const o = x.steps[sp.k]; const cls = o ? (o.skipped ? "skip" : "done") : i === ci ? "cur" : "";
      return html`<li class=${cls}><div class="dot">${o && !o.skipped ? "✓" : i + 1}</div><div class="grow"><div>${sp.s}</div>
        ${o && !o.skipped && html`<div><button class="tm" onClick=${() => setEditT(sp.k)}>${fmtHM(o.t)}</button>${o.lat ? html` <span class="dur">${o.lat.toFixed(5)}, ${o.lng.toFixed(5)} ±${o.acc}м</span>` : ""}</div>`}
        ${o && o.skipped && html`<div class="dur">${o.reason === "vet" ? "Эмч OK биш — хүзүүвчлээгүй" : o.reason === "abort" ? "Хөөлт зогсоосон" : "алгассан"}</div>`}
        ${(SIDE[sp.k] || []).filter(([k]) => x.side && x.side[k]).map(([k, l]) => html`<div class="dur">${l}: ${fmtHM(x.side[k].t)}</div>`)}
      </div></li>`; })}</ul>
      <div class="stats">
        ${m.chase != null && html`<div class="stat"><b>${fmtDur(m.chase)}</b><span>Хөөсөн хугацаа</span></div><div class="stat"><b>${kmOf(m.chaseM) || 0} км</b><span>Хөөсөн зай</span></div>${avgKmh(m) != null && html`<div class="stat"><b>${avgKmh(m)} км/ц</b><span>Дундаж хурд</span></div>`}${m.maxKmh != null && html`<div class="stat"><b>${m.maxKmh} км/ц</b><span>Дээд хурд</span></div>`}`}
        ${m.induction != null && html`<div class="stat"><b>${fmtDur(m.induction)}</b><span>Буудсанаас хэвтэх</span></div>`}
        ${m.handling != null && html`<div class="stat"><b>${fmtDur(m.handling)}</b><span>Хүзүүвчилсэн</span></div>`}
        ${m.monitoring != null && html`<div class="stat"><b>${fmtDur(m.monitoring)}</b><span>Хяналт</span></div>`}
        ${m.total != null && html`<div class="stat"><b>${fmtDur(m.total)}</b><span>Нийт</span></div>`}
      </div></div>
    ${x.chase && x.chase.track && x.chase.track.length > 1 && st(x, "dart") && html`<button class="btn sec block mt" onClick=${() => saveChaseKmz(x)}>🗺 Хөөлтийн замыг KMZ хадгалах</button>`}
    ${ci !== 0 && html`<${PlaceCard} x=${x} />`}
    <button class="btn pri block mt" onClick=${() => { updInd(id, () => {}); const n = missing(x).length; showToast(n ? `Хадгаллаа · дутуу ${n}` : "Хадгаллаа ✓"); }}>💾 Хадгалах</button>
    <button class="btn ghost block mt" onClick=${() => setQr(true)}>▦ Энэ бодгалийг QR-оор дамжуулах</button>
    <div class="hint center">Нөгөө машины утас «QR уншуулах»-аар аваад үргэлжлүүлнэ.</div>
    ${qr && html`<${QrShow} scope=${{ indId: id }} title=${"QR: " + label(x)} onClose=${() => setQr(false)} />`}
    <button class="btn danger block mt" onClick=${del}>Бодгалийг устгах</button>
    ${editT && html`<${EditTime} x=${x} k=${editT} onClose=${() => setEditT(null)} />`}
  </div>`;
}

function EditTime({ x, k, onClose }) {
  const o = x.steps[k]; const d = new Date(o.t); const [v, setV] = useState(`${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`);
  const save = () => { const [h, mi, se] = v.split(":").map(Number); const n = new Date(o.t); n.setHours(h, mi || 0, se || 0, 0); updInd(x.id, y => { y.steps[k].t = n.getTime(); y.steps[k].edited = true; }); onClose(); };
  return html`<${Modal} title=${"Цаг засах: " + STEPS[STEP_IDX[k]].s} onClose=${onClose}><input class="inp" type="time" step="1" value=${v} onInput=${e => setV(e.target.value)} /><button class="btn pri block mt" onClick=${save}>Хадгалах</button><//>`;
}

// Бичиж хайдаг сонголт: "Өм" гэхэд Өмнөговь гарна
const normMn = s => (s || "").toLowerCase().replace(/ё/g, "е");
function SearchPick({ val, opts, on, ph }) {
  const [q, setQ] = useState(null);
  const n = normMn(q);
  const list = q === null ? [] : opts.filter(o => normMn(o).includes(n)).sort((a, b) => (normMn(a).startsWith(n) ? 0 : 1) - (normMn(b).startsWith(n) ? 0 : 1) || a.localeCompare(b, "mn")).slice(0, 40);
  const pick = (o, el) => { on(o); setQ(null); if (el) el.blur(); };
  return html`<div class="sp-wrap"><input class="inp" placeholder=${ph || ""} value=${q === null ? (val || "") : q} onFocus=${() => setQ("")} onInput=${e => setQ(e.target.value)} onBlur=${() => setTimeout(() => setQ(null), 250)}
      onKeyDown=${e => { if (e.key === "Enter" && list[0]) { e.preventDefault(); pick(list[0], e.target); } }} />
    ${q !== null && list.length ? html`<div class="sp-list">${list.map(o => html`<button type="button" class=${"sp-item" + (o === val ? " on" : "")} onPointerDown=${e => e.preventDefault()} onClick=${e => pick(o, e.target.closest(".sp-wrap").querySelector("input"))}>${o}</button>`)}</div>` : null}
  </div>`;
}

function PlaceCard({ x }) {
  const soums = (typeof ADMIN !== "undefined" && ADMIN[x.aimag]) || [];
  const t = x.airTemp === "" || x.airTemp == null ? null : +x.airTemp; const bad = t != null && !isNaN(t) && (t < setting("tempMin") || t > setting("tempMax"));
  const u = (k, v) => updInd(x.id, y => { y[k] = v; });
  return html`<div class="card"><h3 class="mb">Байршил, нөхцөл</h3>
    <div class="grid2">
      <${Field} label="Аймаг" miss=${isMiss(x, "аймаг")}><${SearchPick} val=${x.aimag} opts=${typeof AIMAGS !== "undefined" ? AIMAGS : []} on=${v => updInd(x.id, y => { if (y.aimag !== v) y.soum = ""; y.aimag = v; })} ph="Өм…" /><//>
      <${Field} label="Сум" miss=${isMiss(x, "сум")}><${SearchPick} val=${x.soum} opts=${soums.length ? soums : Object.values(typeof ADMIN !== "undefined" ? ADMIN : {}).flat()} on=${v => updInd(x.id, y => { y.soum = v; if (!y.aimag && typeof ADMIN !== "undefined") { const a = Object.keys(ADMIN).find(k => ADMIN[k].includes(v)); if (a) y.aimag = a; } })} ph="Бичиж хайх…" /><//>
    </div>
    <${Field} label="Газрын нэр" miss=${isMiss(x, "газрын нэр")} hint="Дараагийн бодгальд автоматаар хуулагдана">${(() => { const ps = [...new Set(indsOf(x.surveyId).map(i => i.place).filter(Boolean))].filter(p => p !== x.place).slice(-6); return ps.length ? html`<div class="chips mb">${ps.map(p => html`<button type="button" class="chip" onClick=${() => u("place", p)}>${p}</button>`)}</div>` : null; })()}<${TextIn} val=${x.place} on=${v => u("place", v)} /><//>
    <${Field} label="Амьдрах орчин"><${QuickText} val=${x.habitat} on=${v => u("habitat", v)} opts=${HABITAT} /><//>
    <div class="grid2"><${Field} label="Агаарын хэм (°C)" miss=${isMiss(x, "агаарын хэм")}><${TextIn} val=${x.airTemp} on=${v => u("airTemp", v.replace(",", "."))} type="text" mode="decimal" /><//><div class="field"><label class="lbl">&nbsp;</label><button type="button" class="btn ghost" style="width:100%" onClick=${() => { const v = String(x.airTemp ?? "").trim(); u("airTemp", v.startsWith("-") ? v.slice(1) : "-" + v); }}>− хасах / + нэмэх</button></div></div>
    <${Field} label="Цаг агаар"><${QuickText} val=${x.weather} on=${v => u("weather", v)} opts=${WEATHER} /><//>
    ${bad && html`<div class="panel warn">⚠ Агаарын хэм ${setting("tempMin")}–${setting("tempMax")} °C-ээс гадуур байна. Барилт хийхгүй (CPORT, JHA).</div>`}
  </div>`;
}

function ChasePanel({ x }) {
  useTick(true, 1000);
  const el = ChaseTracker.indId === x.id ? ChaseTracker.elapsed() : Date.now() - x.steps.chaseStart.t;
  const dist = ChaseTracker.indId === x.id ? ChaseTracker.dist : (x.chase && x.chase.distM) || 0;
  const lvl = ChaseTracker.indId === x.id ? ChaseTracker.level : 0;
  const live = ChaseTracker.indId === x.id, now = live ? Math.round(ChaseTracker.speedNow()) : 0, mx = Math.round(live ? ChaseTracker.maxKmh : (x.chase && x.chase.maxKmh) || 0), av = el > 20000 ? Math.round(dist / 1000 / (el / 3600000)) : 0;
  const pm = Math.min(100, el / 60000 / setting("chaseStopMin") * 100), pk = Math.min(100, dist / 1000 / setting("chaseStopKm") * 100);
  const bc = p => p >= 100 ? "bar s" : p >= (setting("chaseWarnMin") / setting("chaseStopMin")) * 100 ? "bar w" : "bar";
  return html`<div class=${"panel" + (lvl === 2 ? " stop" : lvl === 1 ? " warn" : "")}>
    <div class="center small muted">Хөөлт · хязгаар ${setting("chaseStopMin")} мин эсвэл ${setting("chaseStopKm")} км</div>
    <div class="clock">${fmtDur(el)}</div>
    ${lvl === 2 && html`<div class="center" style="font-size:1.5rem;font-weight:800;color:var(--bad)">ЗОГС! Хязгаар хэтэрлээ</div>`}
    ${lvl === 1 && html`<div class="center" style="font-weight:700;color:var(--warn)">Хязгаарт ойртож байна</div>`}
    <div class="stats"><div class="stat"><b>${(dist / 1000).toFixed(2)} км</b><span>Хөөсөн зай</span><div class=${bc(pk)}><i style=${`width:${pk}%`}></i></div></div>
      <div class="stat"><b>${Math.floor(el / 60000)} мин</b><span>Хугацаа</span><div class=${bc(pm)}><i style=${`width:${pm}%`}></i></div></div></div>
    <div class="speed"><div><b>${now}</b><span>км/ц одоо</span></div><div><b>${av}</b><span>дундаж</span></div><div><b>${mx}</b><span>дээд</span></div></div>
    <div class="hint center">${ChaseTracker.status || ""} · Дэлгэцийг асаалттай, аппыг нээлттэй байлгана</div>
  </div>`;
}

function TimerPanel({ title, from, limitMin }) {
  useTick(true); const el = Date.now() - from; const over = limitMin && el >= limitMin * 60000;
  const fired = useRef(false);
  useEffect(() => { if (over && !fired.current) { fired.current = true; beep(3, 760); } }, [over]);
  return html`<div class=${"panel" + (over ? " warn" : "")}><div class="center small muted">${title}${limitMin ? ` · зорилт ${limitMin} мин` : ""}</div><div class="clock sm">${fmtDur(el)}</div>${over && html`<div class="center" style="font-weight:700;color:var(--warn)">${limitMin} минут хэтэрлээ, аль болох хурдан дуусгана</div>`}</div>`;
}

function SideButtons({ x, k }) {
  return html`<div class="row wrap mb">${SIDE[k].map(([sk, l]) => { const o = x.side && x.side[sk];
    return html`<button class=${"btn " + (o ? "okb" : "ghost")} style="flex:1" onClick=${() => updInd(x.id, y => { y.side = y.side || {}; if (y.side[sk]) delete y.side[sk]; else y.side[sk] = { t: Date.now() }; })}>${l}${o ? " " + fmtHM(o.t).slice(0, 5) : ""}</button>`; })}</div>`;
}

// Амин үзүүлэлт: эмчийн үзлэг, хүзүүвчлэх үед хоёуланд нь бичнэ (удирдамж 6.5: тасралтгүй хянана)
function Vitals({ x }) {
  const v = x.vet || {}; const e0 = { resp: "", hr: "", temp: "", mucous: "" };
  const [vt, setVt] = useState(e0);
  const hot = vt.temp !== "" && +String(vt.temp).replace(",", ".") >= 40;
  const addVit = () => { if (!vt.resp && !vt.hr && !vt.temp && !vt.mucous) return; const stage = curStep(x) >= 0 ? STEPS[Math.max(0, curStep(x) - 1)].k : "";
    updInd(x.id, y => { y.vet = y.vet || {}; y.vet.vitals = [...(y.vet.vitals || []), { ...vt, temp: String(vt.temp).replace(",", "."), stage, t: Date.now() }]; }); setVt(e0); showToast("Үзүүлэлт нэмэгдлээ"); };
  return html`<${Field} label="Амин үзүүлэлт (заавал биш, хэд ч нэмж болно)">
      ${(v.vitals || []).map(a => html`<div class="sample"><span>${fmtHM(a.t).slice(0, 5)}</span><span class="small">амьс ${a.resp || "-"} · зүрх ${a.hr || "-"} · <b style=${+a.temp >= 40 ? "color:var(--bad)" : ""}>${a.temp || "-"}°C</b> · ${a.mucous || "-"}</span></div>`)}
      <div class="grid3 mt"><label><span class="mini">Амьсгал /мин</span><input class="inp" inputmode="numeric" placeholder="Амьсгал" value=${vt.resp} onInput=${e => setVt({ ...vt, resp: e.target.value })} /></label>
        <label><span class="mini">Зүрх /мин</span><input class="inp" inputmode="numeric" placeholder="Зүрх" value=${vt.hr} onInput=${e => setVt({ ...vt, hr: e.target.value })} /></label>
        <label><span class="mini">Биеийн хэм</span><input class="inp" inputmode="decimal" placeholder="Хэм °C" value=${vt.temp} onInput=${e => setVt({ ...vt, temp: e.target.value })} /></label></div>
      ${hot && html`<div class="panel warn mt">⚠ Биеийн хэм 40 °C-ээс дээш байна. Малын эмчид мэдэгдэнэ.</div>`}
      <div class="mt"><${Chips} opts=${MUCOUS} val=${vt.mucous} on=${val => setVt({ ...vt, mucous: val })} /></div>
      <button class="btn sec mt" onClick=${addVit}>+ Үзүүлэлт нэмэх</button><//>`;
}
function VetPanel({ x }) {
  const v = x.vet || {}; const uv = (k, val) => updInd(x.id, y => { y.vet = { ...(y.vet || {}), [k]: val }; });
  return html`<div class="card"><h3 class="mb">Малын эмчийн үзлэг</h3>
    <${Field} label="Биеийн ерөнхий байдал" miss=${isMiss(x, "биеийн ерөнхий байдал")}><${Chips} opts=${BODY} val=${v.body} on=${val => uv("body", val)} /><//>
    <${Field} label="Ил харагдах шарх сорви"><${Chips} opts=${["Байхгүй", "Байгаа"]} val=${v.inj || (v.injuries ? "Байгаа" : "")} on=${val => uv("inj", val)} />
      ${(v.inj === "Байгаа" || (!v.inj && v.injuries)) && html`<div class="mt"><${TextIn} val=${v.injuries} on=${val => uv("injuries", val)} area=${true} ph="Хаана, ямар шарх сорви" /></div>`}<//>
    <${Vitals} x=${x} />
    <${Field} label="Эмчийн тэмдэглэл"><${QuickText} val=${v.notes} on=${val => uv("notes", val)} opts=${VETNOTE} area=${true} /><//>
    <div class="row"><button class=${"btn " + (v.ok === true ? "okb" : "ghost")} style="flex:1;min-height:64px;font-size:1.2rem" onClick=${() => vetDecision(x.id, true)}>✓ OK</button>
      <button class=${"btn " + (v.ok === false ? "badb" : "ghost")} style="flex:1;min-height:64px;font-size:1.2rem" onClick=${() => { if (confirm("OK биш: хүзүүвчлэхгүй суллана. Тийм үү?")) vetDecision(x.id, false); }}>✕ OK биш</button></div>
    ${v.ok === false && html`<div class="hint">Хүзүүвчлэхгүй. Доорх «Сэргээх тариа хийлээ» товчоор үргэлжлүүлнэ.</div>`}
  </div>`;
}


/* ---------- Буудсан цэг: сумаа буцааж олоход ---------- */
const DIRS = ["хойд", "зүүн хойд", "зүүн", "зүүн өмнөд", "өмнөд", "баруун өмнөд", "баруун", "баруун хойд"];
function bearing(a, b) { const r = x => x * Math.PI / 180, y = Math.sin(r(b.lng - a.lng)) * Math.cos(r(b.lat)), xx = Math.cos(r(a.lat)) * Math.sin(r(b.lat)) - Math.sin(r(a.lat)) * Math.cos(r(b.lat)) * Math.cos(r(b.lng - a.lng)); return (Math.atan2(y, xx) * 180 / Math.PI + 360) % 360; }
async function copyText(t) { try { await navigator.clipboard.writeText(t); } catch (e) { const ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (er) { } ta.remove(); } showToast("Хуулагдлаа: " + t); }
// Утасны луужин (iOS: webkitCompassHeading, Android: deviceorientationabsolute)
function useHeading(on) {
  const [h, setH] = useState(null);
  useEffect(() => { if (!on) return; const f = e => { const v = e.webkitCompassHeading != null ? e.webkitCompassHeading : (e.absolute && e.alpha != null ? 360 - e.alpha : null); if (v != null) setH(v); };
    addEventListener("deviceorientationabsolute", f); addEventListener("deviceorientation", f); return () => { removeEventListener("deviceorientationabsolute", f); removeEventListener("deviceorientation", f); }; }, [on]);
  return h;
}
function DartCard({ x }) {
  const d = x.steps.dart; const [me, setMe] = useState(null), [on, setOn] = useState(false); const head = useHeading(on);
  useEffect(() => { if (!on || !navigator.geolocation) return; const w = navigator.geolocation.watchPosition(p => setMe({ lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy) }), () => { }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 30000 }); keepAwake(true); return () => navigator.geolocation.clearWatch(w); }, [on]);
  if (!d || !d.lat) return null;
  const txt = `${d.lat.toFixed(6)}, ${d.lng.toFixed(6)}`;
  const start = async () => { if (!on && window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === "function") { try { await DeviceOrientationEvent.requestPermission(); } catch (e) { } } setOn(!on); };
  const dist = me ? haversine(me, d) : null, brg = me ? bearing(me, d) : 0, dir = me ? DIRS[Math.round(brg / 45) % 8] : "";
  const rel = head == null ? brg : brg - head, nrot = head == null ? 0 : -head; // луужин байхгүй бол хойд зүг дээшээ
  const R = 110, rr = v => v * Math.PI / 180, ex = 130 + R * Math.sin(rr(rel)), ey = 130 - R * Math.cos(rr(rel));
  const distTxt = dist == null ? "" : dist < 1000 ? Math.round(dist) + " м" : (dist / 1000).toFixed(2) + " км";
  return html`<div class="card dartc"><h3 class="mb">🎯 Буудсан цэг</h3>
    <button class="coord" onClick=${() => copyText(txt)}>${txt}<span>хуулах</span></button>
    <div class="muted small">${fmtHM(d.t)}${d.acc ? ` · ±${d.acc} м` : ""} · координат дээр дарахад хуулагдана</div>
    <button class=${"btn block mt " + (on ? "ghost" : "pri")} onClick=${start}>${on ? "Сум хайхыг зогсоох" : "🎯 Сум хайх"}</button>
    ${on && html`<div class="center mt">
      ${me ? html`<div style="font-size:2.4rem;font-weight:800;line-height:1.1">${distTxt}</div><div style="font-size:1.15rem">буудсан цэг <b>${dir}</b> зүгт</div>` : html`<div class="muted">GPS хайж байна…</div>`}
      <svg viewBox="0 0 260 260" style="width:min(78vw,300px);display:block;margin:8px auto">
        <circle cx="130" cy="130" r="122" fill="none" stroke="var(--line)" stroke-width="2" />
        <g transform=${`rotate(${nrot} 130 130)`}><text x="130" y="30" text-anchor="middle" font-size="20" font-weight="800" fill="var(--bad)">Х</text><line x1="130" y1="10" x2="130" y2="2" stroke="var(--bad)" stroke-width="4" /></g>
        ${me && html`<line x1="130" y1="130" x2=${ex} y2=${ey} stroke="var(--pri)" stroke-width="3" stroke-dasharray="6 7" stroke-linecap="round" />
        <g transform=${`rotate(${rel} 130 130)`}><path d="M130 10 l-12 22 h24 z" fill="var(--pri)" /></g>`}
        <circle cx="130" cy="130" r="9" fill="var(--ink)" /><text x="130" y="158" text-anchor="middle" font-size="13" fill="var(--muted)">та</text>
      </svg>
      <div class="hint">${head == null ? "Хойд зүг (Х) дээшээ. Утсаа хойд зүг рүү чиглүүлбэл тасархай зураас сум руу заана." : "Утсаа хавтгай барьж, сум заасан зүг рүү явна."}${me ? ` GPS ±${me.acc} м.` : ""}${dist != null && dist < 25 ? " Ойрхон байна, эргэн тойрноо хайна." : ""}</div>
    </div>`}
  </div>`;
}
const PhotoBtn = ({ x, k, l }) => html`<label class="btn sec sm">${l}<input type="file" accept="image/*" capture="environment" style="display:none" onChange=${async e => { const f = e.target.files[0]; e.target.value = ""; if (f) { try { await addPhoto(x.id, k, f); showToast("Зураг хадгаллаа"); } catch (er) { showToast("Зураг хадгалж чадсангүй"); } } }} /></label>`;
// Зургийн тэмдэглэл, нэр өөрчлөгдөхөд зургийг дахин илгээхгүй, зөвхөн мэдээллийг шинэчилнэ (meta)
function queuePhoto(indId, p, meta) { const q = S.queue.find(i => i.kind === "photo" && i.id === p.id); const m = meta && !(q && !q.meta) && !!(S.settings.sentPhotos || {})[p.id]; enqueue("photo", p.id, { indId, pkind: p.kind, meta: m || undefined }); }
const setPhotoNote = (x, pid, note) => { updInd(x.id, y => { const p = (y.photos || []).find(q => q.id === pid); if (p) p.note = note; }); const p = (S.inds[x.id].photos || []).find(q => q.id === pid); if (p) queuePhoto(x.id, p, true); };
const Thumbs = ({ x, k }) => { const ps = (x.photos || []).filter(p => (p.kind || "animal") === k); return ps.length ? html`<div class="phlist mt">${ps.map(p => html`<div class="ph" key=${p.id}><${PhotoThumb} pid=${p.id} /><div class="grow"><div class="phname">${photoName(x, p)}</div><${TextIn} val=${p.note} on=${val => setPhotoNote(x, p.id, val)} ph="Зургийн тэмдэглэл" /></div></div>`)}</div>` : null; };

function CollarPanel({ x, compact }) {
  const [q, setQ] = useState(""); const used = usedCollars(x.id);
  const u = (k, val) => updInd(x.id, y => { y[k] = val; });
  const matches = q ? COLLARS.filter(c => c.id.endsWith(q) || c.id === q) : [];
  const pick = c => { updInd(x.id, y => { y.collarId = c.id; y.imei = c.imei; const sh = c.id.slice(-3); (y.samples || []).forEach(a => { const i = a.code.indexOf("-"); if (i > 0) a.code = sh + a.code.slice(i); }); }); (S.inds[x.id].photos || []).forEach(p => queuePhoto(x.id, p, true)); setQ(""); if (used.has(c.id)) showToast("Анхаар: энэ хүзүүвч өөр бодгальд бүртгэлтэй байна"); };
  const short = x.collarId ? x.collarId.slice(-3) : String(x.no);
  const addSample = (code, l) => updInd(x.id, y => { const n = (y.samples || []).filter(a => a.type === code).reduce((m, a) => Math.max(m, +a.code.split("-").pop() || 0), 0) + 1; y.samples = [...(y.samples || []), { code: `${short}-${code}-${n}`, type: code, label: l, t: Date.now() }]; });
  const free = COLLARS.filter(c => !used.has(c.id));
  return html`<div class="card"><h3 class="mb">${compact ? "Хүзүүвч, бодгалийн мэдээлэл" : "Хүзүүвчлэх"}</h3>
    <${Field} label="Хүзүүвчний дугаар *" miss=${isMiss(x, "хүзүүвчний дугаар")} hint=${x.collarId ? `IMEI ${x.imei}` : `Сүүлийн 3 оронг бичнэ (ж: 808). Үлдсэн ${free.length} хүзүүвч.`}>
      ${x.collarId ? html`<div class="row"><div class="grow" style="font-size:1.6rem;font-weight:750">${x.collarId}</div><button class="btn ghost sm" onClick=${() => updInd(x.id, y => { y.collarId = ""; y.imei = ""; })}>Солих</button></div>`
        : html`<input class="inp" inputmode="numeric" placeholder="808" value=${q} onInput=${e => setQ(e.target.value.replace(/\D/g, ""))} />
          ${matches.length ? html`<div class="chips mt">${matches.slice(0, 8).map(c => html`<button class="chip" onClick=${() => pick(c)}>${c.id}${used.has(c.id) ? " (ашигласан)" : ""}</button>`)}</div>` : q.length >= 3 ? html`<div class="hint">Жагсаалтад алга</div>` : null}`}<//>
    <${Field} label="Хүзүүвчний зураг" miss=${isMiss(x, "хүзүүвчний зураг")}><${PhotoBtn} x=${x} k="collar" l="📷 Хүзүүвчний зураг" /><${Thumbs} x=${x} k="collar" /><//>
    <${Field} label="Хүйс" miss=${isMiss(x, "хүйс")}><${Chips} opts=${SEX} val=${x.sex} on=${val => u("sex", val)} /><//>
    <${Field} label="Нас (жил)" miss=${isMiss(x, "нас")}><div class="chips mb">${AGES.map(a => html`<button type="button" class=${"chip" + (String(x.age) === a ? " on" : "")} onClick=${() => u("age", String(x.age) === a ? "" : a)}>${a}</button>`)}</div><input class="inp" inputmode="decimal" placeholder="эсвэл бичнэ (ж: 4.5)" value=${x.age ?? ""} onInput=${e => u("age", e.target.value.replace(",", "."))} /><//>
    ${x.age !== "" && x.age != null && !isNaN(+x.age) && +x.age < 3 && html`<label class="check"><input type="checkbox" checked=${!!x.growth} onChange=${e => u("growth", e.target.checked)} /> Өсөлтийг тооцсон</label><div class="hint" style="margin:-6px 0 12px">Залуу хуланд хүзүүвчийг өсөлтийн зайтай зүүнэ (удирдамж 6.5)</div>`}
    ${x.sex === "Эм" && html`<${Field} label="Үржлийн байдал"><${Chips} opts=${REPRO} val=${x.repro} on=${val => u("repro", val)} /><//>`}
    <${Field} label="Онцлох зан төрх"><${QuickText} val=${x.behaviour} on=${val => u("behaviour", val)} opts=${BEHAV} /><//>
    <label class="check"><input type="checkbox" checked=${!!x.trd} onChange=${e => u("trd", e.target.checked)} /> TRD соронз авсан</label>
    <label class="check"><input type="checkbox" checked=${!!x.fit2} onChange=${e => u("fit2", e.target.checked)} /> Хоёр хуруу багтана (хүзүүвчний чангалаг)</label>
    <label class="check"><input type="checkbox" checked=${!!x.eyes} onChange=${e => u("eyes", e.target.checked)} /> Нүд боосон, чих бөглөсөн</label>
    <${Field} label="Хэвтүүлсэн байдал"><${Chips} opts=${LIE} val=${x.lie} on=${val => u("lie", val)} /><//>
    <div class="grid2"><${Field} label="Буудсан сумны тоо"><${Chips} opts=${DART_N} val=${x.dartN} on=${val => u("dartN", val)} /><//><${Field} label="Сум туссан газар"><${Chips} opts=${DART_SITE} val=${x.dartSite} on=${val => u("dartSite", val)} /><//></div>
    <hr class="sep" />
    <${Field} label="Дээж">
      <div class="chips">${SAMPLE_TYPES.map(([c, l]) => html`<button class="chip" onClick=${() => addSample(c, l)}>+ ${l}</button>`)}</div>
      ${(x.samples || []).map((a, i) => html`<div class="sample"><span>${a.code}</span><button class="iconbtn" style="height:32px" aria-label="Хасах" onClick=${() => { if (confirm(a.code + " дээжийг хасах уу?")) updInd(x.id, y => { y.samples.splice(i, 1); }); }}>✕</button></div>`)}<//>
    <${Field} label="Бодгалийн зураг" miss=${isMiss(x, "бодгалийн зураг")}><${PhotoBtn} x=${x} k="animal" l="📷 Бодгалийн зураг" /><${Thumbs} x=${x} k="animal" /><//>
  </div>`;
}

function FinishPanel({ x }) {
  const u = (k, val) => updInd(x.id, y => { y[k] = val; });
  return html`<div class="card"><h3 class="mb">${x.chaseAborted ? "Хөөлт зогсоосон" : "Сэргэлт, суллалт"}</h3>
    ${!x.chaseAborted && html`<${Field} label="Сэргэлт" miss=${isMiss(x, "сэргэлт")}><${Chips} opts=${RECOVERY} val=${x.recovery} on=${val => u("recovery", val)} cls=${x.recovery === "Муу" ? "badc" : "okc"} /><//>`}
    <${Field} label="Тэмдэглэл"><${QuickText} val=${x.notes} on=${val => u("notes", val)} opts=${ENDNOTE} area=${true} /><//>
    <div class="hint">Бодгаль хаагдлаа. Засах бол талбаруудыг шууд өөрчилнө, эсвэл «↶ Буцаах».</div>
  </div>`;
}

/* ---------- Тохиргоо, хогийн сав ---------- */
async function testSheet() {
  showToast("Шалгаж байна…");
  try { const r = await fetch(S.settings.sheetsUrl.trim()); const t = await r.text(); showToast(t.includes("BRCC Collaring") ? "✓ Google Sheet холбогдсон" : "Холбоос буруу байна (Apps Script биш)"); }
  catch (e) { showToast(navigator.onLine ? "Холбогдсонгүй: холбоосоо шалгана уу" : "Сүлжээ алга"); }
}
function resendAll() {
  if (!confirm("Бүх судалгаа, бодгаль, зургийг Sheet рүү дахин илгээх үү? (Давхардахгүй, шинэчилнэ)")) return;
  for (const s of Object.values(S.surveys)) enqueue("survey", s.id);
  for (const x of Object.values(S.inds)) { enqueue("ind", x.id); for (const p of x.photos || []) enqueue("photo", p.id, { indId: x.id, pkind: p.kind }); }
  showToast(`Илгээх дараалалд ${S.queue.length} зүйл`);
}
function SettingsView() {
  useStore(); const st2 = S.settings; const u = (k, v) => { S.settings = { ...S.settings, [k]: v }; persist("settings"); if (k === "night") document.body.classList.toggle("night", !!v); if (k === "big") document.body.classList.toggle("big", !!v); emit(); };
  const numF = (k, l) => html`<${Field} label=${l}><input class="inp" inputmode="decimal" value=${st2[k] ?? DEFAULTS[k]} onInput=${e => { const n = +e.target.value.replace(",", "."); u(k, e.target.value === "" || isNaN(n) ? DEFAULTS[k] : n); }} /><//>`;
  return html`<div class="page"><${TopBar} title="Тохиргоо" back="#/" />
    <div class="card"><h3 class="mb">Google Sheet</h3>
      <${Field} label="Apps Script холбоос" hint="README-ийн зааврын дагуу Google Sheet дээр apps-script.gs-ийг байршуулж авсан /exec холбоос"><${TextIn} val=${st2.sheetsUrl} on=${v => u("sheetsUrl", v.trim())} ph="https://script.google.com/macros/s/…/exec" /><//>
      <div class="row between"><span class="muted small">Илгээгээгүй: ${S.queue.length}${S.lastSync ? ` · сүүлд ${fmtHM(S.lastSync)}` : ""}</span><button class="btn sec sm" disabled=${!st2.sheetsUrl || flushing} onClick=${flushQueue}>${flushing ? "Илгээж байна…" : "Одоо илгээх"}</button></div>
      ${st2.sheetsUrl && !/\/exec$/.test(st2.sheetsUrl) ? html`<div class="panel warn mt">Холбоос «/exec»-ээр төгсөх ёстой.</div>` : null}
      <div class="row wrap mt"><button class="btn ghost sm" disabled=${!st2.sheetsUrl} onClick=${testSheet}>🔌 Холболт шалгах</button><button class="btn ghost sm" disabled=${!st2.sheetsUrl} onClick=${resendAll}>↻ Бүгдийг дахин илгээх</button></div></div>
    <div class="card"><h3 class="mb">Хөөлтийн хязгаар (CPORT: 5 км эсвэл 10 мин)</h3>
      <div class="grid2">${numF("chaseWarnMin", "Анхааруулах (мин)")}${numF("chaseStopMin", "Зогсоох (мин)")}${numF("chaseWarnKm", "Анхааруулах (км)")}${numF("chaseStopKm", "Зогсоох (км)")}</div>
      <div class="grid2">${numF("handleMin", "Хүзүүвчлэх зорилт (мин)")}${numF("gpsMaxAcc", "GPS нарийвчлалын босго (м)")}</div>
      <div class="grid2">${numF("tempMin", "Агаарын хэм доод (°C)")}${numF("tempMax", "Агаарын хэм дээд (°C)")}</div>
      <button class="btn ghost sm" onClick=${() => beep(3)}>🔊 Дохио турших</button>
      <p class="hint">iPhone: хажуугийн чимээгүй (silent) товчийг унтраасан байх, дууг чангалах. iPhone дээр чичиргээ ажиллахгүй тул дэлгэц улаанаар анивчина. Дэлгэц унтахгүйн тулд Settings → Display → Auto-Lock → Never.</p></div>
    <div class="card"><label class="check"><input type="checkbox" checked=${!!st2.big} onChange=${e => u("big", e.target.checked)} /> Том үсэг (нүд муутай хүнд)</label>
      <label class="check"><input type="checkbox" checked=${!!st2.night} onChange=${e => u("night", e.target.checked)} /> Шөнийн горим (бараан дэвсгэр)</label></div>
    <div class="card"><h3 class="mb">Өгөгдөл</h3><div class="row wrap">
      <button class="btn ghost sm" onClick=${() => exportSurvey(null)}>⬇ Бүх өгөгдөл (Excel)</button>
      <button class="btn ghost sm" onClick=${exportBackup}>Нөөцлөх (файл)</button>
      <label class="btn ghost sm">Нөөцөөс сэргээх<input type="file" accept=".json,application/json" style="display:none" onChange=${async e => { const f = e.target.files[0]; e.target.value = ""; if (f) try { await importBackup(f); showToast("Сэргээлээ"); } catch (er) { showToast(er.message); } }} /></label>
      <button class="btn ghost sm" onClick=${() => go("#/trash")}>🗑 Хогийн сав</button></div></div>
    <p class="center muted small">BRCC Collaring v${APP_VERSION} · Биологийн Нөөцийг Хамгаалах Төв</p>
  </div>`;
}
function TrashView() {
  useStore();
  const items = [...Object.values(S.surveys).filter(s => s.deletedAt).map(s => ({ kind: "s", o: s, l: "Судалгаа: " + s.name })), ...Object.values(S.inds).filter(x => x.deletedAt).map(x => ({ kind: "i", o: x, l: `Бодгаль: ${label(x)} (${(S.surveys[x.surveyId] || {}).name || ""})` }))].sort((a, b) => b.o.deletedAt - a.o.deletedAt);
  const restore = it => it.kind === "s" ? updSurvey(it.o.id, s => { delete s.deletedAt; }) : updInd(it.o.id, x => { delete x.deletedAt; });
  return html`<div class="page"><${TopBar} title="Хогийн сав" back="#/" />
    <p class="hint">Устгасан зүйл 30 хоног хадгалагдаж, дараа нь бүрмөсөн устна.</p>
    ${items.length ? items.map(it => html`<div class="card row between"><div class="grow"><div>${it.l}</div><div class="cs">${fmtDT(it.o.deletedAt)}</div></div><button class="btn sec sm" onClick=${() => restore(it)}>Сэргээх</button></div>`) : html`<div class="empty">Хогийн сав хоосон</div>`}
  </div>`;
}

/* ---------- App ---------- */
function App() {
  useStore(); const r = useRoute();
  if (!S.ready) return html`<div class="page center muted" style="padding-top:40vh">Ачаалж байна…</div>`;
  let v;
  if (r[0] === "s" && r[1]) v = html`<${SurveyView} id=${r[1]} />`;
  else if (r[0] === "i" && r[1]) v = html`<${IndView} id=${r[1]} />`;
  else if (r[0] === "settings") v = html`<${SettingsView} />`;
  else if (r[0] === "trash") v = html`<${TrashView} />`;
  else if (r[0] === "about") v = html`<${AboutView} />`;
  else v = html`<${Home} />`;
  return html`<div class="app">${v}${S.toast && html`<div class="toast">${S.toast}</div>`}</div>`;
}
render(html`<${App} />`, document.getElementById("root"));
loadAll();
