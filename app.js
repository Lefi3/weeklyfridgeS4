// ================================
// Weekly Fridge - app.js (full)
// Admin-only drag + Google Sheets CSV + JSON fallback
// ================================

const doorLeft  = document.getElementById("doorLeft");
const doorRight = document.getElementById("doorRight");

const overlay  = document.getElementById("overlay");
const closeBtn = document.getElementById("closeBtn");
const weekLabel = document.getElementById("weekLabel");

const mTag   = document.getElementById("mTag");
const mTitle = document.getElementById("mTitle");
const mBody  = document.getElementById("mBody");
const mLink  = document.getElementById("mLink");
const mDue   = document.getElementById("mDue");
const modalNote = document.getElementById("modalNote");

// 1) ΒΑΛΕ ΕΔΩ το Google Sheets "Publish to web" CSV link όταν είσαι έτοιμος.
//    Αν μείνει κενό ("") θα διαβάζει από updates.json
const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRfr3ZWLi62xLMAztUuTQCxkXxukKdPRsiStB54AKzvTYiiqyZXke3k55IYdPyFYxI8zfdCoc3rHQzO/pub?output=csv";

// 2) Admin mode (μόνο εσύ) - άλλαξε το secret
const ADMIN_SECRET = "Alogomiga";

// Χρώματα post-it
const COLORS = {
  meeting: "#ffe88a",
  sales:   "#b7f7c7",
  update:  "#a9ddff",
  urgent:  "#ff9aa2",
  fyi:     "#dcc7ff"
};

// Storage key για drag θέσεις
const STORAGE_KEY = "weekly_fridge_layout_v1";

// Θα κρατάμε τα loaded data για export
let DATA = null;

// --------------------
// Admin check
// --------------------
function isAdmin() {
  const url = new URL(window.location.href);
  const admin = url.searchParams.get("admin") === "1";
  const key = url.searchParams.get("key") === ADMIN_SECRET;
  return admin && key;
}
const ADMIN = isAdmin();

// --------------------
// LocalStorage helpers
// --------------------
function loadLayoutOverrides(){
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveLayoutOverride(id, door, pos){
  const overrides = loadLayoutOverrides();
  overrides[id] = { door, pos };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
}

function applyOverrides(data){
  const overrides = loadLayoutOverrides();
  const items = (data.items || []).map(it => {
    const ov = overrides[it.id];
    if(!ov) return it;
    return {
      ...it,
      door: ov.door || it.door,
      pos: { ...(it.pos || {}), ...(ov.pos || {}) }
    };
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

function pointerToDoorPercent(e, doorEl){
  const rect = doorEl.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;

  const x = (px / rect.width) * 100;
  const y = (py / rect.height) * 100;

  // επιτρέπουμε έξοδο ώστε το post-it να "κολλάει" στις άκρες
  return {
    x: clamp(x, -10, 110),
    y: clamp(y, -10, 110)
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
      door: pick(r, "door") || "left",
      type: pick(r, "type") || "meeting",
      tagLabel: pick(r, "tagLabel"),
      headline: pick(r, "headline"),
      title: pick(r, "title"),
      short: pick(r, "short"),
      due: pick(r, "due"),
      link: pick(r, "link"),
      body: (r[idx("body")] ?? "").replace(/\\n/g, "\n"),
      pos: { x: num(r,"x",50), y: num(r,"y",50), rot: num(r,"rot",0) }
    }))
    // basic sanity: keep only items with id
    .filter(it => it.id);
}

// --------------------
// Create Note element
// --------------------
function makeNote(item, doorEl){
  const el = document.createElement("div");
  el.className = "note";
  el.tabIndex = 0;

  el.dataset.id = item.id || "";
  el.dataset.door = item.door || "left";

  el.style.background = COLORS[item.type] || "#ffe88a";

  const x = item.pos?.x ?? 10;
  const y = item.pos?.y ?? 10;
  const rot = item.pos?.rot ?? 0;

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

  // --- Admin-only drag ---
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

      if(Math.abs(e.clientX - startX) > 4 || Math.abs(e.clientY - startY) > 4){
        moved = true;
      }

      const p = pointerToDoorPercent(e, doorEl);
      el.style.left = `${p.x}%`;
      el.style.top  = `${p.y}%`;
    });

    el.addEventListener("pointerup", (e) => {
      if(!dragging) return;
      dragging = false;
      el.classList.remove("dragging");

      const p = pointerToDoorPercent(e, doorEl);
      const rotNow = item.pos?.rot ?? 0;

      if (item.id) {
        saveLayoutOverride(item.id, item.door, { x: p.x, y: p.y, rot: rotNow });
      }

      // click (χωρίς drag) -> open
      if(!moved){
        openModal(item);
      }
    });
  } else {
    // Viewers: click μόνο
    el.addEventListener("click", () => openModal(item));
  }

  // Keyboard open
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
    .then(() => alert("✅ Έγινε αντιγραφή του updates.json (με τις νέες θέσεις) στο clipboard."))
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

  doorLeft.innerHTML = "";
  doorRight.innerHTML = "";

  (data.items ?? []).forEach((item) => {
    const doorEl = item.door === "right" ? doorRight : doorLeft;
    const note = makeNote(item, doorEl);
    doorEl.appendChild(note);
  });

  // Admin helper: Ctrl/Cmd+E export merged JSON
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "e") {
      e.preventDefault();
      exportLayoutToClipboard();
    }
  });

  if (ADMIN) {
    console.log("ADMIN MODE ON ✅");
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



