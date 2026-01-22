import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore, collection, addDoc, deleteDoc, doc,
  query, orderBy, onSnapshot, serverTimestamp, limit
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

/** 1) Paste your Firebase config here (from Firebase Console) */
const firebaseConfig = {
  apiKey: "AIzaSyD3BU6WK-0NRQsEoflJ2iZKpOH3ZSgrcoA",
  authDomain: "nurtureplace.firebaseapp.com",
  projectId: "nurtureplace",
  storageBucket: "nurtureplace.firebasestorage.app",
  messagingSenderId: "755740348234",
  appId: "1:755740348234:web:05b8cc2e8f83708a59bbb3",
  measurementId: "G-8NCRBXJLGK"
};


const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// --- UI elements ---
const board = document.getElementById("board");
const tpl = document.getElementById("noteTemplate");
const form = document.getElementById("noteForm");
const nameInput = document.getElementById("nameInput");
const msgInput = document.getElementById("msgInput");
const colorInput = document.getElementById("colorInput");
const tiltInput = document.getElementById("tiltInput");
const clearBtn = document.getElementById("clearBtn");
const shuffleBtn = document.getElementById("shuffleBtn");
const searchInput = document.getElementById("searchInput");
const newBtn = document.getElementById("newBtn");

// Required elements for the app to work (if any are missing, bail early instead of crashing)
if (!board || !tpl || !form || !msgInput || !colorInput || !tiltInput || !searchInput || !newBtn) {
  console.error("Pinned Board: Missing required DOM elements. Check index.html ids.");
  throw new Error("Pinned Board: missing required DOM elements");
}

// local UI-only state (positions are per viewer; messages are shared)
let notesCache = []; // from Firestore
const posCache = new Map(); // noteId -> {x,y,tilt} stored locally

const POS_KEY = "pinned_board_positions_v1";

const rand = (min, max) => Math.random() * (max - min) + min;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

function loadPositions() {
  try {
    const raw = localStorage.getItem(POS_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    if (obj && typeof obj === "object") {
      for (const [k, v] of Object.entries(obj)) posCache.set(k, v);
    }
  } catch {}
}
function savePositions() {
  const obj = {};
  for (const [k, v] of posCache.entries()) obj[k] = v;
  localStorage.setItem(POS_KEY, JSON.stringify(obj));
}

function boardRect() {
  return board.getBoundingClientRect();
}
function createPosition() {
  const rect = boardRect();
  const pad = 28;
  const w = 240;
  const h = 170;
  const x = rand(pad, Math.max(pad, rect.width - w - pad));
  const y = rand(pad, Math.max(pad, rect.height - h - pad));
  return { x, y };
}
function autoTilt() {
  const choices = [-7, -5, -3, -2, 2, 3, 5, 7];
  return choices[Math.floor(Math.random() * choices.length)];
}
function formatDate(ts) {
  const d = ts?.toDate ? ts.toDate() : new Date(ts || Date.now());
  return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}
function noteMatches(note, q) {
  if (!q) return true;
  const s = q.toLowerCase();
  return (
    (note.author || "").toLowerCase().includes(s) ||
    (note.text || "").toLowerCase().includes(s)
  );
}

function getViewProps(noteId) {
  const saved = posCache.get(noteId);
  if (saved && typeof saved.x === "number" && typeof saved.y === "number") return saved;

  const pos = createPosition();
  const props = { x: pos.x, y: pos.y, tilt: autoTilt() };
  posCache.set(noteId, props);
  savePositions();
  return props;
}

function render() {
  board.innerHTML = "";
  const q = searchInput.value.trim().toLowerCase();

  for (const note of notesCache) {
    if (!noteMatches(note, q)) continue;

    const node = tpl.content.firstElementChild.cloneNode(true);
    const view = getViewProps(note.id);

    node.classList.add(`paper-${note.color || "lemon"}`);
    node.style.left = `${view.x}px`;
    node.style.top = `${view.y}px`;
    node.style.transform = `rotate(${view.tilt ?? 0}deg)`;

    node.querySelector(".author").textContent = note.author ? note.author : "Anonymous";
    node.querySelector(".date").textContent = formatDate(note.createdAt);
    node.querySelector(".text").textContent = note.text;

    // Delete: only works if Firestore rules allow (creator)
    node.querySelector(".delete").addEventListener("click", async () => {
      try {
        await deleteDoc(doc(db, "notes", note.id));
      } catch (e) {
        alert("Delete failed (you can only delete your own notes).");
      }
    });

    makeDraggable(node, note.id);
    board.appendChild(node);
  }
}

function makeDraggable(el, id) {
  let startX = 0, startY = 0, originX = 0, originY = 0;
  let dragging = false;

  const onPointerDown = (e) => {
    if (e.target.closest(".delete")) return;
    dragging = true;
    el.setPointerCapture(e.pointerId);

    const view = getViewProps(id);
    startX = e.clientX;
    startY = e.clientY;
    originX = view.x;
    originY = view.y;

    el.style.zIndex = String(Date.now());
  };

  const onPointerMove = (e) => {
    if (!dragging) return;

    const rect = boardRect();
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const pad = 10;

    const view = getViewProps(id);
    view.x = clamp(originX + dx, pad, rect.width - w - pad);
    view.y = clamp(originY + dy, pad, rect.height - h - pad);

    posCache.set(id, view);
    savePositions();

    el.style.left = `${view.x}px`;
    el.style.top = `${view.y}px`;
  };

  const onPointerUp = () => { dragging = false; };

  el.addEventListener("pointerdown", onPointerDown);
  el.addEventListener("pointermove", onPointerMove);
  el.addEventListener("pointerup", onPointerUp);
  el.addEventListener("pointercancel", onPointerUp);
}

async function ensureAuth() {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (user) return resolve(user);
      await signInAnonymously(auth);
    });
  });
}

// --- Firestore realtime subscription ---
function startListener() {
  const q = query(collection(db, "notes"), orderBy("createdAt", "desc"), limit(200));
  onSnapshot(q, (snap) => {
    notesCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    render();
  });
}

// --- UI events ---
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const user = auth.currentUser;
  if (!user) return alert("Not signed in yet. Try again.");

  const author = (nameInput.value || "").trim().slice(0, 32);
  const text = (msgInput.value || "").trim().slice(0, 500);
  if (!text) return;

  const color = colorInput.value;
  const tilt = tiltInput.value === "auto" ? autoTilt() : Number(tiltInput.value);

  try {
    await addDoc(collection(db, "notes"), {
      uid: user.uid,
      author,
      text,
      color,
      createdAt: serverTimestamp()
    });

    // set local view props for this note so it appears pinned nicely for this viewer
    // (we don't know the doc id until Firestore confirms; listener will render it)
    msgInput.value = "";
    msgInput.focus();
  } catch (e2) {
    alert("Posting failed. Check Firestore rules and Firebase config.");
  }
});

// Optional controls (may be removed/commented out in HTML)
if (clearBtn) {
  clearBtn.addEventListener("click", () => {
    // With shared notes, "clear all" would delete everyone’s notes, which is not OK by default.
    // So we make this just clear *your local positions*.
    posCache.clear();
    localStorage.removeItem(POS_KEY);
    render();
  });
}

if (shuffleBtn) {
  shuffleBtn.addEventListener("click", () => {
    // shuffle is viewer-only; doesn't change shared data
    for (const n of notesCache) {
      const pos = createPosition();
      const view = getViewProps(n.id);
      view.x = pos.x;
      view.y = pos.y;
      view.tilt = (view.tilt ?? 0) + rand(-2, 2);
      posCache.set(n.id, view);
    }
    savePositions();
    render();
  });
}

searchInput.addEventListener("input", render);
newBtn.addEventListener("click", () => msgInput.focus());
window.addEventListener("resize", render);

// --- boot ---
loadPositions();
await ensureAuth();
startListener();
