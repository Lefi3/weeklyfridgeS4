// ================================
// Weekly Fridge - app.js
// - Fridge image is 1920x1080 (16:9) shown as CONTAIN
// - Notes are positioned relative to the contained image rect (imageBox)
// - iOS Safari fixes: dvh + visualViewport relayout
// - Notes scale with the fridge size (--noteScale)
// - Google Sheet (pubhtml/edit/export) normalized to CSV
// - CSV supports ',' or ';' and headers case-insensitive
// - ID accents for 1-8
// ================================

const stage = document.getElementById("stage");
const imageBox = document.getElementById("imageBox");

const overlay   = document.getElementById("overlay");
const closeBtn  = document.getElementById("closeBtn");
const weekLabel = document.getElementById("weekLabel");

const mTag   = document.getElementById("mTag");
const mTitle = document.getElementById("mTitle");
const mBody  = document.getElementById("mBody");
const mLink  = document.getElementById("mLink");
const mDue   = document.getElementById("mDue");
const modalNote = document.getElementById("modalNote");

// ✅ Your Google Sheet URL (pubhtml or csv/export ok)
const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRfr3ZWLi62xLMAztUuTQCxkXxukKdPRsiStB54AKzvTYiiqyZXke3k55IYdPyFYxI8zfdCoc3rHQzO/pubhtml";

// ✅ Admin secret
const ADMIN_SECRET = "Alogomiga";

const WORD_OF_WEEK_DEFAULT = {
  title: "Η λέξη της εβδομάδας",
  word: "Exclusivity",
};


// Fridge image aspect (1920x1080)
const IMAGE_ASPECT = 1920 / 1080;

// Note scaling reference
const DESIGN_WIDTH = 1920;    // reference width for scale=1
const MOBILE_MULT  = 0.82;    // extra shrink on phones
const MIN_SCALE    = 0.46;
const MAX_SCALE    = 1.00;

// Base bg by type
const COLORS = {
  meeting: "#ffe88a",
  sales:   "#b7f7c7",
  update:  "#a9ddff",
  urgent:  "#ff9aa2",
  fyi:     "#dcc7ff"
};

// Accent by ID 1–8
const ID_ACCENTS = {
  "1": "#3B82F6",
  "2": "#22C55E",
  "3": "#A855F7",
  "4": "#F97316",
  "5": "#EF4444",
  "6": "#06B6D4",
  "7": "#EAB308",
  "8": "#EC4899"
};

// Admin-only temporary overrides
const STORAGE_KEY = "weekly_fridge_admin_overrides_v2";

let DATA = null;

// --------------------
// Helpers
// --------------------
function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }

function isPhone() {
  return window.matchMedia("(max-width: 520px)").matches;
}

function isAdmin() {
  const url = new URL(window.location.href);
  return url.searchParams.get("admin") === "1" && url.searchParams.get("key") === ADMIN_SECRET;
}
const ADMIN = isAdmin();

// Admin overrides
function loadOverrides(){
  if(!ADMIN) return {};
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
  catch { return {}; }
}
function saveOverride(id, pos){
  if(!ADMIN) return;
  const o = loadOverrides();
  o[id] = { pos };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(o));
}
function applyOverrides(data){
  if(!ADMIN) return data; // viewers see ONLY sheet layout
  const o = loadOverrides();
  const items = (data.items || []).map(it => {
    const ov = o[it.id];
    if(!ov) return it;
    return { ...it, pos: { ...(it.pos || {}), ...(ov.pos || {}) } };
  });
  return { ...data, items };
}

// --------------------
// Modal
// --------------------
function openModal(item){
  overlay.classList.add("open");
  overlay.setAttribute("aria-hidden", "false");

  mTag.textContent = item.tagLabel ?? "";
  mTitle.textContent = item.title ?? "";
  mBody.textContent = item.body ?? "";

  modalNote.style.background = COLORS[item.type] || "#ffe88a";

  if(item.link){
    mLink.style.display = "inline-flex";
    // auto-fix missing protocol for meet links etc
    const href = item.link.startsWith("http") ? item.link : `https://${item.link}`;
    mLink.href = href;
  } else {
    mLink.style.display = "none";
    mLink.removeAttribute("href");
  }

  mDue.textContent = item.due ? `Προθεσμία: ${item.due}` : "";
}

function closeModal(){
  overlay.classList.remove("open");
  overlay.setAttribute("aria-hidden", "true");
}

closeBtn.addEventListener("click", closeModal);
overlay.addEventListener("click", (e) => { if(e.target === overlay) closeModal(); });
document.addEventListener("keydown", (e) => { if(e.key === "Escape") closeModal(); });

// --------------------
// Layout: imageBox matches "contain" 16:9 rect
// --------------------
function getContainedImageRect() {
  const rect = stage.getBoundingClientRect();
  const stageW = rect.width;
  const stageH = rect.height;

  let w = stageW;
  let h = w / IMAGE_ASPECT;

  if (h > stageH) {
    h = stageH;
    w = h * IMAGE_ASPECT;
  }

  const left = (stageW - w) / 2;
  const top  = (stageH - h) / 2;

  return { left, top, width: w, height: h };
}

function layoutImageBox(){
  const r = getContainedImageRect();
  imageBox.style.left = `${r.left}px`;
  imageBox.style.top = `${r.top}px`;
  imageBox.style.width = `${r.width}px`;
  imageBox.style.height = `${r.height}px`;
}

function updateNoteScale() {
  const rect = imageBox.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  // ✅ σωστό: min(width/1920, height/1080)
  let s = Math.min(rect.width / 1920, rect.height / 1080);

  // λίγο extra shrink σε πολύ μικρά παράθυρα (desktop + mobile)
  if (rect.width < 900) s *= 0.92;
  if (rect.width < 700) s *= 0.86;
  if (rect.width < 520) s *= 0.82;

  // πιο χαμηλό min για να μη γίνεται “τούβλο” σε μικρό viewport
  s = clamp(s, 0.28, 1.0);

  document.documentElement.style.setProperty("--noteScale", String(s));
}


// Schedule relayout (iOS-friendly)
let _relayoutRaf = 0;
function relayoutNow(){
  layoutImageBox();
  updateNoteScale();
}
function scheduleRelayout(){
  cancelAnimationFrame(_relayoutRaf);
  _relayoutRaf = requestAnimationFrame(relayoutNow);
}

// Events for iOS Safari / address bar changes
window.addEventListener("resize", scheduleRelayout);
window.addEventListener("orientationchange", () => setTimeout(scheduleRelayout, 60));

if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", scheduleRelayout);
  window.visualViewport.addEventListener("scroll", scheduleRelayout);
}

// --------------------
// Pointer to imageBox percent
// --------------------
function pointerToImagePercent(e){
  const rect = imageBox.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;

  const x = (px / rect.width) * 100;
  const y = (py / rect.height) * 100;

  return { x: clamp(x, 0, 100), y: clamp(y, 0, 100) };
}

// --------------------
// Google Sheet URL normalize -> CSV
// --------------------
function normalizeSheetUrl(url){
  if(!url) return "";

  if (url.includes("output=csv") || url.includes("format=csv")) return url;

  if (url.includes("/pubhtml")) {
    const base = url.replace("/pubhtml", "/pub");
    return base + (base.includes("?") ? "&" : "?") + "output=csv";
  }

  if (url.includes("/spreadsheets/d/") && url.includes("/edit")) {
    const m = url.match(/\/spreadsheets\/d\/([^/]+)/);
    const fileId = m ? m[1] : null;
    if (!fileId) return url;

    const u = new URL(url);
    const gid = u.searchParams.get("gid") || (url.match(/#gid=(\d+)/)?.[1]) || "0";
    return `https://docs.google.com/spreadsheets/d/${fileId}/export?format=csv&gid=${gid}`;
  }

  return url;
}

// --------------------
// CSV parsing (',' or ';') + headers case-insensitive
// --------------------
function parseCSV(text, delimiter = ",") {
  const rows = [];
  let cur = "", row = [], inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === delimiter && !inQuotes) {
      row.push(cur); cur = "";
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (cur.length || row.length) { row.push(cur); rows.push(row); }
      cur = ""; row = [];
      if (ch === '\r' && next === '\n') i++;
    } else {
      cur += ch;
    }
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

function csvToData(csvText){
  const firstLine = (csvText.split(/\r?\n/)[0] || "");
  const delimiter = (firstLine.includes(";") && !firstLine.includes(",")) ? ";" : ",";

  const rows = parseCSV(csvText, delimiter);
  const headersRaw = (rows.shift() || []);
  const headers = headersRaw.map(h => (h || "").trim().toLowerCase());

  const idx = (name) => headers.indexOf(name.toLowerCase());
  const pick = (r, k) => {
    const i = idx(k);
    return i >= 0 ? (r[i] ?? "").trim() : "";
  };
  const num = (r, k, fallback=0) => {
    const v = parseFloat(pick(r, k).replace(",", "."));
    return Number.isFinite(v) ? v : fallback;
  };

  let metaWeek = "";

  const items = rows
    .filter(r => r.some(cell => (cell || "").trim() !== ""))
    .map(r => {
      const id = pick(r, "id");
      const item = {
        id,
        type: (pick(r, "type") || "meeting").toLowerCase(),
        tagLabel: pick(r, "taglabel") || pick(r, "tagLabel"),
        headline: pick(r, "headline"),
        title: pick(r, "title"),
        short: pick(r, "short"),
        due: pick(r, "due"),
        link: pick(r, "link"),
        body: (pick(r, "body") || "").replace(/\\n/g, "\n"),
        pos: { x: num(r, "x", 50), y: num(r, "y", 50), rot: num(r, "rot", 0) }
      };

      if (id === "meta_week") {
        metaWeek = item.title || item.headline || item.body || "";
      }

      return item;
    })
    .filter(it => it.id && it.id !== "meta_week");

  return { weekLabel: metaWeek || "ΕΒΔΟΜΑΔΑ", items };
}

// --------------------
// Render note
// --------------------
function makeNote(item){
  const el = document.createElement("div");
  el.className = "note";
  el.tabIndex = 0;
  el.dataset.id = item.id || "";
  el.dataset.rot = String(item.pos?.rot ?? 0);

  // background color by type
  el.style.background = COLORS[item.type] || "#ffe88a";

  // accent
  const accent = ID_ACCENTS[item.id];
  if (accent) el.style.borderLeft = `7px solid ${accent}`;

  const x = item.pos?.x ?? 50;
  const y = item.pos?.y ?? 50;
  const rot = item.pos?.rot ?? 0;

  // Position inside imageBox (percent of image)
  el.style.left = `${x}%`;
  el.style.top  = `${y}%`;

  // Transform: translate + rotate (scale is global via CSS)
  el.style.transform = `translate(-50%, -50%) rotate(${rot}deg)`;

  el.innerHTML = `
    <div class="smallTag">${item.tagLabel ?? ""}</div>
    <div class="headline">${item.headline ?? item.title ?? ""}</div>
    <div class="tiny">
      <span>${item.short ?? ""}</span>
      <span>${item.due ? "⏰ " + item.due : ""}</span>
    </div>
  `;

  // Badge
  if (accent) {
    const badge = document.createElement("div");
    badge.textContent = `#${item.id}`;
    badge.style.cssText = `
      position:absolute;
      top:8px;
      right:8px;
      background:${accent};
      color:white;
      font-weight:900;
      font-size:12px;
      padding:2px 8px;
      border-radius:999px;
      box-shadow: 0 6px 14px rgba(0,0,0,.25);
      pointer-events:none;
    `;
    el.appendChild(badge);
  }

  const open = () => openModal(item);

  // Admin-only drag (inside imageBox coords)
  if (ADMIN) {
    let dragging = false;
    let moved = false;
    let startX = 0, startY = 0;

    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      dragging = true;
      moved = false;
      startX = e.clientX;
      startY = e.clientY;
      el.classList.add("dragging");
    });

    el.addEventListener("pointermove", (e) => {
      if(!dragging) return;
      if(Math.abs(e.clientX - startX) > 4 || Math.abs(e.clientY - startY) > 4) moved = true;

      const p = pointerToImagePercent(e);
      el.style.left = `${p.x}%`;
      el.style.top  = `${p.y}%`;
    });

    el.addEventListener("pointerup", (e) => {
      if(!dragging) return;
      dragging = false;
      el.classList.remove("dragging");

      const p = pointerToImagePercent(e);
      const rotNow = parseFloat(el.dataset.rot || "0") || 0;

      // store temporary override (admin only)
      saveOverride(item.id, { x: p.x, y: p.y, rot: rotNow });

      if(!moved) open();
    });

  } else {
    el.addEventListener("click", open);
  }

  // keyboard open
  el.addEventListener("keydown", (e) => {
    if(e.key === "Enter" || e.key === " "){
      e.preventDefault();
      open();
    }
  });

  return el;
}

// Export (admin): CSV + JSON to clipboard
function exportPositions(){
  if(!DATA) return;

  const lines = ["id,x,y,rot"];
  for (const it of (DATA.items || [])) {
    const x = (it.pos?.x ?? 50).toFixed(2);
    const y = (it.pos?.y ?? 50).toFixed(2);
    const r = (it.pos?.rot ?? 0).toFixed(2);
    lines.push(`${it.id},${x},${y},${r}`);
  }
  const csv = lines.join("\n");
  const json = JSON.stringify(DATA, null, 2);

  const combined = `/* CSV (paste in sheet): */\n${csv}\n\n/* JSON (backup): */\n${json}\n`;
  navigator.clipboard.writeText(combined)
    .then(() => alert("✅ Αντιγράφηκαν θέσεις (CSV + JSON) στο clipboard."))
    .catch(() => alert("❌ Δεν μπόρεσα να γράψω στο clipboard."));
}

// --------------------
// Init
// --------------------
async function init(){
  // iOS often stabilizes viewport after a moment
  scheduleRelayout();
  setTimeout(scheduleRelayout, 80);
  setTimeout(scheduleRelayout, 250);

  let data;

  try {
    if (SHEET_URL) {
      const url = normalizeSheetUrl(SHEET_URL);
      const res = await fetch(url, { cache: "no-store" });
      const text = await res.text();

      // basic HTML detection (wrong link)
      const head = text.trim().slice(0, 50).toLowerCase();
      if (head.startsWith("<!doctype") || head.startsWith("<html")) {
        console.warn("Fetched HTML instead of CSV. Check publish settings.", url);
      }

      data = csvToData(text);
    } else {
      const res = await fetch("updates.json", { cache: "no-store" });
      data = await res.json();
    }
  } catch (err) {
    console.error("Data load failed:", err);
    data = { weekLabel: "—", items: [] };
  }

  // Apply overrides only if admin
  data = applyOverrides(data);
  DATA = data;

  weekLabel.textContent = data.weekLabel ?? "—";

  const wordBadge = document.getElementById("wordBadge");

const wow = data.wordOfWeek || WORD_OF_WEEK_DEFAULT;

wordBadge.innerHTML = `
  <div class="kicker">${wow.title || "Η λέξη της εβδομάδας"}</div>
  <div class="word">${wow.word || ""}</div>
  <div class="sub">${wow.sub || ""}</div>
`;

wordBadge.addEventListener("click", () => {
  openModal({
    type: "fyi",
    tagLabel: "📌 Word of the Week",
    title: wow.word || "Η λέξη της εβδομάδας",
    body: wow.body || wow.sub || "",
    link: wow.link || "",
    due: ""
  });
});


  // Clear notes
  imageBox.querySelectorAll(".note").forEach(n => n.remove());

  // Render inside imageBox
  (data.items ?? []).forEach((item) => {
    const note = makeNote(item);
    imageBox.appendChild(note);
  });

  // Set scale after notes exist (safe)
  scheduleRelayout();

  // Admin export: Ctrl/Cmd+E
  document.addEventListener("keydown", (e) => {
    if (!ADMIN) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "e") {
      e.preventDefault();
      exportPositions();
    }
  });

  if (ADMIN) console.log("ADMIN MODE ON ✅");
}

init();


