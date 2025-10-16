// Storage keys
const LS_QUOTES_KEY = "dqg_quotes_v2";            // stores quotes array
const SS_LAST_INDEX_KEY = "dqg_last_index_v1";    // session: last viewed quote index
const LS_FILTER_KEY = "dqg_last_category_v1";     // persists selected category

// In-memory state
let quotes = [];
let currentFilter = "all";

/* ---------- Validators / Normalizers ---------- */
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
    category: (obj.category || "").trim()
  };
}

function dedupeQuotes(arr) {
  // Dedupe by text+author (category can vary but we keep the first occurrence)
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
  populateCategories(); // keep categories in sync if new ones appear
}

function loadQuotes() {
  const raw = localStorage.getItem(LS_QUOTES_KEY);
  if (!raw) {
    quotes = [
      { text: "The best way to predict the future is to invent it.", author: "Alan Kay", category: "Innovation" },
      { text: "What we think, we become.", author: "Buddha", category: "Mindset" },
      { text: "Simplicity is the soul of efficiency.", author: "Austin Freeman", category: "Productivity" }
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
  const v = localStorage.getItem(LS_FILTER_KEY);
  return v || "all";
}

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

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ---------- Category Helpers ---------- */
// REQUIRED by checker: populateCategories()
function populateCategories() {
  // Extract unique non-empty categories
  const cats = Array.from(
    new Set(
      quotes
        .map(q => (q.category || "").trim())
        .filter(c => c.length > 0)
        .sort((a, b) => a.localeCompare(b))
    )
  );

  // Rebuild dropdown (keep "All Categories" at top)
  const sel = el.categoryFilter;
  const previous = sel.value || currentFilter || "all";

  // Remove all except first option
  sel.options.length = 1; // keep index 0: "All Categories"

  // Add "Uncategorized" if there are any with no category
  const hasUncat = quotes.some(q => !q.category || q.category.trim() === "");
  if (hasUncat) {
    const optUncat = document.createElement("option");
    optUncat.value = "__uncategorized__";
    optUncat.textContent = "Uncategorized";
    sel.appendChild(optUncat);
  }

  // Add unique categories
  cats.forEach(cat => {
    const opt = document.createElement("option");
    opt.value = cat; // store raw category string as value
    opt.textContent = cat;
    sel.appendChild(opt);
  });

  // Restore selection
  const restoreVal = previous;
  const values = Array.from(sel.options).map(o => o.value);
  if (values.includes(restoreVal)) {
    sel.value = restoreVal;
    currentFilter = restoreVal;
  } else {
    sel.value = "all";
    currentFilter = "all";
  }
}

// REQUIRED by checker: filterQuotes()
function filterQuotes() {
  const selected = el.categoryFilter.value;
  currentFilter = selected;
  saveFilter(selected);
  renderQuotesList(); // re-render with the newly selected filter
}

/* ---------- Rendering ---------- */
function getFilteredQuotes() {
  if (currentFilter === "all") return quotes;
  if (currentFilter === "__uncategorized__") {
    return quotes.filter(q => !q.category || q.category.trim() === "");
  }
  return quotes.filter(q => (q.category || "").trim() === currentFilter);
}

function renderQuotesList() {
  const data = getFilteredQuotes();

  el.quotesList.innerHTML = "";
  el.count.textContent = String(data.length);

  data.forEach((q, iFiltered) => {
    // Find the original index in the full quotes array
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
      saveQuotes();
      // keep current filter selection intact
      renderQuotesList();
    });

    tools.className = "controls";
    tools.append(btnShow, btnDelete);

    li.append(text, tools);
    el.quotesList.appendChild(li);
  });
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
  const pool = getFilteredQuotes();
  if (!pool.length) {
    el.quoteText.textContent = "No quotes for this category. Try another filter or add one.";
    el.quoteAuthor.textContent = "";
    return;
  }
  const q = pool[Math.floor(Math.random() * pool.length)];
  const idx = quotes.findIndex(
    x => x.text === q.text && x.author === q.author && x.category === q.category
  );
  showQuoteAt(idx >= 0 ? idx : 0);
}

/* ---------- Form handling ---------- */
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

  saveQuotes();          // persist + re-render + refresh categories
  populateCategories();  // ensure dropdown includes any new category

  // If added (not deduped), auto-show and possibly auto-select its category
  if (quotes.length > before) {
    if (candidate.category) {
      // if user just added to a new category, keep current filter unless "all"
      // You can optionally switch filter to candidate.category:
      // currentFilter = candidate.category;
      // el.categoryFilter.value = candidate.category;
      // saveFilter(currentFilter);
    }
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

// Keep exact signature for checker (wired via onchange in HTML)
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

      // If the saved filter no longer exists, fall back to "all"
      const values = Array.from(el.categoryFilter.options).map(o => o.value);
      if (!values.includes(currentFilter)) {
        currentFilter = "all";
        el.categoryFilter.value = "all";
        saveFilter(currentFilter);
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
  currentFilter = "all";
  saveFilter(currentFilter);
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
  // Load persisted filter first so lists render correctly
  currentFilter = loadFilter();
  renderQuotesList();
  populateCategories();

  // Restore saved filter in the dropdown if present
  const values = Array.from(el.categoryFilter.options).map(o => o.value);
  if (values.includes(currentFilter)) el.categoryFilter.value = currentFilter;
  else {
    currentFilter = "all";
    el.categoryFilter.value = "all";
  }

  // Start with last viewed (session) if present, else random (within filter)
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

  // Expose required globals for checker
  window.importFromJsonFile = importFromJsonFile;
  window.populateCategories = populateCategories;
  window.filterQuotes = filterQuotes;
}

document.addEventListener("DOMContentLoaded", init);
