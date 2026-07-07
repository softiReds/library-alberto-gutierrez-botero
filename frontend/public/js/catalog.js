// =====================================================================
// Catálogo — filtros dinámicos, búsqueda, orden, vistas y paginación
// =====================================================================

const CATALOG_URL = 'data/catalog.json';
const PAGE_SIZE = 10;

const FALLBACK_COVERS = [
  'assets/home/book-cover-1.png',
  'assets/home/book-cover-2.png',
  'assets/home/book-cover-3.png'
];

const FILTER_GROUPS = [
  { key: 'material_type', label: 'Tipo de material' },
  { key: 'target_audience', label: 'Público objetivo' },
  { key: 'location', label: 'Ubicación' },
  { key: 'status', label: 'Disponibilidad' }
];

let CATALOG = [];
let currentPage = 1;
let currentView = 'grid';
const activeFilters = {};
FILTER_GROUPS.forEach(g => { activeFilters[g.key] = new Set(); });

const gridEl = document.getElementById('catalogGrid');
const countEl = document.getElementById('resultsCount');
const paginationEl = document.getElementById('pagination');
const filterGroupsEl = document.getElementById('filterGroups');
const searchInput = document.getElementById('filterSearch');
const sortSelect = document.getElementById('sortSelect');
const bookModal = document.getElementById('bookModal');
const bookDetailEl = document.getElementById('bookDetail');

// ---------------------------------------------------------------------
// Portada de libro (misma lógica del home)
// ---------------------------------------------------------------------
function firstIsbn(book) {
  if (Array.isArray(book.isbn) && book.isbn.length) return book.isbn[0];
  if (typeof book.isbn === 'string') return book.isbn;
  return null;
}

function buildCoverWrap(book, index, imgClassName, wrapClassName) {
  const wrap = document.createElement('div');
  wrap.className = wrapClassName;

  const img = document.createElement('img');
  img.className = imgClassName;
  img.alt = `Portada de ${book.title}`;
  img.loading = 'lazy';

  const overlay = document.createElement('span');
  overlay.className = 'cover-fallback-title';
  overlay.textContent = book.title;

  function useFallback() {
    img.src = FALLBACK_COVERS[index % FALLBACK_COVERS.length];
    wrap.classList.add('cover-wrap--fallback');
  }

  const isbn = firstIsbn(book);

  if (isbn) {
    img.src = `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false`;
    img.onerror = () => { img.onerror = null; useFallback(); };
  } else {
    useFallback();
  }

  wrap.appendChild(img);
  wrap.appendChild(overlay);
  return wrap;
}

// ---------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function normalize(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// "Baja" se muestra al usuario como "Prestado"
function displayStatus(status) {
  const s = normalize(status);
  if (s.includes('baja')) return 'Prestado';
  return status || '';
}

function statusClass(status) {
  const s = normalize(status);
  // "Baja" visualmente se trata como "Prestado"
  if (s.includes('disponible') || s === 'normal') return 'status--disponible';
  if (s.includes('prestado') || s.includes('baja')) return 'status--prestado';
  return 'status--otro';
}

// ---------------------------------------------------------------------
// Carga del catálogo
// ---------------------------------------------------------------------
async function loadCatalog() {
  try {
    const res = await fetch(CATALOG_URL);
    if (!res.ok) throw new Error('No se pudo cargar catalog.json');
    CATALOG = await res.json();
  } catch (err) {
    console.error(err);
    CATALOG = [];
  }

  buildFilterGroups();
  update();
}

// ---------------------------------------------------------------------
// Filtros dinámicos
// ---------------------------------------------------------------------
function buildFilterGroups() {
  filterGroupsEl.innerHTML = '';

  FILTER_GROUPS.forEach(group => {
    const counts = new Map();
    CATALOG.forEach(book => {
      const value = book[group.key];
      if (!value) return;
      counts.set(value, (counts.get(value) || 0) + 1);
    });

    if (!counts.size) return;

    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);

    const groupEl = document.createElement('div');
    groupEl.className = 'filter-group';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'filter-group__toggle';
    toggle.innerHTML = `
      ${escapeHtml(group.label)}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m6 9 6 6 6-6"/></svg>
    `;
    toggle.addEventListener('click', () => groupEl.classList.toggle('is-collapsed'));

    const options = document.createElement('div');
    options.className = 'filter-options';

    sorted.forEach(([value, count]) => {
      const label = document.createElement('label');
      label.className = 'filter-option';

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = value;
      input.checked = activeFilters[group.key].has(value);
      input.addEventListener('change', () => {
        if (input.checked) activeFilters[group.key].add(value);
        else activeFilters[group.key].delete(value);
        currentPage = 1;
        update();
      });

      const displayValue = group.key === 'status' ? displayStatus(value) : value;

      const text = document.createElement('span');
      text.innerHTML = `${escapeHtml(displayValue)} <span class="count">(${count.toLocaleString('es-CO')})</span>`;

      label.appendChild(input);
      label.appendChild(text);
      options.appendChild(label);
    });

    groupEl.appendChild(toggle);
    groupEl.appendChild(options);
    filterGroupsEl.appendChild(groupEl);
  });
}

// ---------------------------------------------------------------------
// Filtrado, búsqueda y orden
// ---------------------------------------------------------------------
function getFilteredBooks() {
  const q = normalize(searchInput.value.trim());

  let books = CATALOG.filter(book => {
    for (const group of FILTER_GROUPS) {
      const selected = activeFilters[group.key];
      if (selected.size && !selected.has(book[group.key])) return false;
    }

    if (q) {
      const isbns = Array.isArray(book.isbn) ? book.isbn.join(' ') : (book.isbn || '');
      const haystack = normalize(`${book.title} ${book.author} ${book.subject} ${book.publisher} ${isbns} ${book.barcode || ''}`);
      if (!haystack.includes(q)) return false;
    }

    return true;
  });

  switch (sortSelect.value) {
    case 'title':
      books.sort((a, b) => normalize(a.title).localeCompare(normalize(b.title)));
      break;
    case 'author':
      books.sort((a, b) => normalize(a.author).localeCompare(normalize(b.author)));
      break;
    case 'newest':
      books.sort((a, b) => Number(b.publication_date || 0) - Number(a.publication_date || 0));
      break;
    case 'oldest':
      books.sort((a, b) => Number(a.publication_date || 9999) - Number(b.publication_date || 9999));
      break;
    case 'relevance':
    default:
      books.sort((a, b) => (b.featured === true) - (a.featured === true));
      break;
  }

  return books;
}

// ---------------------------------------------------------------------
// Render de tarjetas
// ---------------------------------------------------------------------
function renderBooks(books) {
  gridEl.innerHTML = '';
  gridEl.classList.toggle('is-list', currentView === 'list');

  if (!books.length) {
    gridEl.innerHTML = '<div class="catalog-empty">No encontramos resultados con los filtros actuales.<br>Prueba con otros términos o limpia los filtros.</div>';
    return;
  }

  const start = (currentPage - 1) * PAGE_SIZE;
  const pageBooks = books.slice(start, start + PAGE_SIZE);

  pageBooks.forEach((book, i) => {
    const card = document.createElement('article');
    card.className = 'book-card';
    card.setAttribute('tabindex', '0');
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `Ver detalle de ${book.title}`);

    const coverWrap = buildCoverWrap(book, start + i, 'book-card__cover', 'book-card__cover-wrap');

    const body = document.createElement('div');
    body.className = 'book-card__body';
    body.innerHTML = `
      <h3>${escapeHtml(book.title)}</h3>
      <span class="author">${escapeHtml(book.author || '')}</span>
      <span class="subject">${escapeHtml(book.subject || '')}</span>
    `;

    const meta = document.createElement('div');
    meta.className = 'book-card__meta';
    meta.innerHTML = `
      <span class="status ${statusClass(book.status)}">${escapeHtml(displayStatus(book.status))}</span>
      <span class="place">${escapeHtml(book.location || '')}</span>
    `;

    card.appendChild(coverWrap);
    card.appendChild(body);
    card.appendChild(meta);

    card.addEventListener('click', () => openBookModal(book));
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openBookModal(book);
      }
    });

    gridEl.appendChild(card);
    makeReveal(card, i % 5);
  });
}

// ---------------------------------------------------------------------
// Modal de detalle de libro
// ---------------------------------------------------------------------
function openBookModal(book) {
  bookDetailEl.innerHTML = '';

  const coverWrap = buildCoverWrap(book, 0, 'book-detail__cover', 'book-detail__cover-wrap');

  const info = document.createElement('div');
  info.className = 'book-detail__info';

  const isbns = Array.isArray(book.isbn) ? book.isbn.join(', ') : (book.isbn || '');

  const fields = [
    ['Autor', book.author],
    ['Clasificación', book.classification],
    ['Tema', book.subject],
    ['Tipo de material', book.material_type],
    ['Público objetivo', book.target_audience],
    ['Editorial', book.publisher],
    ['Año de publicación', book.publication_date],
    ['ISBN', isbns],
    ['Ubicación', book.location],
    ['Código de barras', book.barcode],
    ['Fecha de ingreso', book.created_at]
  ];

  const fieldsHtml = fields.map(([label, value]) => `
    <div class="book-detail__field">
      <dt>${escapeHtml(label)}</dt>
      <dd>${value !== null && value !== undefined && value !== '' ? escapeHtml(String(value)) : '—'}</dd>
    </div>
  `).join('');

  info.innerHTML = `
    <h3>${escapeHtml(book.title)}</h3>
    <span class="status ${statusClass(book.status)} book-detail__status">${escapeHtml(displayStatus(book.status))}</span>
    <dl class="book-detail__fields">
      ${fieldsHtml}
    </dl>
  `;

  bookDetailEl.appendChild(coverWrap);
  bookDetailEl.appendChild(info);

  bookModal.hidden = false;
}

function closeBookModal() {
  bookModal.hidden = true;
}

document.getElementById('bookModalClose').addEventListener('click', closeBookModal);
bookModal.addEventListener('click', e => { if (e.target === bookModal) closeBookModal(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !bookModal.hidden) closeBookModal();
});

// ---------------------------------------------------------------------
// Paginación
// ---------------------------------------------------------------------
function renderPagination(total) {
  paginationEl.innerHTML = '';
  const totalPages = Math.ceil(total / PAGE_SIZE);
  if (totalPages <= 1) return;

  function addBtn(label, page, { active = false, disabled = false, ariaLabel = null } = {}) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.innerHTML = label;
    if (active) btn.classList.add('active');
    btn.disabled = disabled;
    if (ariaLabel) btn.setAttribute('aria-label', ariaLabel);
    if (!disabled && !active) {
      btn.addEventListener('click', () => {
        currentPage = page;
        update();
        gridEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
    paginationEl.appendChild(btn);
  }

  function addEllipsis() {
    const span = document.createElement('span');
    span.className = 'ellipsis';
    span.textContent = '…';
    paginationEl.appendChild(span);
  }

  addBtn('&lsaquo;', currentPage - 1, { disabled: currentPage === 1, ariaLabel: 'Página anterior' });

  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  const sorted = [...pages].filter(p => p >= 1 && p <= totalPages).sort((a, b) => a - b);

  let prev = 0;
  sorted.forEach(p => {
    if (p - prev > 1) addEllipsis();
    addBtn(String(p), p, { active: p === currentPage });
    prev = p;
  });

  addBtn('&rsaquo;', currentPage + 1, { disabled: currentPage === totalPages, ariaLabel: 'Página siguiente' });
}

// ---------------------------------------------------------------------
// Actualización general
// ---------------------------------------------------------------------
function update() {
  const books = getFilteredBooks();
  countEl.textContent = books.length.toLocaleString('es-CO');

  const totalPages = Math.max(1, Math.ceil(books.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;

  renderBooks(books);
  renderPagination(books.length);
}

// ---------------------------------------------------------------------
// Controles
// ---------------------------------------------------------------------
searchInput.addEventListener('input', () => {
  currentPage = 1;
  update();
});

sortSelect.addEventListener('change', () => {
  currentPage = 1;
  update();
});

document.getElementById('clearFilters').addEventListener('click', () => {
  FILTER_GROUPS.forEach(g => activeFilters[g.key].clear());
  searchInput.value = '';
  sortSelect.value = 'relevance';
  currentPage = 1;
  filterGroupsEl.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = false; });
  update();
});

document.getElementById('viewGrid').addEventListener('click', () => setView('grid'));
document.getElementById('viewList').addEventListener('click', () => setView('list'));

function setView(view) {
  currentView = view;
  document.getElementById('viewGrid').classList.toggle('active', view === 'grid');
  document.getElementById('viewList').classList.toggle('active', view === 'list');
  update();
}

document.getElementById('navSearchToggle').addEventListener('click', () => {
  searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
  searchInput.focus({ preventScroll: true });
});

// ---------------------------------------------------------------------
// Botón flotante de sugerencias
// ---------------------------------------------------------------------
const fab = document.getElementById('suggestionFab');
const modal = document.getElementById('suggestionModal');
const modalClose = document.getElementById('suggestionClose');
const suggestionForm = document.getElementById('suggestionForm');

fab.addEventListener('click', () => { modal.hidden = false; });
modalClose.addEventListener('click', () => { modal.hidden = true; });
modal.addEventListener('click', e => { if (e.target === modal) modal.hidden = true; });

suggestionForm.addEventListener('submit', e => {
  e.preventDefault();
  alert('¡Gracias por tu sugerencia! La tendremos en cuenta.');
  suggestionForm.reset();
  modal.hidden = true;
});

// ---------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------
initStaticReveals();
loadCatalog();