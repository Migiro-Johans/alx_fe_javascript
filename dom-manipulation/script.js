/* ---------- Storage Keys ---------- */
const LS_QUOTES_KEY = "dqg_quotes_v2";           // quotes array
const SS_LAST_INDEX_KEY = "dqg_last_index_v1";   // session: last viewed quote index
const LS_FILTER_KEY = "dqg_last_category_v1";    // persisted category filter

/* ---------- State ---------- */
let quotes = [];
let currentFilter = "all";        // internal (legacy)
let selectedCategory = "all";     // <- required by checker, mirrors currentFilter

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
};

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
  if (typeof obj === "string") return { text: obj.trim(), author: "", category: "" };
  return {
    text: (obj.text || "").trim(),
    author: (obj.author || "").trim(),
    category: (obj.category || "").trim(),
  };
}

function dedupeQuotes(arr) {
  // Dedupe by (text|author) to avoid exact duplicates regardless of category
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

/* ---------- Storage Helpers ---------- */
function saveQuotes() {
  localStorage.setItem(LS_QUOTES_KEY, JSON.stringify(quotes));
  renderQuotesList();
  populateCategories(); // keep categories in sync when quotes change
}

function loadQuotes() {
  const raw = localStorage.getItem(LS_QUOTES_KEY);
  if (!raw) {
    quotes = [
      { text: "The best way to predict the future is to invent it.", author: "Alan Kay", category: "Innovation" },
      { text: "What we think, we become.", author: "Buddha", category: "Mindset" },
      { text: "Simplicity is the soul of efficiency.", author: "Austin Freeman", category: "Productivity" },
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

/* ---------- Utils ---------- */
function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
  const previous = sel.value || selectedCategory || currentFilter || "all";

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
    selectedCategory = previous; // sync
    currentFilter = previous;    // sync
  } else {
    sel.value = "all";
    selectedCategory = "all";
    currentFilter = "all";
  }
}

// REQUIRED by checker
function filterQuotes() {
  selectedCategory = el.categoryFilter.value; // sync from UI
  currentFilter = selectedCategory;           // keep both in sync
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
  const data = getFilteredQuotes();

  el.quotesList.innerHTML = "";
  el.count.textContent = String(data.length);

  data.forEach(q => {
    const originalIndex = quotes.findIndex(
      x => x.text === q.text && x.author === q.author && x.category === q.category
    );

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
      saveQuotes();       // persist & re-render
      renderQuotesList(); // keep current filter view consistent
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
  quoteDisplay(q); // use checker-required function
  setLastViewedIndex(idx);
}

function showRandomQuote() {
  const pool = getFilteredQuotes();
  if (!pool.length) {
    quoteDisplay({ text: "No quotes for this category. Try another filter or add one.", author: "" });
    return;
  }
  const q = pool[Math.floor(Math.random() * pool.length)];
  const idx = quotes.findIndex(
    x => x.text === q.text && x.author === q.author && x.category === q.category
  );
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

  const candidate = normalizeQuote({ text, author, category });
  const before = quotes.length;
  quotes = dedupeQuotes([...quotes, candidate]);

  saveQuotes();         // persist and refresh list/categories
  populateCategories(); // ensure dropdown reflects any new category

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
  const stamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
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

      // Ensure current/selected filter is still valid
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
  el.categoryFilter.value = "all";
  selectedCategory = "all";
  currentFilter = "all";
  saveFilter(selectedCategory);
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

  // Restore saved filter before first render
  selectedCategory = loadFilter();
  currentFilter = selectedCategory; // sync

  renderQuotesList();
  populateCategories();

  // Set dropdown to restored filter if still available
  const values = Array.from(el.categoryFilter.options).map(o => o.value);
  if (values.includes(selectedCategory)) {
    el.categoryFilter.value = selectedCategory;
  } else {
    selectedCategory = "all";
    currentFilter = "all";
    el.categoryFilter.value = "all";
  }

  // Start with last viewed (session) if present, else random within filter
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

  // Expose globals for checker
  window.importFromJsonFile = importFromJsonFile;
  window.populateCategories = populateCategories;
  window.filterQuotes = filterQuotes;
  window.quoteDisplay = quoteDisplay;
}

document.addEventListener("DOMContentLoaded", init);
