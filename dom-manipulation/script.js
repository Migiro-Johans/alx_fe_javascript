// Storage keys
const LS_KEY = "dqg_quotes_v1";
const SS_KEY = "dqg_last_index_v1";

// In-memory state
let quotes = [];

/* ---------- Utilities ---------- */
function isValidQuote(obj) {
  // Accept either string (quote text) or { text, author } object
  if (typeof obj === "string") return obj.trim().length > 0;
  if (obj && typeof obj === "object") {
    const textOk = typeof obj.text === "string" && obj.text.trim().length > 0;
    const authorOk = obj.author == null || typeof obj.author === "string";
    return textOk && authorOk;
  }
  return false;
}

function normalizeQuote(obj) {
  // Convert acceptable shapes to uniform { text, author } objects
  if (typeof obj === "string") return { text: obj.trim(), author: "" };
  return { text: obj.text.trim(), author: (obj.author || "").trim() };
}

function dedupeQuotes(arr) {
  const seen = new Set();
  const out = [];
  for (const q of arr) {
    const key = `${q.text.toLowerCase()}|${q.author.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(q);
    }
  }
  return out;
}

function saveQuotes() {
  localStorage.setItem(LS_KEY, JSON.stringify(quotes));
  renderQuotesList();
}

function loadQuotes() {
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) {
    // Default seed data (appear only on first load)
    quotes = [
      { text: "The best way to predict the future is to invent it.", author: "Alan Kay" },
      { text: "What we think, we become.", author: "Buddha" },
      { text: "Simplicity is the soul of efficiency.", author: "Austin Freeman" }
    ];
    saveQuotes();
    return;
  }
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const normalized = parsed.filter(isValidQuote).map(normalizeQuote);
      quotes = dedupeQuotes(normalized);
    } else {
      quotes = [];
    }
  } catch {
    quotes = [];
  }
}

function setLastViewedIndex(i) {
  sessionStorage.setItem(SS_KEY, String(i));
}

function getLastViewedIndex() {
  const v = sessionStorage.getItem(SS_KEY);
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n < quotes.length ? n : null;
}

/* ---------- DOM helpers ---------- */
const el = {
  quoteText: document.getElementById("quoteText"),
  quoteAuthor: document.getElementById("quoteAuthor"),
  quotesList: document.getElementById("quotesList"),
  count: document.getElementById("count"),
  btnRandom: document.getElementById("btnRandom"),
  btnShowLast: document.getElementById("btnShowLast"),
  btnCopy: document.getElementById("btnCopy"),
  addForm: document.getElementById("addQuoteForm"),
  quoteInput: document.getElementById("quoteInput"),
  authorInput: document.getElementById("authorInput"),
  btnClearForm: document.getElementById("btnClearForm"),
  btnExport: document.getElementById("btnExport"),
  btnClearAll: document.getElementById("btnClearAll"),
};

function renderQuotesList() {
  el.quotesList.innerHTML = "";
  el.count.textContent = String(quotes.length);

  quotes.forEach((q, i) => {
    const li = document.createElement("li");
    const text = document.createElement("div");
    const tools = document.createElement("div");

    text.innerHTML = `<strong>“${escapeHtml(q.text)}”</strong> — <em>${escapeHtml(q.author || "Unknown")}</em>`;
    text.style.marginBottom = ".25rem";

    // A small set of per-item actions
    const btnShow = document.createElement("button");
    btnShow.textContent = "Show";
    btnShow.addEventListener("click", () => showQuoteAt(i));

    const btnDelete = document.createElement("button");
    btnDelete.textContent = "Delete";
    btnDelete.addEventListener("click", () => {
      quotes.splice(i, 1);
      saveQuotes();
    });

    tools.className = "controls";
    tools.append(btnShow, btnDelete);

    li.append(text, tools);
    el.quotesList.appendChild(li);
  });
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ---------- Quote display ---------- */
function showQuoteAt(i) {
  if (!quotes.length) {
    el.quoteText.textContent = "No quotes yet. Add one below!";
    el.quoteAuthor.textContent = "";
    return;
  }
  const idx = Math.max(0, Math.min(i, quotes.length - 1));
  const q = quotes[idx];
  el.quoteText.textContent = `“${q.text}”`;
  el.quoteAuthor.textContent = q.author ? `— ${q.author}` : "";
  setLastViewedIndex(idx);
}

function showRandomQuote() {
  if (!quotes.length) return showQuoteAt(0);
  const i = Math.floor(Math.random() * quotes.length);
  showQuoteAt(i);
}

/* ---------- Form handling ---------- */
function addQuote(e) {
  e.preventDefault();
  const text = el.quoteInput.value.trim();
  const author = el.authorInput.value.trim();

  if (!text) {
    alert("Quote text is required.");
    return;
  }

  const candidate = normalizeQuote({ text, author });
  const before = quotes.length;
  quotes = dedupeQuotes([...quotes, candidate]);

  saveQuotes();
  renderQuotesList();
  if (quotes.length > before) {
    showQuoteAt(quotes.length - 1);
  } else {
    alert("Duplicate quote ignored (same text & author).");
  }

  el.addForm.reset();
}

function clearForm() {
  el.quoteInput.value = "";
  el.authorInput.value = "";
  el.quoteInput.focus();
}

/* ---------- Import / Export ---------- */
function exportToJsonFile() {
  const payload = JSON.stringify(quotes, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  a.href = url;
  a.download = `quotes-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Keep this exact signature to match your rubric/onchange in index.html
function importFromJsonFile(event) {
  const fileReader = new FileReader();
  fileReader.onload = function (e) {
    try {
      const imported = JSON.parse(e.target.result);

      if (!Array.isArray(imported)) {
        alert("Invalid JSON: expected an array.");
        return;
      }

      // validate + normalize
      const validated = imported.filter(isValidQuote).map(normalizeQuote);
      if (!validated.length) {
        alert("No valid quotes found in the file.");
        return;
      }

      // merge + dedupe
      quotes = dedupeQuotes([...quotes, ...validated]);
      saveQuotes();
      renderQuotesList();
      alert("Quotes imported successfully!");
    } catch (err) {
      console.error(err);
      alert("Failed to parse JSON file.");
    }
  };
  const file = event.target.files?.[0];
  if (file) fileReader.readAsText(file);
}

/* ---------- Danger ---------- */
function clearAll() {
  if (!confirm("This will remove all quotes from Local Storage. Continue?")) return;
  localStorage.removeItem(LS_KEY);
  quotes = [];
  saveQuotes();
  showQuoteAt(0);
}

/* ---------- Clipboard ---------- */
async function copyCurrentQuote() {
  const txt = el.quoteText.textContent?.replaceAll(/[“”]/g, '"') || "";
  const author = el.quoteAuthor.textContent || "";
  const payload = `${txt} ${author}`.trim();
  try {
    await navigator.clipboard.writeText(payload);
    alert("Copied to clipboard!");
  } catch {
    alert("Copy failed. You can select and copy manually.");
  }
}

/* ---------- Init ---------- */
function init() {
  loadQuotes();
  renderQuotesList();

  // Start with last viewed (session) if present, else random
  const last = getLastViewedIndex();
  if (last != null) showQuoteAt(last);
  else showRandomQuote();

  // Events
  el.btnRandom.addEventListener("click", showRandomQuote);
  el.btnShowLast.addEventListener("click", () => {
    const idx = getLastViewedIndex();
    if (idx == null) {
      alert("No last viewed quote in this session yet. Click Random first.");
      return;
    }
    showQuoteAt(idx);
  });
  el.btnCopy.addEventListener("click", copyCurrentQuote);

  el.addForm.addEventListener("submit", addQuote);
  el.btnClearForm.addEventListener("click", clearForm);

  el.btnExport.addEventListener("click", exportToJsonFile);
  el.btnClearAll.addEventListener("click", clearAll);

  // Expose import function globally for the onchange HTML attribute
  window.importFromJsonFile = importFromJsonFile;
}

// Kick off
document.addEventListener("DOMContentLoaded", init)
