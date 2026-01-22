(() => {
  const STORAGE_KEY = "pinned_board_notes_v1";

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

  const rand = (min, max) => Math.random() * (max - min) + min;

  function loadNotes() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const notes = raw ? JSON.parse(raw) : [];
      return Array.isArray(notes) ? notes : [];
    } catch {
      return [];
    }
  }

  function saveNotes(notes) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function boardRect() {
    return board.getBoundingClientRect();
  }

  function createPosition() {
    // place within board padding area
    const rect = boardRect();
    const pad = 28;
    const w = 240;
    const h = 170;
    const x = rand(pad, Math.max(pad, rect.width - w - pad));
    const y = rand(pad, Math.max(pad, rect.height - h - pad));
    return { x, y };
  }

  function formatDate(ts) {
    const d = new Date(ts);
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

  function render(notes) {
    board.innerHTML = "";
    const q = searchInput.value.trim().toLowerCase();

    for (const note of notes) {
      if (!noteMatches(note, q)) continue;

      const node = tpl.content.firstElementChild.cloneNode(true);

      node.classList.add(`paper-${note.color}`);
      node.style.left = `${note.x}px`;
      node.style.top = `${note.y}px`;
      node.style.transform = `rotate(${note.tilt}deg)`;

      node.querySelector(".author").textContent = note.author ? note.author : "Anonymous";
      node.querySelector(".date").textContent = formatDate(note.createdAt);
      node.querySelector(".text").textContent = note.text;

      // Delete
      node.querySelector(".delete").addEventListener("click", () => {
        const updated = loadNotes().filter(n => n.id !== note.id);
        saveNotes(updated);
        render(updated);
      });

      // Drag
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

      const notes = loadNotes();
      const note = notes.find(n => n.id === id);
      if (!note) return;

      startX = e.clientX;
      startY = e.clientY;
      originX = note.x;
      originY = note.y;

      el.style.zIndex = String(Date.now());
    };

    const onPointerMove = (e) => {
      if (!dragging) return;
      const notes = loadNotes();
      const note = notes.find(n => n.id === id);
      if (!note) return;

      const rect = boardRect();
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const pad = 10;

      note.x = clamp(originX + dx, pad, rect.width - w - pad);
      note.y = clamp(originY + dy, pad, rect.height - h - pad);

      saveNotes(notes);
      el.style.left = `${note.x}px`;
      el.style.top = `${note.y}px`;
    };

    const onPointerUp = () => {
      dragging = false;
    };

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerUp);
  }

  function addNote({ author, text, color, tilt }) {
    const notes = loadNotes();
    const pos = createPosition();

    const autoTilt = () => {
      // slight random tilt
      const choices = [-7, -5, -3, -2, 2, 3, 5, 7];
      return choices[Math.floor(Math.random() * choices.length)];
    };

    const note = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random(),
      author: (author || "").trim().slice(0, 32),
      text: text.trim().slice(0, 500),
      color,
      tilt: tilt === "auto" ? autoTilt() : Number(tilt),
      x: pos.x,
      y: pos.y,
      createdAt: Date.now()
    };

    notes.push(note);
    saveNotes(notes);
    render(notes);
  }

  function shuffle() {
    const notes = loadNotes();
    // randomize positions and z-order
    const rect = boardRect();
    for (const n of notes) {
      const pos = createPosition();
      n.x = clamp(pos.x, 0, rect.width - 240);
      n.y = clamp(pos.y, 0, rect.height - 170);
      if (Math.random() < 0.6) n.tilt = n.tilt + rand(-2, 2);
    }
    saveNotes(notes);
    render(notes);
  }

  // Events
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    addNote({
      author: nameInput.value,
      text: msgInput.value,
      color: colorInput.value,
      tilt: tiltInput.value
    });
    msgInput.value = "";
    msgInput.focus();
  });

  clearBtn.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    render([]);
  });

  shuffleBtn.addEventListener("click", shuffle);

  searchInput.addEventListener("input", () => {
    render(loadNotes());
  });

  newBtn.addEventListener("click", () => {
    msgInput.focus();
  });

  // Initial render
  window.addEventListener("resize", () => render(loadNotes()));
  render(loadNotes());
})();
