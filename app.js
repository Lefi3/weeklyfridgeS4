// ================================
// Weekly Fridge - app.js (FULL PAGE DRAG)
// Admin-only drag + Google Sheets CSV + JSON fallback
// Positions are % of the full stage => responsive scaling on mobile
// ================================

const stage = document.getElementById("stage");

const overlay   = document.getElementById("overlay");
const closeBtn  = document.getElementById("closeBtn");
const weekLabel = document.getElementById("weekLabel");

const mTag   = document.getElementById("mTag");
const mTitle = document.getElementById("mTitle");
const mBody  = document.getElementById("mBody");
const mLink  = document.getElementById("mLink");
const mDue   = document.getElementById("mDue");
const modalNote = document.getElementById("modalNote");

// 1) Βάλε εδώ το Google Sheets "Publish to web" CSV link όταν είσαι έτοιμος.
//    Αν μείνει κενό ("") θα διαβάζει από updates.json
const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRfr3ZWLi62xLMAztUuTQCxkXxukKdPRsiStB54AKzvTYiiqyZXke3k55IYdPyFYxI8zfdCoc3rHQzO/pubhtml";

// 2) Admin mode (μόνο εσύ) - άλλαξε το secret
const ADMIN_SECRET = "Alogomiga"; // άλλαξέ το σε κάτι πιο long όταν θες

const COLORS = {
  meeting: "#ffe88a",
  sales:   "#b7f7c7",
  update:  "#a9ddff",
  urgent:  "#ff9aa2",
  fyi:     "#dcc7ff"
};

// Storage key για drag θέσεις
const STORAGE_KEY = "weekly_fridge_layout_page_v1";

// Θα κρατάμε τα loaded data για export
let DATA = null;

// --------------------
// Admin check
// --------------------
function isAdmin() {
  const url = new URL(window.location.href);
  return url.searchParams.get("admin") === "1" && url.searchParams.get("key") === ADMIN_SECRET;
}
const ADMIN = isAdmin();

// --------------------
// LocalStorage helpers
// --------------------
function loadLayoutOverrides(){
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
  catch { return {}; }
}

function saveLayoutOverride(id, pos){
  const overrides = loadLayoutOverrides();
  overrides[id] = { pos };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
}

function applyOverrides(data){
  const overrides = loadLayoutOverrides();
  const items = (data.items || []).map(it => {
    const ov = overrides[it.id];
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
    mLink.href = item.link;
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

// --------------------
// Utils
// --------------------
function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }

// Full page (stage) percent: NO LIMITS (but we’ll keep a very soft clamp to avoid NaN)
function pointerToStagePercent(e){
  const rect = stage.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;

  const x = (px / rect.width) * 100;
  const y = (py / rect.height) * 100;

  // no "real" restriction; just avoid infinities if something weird happens
  return {
    x: clamp(x, -5000, 5000),
    y: clamp(y, -5000, 5000)
  };
}

// --------------------
// CSV parsing (Google Sheets publish CSV)
// --------------------
function parseCSV(text) {
  const rows = [];
  let cur = "", row = [], inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
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

function csvToItems(csvText){
  const rows = parseCSV(csvText);
  const headers = (rows.shift() || []).map(h => (h || "").trim());

  const idx = (name) => headers.indexOf(name);
  const pick = (r, k) => (r[idx(k)] ?? "").trim();
  const num  = (r, k, fallback=0) => {
    const v = parseFloat(pick(r, k).replace(",", "."));
    return Number.isFinite(v) ? v : fallback;
  };

  return rows
    .filter(r => r.some(cell => (cell || "").trim() !== ""))
    .map(r => ({
      id: pick(r, "id"),
      // door ignored now (free drag). Keep for compatibility:
      door: pick(r, "door") || "left",
      type: pick(r, "type") || "meeting",
      tagLabel: pick(r, "tagLabel"),
      headline: pick(r, "headline"),
      title: pick(r, "title"),
      short: pick(r, "short"),
      due: pick(r, "due"),
      link: pick(r, "link"),
      body: (r[idx("body")] ?? "").replace(/\\n/g, "\n"),
      // now x/y are stage% (whole page)
      pos: { x: num(r,"x",50), y: num(r,"y",50), rot: num(r,"rot",0) }
    }))
    .filter(it => it.id);
}

// --------------------
// Create Note element
// --------------------
function makeNote(item){
  const el = document.createElement("div");
  el.className = "note";
  el.tabIndex = 0;

  el.dataset.id = item.id || "";

  el.style.background = COLORS[item.type] || "#ffe88a";

  const x = item.pos?.x ?? 50;
  const y = item.pos?.y ?? 50;
  const rot = item.pos?.rot ?? 0;

  // IMPORTANT: left/top are % of stage -> responsive scaling
  el.style.left = `${x}%`;
  el.style.top  = `${y}%`;
  el.style.setProperty("--rot", `${rot}deg`);
  el.style.transformOrigin = "center";
  el.style.translate = "-50% -50%";

  el.innerHTML = `
    <div class="smallTag">${item.tagLabel ?? ""}</div>
    <div class="headline">${item.headline ?? item.title ?? ""}</div>
    <div class="tiny">
      <span>${item.short ?? ""}</span>
      <span>${item.due ? "⏰ " + item.due : ""}</span>
    </div>
  `;

  // Admin-only drag
  if (ADMIN) {
    let dragging = false;
    let moved = false;
    let startX = 0, startY = 0;

    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();               // helps on touch/scroll
      el.setPointerCapture(e.pointerId);

      dragging = true;
      moved = false;
      startX = e.clientX;
      startY = e.clientY;

      el.classList.add("dragging");
    });

    el.addEventListener("pointermove", (e) => {
      if(!dragging) return;

      if(Math.abs(e.clientX - startX) > 4 || Math.abs(e.clientY - startY) > 4){
        moved = true;
      }

      const p = pointerToStagePercent(e);
      el.style.left = `${p.x}%`;
      el.style.top  = `${p.y}%`;
    });

    el.addEventListener("pointerup", (e) => {
      if(!dragging) return;

      dragging = false;
      el.classList.remove("dragging");

      const p = pointerToStagePercent(e);
      const rotNow = item.pos?.rot ?? 0;

      if (item.id) {
        saveLayoutOverride(item.id, { x: p.x, y: p.y, rot: rotNow });
      }

      // click (without drag) -> open
      if(!moved){
        openModal(item);
      }
    });

  } else {
    // viewers: click only
    el.addEventListener("click", () => openModal(item));
  }

  // keyboard open
  el.addEventListener("keydown", (e) => {
    if(e.key === "Enter" || e.key === " "){
      e.preventDefault();
      openModal(item);
    }
  });

  return el;
}

// --------------------
// Export merged layout to clipboard (Ctrl/Cmd+E)
// --------------------
function exportLayoutToClipboard(){
  if(!DATA) return;
  const merged = JSON.stringify(DATA, null, 2);
  navigator.clipboard.writeText(merged)
    .then(() => alert("✅ Αντιγράφηκε το merged JSON στο clipboard (με τις νέες θέσεις)."))
    .catch(() => alert("❌ Δεν μπόρεσα να γράψω στο clipboard."));
}

// --------------------
// Load data (CSV or JSON), apply overrides, render
// --------------------
async function init(){
  let data;

  try {
    if (SHEET_CSV_URL) {
      const res = await fetch(SHEET_CSV_URL, { cache: "no-store" });
      const csv = await res.text();
      data = {
        weekLabel: "ΕΒΔΟΜΑΔΑ (από Sheet)",
        items: csvToItems(csv)
      };
    } else {
      const res = await fetch("updates.json", { cache: "no-store" });
      data = await res.json();
    }
  } catch (err) {
    console.error("Data load failed:", err);
    data = { weekLabel: "—", items: [] };
  }

  // Apply admin drag overrides
  data = applyOverrides(data);
  DATA = data;

  weekLabel.textContent = data.weekLabel ?? "—";

  // Remove all old notes (we only remove .note elements, not the rest of the UI)
  stage.querySelectorAll(".note").forEach(n => n.remove());

  (data.items ?? []).forEach((item) => {
    const note = makeNote(item);
    stage.appendChild(note);
  });

  // Admin helper: Ctrl/Cmd+E export merged JSON
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "e") {
      e.preventDefault();
      exportLayoutToClipboard();
    }
  });

  if (ADMIN) {
    console.log("ADMIN MODE ON ✅ (free-drag full page)");
  }
}

// --------------------
// Global listeners
// --------------------
closeBtn.addEventListener("click", closeModal);
overlay.addEventListener("click", (e) => { if(e.target === overlay) closeModal(); });
document.addEventListener("keydown", (e) => { if(e.key === "Escape") closeModal(); });

// Start
init();

