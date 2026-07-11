// =====================================================================
// Catálogo — búsqueda, orden, vistas y paginación (contra la API real)
// =====================================================================

const API_BASE_URL = (window.LIBRARY_API && window.LIBRARY_API.baseUrl) || '';
const BOOKS_URL = `${API_BASE_URL}/books`;
const SEARCH_DEBOUNCE_MS = 350;
let currentPageSize = 10;

const FALLBACK_COVERS = [
  'assets/home/book-cover-1.png',
  'assets/home/book-cover-2.png',
  'assets/home/book-cover-3.png'
];

let currentPage = 1;
let currentTotal = 0;
let currentView = 'grid';
let currentSort = 'relevance';
let loadRequestId = 0;

const gridEl = document.getElementById('catalogGrid');
const countEl = document.getElementById('resultsCount');
const paginationEl = document.getElementById('pagination');
const filterGroupsEl = document.getElementById('filterGroups');
const searchInput = document.getElementById('filterSearch');
const sortSelect = document.getElementById('sortSelect');
const pageSizeSelect = document.getElementById('pageSizeSelect');
const bookModal = document.getElementById('bookModal');
const bookDetailEl = document.getElementById('bookDetail');

// ---------------------------------------------------------------------
// Filtros por faceta — mismos valores usados al crear libros desde el
// panel de gestión (frontend/admin/js/catalog.js), para que el filtro
// siempre coincida con lo que hay realmente en los datos.
// GET /books soporta un valor exacto por faceta (no selección múltiple).
// ---------------------------------------------------------------------
const FILTER_FACETS = [
  { key: 'target_audience', label: 'Público objetivo', options: ['Adolescente', 'Adulto', 'Especializada', 'General', 'Infantil', 'Juvenil', 'Preadolescente', 'Preescolar', 'Primaria'] },
  { key: 'material_type', label: 'Tipo de material', options: ['CD', 'DVD', 'Folletos', 'Libro General', 'Libro Infantil', 'Libro Juvenil', 'Referencia'] },
  { key: 'location', label: 'Ubicación', options: ['General', 'Infantil', 'No disponible', 'Videoteca'] },
  { key: 'status', label: 'Disponibilidad', options: ['Disponible', 'Prestado'] }
];

const activeFacets = {};

function buildFilterGroups() {
  if (!filterGroupsEl) return;

  filterGroupsEl.innerHTML = FILTER_FACETS.map(facet => `
    <div class="filter-group">
      <span class="filter-group__label">${facet.label}</span>
      <select class="filter-facet-select" data-key="${facet.key}">
        <option value="">Todos</option>
        ${facet.options.map(opt => `<option value="${opt}">${opt}</option>`).join('')}
      </select>
    </div>
  `).join('');

  filterGroupsEl.querySelectorAll('.filter-facet-select').forEach(sel => {
    sel.addEventListener('change', () => {
      activeFacets[sel.dataset.key] = sel.value;
      currentPage = 1;
      loadCatalog();
    });
  });
}

function resetFilterGroups() {
  FILTER_FACETS.forEach(facet => { activeFacets[facet.key] = ''; });
  if (filterGroupsEl) {
    filterGroupsEl.querySelectorAll('.filter-facet-select').forEach(sel => { sel.value = ''; });
  }
}

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
// Orden (aplicado solo sobre la página actual — el backend siempre
// devuelve ordenado por título)
// ---------------------------------------------------------------------
function applySort(books) {
  const sorted = [...books];
  switch (currentSort) {
    case 'title':
      sorted.sort((a, b) => normalize(a.title).localeCompare(normalize(b.title)));
      break;
    case 'author':
      sorted.sort((a, b) => normalize(a.author).localeCompare(normalize(b.author)));
      break;
    case 'newest':
      sorted.sort((a, b) => String(b.publication_date || '').localeCompare(String(a.publication_date || '')));
      break;
    case 'oldest':
      sorted.sort((a, b) => String(a.publication_date || '9999').localeCompare(String(b.publication_date || '9999')));
      break;
    case 'relevance':
    default:
      sorted.sort((a, b) => (b.featured === true) - (a.featured === true));
      break;
  }
  return sorted;
}

// ---------------------------------------------------------------------
// Carga de una página del catálogo
// ---------------------------------------------------------------------
async function loadCatalog() {
  const requestId = ++loadRequestId;
  const q = searchInput.value.trim();

  gridEl.innerHTML = '<div class="catalog-empty">Cargando catálogo…</div>';
  paginationEl.innerHTML = '';

  const params = new URLSearchParams({
    page: String(currentPage),
    page_size: String(currentPageSize)
  });
  if (q) params.set('search', q);
  FILTER_FACETS.forEach(facet => {
    if (activeFacets[facet.key]) params.set(facet.key, activeFacets[facet.key]);
  });

  try {
    const res = await fetch(`${BOOKS_URL}?${params.toString()}`);
    if (!res.ok) throw new Error(`El servidor respondió con el código ${res.status}.`);
    const data = await res.json();

    // Si el usuario ya disparó otra carga (nueva búsqueda/página), esta
    // respuesta llegó tarde — no la pintamos para no pisar la vigente.
    if (requestId !== loadRequestId) return;

    const books = applySort(data.data || []);
    currentTotal = data.total || 0;
    countEl.textContent = currentTotal.toLocaleString('es-CO');

    renderBooks(books);
    renderPagination();
  } catch (err) {
    if (requestId !== loadRequestId) return;
    console.error('Error cargando el catálogo.', err);
    countEl.textContent = '0';
    gridEl.innerHTML = '<div class="catalog-empty">No pudimos cargar el catálogo. Intenta de nuevo en un momento.</div>';
  }
}

// ---------------------------------------------------------------------
// Render de tarjetas
// ---------------------------------------------------------------------
function renderBooks(books) {
  gridEl.innerHTML = '';
  gridEl.classList.toggle('is-list', currentView === 'list');

  if (!books.length) {
    gridEl.innerHTML = '<div class="catalog-empty">No encontramos resultados con los filtros actuales.<br>Prueba con otros términos o limpia la búsqueda.</div>';
    return;
  }

  books.forEach((book, i) => {
    const card = document.createElement('article');
    card.className = 'book-card';
    card.setAttribute('tabindex', '0');
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `Ver detalle de ${book.title}`);

    const coverWrap = buildCoverWrap(book, i, 'book-card__cover', 'book-card__cover-wrap');

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

    card.addEventListener('click', () => openBookModal(book.id));
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openBookModal(book.id);
      }
    });

    gridEl.appendChild(card);
    makeReveal(card, i % 5);
  });
}

// ---------------------------------------------------------------------
// Modal de detalle de libro — GET /books/{id}, no el JSON ya cargado
// ---------------------------------------------------------------------
async function openBookModal(id) {
  bookModal.hidden = false;
  bookDetailEl.innerHTML = '<p class="book-detail__loading">Cargando…</p>';

  try {
    const res = await fetch(`${BOOKS_URL}/${encodeURIComponent(id)}`);
    if (res.status === 404) throw new Error('Este libro ya no está disponible en el catálogo.');
    if (!res.ok) throw new Error(`El servidor respondió con el código ${res.status}.`);
    const book = await res.json();
    renderBookDetail(book);
  } catch (err) {
    console.error('Error cargando el detalle del libro.', err);
    bookDetailEl.innerHTML = `<p class="book-detail__error">No pudimos cargar el detalle de este libro. ${escapeHtml(err.message || '')}</p>`;
  }
}

function renderBookDetail(book) {
  bookDetailEl.innerHTML = '';

  const coverWrap = buildCoverWrap(book, 0, 'book-detail__cover', 'book-detail__cover-wrap');

  const info = document.createElement('div');
  info.className = 'book-detail__info';

  // barcode/created_at son datos de gestión interna — GET /books/{id}
  // público (BookPublicDto) nunca los expone, así que no se muestran acá.
  const fields = [
    ['Autor', book.author],
    ['Clasificación', book.classification],
    ['Tema', book.subject],
    ['Tipo de material', book.material_type],
    ['Público objetivo', book.target_audience],
    ['Editorial', book.publisher],
    ['Año de publicación', book.publication_date],
    ['ISBN', book.isbn],
    ['Ubicación', book.location]
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
// Paginación (server-side: cada página es un fetch nuevo)
// ---------------------------------------------------------------------
function renderPagination() {
  paginationEl.innerHTML = '';
  const totalPages = Math.ceil(currentTotal / currentPageSize);
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
        loadCatalog();
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
// Controles
// ---------------------------------------------------------------------
let searchDebounceTimer = null;
searchInput.addEventListener('input', () => {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    currentPage = 1;
    loadCatalog();
  }, SEARCH_DEBOUNCE_MS);
});

sortSelect.addEventListener('change', () => {
  currentSort = sortSelect.value;
  loadCatalog();
});

pageSizeSelect.addEventListener('change', () => {
  currentPageSize = Number(pageSizeSelect.value);
  currentPage = 1;
  loadCatalog();
});

document.getElementById('clearFilters').addEventListener('click', () => {
  searchInput.value = '';
  sortSelect.value = 'relevance';
  currentSort = 'relevance';
  currentPage = 1;
  resetFilterGroups();
  loadCatalog();
});

document.getElementById('viewGrid').addEventListener('click', () => setView('grid'));
document.getElementById('viewList').addEventListener('click', () => setView('list'));

function setView(view) {
  currentView = view;
  document.getElementById('viewGrid').classList.toggle('active', view === 'grid');
  document.getElementById('viewList').classList.toggle('active', view === 'list');
  gridEl.classList.toggle('is-list', currentView === 'list');
}

document.getElementById('navSearchToggle').addEventListener('click', () => {
  searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
  searchInput.focus({ preventScroll: true });
});

// ---------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------
initStaticReveals();
buildFilterGroups();
loadCatalog();
