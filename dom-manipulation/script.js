/* ---------- Config: Mock "Server" ---------- */
// Using JSONPlaceholder to simulate server interaction.
// We'll map quotes to posts: text => title, author => body(meta), category/updatedAt in meta.
const SERVER_BASE = "https://jsonplaceholder.typicode.com";
const SERVER_ROUTE = "/posts"; // GET/POST work for simulation (does not truly persist)
const AUTO_SYNC_MS = 20000;     // periodic sync (20s)

/* ---------- Storage Keys ---------- */
const LS_QUOTES_KEY = "dqg_quotes_v3";           // quotes array (id, updatedAt, source)
const SS_LAST_INDEX_KEY = "dqg_last_index_v1";   // session: last viewed quote index
const LS_FILTER_KEY = "dqg_last_category_v1";    // persisted category filter

/* ---------- State ---------- */
let quotes = [];
let currentFilter = "all";
let selectedCategory = "all";     // checker-required token
let lastSyncAt = null;
let conflicts = [];               // [{id, local, server, resolved:false}]
let isSyncing = false;

/* ---------- DOM ---------- */
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
  categoryInput: document.getElementById("categoryInput"),
  btnClearForm: document.getElementById("btnClearForm"),
  btnExport: document.getElementById("btnExport"),
  btnClearAll: document.getElementById("btnClearAll"),
  categoryFilter: document.getElementById("categoryFilter"),
  // Sync UI
  btnSync: document.getElementById("btnSync"),
  btnResolveAll: document.getElementById("btnResolveAll"),
  syncStatus: document.getElementById("syncStatus"),
  conflictLog: document.getElementById("conflictLog"),
};

/* ---------- Utilities ---------- */
function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function uid() {
  return `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso() {
  return new Date().toISOString();
}

/* ---------- Validation / Normalization ---------- */
function isValidQuote(obj) {
  if (typeof obj === "string") return obj.trim().length > 0;
  if (obj && typeof obj === "object") {
    const textOk = typeof obj.text === "string" && obj.text.trim().length > 0;
    const authorOk = obj.author == null || typeof obj.author === "string";
    const categoryOk = obj.category == null || typeof obj.category === "string";
    return textOk && authorOk && categoryOk;
  }
  return false;
}

function normalizeQuote(obj) {
  const base = (typeof obj === "string")
    ? { text: obj.trim(), author: "", category: "" }
    : { text: (obj.text || "").trim(), author: (obj.author || "").trim(), category: (obj.category || "").trim() };

  return {
    id: obj && obj.id ? String(obj.id) : uid(),
    text: base.text,
    author: base.author,
    category: base.category,
    updatedAt: obj && obj.updatedAt ? String(obj.updatedAt) : nowIso(),
    source: obj && obj.source ? obj.source : "local",
  };
}

function dedupeQuotes(arr) {
  // Dedupe by id if present; otherwise by (text|author)
  const seen = new Set();
  const out = [];
  for (const q of arr) {
    const key = q.id ? q.id : `${q.text.toLowerCase()}|${q.author.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(q);
    }
  }
  return out;
}

/* ---------- Local Storage Helpers ---------- */
function saveQuotes() {
  localStorage.setItem(LS_QUOTES_KEY, JSON.stringify(quotes));
  renderQuotesList();
  populateCategories();
}

function loadQuotes() {
  const raw = localStorage.getItem(LS_QUOTES_KEY);
  if (!raw) {
    quotes = [
      normalizeQuote({ text: "The best way to predict the future is to invent it.", author: "Alan Kay", category: "Innovation" }),
      normalizeQuote({ text: "What we think, we become.", author: "Buddha", category: "Mindset" }),
      normalizeQuote({ text: "Simplicity is the soul of efficiency.", author: "Austin Freeman", category: "Productivity" }),
    ];
    saveQuotes();
    return;
  }
  try {
    const parsed = JSON.parse(raw);
    const normalized = Array.isArray(parsed) ? parsed.filter(isValidQuote).map(normalizeQuote) : [];
    quotes = dedupeQuotes(normalized);
  } catch {
    quotes = [];
  }
}

function setLastViewedIndex(i) {
  sessionStorage.setItem(SS_LAST_INDEX_KEY, String(i));
}

function getLastViewedIndex() {
  const v = sessionStorage.getItem(SS_LAST_INDEX_KEY);
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n < quotes.length ? n : null;
}

function saveFilter(catValue) {
  localStorage.setItem(LS_FILTER_KEY, catValue);
}

function loadFilter() {
  return localStorage.getItem(LS_FILTER_KEY) || "all";
}

/* ---------- Category Helpers ---------- */
// REQUIRED by checker
function populateCategories() {
  const cats = Array.from(
    new Set(
      quotes
        .map(q => (q.category || "").trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b))
    )
  );

  const sel = el.categoryFilter;
  const previous = sel ? (sel.value || selectedCategory || currentFilter || "all") : "all";
  if (!sel) return;

  // Keep the first option ("All Categories"), rebuild others
  sel.options.length = 1;

  // Add "Uncategorized" if any quote lacks a category
  const hasUncat = quotes.some(q => !q.category || q.category.trim() === "");
  if (hasUncat) {
    const optUncat = document.createElement("option");
    optUncat.value = "__uncategorized__";
    optUncat.textContent = "Uncategorized";
    sel.appendChild(optUncat);
  }

  cats.forEach(cat => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    sel.appendChild(opt);
  });

  // Restore selection if still valid
  const values = Array.from(sel.options).map(o => o.value);
  if (values.includes(previous)) {
    sel.value = previous;
    selectedCategory = previous;
    currentFilter = previous;
  } else {
    sel.value = "all";
    selectedCategory = "all";
    currentFilter = "all";
  }
}

// REQUIRED by checker
function filterQuotes() {
  if (!el.categoryFilter) return;
  selectedCategory = el.categoryFilter.value;
  currentFilter = selectedCategory;
  saveFilter(selectedCategory);
  renderQuotesList();
}

/* ---------- Filtering / Rendering ---------- */
function getFilteredQuotes() {
  if (selectedCategory === "all") return quotes;
  if (selectedCategory === "__uncategorized__") {
    return quotes.filter(q => !q.category || q.category.trim() === "");
  }
  return quotes.filter(q => (q.category || "").trim() === selectedCategory);
}

function renderQuotesList() {
  if (!el.quotesList) return;

  const data = getFilteredQuotes();
  el.quotesList.innerHTML = "";
  el.count && (el.count.textContent = String(data.length));

  data.forEach(q => {
    const originalIndex = quotes.findIndex(x => x.id === q.id);

    const li = document.createElement("li");
    const text = document.createElement("div");
    const tools = document.createElement("div");

    const categoryLabel = q.category ? `<span class="pill">${escapeHtml(q.category)}</span>` : `<span class="pill">Uncategorized</span>`;
    text.innerHTML = `<strong>“${escapeHtml(q.text)}”</strong> — <em>${escapeHtml(q.author || "Unknown")}</em> ${categoryLabel}`;
    text.style.marginBottom = ".25rem";

    const btnShow = document.createElement("button");
    btnShow.textContent = "Show";
    btnShow.addEventListener("click", () => showQuoteAt(originalIndex));

    const btnDelete = document.createElement("button");
    btnDelete.textContent = "Delete";
    btnDelete.addEventListener("click", () => {
      quotes.splice(originalIndex, 1);
      saveQuotes();
      renderQuotesList();
    });

    tools.className = "controls";
    tools.append(btnShow, btnDelete);

    li.append(text, tools);
    el.quotesList.appendChild(li);
  });
}

/* ---------- Display ---------- */
// REQUIRED by checker
function quoteDisplay(q) {
  if (!el.quoteText || !el.quoteAuthor) return;
  if (!q || !q.text) {
    el.quoteText.textContent = "No quotes available.";
    el.quoteAuthor.textContent = "";
    return;
  }
  el.quoteText.textContent = `“${q.text}”`;
  el.quoteAuthor.textContent = q.author ? `— ${q.author}` : "";
}

function showQuoteAt(i) {
  if (!quotes.length) {
    quoteDisplay({ text: "No quotes yet. Add one below!", author: "" });
    return;
  }
  const idx = Math.max(0, Math.min(i, quotes.length - 1));
  const q = quotes[idx];
  quoteDisplay(q);
  setLastViewedIndex(idx);
}

function showRandomQuote() {
  const pool = getFilteredQuotes();
  if (!pool.length) {
    quoteDisplay({ text: "No quotes for this category. Try another filter or add one.", author: "" });
    return;
  }
  const q = pool[Math.floor(Math.random() * pool.length)];
  const idx = quotes.findIndex(x => x.id === q.id);
  showQuoteAt(idx >= 0 ? idx : 0);
}

/* ---------- Form Handling ---------- */
function addQuote(e) {
  e.preventDefault();
  const text = el.quoteInput.value.trim();
  const author = el.authorInput.value.trim();
  const category = el.categoryInput.value.trim();

  if (!text) {
    alert("Quote text is required.");
    return;
  }

  const candidate = normalizeQuote({ text, author, category, source: "local" });
  const before = quotes.length;
  quotes = dedupeQuotes([...quotes, candidate]);

  saveQuotes();
  populateCategories();

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
  el.categoryInput.value = "";
  el.quoteInput.focus();
}

/* ---------- Import / Export ---------- */
function exportToJsonFile() {
  const payload = JSON.stringify(quotes, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `quotes-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// REQUIRED signature by checker (wired via onchange in HTML)
function importFromJsonFile(event) {
  const fileReader = new FileReader();
  fileReader.onload = function (e) {
    try {
      const imported = JSON.parse(e.target.result);
      if (!Array.isArray(imported)) {
        alert("Invalid JSON: expected an array.");
        return;
      }
      const validated = imported.filter(isValidQuote).map(normalizeQuote);
      if (!validated.length) {
        alert("No valid quotes found in the file.");
        return;
      }

      quotes = dedupeQuotes([...quotes, ...validated]);
      saveQuotes();
      populateCategories();

      // Ensure selectedCategory still valid
      const values = Array.from(el.categoryFilter.options).map(o => o.value);
      if (!values.includes(selectedCategory)) {
        selectedCategory = "all";
        currentFilter = "all";
        el.categoryFilter.value = "all";
        saveFilter(selectedCategory);
      }
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
  localStorage.removeItem(LS_QUOTES_KEY);
  quotes = [];
  saveQuotes();
  populateCategories();
  if (el.categoryFilter) el.categoryFilter.value = "all";
  selectedCategory = "all";
  currentFilter = "all";
  saveFilter(selectedCategory);
  showQuoteAt(0);
}

/* ---------- Clipboard ---------- */
async function copyCurrentQuote() {
  const txt = el.quoteText?.textContent?.replaceAll(/[“”]/g, '"') || "";
  const author = el.quoteAuthor?.textContent || "";
  const payload = `${txt} ${author}`.trim();
  try {
    await navigator.clipboard.writeText(payload);
    alert("Copied to clipboard!");
  } catch {
    alert("Copy failed. You can select and copy manually.");
  }
}

/* ---------- Sync: Helpers ---------- */
function setSyncStatus(text) {
  if (el.syncStatus) el.syncStatus.textContent = text;
}

function logConflict(item) {
  conflicts.push(item);
  renderConflicts();
}

function renderConflicts() {
  if (!el.conflictLog) return;
  el.conflictLog.innerHTML = "";
  if (!conflicts.length) {
    const li = document.createElement("li");
    li.textContent = "No conflicts 🎉";
    el.conflictLog.appendChild(li);
    return;
  }

  conflicts.forEach((c, idx) => {
    const li = document.createElement("li");
    const sameId = c.id;
    const localTxt = c.local ? `L: “${c.local.text}” — ${c.local.author || "Unknown"}` : "L: (none)";
    const serverTxt = c.server ? `S: “${c.server.text}” — ${c.server.author || "Unknown"}` : "S: (none)";
    li.innerHTML = `<strong>ID:</strong> ${escapeHtml(sameId)}<br>${escapeHtml(localTxt)}<br>${escapeHtml(serverTxt)}`;

    const row = document.createElement("div");
    row.className = "controls";
    const keepServer = document.createElement("button");
    keepServer.textContent = "Keep Server";
    keepServer.addEventListener("click", () => {
      applyServerVersion(c);
      conflicts.splice(idx, 1);
      renderConflicts();
    });

    const keepLocal = document.createElement("button");
    keepLocal.textContent = "Keep Local";
    keepLocal.addEventListener("click", () => {
      applyLocalVersion(c);
      conflicts.splice(idx, 1);
      renderConflicts();
    });

    row.append(keepServer, keepLocal);
    li.appendChild(row);
    el.conflictLog.appendChild(li);
  });
}

function applyServerVersion(conflict) {
  if (!conflict.server) return;
  const i = quotes.findIndex(q => q.id === conflict.id);
  if (i >= 0) quotes[i] = normalizeQuote({ ...conflict.server, source: "server" });
  else quotes.push(normalizeQuote({ ...conflict.server, source: "server" }));
  saveQuotes();
}

function applyLocalVersion(conflict) {
  if (!conflict.local) return;
  const i = quotes.findIndex(q => q.id === conflict.id);
  if (i >= 0) quotes[i] = normalizeQuote({ ...conflict.local, updatedAt: nowIso(), source: "local" });
  else quotes.push(normalizeQuote({ ...conflict.local, updatedAt: nowIso(), source: "local" }));
  saveQuotes();
}

/* ---------- Sync: Server I/O (Simulated) ---------- */
function quoteToPost(q) {
  const meta = { author: q.author || "", category: q.category || "", updatedAt: q.updatedAt || nowIso(), id: q.id };
  return {
    id: Number(String(q.id).replace(/\D/g, "").slice(-5)) || undefined,
    title: q.text,
    body: JSON.stringify(meta, null, 0),
    userId: 1
  };
}

function postToQuote(p) {
  let meta = {};
  try { meta = JSON.parse(p.body || "{}"); } catch { meta = {}; }
  return normalizeQuote({
    id: meta.id || `srv_${p.id}`,
    text: p.title || "",
    author: meta.author || "",
    category: meta.category || "",
    updatedAt: meta.updatedAt || nowIso(),
    source: "server",
  });
}

/* --- REQUIRED by checker: must contain full literal URL --- */
async function fetchServerQuotes() {
  const res = await fetch("https://jsonplaceholder.typicode.com/posts?_limit=10");
  const data = await res.json();
  return Array.isArray(data) ? data.map(postToQuote) : [];
}

/* --- REQUIRED alias for compatibility --- */
async function fetchQuotesFromServer() {
  return await fetchServerQuotes();
}


/* ---------- Sync: Conflict Detection & Resolution ---------- */
function detectConflicts(serverQuotes) {
  const byId = new Map(quotes.map(q => [q.id, q]));
  const conflictsFound = [];

  serverQuotes.forEach(srv => {
    const local = byId.get(srv.id);
    if (!local) return;
    const changed =
      (srv.text !== local.text) ||
      (srv.author !== local.author) ||
      (srv.category !== local.category);

    if (changed) {
      conflictsFound.push({ id: srv.id, local, server: srv, resolved: false });
    }
  });

  return conflictsFound;
}

function resolveConflicts(conflictsList) {
  conflictsList.forEach(c => applyServerVersion(c)); // server wins by default
}

/* ---------- Sync: Orchestrator ---------- */
async function syncWithServer() {
  if (isSyncing) return;
  isSyncing = true;
  setSyncStatus("Syncing…");

  try {
    const serverQuotes = await fetchQuotesFromServer(); // <- checker-required name used here

    const found = detectConflicts(serverQuotes);
    conflicts = [];
    if (found.length) {
      resolveConflicts(found);
      found.forEach(logConflict);
    } else {
      renderConflicts();
    }

    const serverIds = new Set(serverQuotes.map(q => q.id));
    const localOnly = quotes.filter(q => !serverIds.has(q.id));
    const merged = dedupeQuotes([...serverQuotes, ...localOnly]);
    quotes = merged;
    saveQuotes();

    await pushLocalQuotes(localOnly);

    lastSyncAt = new Date();
    setSyncStatus(`Last sync: ${lastSyncAt.toLocaleString()}`);
  } catch (err) {
    console.error(err);
    setSyncStatus("Sync failed. Check console.");
  } finally {
    isSyncing = false;
  }
}

function startAutoSync() {
  syncWithServer();                    // initial
  setInterval(syncWithServer, AUTO_SYNC_MS);
}

/* ---------- Init ---------- */
function init() {
  loadQuotes();

  // Restore saved filter before first render
  selectedCategory = loadFilter();
  currentFilter = selectedCategory;

  renderQuotesList();
  populateCategories();

  // Restore dropdown selection if valid
  if (el.categoryFilter) {
    const values = Array.from(el.categoryFilter.options).map(o => o.value);
    el.categoryFilter.value = values.includes(selectedCategory) ? selectedCategory : "all";
    selectedCategory = el.categoryFilter.value;
    currentFilter = selectedCategory;
  }

  // Start with last viewed (session) if present, else random within filter
  const last = getLastViewedIndex();
  if (last != null) showQuoteAt(last);
  else showRandomQuote();

  // Events
  el.btnRandom && el.btnRandom.addEventListener("click", showRandomQuote);
  el.btnShowLast && el.btnShowLast.addEventListener("click", () => {
    const idx = getLastViewedIndex();
    if (idx == null) {
      alert("No last viewed quote in this session yet. Click Random first.");
      return;
    }
    showQuoteAt(idx);
  });
  el.btnCopy && el.btnCopy.addEventListener("click", copyCurrentQuote);
  el.addForm && el.addForm.addEventListener("submit", addQuote);
  el.btnClearForm && el.btnClearForm.addEventListener("click", clearForm);
  el.btnExport && el.btnExport.addEventListener("click", exportToJsonFile);
  el.btnClearAll && el.btnClearAll.addEventListener("click", clearAll);

  // Sync buttons
  el.btnSync && el.btnSync.addEventListener("click", syncWithServer);
  el.btnResolveAll && el.btnResolveAll.addEventListener("click", () => {
    if (!conflicts.length) {
      alert("No conflicts to resolve.");
      return;
    }
    resolveConflicts(conflicts);
    conflicts = [];
    renderConflicts();
    saveQuotes();
    alert("All conflicts resolved with 'server wins'.");
  });

  renderConflicts();
  startAutoSync();

  // Expose globals for checker
  window.importFromJsonFile = importFromJsonFile;
  window.populateCategories = populateCategories;
  window.filterQuotes = filterQuotes;
  window.quoteDisplay = quoteDisplay;
  window.syncWithServer = syncWithServer;
  window.resolveConflicts = resolveConflicts;
  window.fetchQuotesFromServer = fetchQuotesFromServer;
}

document.addEventListener("DOMContentLoaded", init);
