const doorLeft  = document.getElementById("doorLeft");
const doorRight = document.getElementById("doorRight");

const overlay = document.getElementById("overlay");
const closeBtn = document.getElementById("closeBtn");
const weekLabel = document.getElementById("weekLabel");

const mTag = document.getElementById("mTag");
const mTitle = document.getElementById("mTitle");
const mBody = document.getElementById("mBody");
const mLink = document.getElementById("mLink");
const mDue = document.getElementById("mDue");
const modalNote = document.getElementById("modalNote");

const COLORS = {
  meeting: "#ffe88a",
  sales:   "#b7f7c7",
  update:  "#a9ddff",
  urgent:  "#ff9aa2",
  fyi:     "#dcc7ff"
};

// Θα κρατάμε τα items στη μνήμη για export
let DATA = null;

const STORAGE_KEY = "weekly_fridge_layout_v1";

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

function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }

// Convert pointer position to % inside door element
function pointerToDoorPercent(e, doorEl){
  const rect = doorEl.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;
  const x = (px / rect.width) * 100;
  const y = (py / rect.height) * 100;
  return { x: clamp(x, 0, 100), y: clamp(y, 0, 100) };
}

function makeNote(item, doorEl){
  const el = document.createElement("div");
  el.className = "note";
  el.tabIndex = 0;

  el.dataset.id = item.id;       // required for saving
  el.dataset.door = item.door;   // left/right

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

  // --- DRAG LOGIC ---
  let dragging = false;
  let moved = false;
  let startX = 0, startY = 0;

  el.addEventListener("pointerdown", (e) => {
    // Δεν θέλουμε scroll/selection
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

    // Αν κουνήθηκε λίγο, το θεωρούμε drag (για να μην ανοίγει modal)
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

    // Save new pos to localStorage
    const p = pointerToDoorPercent(e, doorEl);
    const rotNow = item.pos?.rot ?? 0;
    saveLayoutOverride(item.id, item.door, { x: p.x, y: p.y, rot: rotNow });

    // Αν ΔΕΝ έγινε drag (δηλαδή ήταν click), άνοιξε modal
    if(!moved){
      openModal(item);
    }
  });

  // Keyboard open
  el.addEventListener("keydown", (e) => {
    if(e.key === "Enter" || e.key === " "){
      e.preventDefault();
      openModal(item);
    }
  });

  return el;
}

function applyOverrides(data){
  const overrides = loadLayoutOverrides();
  data.items = (data.items || []).map(it => {
    const ov = overrides[it.id];
    if(!ov) return it;
    return {
      ...it,
      door: ov.door || it.door,
      pos: { ...(it.pos || {}), ...(ov.pos || {}) }
    };
  });
  return data;
}

// Optional: export current merged JSON to clipboard
function exportLayoutToClipboard(){
  if(!DATA) return;
  const merged = JSON.stringify(DATA, null, 2);
  navigator.clipboard.writeText(merged)
    .then(() => alert("✅ Έγινε αντιγραφή του updates.json (με τις νέες θέσεις) στο clipboard."))
    .catch(() => alert("❌ Δεν μπόρεσα να γράψω στο clipboard. Κάνε copy από console."));
}

async function init(){
  const res = await fetch("updates.json", { cache: "no-store" });
  let data = await res.json();

  // Apply saved positions
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

  // Quick dev shortcut: press "E" to export
  document.addEventListener("keydown", (e) => {
    if(e.key.toLowerCase() === "e" && (e.ctrlKey || e.metaKey)){
      e.preventDefault();
      exportLayoutToClipboard();
    }
  });
}

closeBtn.addEventListener("click", closeModal);
overlay.addEventListener("click", (e) => { if(e.target === overlay) closeModal(); });
document.addEventListener("keydown", (e) => { if(e.key === "Escape") closeModal(); });

init();
