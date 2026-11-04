/* ===== BRCC Collaring — зэрлэг амьтан барих, хүзүүвчлэх бүртгэл =====
   Суурь: BRCC Mongolia аппын offline хадгалалт, Google Sheets (Apps Script) илгээлт, дохио, Excel экспорт. */
const { html, render, useState, useEffect, useRef, useMemo } = htmPreact;

const APP_VERSION = "0.1.1";
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
  { k: "dart", b: "Буудлаа", s: "Буудсан" },
  { k: "postDart", b: "Буудсаны дараах хяналт", s: "Буудсаны дараах хяналт" },
  { k: "vet", b: "Малын эмчийн үзлэг", s: "Малын эмчийн үзлэг" },
  { k: "collarStart", b: "Хүзүүвчлэх эхэллээ", s: "Хүзүүвчилж эхэлсэн" },
  { k: "collarEnd", b: "Хүзүүвчилж дууслаа", s: "Хүзүүвчилж дууссан" },
  { k: "monStart", b: "Хяналт эхэллээ", s: "Сэргэлтийн хяналт эхэлсэн" },
  { k: "monEnd", b: "Хяналт дууслаа", s: "Хяналт дууссан" },
];
const STEP_IDX = Object.fromEntries(STEPS.map((s, i) => [s.k, i]));
const SIDE = { postDart: [["down", "Унасан"], ["recumbent", "Хэвтсэн"], ["approached", "Ойртсон"]], monStart: [["stood", "Босов"], ["left", "Явсан"], ["joined", "Сүрэгтээ нийлсэн"]] };
const SPECIES = ["Хулан", "Цагаан зээр", "Хар сүүлт зээр", "Аргаль", "Янгир"];
const ROLES = ["Баг ахлагч", "Малын эмч", "Буудагч", "Цаг хэмжигч", "Хүзүүвч зүүгч", "Дээж авагч", "Зурагчин", "Ажиглагч", "Жолооч", "Бусад"];
const SEX = ["Эр", "Эм"];
const AGE = ["Насанд хүрсэн", "Залуу", "Бага нас"];
const REPRO = ["Хээлтэй", "Хөхүүл", "Хээлгүй / хөхүүлгүй", "Тодорхойгүй"];
const BODY = ["Сайн", "Дунд", "Муу"];
const MUCOUS = ["Ягаан (хэвийн)", "Цайвар", "Хөхрөлттэй"];
const RECOVERY = ["Сайн", "Дунд", "Муу"];
const SAMPLE_TYPES = [["ЦУС", "Цус"], ["АРЧ", "Арчдас"], ["БААС", "Баас"], ["ҮС", "Үс"], ["БУС", "Бусад"]];
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
  // 30 хоногоос дээш хогийн саванд байгааг бүрмөсөн устгана
  const lim = Date.now() - 30 * 864e5;
  for (const [id, x] of Object.entries(S.inds)) if (x.deletedAt && x.deletedAt < lim) { (x.photos || []).forEach(p => DB.del("photo:" + p.id)); delete S.inds[id]; }
  for (const [id, x] of Object.entries(S.surveys)) if (x.deletedAt && x.deletedAt < lim) delete S.surveys[id];
  S.ready = true; document.body.classList.toggle("night", !!S.settings.night); emit();
  ChaseTracker.resume(); setTimeout(flushQueue, 2000);
}
function useStore() { const [, f] = useState(0); useEffect(() => { const cb = () => f(x => x + 1); subs.add(cb); return () => subs.delete(cb); }, []); return S; }
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
addEventListener("pointerdown", primeAudio, { once: true });

let wakeLock = null;
async function keepAwake(on) { try { if (on && navigator.wakeLock && !wakeLock) { wakeLock = await navigator.wakeLock.request("screen"); wakeLock.addEventListener("release", () => { wakeLock = null; }); } if (!on && wakeLock) { wakeLock.release(); wakeLock = null; } } catch (e) { } }

/* ---------- хөөлтийн GPS (үсрэлт шүүх) ----------
   1) нарийвчлал муу (gpsMaxAcc м-ээс их) цэгийг хасна
   2) өмнөх цэгээс боломжгүй хурдтай (gpsMaxKmh-ээс их) бол үсрэлт гэж хасна
   3) нарийвчлалаас бага хөдөлгөөнийг (зогсож байхад чичрэх) тоолохгүй
   4) сүүлийн 3 цэгийн дунджаар зөөлрүүлж зай тооцно */
const ChaseTracker = {
  indId: null, watchId: null, kept: [], smooth: [], dist: 0, last: null, level: 0, lastAlarm: 0, tick: null, status: "",
  start(indId) {
    this.stop(); this.indId = indId; const x = S.inds[indId]; const c = x.chase || {};
    this.kept = []; this.smooth = (c.track || []).map(p => ({ ...p })); this.dist = c.distM || 0; this.level = 0; this.status = "GPS хайж байна…";
    if (navigator.geolocation) this.watchId = navigator.geolocation.watchPosition(p => this.onPos(p), e => { this.status = "GPS алдаа: " + (e.message || e.code); emit(); }, { enableHighAccuracy: true, maximumAge: 1000, timeout: 30000 });
    else this.status = "GPS байхгүй";
    this.tick = setInterval(() => this.check(), 1000); keepAwake(true); emit();
  },
  resume() { const x = Object.values(S.inds).find(i => !i.deletedAt && i.steps.chaseStart && !i.steps.chaseStart.skipped && !i.steps.dart && !i.chaseAborted); if (x) this.start(x.id); },
  onPos(p) {
    const pt = { lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6), acc: Math.round(p.coords.accuracy), t: Date.now() };
    this.last = pt; this.status = `GPS ±${pt.acc} м`;
    if (pt.acc > setting("gpsMaxAcc")) { this.status += " (муу, тоолсонгүй)"; emit(); return; }
    const prev = this.kept[this.kept.length - 1];
    if (prev) {
      const d = haversine(prev, pt), dt = (pt.t - prev.t) / 1000;
      if (dt <= 0) return;
      if (d / dt * 3.6 > setting("gpsMaxKmh")) { this.status += " (үсрэлт хасав)"; emit(); return; }
      if (d < Math.max(5, pt.acc)) { emit(); return; }
    }
    this.kept.push(pt); if (this.kept.length > 50) this.kept.shift();
    const k = this.kept.slice(-3); const sp = { lat: +(k.reduce((a, b) => a + b.lat, 0) / k.length).toFixed(6), lng: +(k.reduce((a, b) => a + b.lng, 0) / k.length).toFixed(6), t: pt.t };
    const ps = this.smooth[this.smooth.length - 1]; if (ps) this.dist += haversine(ps, sp);
    this.smooth.push(sp);
    if (this.indId && S.inds[this.indId]) updInd(this.indId, x => { x.chase = { track: this.smooth, distM: Math.round(this.dist) }; }, { noSync: true });
  },
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
async function pressStep(id, k) {
  const t = Date.now();
  updInd(id, x => { x.steps[k] = { t }; if (k === "monEnd") x.status = "done"; });
  if (k === "chaseStart") { ChaseTracker.start(id); }
  if (k === "dart" && ChaseTracker.indId === id) { const f = lastFix(); ChaseTracker.stop(); if (f) updInd(id, x => Object.assign(x.steps.dart, f)); }
  if (k === "collarStart") showToast(`${setting("handleMin")} минутын таймер эхэллээ`);
  if (["collarStart", "monStart", "postDart", "dart"].includes(k)) keepAwake(true);
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
    updInd(id, y => { delete y.steps.collarStart; delete y.steps.collarEnd; y.vet.ok = undefined; y.released = ""; y.status = "open"; }); return;
  }
  const k = STEPS[i].k;
  updInd(id, y => {
    for (let j = i; j < STEPS.length; j++) delete y.steps[STEPS[j].k];
    if (k === "vet") { y.vet = { ...(y.vet || {}), ok: undefined }; }
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
function metrics(x) {
  const down = (x.side && (x.side.recumbent || x.side.down)) || null;
  const first = STEPS.map(s => st(x, s.k)).find(Boolean);
  return {
    chase: diff(st(x, "chaseStart"), st(x, "dart") || (x.chaseAborted && x.steps.chaseStop && x.steps.chaseStop.t)),
    chaseM: x.chase ? x.chase.distM : null,
    induction: diff(st(x, "dart"), down && down.t),
    vet: diff(st(x, "vet"), st(x, "collarStart") || (x.vet && x.vet.ok === false ? x.vet.decidedAt : null)),
    handling: diff(st(x, "collarStart"), st(x, "collarEnd")),
    standUp: diff(st(x, "monStart"), x.side && x.side.stood && x.side.stood.t),
    monitoring: diff(st(x, "monStart"), st(x, "monEnd")),
    total: diff(first, st(x, "monEnd")),
  };
}
const label = x => x.collarId ? x.collarId : `Бодгаль ${x.no}`;
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
  enqueue("photo", pid, { indId: id, kind });
}
function PhotoThumb({ pid }) { const [src, setSrc] = useState(null); useEffect(() => { DB.get("photo:" + pid).then(setSrc); }, [pid]); return src ? html`<img src=${src} alt="" />` : html`<div class="photos"><span class="muted small">…</span></div>`; }

/* ---------- Google Sheet руу илгээх ---------- */
function enqueue(kind, id, extra) { S.queue = S.queue.filter(q => !(q.kind === kind && q.id === id)).concat([{ kind, id, at: Date.now(), ...(extra || {}) }]); persist("queue"); clearTimeout(enqueue.t); enqueue.t = setTimeout(flushQueue, 1500); }
function surveyRow(s) { return { id: s.id, "Судалгаа": s.name, "Зүйл": s.species, "Баг": (s.team || []).map(m => `${m.name} (${m.role})`).join("; "), "Бүртгэгч": s.recorder || "", "Үүсгэсэн": fmtDT(s.createdAt), "Устгасан": s.deletedAt ? fmtDT(s.deletedAt) : "" }; }
function indRow(x) {
  const s = S.surveys[x.surveyId] || {}, m = metrics(x), v = x.vet || {}, r = { id: x.id };
  Object.assign(r, { "Судалгаа": s.name || "", "Зүйл": s.species || "", "№": x.no, "Хүзүүвч": x.collarId || "", "Iridium IMEI": x.imei || "", "Огноо": fmtDate(x.createdAt), "Аймаг": x.aimag || "", "Сум": x.soum || "", "Газрын нэр": x.place || "", "Амьдрах орчин": x.habitat || "",
    "Агаарын хэм (°C)": x.airTemp ?? "", "Цаг агаар": x.weather || "" });
  for (const sp of STEPS) { const o = x.steps[sp.k]; r[sp.s] = o ? (o.skipped ? "алгассан" : fmtHM(o.t)) : ""; }
  for (const k of ["chaseStart", "dart", "collarEnd"]) { const o = x.steps[k]; r[`${STEPS[STEP_IDX[k]].s} N`] = o && o.lat || ""; r[`${STEPS[STEP_IDX[k]].s} E`] = o && o.lng || ""; }
  for (const [k, l] of [...SIDE.postDart, ...SIDE.monStart]) r[l] = x.side && x.side[k] ? fmtHM(x.side[k].t) : "";
  Object.assign(r, { "Хөөсөн хугацаа (мин)": minOf(m.chase), "Хөөсөн зай (км)": kmOf(m.chaseM), "Хөөлт зогсоосон": x.chaseAborted ? "тийм" : "", "Буудсанаас хэвтэх (мин)": minOf(m.induction), "Эмчийн үзлэг (мин)": minOf(m.vet), "Хүзүүвчилсэн хугацаа (мин)": minOf(m.handling), "Босох хүртэл (мин)": minOf(m.standUp), "Хяналт (мин)": minOf(m.monitoring), "Нийт (мин)": minOf(m.total),
    "Эмчийн дүгнэлт": v.ok === true ? "OK" : v.ok === false ? "OK биш" : "", "Биеийн ерөнхий байдал": v.body || "", "Ил харагдах шарх сорви": v.injuries || "", "Эмчийн тэмдэглэл": v.notes || "",
    "Амин үзүүлэлт": (v.vitals || []).map(a => `${fmtHM(a.t)} амьс ${a.resp || "-"}, зүрх ${a.hr || "-"}, хэм ${a.temp || "-"}, салст ${a.mucous || "-"}`).join(" | "),
    "Хүйс": x.sex || "", "Нас": x.age || "", "Өсөлтийн тэмдэглэл": x.ageNote || "", "Үржлийн байдал": x.repro || "", "Онцлох зан төрх": x.behaviour || "", "TRD соронз авсан": x.trd ? "тийм" : "",
    "Дээж": (x.samples || []).map(a => a.code).join(", "), "Зураг (тоо)": (x.photos || []).length, "Сэргэлт": x.recovery || "", "Суллалт": x.released || "", "Тэмдэглэл": x.notes || "", "Төлөв": x.status || "", "Устгасан": x.deletedAt ? fmtDT(x.deletedAt) : "", "Шинэчилсэн": fmtDT(x.updatedAt) });
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
      if (it.kind === "ind" && S.inds[it.id]) { items.push({ kind: "ind", row: indRow(S.inds[it.id]) }); const x = S.inds[it.id]; if (x.chase && x.chase.track && x.chase.track.length > 1) items.push({ kind: "track", id: x.id, name: label(x), points: x.chase.track.map(p => [p.lat, p.lng, fmtHM(p.t)]) }); }
      if (it.kind === "photo") { const data = await DB.get("photo:" + it.id); const x = S.inds[it.indId]; if (data && x) items.push({ kind: "photo", id: it.id, ind: x.id, name: `${label(x)}_${it.kind === "collar" ? "huzuuvch" : "bodgal"}_${it.id}.jpg`, survey: (S.surveys[x.surveyId] || {}).name || "", data }); }
    }
    const body = JSON.stringify({ app: "collaring", items });
    try { await fetch(url, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain;charset=utf-8" }, body }); }
    catch (e) { throw e; }
    const sent = new Set(q.map(i => i.kind + "|" + i.id + "|" + i.at));
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
  for (const f of files) {
    const name = enc.encode(f.name), data = typeof f.data === "string" ? enc.encode(f.data) : f.data, crc = crc32(data);
    const head = new Uint8Array([0x50, 0x4b, 3, 4, ...u16(20), ...u16(0x800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0)]);
    parts.push(head, name, data);
    central.push(new Uint8Array([0x50, 0x4b, 1, 2, ...u16(20), ...u16(20), ...u16(0x800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), name);
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
function exportSurvey(sid) {
  const s = S.surveys[sid], list = sid ? indsOf(sid) : Object.values(S.inds).filter(x => !x.deletedAt);
  const vit = [], smp = [], trk = [];
  for (const x of list) {
    for (const a of (x.vet && x.vet.vitals) || []) vit.push({ "Хүзүүвч / бодгаль": label(x), "Цаг": fmtHM(a.t), "Амьсгал (/мин)": +a.resp || a.resp || "", "Зүрх (/мин)": +a.hr || a.hr || "", "Биеийн хэм (°C)": +a.temp || a.temp || "", "Салст": a.mucous || "" });
    for (const a of x.samples || []) smp.push({ "Дээжийн дугаар": a.code, "Төрөл": a.label, "Хүзүүвч / бодгаль": label(x), "Цаг": fmtDT(a.t) });
    for (const p of (x.chase && x.chase.track) || []) trk.push({ "Хүзүүвч / бодгаль": label(x), "Цаг": fmtHM(p.t), N: p.lat, E: p.lng });
  }
  const sheets = [{ name: "Бодгаль", rows: toRows(list.map(indRow)) }];
  if (vit.length) sheets.push({ name: "Амин үзүүлэлт", rows: toRows(vit) });
  if (smp.length) sheets.push({ name: "Дээж", rows: toRows(smp) });
  if (trk.length) sheets.push({ name: "Хөөлтийн зам", rows: toRows(trk) });
  saveFile(`BRCC_Collaring_${(s ? s.name : "bugd").replace(/[^\wА-Яа-яЁёӨөҮү-]+/g, "_")}_${fmtDate(Date.now())}.xlsx`, makeXlsx(sheets), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}
function exportBackup() { saveFile(`BRCC_Collaring_noots_${fmtDate(Date.now())}.json`, JSON.stringify({ app: "brcc-collaring", v: APP_VERSION, surveys: S.surveys, inds: S.inds }), "application/json"); }
async function importBackup(file) {
  const d = JSON.parse(await file.text()); if (d.app !== "brcc-collaring") throw new Error("Энэ аппын нөөц файл биш");
  for (const [k, v] of Object.entries(d.surveys || {})) if (!S.surveys[k] || (S.surveys[k].updatedAt || 0) < (v.updatedAt || 0)) S.surveys[k] = v;
  for (const [k, v] of Object.entries(d.inds || {})) if (!S.inds[k] || (S.inds[k].updatedAt || 0) < (v.updatedAt || 0)) S.inds[k] = v;
  persist("surveys"); persist("inds"); emit();
}

/* ---------- UI туслахууд ---------- */
let toastT = null;
function showToast(msg) { S.toast = msg; emit(); clearTimeout(toastT); toastT = setTimeout(() => { S.toast = null; emit(); }, 2600); }
const go = h => { location.hash = h; };
function useRoute() { const [h, setH] = useState(location.hash || "#/"); useEffect(() => { const f = () => { setH(location.hash || "#/"); scrollTo(0, 0); }; addEventListener("hashchange", f); return () => removeEventListener("hashchange", f); }, []); return h.slice(1).split("/").filter(Boolean); }
function useTick(on = true, ms = 1000) { const [, f] = useState(0); useEffect(() => { if (!on) return; const t = setInterval(() => f(x => x + 1), ms); return () => clearInterval(t); }, [on, ms]); }
const Chips = ({ opts, val, on, cls = "" }) => html`<div class="chips">${opts.map(o => html`<button type="button" class=${"chip " + cls + (val === o ? " on" : "")} onClick=${() => on(val === o ? "" : o)}>${o}</button>`)}</div>`;
const Field = ({ label, children, hint }) => html`<div class="field"><label class="lbl">${label}</label>${children}${hint && html`<div class="hint">${hint}</div>`}</div>`;
const TopBar = ({ title, sub, back, right }) => html`<div class="topbar">${back ? html`<button class="iconbtn" aria-label="Буцах" onClick=${() => go(back)}>‹</button>` : html`<img class="logo-sm" src="logo-small.png" alt="BRCC" />`}<div class="grow"><div class="tt">${title}</div>${sub && html`<div class="ts">${sub}</div>`}</div>${right}</div>`;
function Modal({ title, onClose, children }) { return html`<div class="modal-bg" onClick=${e => { if (e.target === e.currentTarget) onClose(); }}><div class="modal"><div class="row between mb"><h2>${title}</h2><button class="iconbtn" onClick=${onClose}>✕</button></div>${children}</div></div>`; }
// Текст талбар: бичих бүрт хадгална
const TextIn = ({ val, on, ph, area, type = "text", mode }) => area
  ? html`<textarea class="inp ta" placeholder=${ph || ""} value=${val || ""} onInput=${e => on(e.target.value)}></textarea>`
  : html`<input class="inp" type=${type} inputmode=${mode} placeholder=${ph || ""} value=${val ?? ""} onInput=${e => on(e.target.value)} />`;

/* ---------- Нүүр ---------- */
function Home() {
  const [show, setShow] = useState(false); useStore();
  const list = liveSurveys();
  return html`<div class="page">
    <${TopBar} title="BRCC Collaring" sub="Зэрлэг амьтан барих, хүзүүвчлэх бүртгэл" right=${html`<button class="iconbtn" aria-label="Тохиргоо" onClick=${() => go("#/settings")}>⚙</button>`} />
    <img class="logo-lg" src="logo-small.png" alt="BRCC" />
    <div class="hero"><h1>BRCC Collaring</h1><p>Зэрлэг амьтан барих, хүзүүвчлэх бүртгэл</p></div>
    <button class="btn pri block" onClick=${() => setShow(true)}>+ Шинэ судалгаа</button>
    <div class="sec-h"><h2>Судалгаанууд</h2>${S.queue.length ? html`<span class="tag warn">Илгээгээгүй ${S.queue.length}</span>` : null}</div>
    ${list.length ? list.map(s => { const n = indsOf(s.id); const c = n.filter(x => x.collarId && x.steps.collarEnd && !x.steps.collarEnd.skipped).length;
      return html`<button class="card link" onClick=${() => go("#/s/" + s.id)}><div class="ct">${s.name}<span class="tag">${s.species}</span></div><div class="cs">${n.length} бодгаль · ${c} хүзүүвчилсэн · ${fmtDate(s.createdAt)}</div></button>`; })
      : html`<div class="empty">Судалгаа алга. «+ Шинэ судалгаа» дарж эхлээрэй.</div>`}
    ${show && html`<${SurveyModal} onClose=${() => setShow(false)} />`}
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
  useStore(); const s = S.surveys[id]; const [edit, setEdit] = useState(false);
  if (!s || s.deletedAt) return html`<div class="page"><${TopBar} title="Олдсонгүй" back="#/" /></div>`;
  const list = indsOf(id);
  const groups = {}; list.forEach(x => { const g = [x.aimag, x.soum, x.place].filter(Boolean).join(" › ") || "Байршил оруулаагүй"; (groups[g] = groups[g] || []).push(x); });
  const newInd = () => {
    const prev = list[list.length - 1] || {}; const iid = uid();
    S.inds[iid] = { id: iid, surveyId: id, no: list.length + 1, createdAt: Date.now(), updatedAt: Date.now(), steps: {}, side: {}, vet: { vitals: [] }, samples: [], photos: [], status: "open",
      aimag: prev.aimag || "", soum: prev.soum || "", place: prev.place || "", habitat: prev.habitat || "", airTemp: prev.airTemp ?? "", weather: prev.weather || "" };
    persist("inds"); enqueue("ind", iid); emit(); go("#/i/" + iid);
  };
  const del = () => { if (confirm("Судалгааг устгах уу? (Хогийн саванд 30 хоног хадгалагдана)")) { updSurvey(id, x => { x.deletedAt = Date.now(); }); go("#/"); } };
  return html`<div class="page">
    <${TopBar} title=${s.name} sub=${`${s.species} · ${list.length} бодгаль`} back="#/" right=${html`<button class="iconbtn" aria-label="Засах" onClick=${() => setEdit(true)}>✎</button>`} />
    <button class="btn pri block" onClick=${newInd}>+ Шинэ бодгаль</button>
    ${list.length ? Object.entries(groups).map(([g, xs]) => html`<div class="group-h">📍 ${g}</div>${xs.map(x => html`<button class=${"card link" + (x.status === "done" ? " done" : x.status === "aborted" ? " abort" : "")} onClick=${() => go("#/i/" + x.id)}>
        <div class="ct">${label(x)} ${statusTag(x)}</div><div class="cs">№${x.no} · ${[x.sex, x.age].filter(Boolean).join(", ")}${x.sex || x.age ? " · " : ""}${fmtDT(x.createdAt)}</div></button>`)}`)
      : html`<div class="empty mt">Бодгаль алга. Амьтан харагдмагц «+ Шинэ бодгаль» дарна.</div>`}
    <div class="card mt"><table class="kv"><tbody>
      <tr><td>Баг</td><td>${(s.team || []).map(m => html`<div>${m.name} <span class="muted small">· ${m.role}</span></div>`)}</td></tr>
      <tr><td>Бүртгэгч</td><td>${s.recorder}</td></tr></tbody></table></div>
    <div class="row wrap mt"><button class="btn ghost" onClick=${() => exportSurvey(id)}>⬇ Excel татах</button><button class="btn danger" onClick=${del}>Устгах</button></div>
    ${edit && html`<${SurveyModal} survey=${s} onClose=${() => setEdit(false)} />`}
  </div>`;
}

/* ---------- Бодгаль: товчоор урагшилдаг цагийн шугам ---------- */
function IndView({ id }) {
  useStore(); const x = S.inds[id]; const [startPick, setStartPick] = useState(false); const [editT, setEditT] = useState(null);
  const ci = x ? curStep(x) : -1; const running = x && ci >= 0;
  useTick(!!running);
  if (!x || x.deletedAt) return html`<div class="page"><${TopBar} title="Олдсонгүй" back="#/" /></div>`;
  const s = S.surveys[x.surveyId] || {};
  const lastK = ci < 0 ? "monEnd" : ci > 0 ? STEPS[ci - 1].k : null;
  const next = ci >= 0 ? STEPS[ci] : null;
  const blocked = next && next.k === "collarStart" && x.vet && x.vet.ok !== true; // эмч OK гэж хэлэхээс өмнө хүзүүвчлэхгүй
  const startFrom = i => { updInd(id, y => { for (let j = 0; j < i; j++) y.steps[STEPS[j].k] = { skipped: true, reason: "start" }; }); setStartPick(false); pressStep(id, STEPS[i].k); };
  const del = () => { if (confirm("Энэ бодгалийг устгах уу? (Хогийн саванд 30 хоног хадгалагдана)")) { if (ChaseTracker.indId === id) ChaseTracker.stop(); updInd(id, y => { y.deletedAt = Date.now(); }); go("#/s/" + x.surveyId); } };
  const m = metrics(x);
  return html`<div class="page">
    <${TopBar} title=${label(x)} sub=${`${s.name || ""} · №${x.no}`} back=${"#/s/" + x.surveyId} />
    ${ci === 0 && !startPick && html`<${PlaceCard} x=${x} />`}

    ${lastK === "chaseStart" && !x.chaseAborted && html`<${ChasePanel} x=${x} />`}
    ${lastK === "postDart" && html`<${TimerPanel} title="Буудсанаас хойш" from=${st(x, "dart") || x.steps.postDart.t} />`}
    ${(lastK === "postDart" || lastK === "monStart") && html`<${SideButtons} x=${x} k=${lastK} />`}
    ${lastK === "vet" && html`<${VetPanel} x=${x} />`}
    ${lastK === "collarStart" && html`<${TimerPanel} title="Хүзүүвчилж эхэлснээс хойш" from=${x.steps.collarStart.t} limitMin=${setting("handleMin")} /><${CollarPanel} x=${x} />`}
    ${lastK === "monStart" && html`<${TimerPanel} title="Хяналт эхэлснээс хойш" from=${x.steps.monStart.t} />`}

    ${next && !x.chaseAborted && html`<div>
      <button class=${"btn pri bigbtn" + (next.k === "dart" && ChaseTracker.level === 2 ? " badb" : "")} disabled=${blocked} onClick=${() => pressStep(id, next.k)}>${next.b}</button>
      ${blocked && html`<div class="hint center">Малын эмч «OK» гэж шийдвэрлэсний дараа хүзүүвчилнэ.</div>`}
      ${next.k === "dart" && html`<button class="btn ghost block mt" onClick=${() => { if (confirm("Хөөлтийг буудалгүй зогсоох уу?")) abortChase(id); }}>Хөөлтийг зогсоох (буудаагүй)</button>`}
      ${ci === 0 && html`<button class="btn sec block" onClick=${() => setStartPick(!startPick)}>Өөр алхмаас эхлэх</button>`}
      ${startPick && html`<div class="card mt">${STEPS.slice(1).map((sp, i) => html`<button class="btn ghost block mb" onClick=${() => startFrom(i + 1)}>${sp.b}</button>`)}</div>`}
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
        ${m.chase != null && html`<div class="stat"><b>${fmtDur(m.chase)}</b><span>Хөөсөн хугацаа</span></div><div class="stat"><b>${kmOf(m.chaseM) || 0} км</b><span>Хөөсөн зай</span></div>`}
        ${m.induction != null && html`<div class="stat"><b>${fmtDur(m.induction)}</b><span>Буудсанаас хэвтэх</span></div>`}
        ${m.handling != null && html`<div class="stat"><b>${fmtDur(m.handling)}</b><span>Хүзүүвчилсэн</span></div>`}
        ${m.monitoring != null && html`<div class="stat"><b>${fmtDur(m.monitoring)}</b><span>Хяналт</span></div>`}
        ${m.total != null && html`<div class="stat"><b>${fmtDur(m.total)}</b><span>Нийт</span></div>`}
      </div></div>
    ${ci !== 0 && html`<${PlaceCard} x=${x} />`}
    <button class="btn danger block mt" onClick=${del}>Бодгалийг устгах</button>
    ${editT && html`<${EditTime} x=${x} k=${editT} onClose=${() => setEditT(null)} />`}
  </div>`;
}

function EditTime({ x, k, onClose }) {
  const o = x.steps[k]; const d = new Date(o.t); const [v, setV] = useState(`${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`);
  const save = () => { const [h, mi, se] = v.split(":").map(Number); const n = new Date(o.t); n.setHours(h, mi || 0, se || 0, 0); updInd(x.id, y => { y.steps[k].t = n.getTime(); y.steps[k].edited = true; }); onClose(); };
  return html`<${Modal} title=${"Цаг засах: " + STEPS[STEP_IDX[k]].s} onClose=${onClose}><input class="inp" type="time" step="1" value=${v} onInput=${e => setV(e.target.value)} /><button class="btn pri block mt" onClick=${save}>Хадгалах</button><//>`;
}

function PlaceCard({ x }) {
  const soums = (typeof ADMIN !== "undefined" && ADMIN[x.aimag]) || [];
  const t = x.airTemp === "" || x.airTemp == null ? null : +x.airTemp; const bad = t != null && !isNaN(t) && (t < setting("tempMin") || t > setting("tempMax"));
  const u = (k, v) => updInd(x.id, y => { y[k] = v; });
  return html`<div class="card"><h3 class="mb">Байршил, нөхцөл</h3>
    <div class="grid2">
      <${Field} label="Аймаг"><select class="inp" value=${x.aimag} onChange=${e => updInd(x.id, y => { y.aimag = e.target.value; y.soum = ""; })}><option value="">—</option>${(typeof AIMAGS !== "undefined" ? AIMAGS : []).map(a => html`<option value=${a}>${a}</option>`)}</select><//>
      <${Field} label="Сум"><select class="inp" value=${x.soum} onChange=${e => u("soum", e.target.value)}><option value="">—</option>${soums.map(a => html`<option value=${a}>${a}</option>`)}</select><//>
    </div>
    <${Field} label="Газрын нэр" hint="Дараагийн бодгальд автоматаар хуулагдана"><${TextIn} val=${x.place} on=${v => u("place", v)} /><//>
    <${Field} label="Амьдрах орчин"><${TextIn} val=${x.habitat} on=${v => u("habitat", v)} ph="ж: хялгана-хиаглаг тал" /><//>
    <div class="grid2">
      <${Field} label="Агаарын хэм (°C)"><${TextIn} val=${x.airTemp} on=${v => u("airTemp", v)} type="text" mode="decimal" /><//>
      <${Field} label="Цаг агаар"><${TextIn} val=${x.weather} on=${v => u("weather", v)} ph="салхи, үүл" /><//>
    </div>
    ${bad && html`<div class="panel warn">⚠ Агаарын хэм ${setting("tempMin")}–${setting("tempMax")} °C-ээс гадуур байна. Барилт хийхгүй (CPORT, JHA).</div>`}
  </div>`;
}

function ChasePanel({ x }) {
  useTick(true, 1000);
  const el = ChaseTracker.indId === x.id ? ChaseTracker.elapsed() : Date.now() - x.steps.chaseStart.t;
  const dist = ChaseTracker.indId === x.id ? ChaseTracker.dist : (x.chase && x.chase.distM) || 0;
  const lvl = ChaseTracker.indId === x.id ? ChaseTracker.level : 0;
  const pm = Math.min(100, el / 60000 / setting("chaseStopMin") * 100), pk = Math.min(100, dist / 1000 / setting("chaseStopKm") * 100);
  const bc = p => p >= 100 ? "bar s" : p >= (setting("chaseWarnMin") / setting("chaseStopMin")) * 100 ? "bar w" : "bar";
  return html`<div class=${"panel" + (lvl === 2 ? " stop" : lvl === 1 ? " warn" : "")}>
    <div class="center small muted">Хөөлт · хязгаар ${setting("chaseStopMin")} мин эсвэл ${setting("chaseStopKm")} км</div>
    <div class="clock">${fmtDur(el)}</div>
    ${lvl === 2 && html`<div class="center" style="font-size:1.5rem;font-weight:800;color:var(--bad)">ЗОГС! Хязгаар хэтэрлээ</div>`}
    ${lvl === 1 && html`<div class="center" style="font-weight:700;color:var(--warn)">Хязгаарт ойртож байна</div>`}
    <div class="stats"><div class="stat"><b>${(dist / 1000).toFixed(2)} км</b><span>Хөөсөн зай</span><div class=${bc(pk)}><i style=${`width:${pk}%`}></i></div></div>
      <div class="stat"><b>${Math.floor(el / 60000)} мин</b><span>Хугацаа</span><div class=${bc(pm)}><i style=${`width:${pm}%`}></i></div></div></div>
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

function VetPanel({ x }) {
  const v = x.vet || {}; const uv = (k, val) => updInd(x.id, y => { y.vet = { ...(y.vet || {}), [k]: val }; });
  const [vt, setVt] = useState({ resp: "", hr: "", temp: "", mucous: "" });
  const addVit = () => { if (!vt.resp && !vt.hr && !vt.temp && !vt.mucous) return; updInd(x.id, y => { y.vet.vitals = [...(y.vet.vitals || []), { ...vt, t: Date.now() }]; }); setVt({ resp: "", hr: "", temp: "", mucous: "" }); };
  return html`<div class="card"><h3 class="mb">Малын эмчийн үзлэг</h3>
    <${Field} label="Биеийн ерөнхий байдал"><${Chips} opts=${BODY} val=${v.body} on=${val => uv("body", val)} /><//>
    <${Field} label="Ил харагдах шарх сорви"><${TextIn} val=${v.injuries} on=${val => uv("injuries", val)} area=${true} /><//>
    <${Field} label="Амин үзүүлэлт (заавал биш, хэд ч нэмж болно)">
      ${(v.vitals || []).map(a => html`<div class="sample"><span>${fmtHM(a.t).slice(0, 5)}</span><span class="small">амьс ${a.resp || "-"} · зүрх ${a.hr || "-"} · ${a.temp || "-"}°C · ${a.mucous || "-"}</span></div>`)}
      <div class="grid2 mt"><input class="inp" inputmode="numeric" placeholder="Амьсгал /мин" value=${vt.resp} onInput=${e => setVt({ ...vt, resp: e.target.value })} />
        <input class="inp" inputmode="numeric" placeholder="Зүрх /мин" value=${vt.hr} onInput=${e => setVt({ ...vt, hr: e.target.value })} /></div>
      <div class="grid2 mt"><input class="inp" inputmode="decimal" placeholder="Биеийн хэм °C" value=${vt.temp} onInput=${e => setVt({ ...vt, temp: e.target.value })} />
        <select class="inp" value=${vt.mucous} onChange=${e => setVt({ ...vt, mucous: e.target.value })}><option value="">Салст бүрхүүл</option>${MUCOUS.map(o => html`<option value=${o}>${o}</option>`)}</select></div>
      <button class="btn sec sm mt" onClick=${addVit}>+ Үзүүлэлт нэмэх</button><//>
    <${Field} label="Эмчийн тэмдэглэл"><${TextIn} val=${v.notes} on=${val => uv("notes", val)} area=${true} /><//>
    <div class="row"><button class=${"btn " + (v.ok === true ? "okb" : "ghost")} style="flex:1;min-height:64px;font-size:1.2rem" onClick=${() => vetDecision(x.id, true)}>✓ OK</button>
      <button class=${"btn " + (v.ok === false ? "badb" : "ghost")} style="flex:1;min-height:64px;font-size:1.2rem" onClick=${() => { if (confirm("OK биш: хүзүүвчлэхгүй суллана. Тийм үү?")) vetDecision(x.id, false); }}>✕ OK биш</button></div>
    ${v.ok === false && html`<div class="hint">Хүзүүвчлэхгүй суллана. Доорх «Хяналт эхэллээ» товчоор сэргэлтийг бүртгэнэ.</div>`}
  </div>`;
}

function CollarPanel({ x, compact }) {
  const [q, setQ] = useState(""); const used = usedCollars(x.id);
  const u = (k, val) => updInd(x.id, y => { y[k] = val; });
  const matches = q ? COLLARS.filter(c => c.id.endsWith(q) || c.id === q) : [];
  const pick = c => { updInd(x.id, y => { y.collarId = c.id; y.imei = c.imei; }); setQ(""); if (used.has(c.id)) showToast("Анхаар: энэ хүзүүвч өөр бодгальд бүртгэлтэй байна"); };
  const short = x.collarId ? x.collarId.slice(-3) : String(x.no);
  const addSample = (code, l) => updInd(x.id, y => { const n = (y.samples || []).filter(a => a.type === code).length + 1; y.samples = [...(y.samples || []), { code: `${short}-${code}-${n}`, type: code, label: l, t: Date.now() }]; });
  const free = COLLARS.filter(c => !used.has(c.id));
  return html`<div class="card"><h3 class="mb">${compact ? "Хүзүүвч, бодгалийн мэдээлэл" : "Хүзүүвчлэх"}</h3>
    <${Field} label="Хүзүүвчний дугаар" hint=${x.collarId ? `IMEI ${x.imei}` : `Сүүлийн 3 оронг бичнэ (ж: 808). Үлдсэн ${free.length} хүзүүвч.`}>
      ${x.collarId ? html`<div class="row"><div class="grow" style="font-size:1.6rem;font-weight:750">${x.collarId}</div><button class="btn ghost sm" onClick=${() => updInd(x.id, y => { y.collarId = ""; y.imei = ""; })}>Солих</button></div>`
        : html`<input class="inp" inputmode="numeric" placeholder="808" value=${q} onInput=${e => setQ(e.target.value.replace(/\D/g, ""))} />
          ${matches.length ? html`<div class="chips mt">${matches.slice(0, 8).map(c => html`<button class="chip" onClick=${() => pick(c)}>${c.id}${used.has(c.id) ? " (ашигласан)" : ""}</button>`)}</div>` : q.length >= 3 ? html`<div class="hint">Жагсаалтад алга</div>` : null}`}<//>
    <${Field} label="Хүйс"><${Chips} opts=${SEX} val=${x.sex} on=${val => u("sex", val)} /><//>
    <${Field} label="Нас"><${Chips} opts=${AGE} val=${x.age} on=${val => u("age", val)} /><//>
    ${x.age === "Бага нас" && html`<${Field} label="Өсөлтийн тэмдэглэл" hint="Хүзүү нь өсөж байгаа залуу хуланд өсөлтийг тооцно (удирдамж 6.5)"><${TextIn} val=${x.ageNote} on=${val => u("ageNote", val)} /><//>`}
    ${x.sex === "Эм" && html`<${Field} label="Үржлийн байдал"><${Chips} opts=${REPRO} val=${x.repro} on=${val => u("repro", val)} /><//>`}
    <${Field} label="Онцлох зан төрх"><${TextIn} val=${x.behaviour} on=${val => u("behaviour", val)} /><//>
    <label class="check"><input type="checkbox" checked=${!!x.trd} onChange=${e => u("trd", e.target.checked)} /> TRD соронз авсан</label>
    <hr class="sep" />
    <${Field} label="Дээж">
      <div class="chips">${SAMPLE_TYPES.map(([c, l]) => html`<button class="chip" onClick=${() => addSample(c, l)}>+ ${l}</button>`)}</div>
      ${(x.samples || []).map((a, i) => html`<div class="sample"><span>${a.code}</span><button class="iconbtn" style="height:32px" aria-label="Хасах" onClick=${() => { if (confirm(a.code + " дээжийг хасах уу?")) updInd(x.id, y => { y.samples.splice(i, 1); }); }}>✕</button></div>`)}<//>
    <${Field} label="Зураг">
      <div class="row wrap">${[["collar", "📷 Хүзүүвчний зураг"], ["animal", "📷 Бодгалийн зураг"]].map(([k, l]) => html`<label class="btn sec sm">${l}<input type="file" accept="image/*" capture="environment" style="display:none" onChange=${async e => { const f = e.target.files[0]; e.target.value = ""; if (f) { try { await addPhoto(x.id, k, f); showToast("Зураг хадгаллаа"); } catch (er) { showToast("Зураг хадгалж чадсангүй"); } } }} /></label>`)}</div>
      <div class="photos mt">${(x.photos || []).map(p => html`<${PhotoThumb} key=${p.id} pid=${p.id} />`)}</div><//>
  </div>`;
}

function FinishPanel({ x }) {
  const u = (k, val) => updInd(x.id, y => { y[k] = val; });
  return html`<div class="card"><h3 class="mb">${x.chaseAborted ? "Хөөлт зогсоосон" : "Сэргэлт, суллалт"}</h3>
    ${!x.chaseAborted && html`<${Field} label="Сэргэлт"><${Chips} opts=${RECOVERY} val=${x.recovery} on=${val => u("recovery", val)} cls=${x.recovery === "Муу" ? "badc" : "okc"} /><//>`}
    <${Field} label="Тэмдэглэл"><${TextIn} val=${x.notes} on=${val => u("notes", val)} area=${true} /><//>
    <div class="hint">Бодгаль хаагдлаа. Засах бол талбаруудыг шууд өөрчилнө, эсвэл «↶ Буцаах».</div>
  </div>`;
}

/* ---------- Тохиргоо, хогийн сав ---------- */
function SettingsView() {
  useStore(); const st2 = S.settings; const u = (k, v) => { S.settings = { ...S.settings, [k]: v }; persist("settings"); if (k === "night") document.body.classList.toggle("night", !!v); emit(); };
  const numF = (k, l) => html`<${Field} label=${l}><input class="inp" inputmode="decimal" value=${st2[k] ?? DEFAULTS[k]} onInput=${e => u(k, e.target.value === "" ? DEFAULTS[k] : +e.target.value)} /><//>`;
  return html`<div class="page"><${TopBar} title="Тохиргоо" back="#/" />
    <div class="card"><h3 class="mb">Google Sheet</h3>
      <${Field} label="Apps Script холбоос" hint="README-ийн зааврын дагуу Google Sheet дээр apps-script.gs-ийг байршуулж авсан /exec холбоос"><${TextIn} val=${st2.sheetsUrl} on=${v => u("sheetsUrl", v.trim())} ph="https://script.google.com/macros/s/…/exec" /><//>
      <div class="row between"><span class="muted small">Илгээгээгүй: ${S.queue.length}${S.lastSync ? ` · сүүлд ${fmtHM(S.lastSync)}` : ""}</span><button class="btn sec sm" disabled=${!st2.sheetsUrl || flushing} onClick=${flushQueue}>${flushing ? "Илгээж байна…" : "Одоо илгээх"}</button></div></div>
    <div class="card"><h3 class="mb">Хөөлтийн хязгаар (CPORT: 5 км эсвэл 10 мин)</h3>
      <div class="grid2">${numF("chaseWarnMin", "Анхааруулах (мин)")}${numF("chaseStopMin", "Зогсоох (мин)")}${numF("chaseWarnKm", "Анхааруулах (км)")}${numF("chaseStopKm", "Зогсоох (км)")}</div>
      <div class="grid2">${numF("handleMin", "Хүзүүвчлэх зорилт (мин)")}${numF("gpsMaxAcc", "GPS нарийвчлалын босго (м)")}</div>
      <div class="grid2">${numF("tempMin", "Агаарын хэм доод (°C)")}${numF("tempMax", "Агаарын хэм дээд (°C)")}</div>
      <button class="btn ghost sm" onClick=${() => beep(3)}>🔊 Дохио турших</button></div>
    <div class="card"><label class="check"><input type="checkbox" checked=${!!st2.night} onChange=${e => u("night", e.target.checked)} /> Шөнийн горим (бараан)</label></div>
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
  return html`<div class="page"><${TopBar} title="Хогийн сав" back="#/settings" />
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
  else v = html`<${Home} />`;
  return html`<div class="app">${v}${S.toast && html`<div class="toast">${S.toast}</div>`}</div>`;
}
render(html`<${App} />`, document.getElementById("root"));
loadAll();
