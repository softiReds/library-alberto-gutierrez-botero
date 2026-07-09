// =====================================================================
// Catálogo (Admin) — filtros, búsqueda, orden, paginación y CRUD real
// contra GET/POST/PUT /books y PATCH /books/:id/retire, vía apiFetch.
// =====================================================================

const token = window.BAGBAuth && window.BAGBAuth.getToken();
if (!token) {
  window.location.replace('index.html');
}

const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 350;

const FALLBACK_COVERS = [
  'assets/catalog/book-cover-1.png',
  'assets/catalog/book-cover-2.png',
  'assets/catalog/book-cover-3.png'
];

const STATUS_LABELS = {
  disponible: 'Disponible',
  prestado: 'Prestado',
  consulta_en_sala: 'Consulta en sala',
  perdido: 'Perdido',
  baja: 'Dado de baja'
};

let CATALOG = [];        // solo los libros de la página actual
let currentPage = 1;
let currentTotal = 0;
let currentSort = 'recent';
let loadRequestId = 0;
let searchDebounceTimer = null;

let editingId = null;      // id del libro en edición (null = creando uno nuevo)
let pendingRetireId = null;

// ---------------------------------------------------------------------
// Referencias DOM
// ---------------------------------------------------------------------
const gridEl = document.getElementById('catalogGrid');
const countEl = document.getElementById('resultsCount');
const rangeEl = document.getElementById('resultsRange');
const paginationEl = document.getElementById('pagination');
const filterGroupsEl = document.getElementById('filterGroups');
const filterPanelEl = document.getElementById('filterPanel');
const filterToggleBtn = document.getElementById('filterToggle');
const filterCountBadge = document.getElementById('filterCount');
const searchInput = document.getElementById('filterSearch');
const sortSelect = document.getElementById('sortSelect');
const statTotalEl = document.getElementById('statTotal');

const bookModal = document.getElementById('bookModal');
const bookDetailEl = document.getElementById('bookDetail');

const formModal = document.getElementById('formModal');
const bookForm = document.getElementById('bookForm');
const formTitleEl = document.getElementById('formTitle');
const formSubmitBtn = document.getElementById('formSubmit');
const formErrorEl = document.getElementById('formError');

const deleteModal = document.getElementById('deleteModal');
const deleteBookNameEl = document.getElementById('deleteBookName');
const retireErrorEl = document.getElementById('retireError');
const deleteConfirmBtn = document.getElementById('deleteConfirm');

// ---------------------------------------------------------------------
// API — GET/POST/PUT /books y PATCH /books/:id/retire vía apiFetch
// (agrega el token y parsea los errores automáticamente)
// ---------------------------------------------------------------------
const api = {
  async list({ search, page, pageSize }) {
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(pageSize),
      // El panel admin necesita ver también los libros dados de baja,
      // a diferencia del catálogo público — el backend solo honra este
      // flag si la petición trae un JWT válido.
      include_retired: 'true'
    });
    if (search) params.set('search', search);
    return window.BAGBApi.apiFetch(`/books?${params.toString()}`);
  },
  async create(payload) {
    return window.BAGBApi.apiFetch('/books', { method: 'POST', body: payload });
  },
  async update(id, payload) {
    return window.BAGBApi.apiFetch(`/books/${id}`, { method: 'PUT', body: payload });
  },
  async retire(id) {
    return window.BAGBApi.apiFetch(`/books/${id}/retire`, { method: 'PATCH' });
  }
};

// ---------------------------------------------------------------------
// Portada de libro (misma lógica que el catálogo público: Open Library
// por ISBN, con imagen de respaldo local y título centrado si falla)
// ---------------------------------------------------------------------
function firstIsbn(book) {
  return book.isbn || null;
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
  div.textContent = str ?? '';
  return div.innerHTML;
}

function normalize(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function displayStatus(status) {
  return STATUS_LABELS[status] || status || '';
}

function statusClass(status) {
  if (status === 'disponible') return 'status--disponible';
  if (status === 'prestado' || status === 'baja') return 'status--prestado';
  return 'status--otro';
}

function yearFromDate(isoDate) {
  return isoDate ? Number(isoDate.slice(0, 4)) : null;
}

// ---------------------------------------------------------------------
// Carga del catálogo — servidor pagina y busca, el sort se aplica acá
// solo sobre la página ya cargada (GET /books no soporta un query
// param de orden).
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
    case 'year_desc':
      sorted.sort((a, b) => (yearFromDate(b.publication_date) || 0) - (yearFromDate(a.publication_date) || 0));
      break;
    case 'year_asc':
      sorted.sort((a, b) => (yearFromDate(a.publication_date) || 9999) - (yearFromDate(b.publication_date) || 9999));
      break;
    case 'recent':
    default:
      sorted.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
      break;
  }
  return sorted;
}

async function loadCatalog() {
  const requestId = ++loadRequestId;
  gridEl.innerHTML = '<div class="catalog-empty">Cargando catálogo…</div>';
  paginationEl.innerHTML = '';

  let data;
  try {
    data = await api.list({
      search: searchInput.value.trim(),
      page: currentPage,
      pageSize: PAGE_SIZE
    });
  } catch (err) {
    if (requestId !== loadRequestId) return;
    console.error('No se pudo cargar el catálogo.', err);
    gridEl.innerHTML = `<div class="catalog-empty">No se pudo cargar el catálogo: ${escapeHtml(err.message)}</div>`;
    countEl.textContent = '0';
    rangeEl.textContent = 'Sin resultados';
    return;
  }

  if (requestId !== loadRequestId) return; // respuesta obsoleta, se descarta

  CATALOG = data.data;
  currentTotal = data.total;

  buildDatalists();
  renderBooks(applySort(CATALOG));
  renderPagination();
  updateFilterBadge();

  statTotalEl.textContent = currentTotal.toLocaleString('es-CO');
  countEl.textContent = currentTotal.toLocaleString('es-CO');

  if (currentTotal) {
    const start = (currentPage - 1) * PAGE_SIZE + 1;
    const end = Math.min(currentPage * PAGE_SIZE, currentTotal);
    rangeEl.textContent = `Mostrando ${start} – ${end} de ${currentTotal.toLocaleString('es-CO')} libros`;
  } else {
    rangeEl.textContent = 'Sin resultados';
  }
}

// ---------------------------------------------------------------------
// Filtros por categoría — el backend de gestión solo soporta buscar por
// título/autor y traer o no los dados de baja (include_retired), así
// que los filtros por tipo de material / público / ubicación /
// disponibilidad no están disponibles todavía (requerirían traer todo
// el catálogo de una vez, lo que anula la paginación del servidor).
// ---------------------------------------------------------------------
function buildFilterGroups() {
  filterGroupsEl.innerHTML = '<p class="filters-empty">Los filtros por categoría no están disponibles todavía.</p>';
}

function updateFilterBadge() {
  filterCountBadge.hidden = true;
  filterCountBadge.textContent = '0';
}

// ---------------------------------------------------------------------
// Listas para los <datalist> del formulario. Solo se derivan de la
// página actualmente cargada (el backend no expone un endpoint de
// valores distintos), así que son sugerencias de mejor esfuerzo, no
// el listado completo de categorías usadas en todo el catálogo.
// ---------------------------------------------------------------------
function buildDatalists() {
  const distinct = key => [...new Set(CATALOG.map(b => b[key]).filter(Boolean))].sort();

  fillDatalist('materialTypeOptions', distinct('material_type'));
  fillDatalist('audienceOptions', distinct('target_audience'));
  fillDatalist('locationOptions', distinct('location'));
}

function fillDatalist(id, values) {
  const el = document.getElementById(id);
  el.innerHTML = values.map(v => `<option value="${escapeHtml(v)}"></option>`).join('');
}

// ---------------------------------------------------------------------
// Render de tarjetas
// ---------------------------------------------------------------------
function renderBooks(books) {
  gridEl.innerHTML = '';

  if (!books.length) {
    gridEl.innerHTML = '<div class="catalog-empty">No encontramos libros con los filtros actuales.<br>Prueba con otros términos o limpia la búsqueda.</div>';
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
      <span class="status ${statusClass(book.status)}">${escapeHtml(displayStatus(book.status))}</span>
    `;

    const actions = document.createElement('div');
    actions.className = 'book-card__actions';
    actions.innerHTML = `
      <button type="button" class="icon-action" data-action="edit" aria-label="Editar ${escapeHtml(book.title)}">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
      </button>
      <button type="button" class="icon-action icon-action--danger" data-action="retire" aria-label="Dar de baja ${escapeHtml(book.title)}">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
      </button>
    `;
    actions.querySelector('[data-action="edit"]').addEventListener('click', e => {
      e.stopPropagation();
      openFormModal(book);
    });
    actions.querySelector('[data-action="retire"]').addEventListener('click', e => {
      e.stopPropagation();
      openDeleteModal(book);
    });

    card.appendChild(coverWrap);
    card.appendChild(body);
    card.appendChild(actions);

    card.addEventListener('click', () => openBookModal(book));
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openBookModal(book);
      }
    });

    gridEl.appendChild(card);
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

  const fields = [
    ['Autor', book.author],
    ['Clasificación', book.classification],
    ['Tema', book.subject],
    ['Tipo de material', book.material_type],
    ['Público objetivo', book.target_audience],
    ['Editorial', book.publisher],
    ['Año de publicación', yearFromDate(book.publication_date)],
    ['ISBN', book.isbn],
    ['Ubicación', book.location],
    ['Código de barras', book.barcode],
    ['Fecha de ingreso', book.created_at ? book.created_at.slice(0, 10) : null]
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
    <div class="book-detail__actions">
      <button type="button" class="btn btn--outline" id="bookDetailEdit">Editar libro</button>
      <button type="button" class="btn btn--danger" id="bookDetailRetire">Dar de baja</button>
    </div>
  `;

  bookDetailEl.appendChild(coverWrap);
  bookDetailEl.appendChild(info);

  info.querySelector('#bookDetailEdit').addEventListener('click', () => {
    closeBookModal();
    openFormModal(book);
  });
  info.querySelector('#bookDetailRetire').addEventListener('click', () => {
    closeBookModal();
    openDeleteModal(book);
  });

  bookModal.hidden = false;
}

function closeBookModal() {
  bookModal.hidden = true;
}

document.getElementById('bookModalClose').addEventListener('click', closeBookModal);
bookModal.addEventListener('click', e => { if (e.target === bookModal) closeBookModal(); });

// ---------------------------------------------------------------------
// Modal de formulario (agregar / editar)
// ---------------------------------------------------------------------
function hideFormError() {
  formErrorEl.hidden = true;
  formErrorEl.textContent = '';
}

function showFormError(message) {
  formErrorEl.textContent = message;
  formErrorEl.hidden = false;
}

function openFormModal(book) {
  buildDatalists();
  bookForm.reset();
  hideFormError();
  document.getElementById('bookStatus').value = 'disponible';

  if (book) {
    editingId = book.id;
    formTitleEl.textContent = 'Editar libro';
    formSubmitBtn.textContent = 'Guardar cambios';

    document.getElementById('bookTitle').value = book.title || '';
    document.getElementById('bookAuthor').value = book.author || '';
    document.getElementById('bookClassification').value = book.classification || '';
    document.getElementById('bookSubject').value = book.subject || '';
    document.getElementById('bookMaterialType').value = book.material_type || '';
    document.getElementById('bookAudience').value = book.target_audience || '';
    document.getElementById('bookPublisher').value = book.publisher || '';
    document.getElementById('bookYear').value = yearFromDate(book.publication_date) || '';
    document.getElementById('bookIsbn').value = book.isbn || '';
    document.getElementById('bookLocation').value = book.location || '';
    document.getElementById('bookBarcode').value = book.barcode || '';
    document.getElementById('bookStatus').value = book.status || 'disponible';
    document.getElementById('bookFeatured').checked = !!book.featured;
    document.getElementById('bookCreatedAt').value = book.created_at ? book.created_at.slice(0, 10) : '';
    document.getElementById('bookCreatedAt').disabled = true;
  } else {
    editingId = null;
    formTitleEl.textContent = 'Agregar libro';
    formSubmitBtn.textContent = 'Guardar libro';
    document.getElementById('bookCreatedAt').value = '';
    document.getElementById('bookCreatedAt').placeholder = 'Se asigna automáticamente al guardar';
    document.getElementById('bookCreatedAt').disabled = true;
  }

  formModal.hidden = false;
  document.getElementById('bookTitle').focus();
}

function closeFormModal() {
  formModal.hidden = true;
  editingId = null;
}

document.getElementById('addBookBtn').addEventListener('click', () => openFormModal(null));
document.getElementById('formModalClose').addEventListener('click', closeFormModal);
document.getElementById('formCancel').addEventListener('click', closeFormModal);
formModal.addEventListener('click', e => { if (e.target === formModal) closeFormModal(); });

bookForm.addEventListener('submit', async e => {
  e.preventDefault();
  hideFormError();

  const barcode = document.getElementById('bookBarcode').value.trim();
  const title = document.getElementById('bookTitle').value.trim();
  const author = document.getElementById('bookAuthor').value.trim();

  if (!barcode || !title || !author) {
    showFormError('Título, autor y código de barras son obligatorios.');
    return;
  }

  const yearRaw = document.getElementById('bookYear').value.trim();

  const payload = {
    barcode,
    title,
    author,
    classification: document.getElementById('bookClassification').value.trim() || null,
    subject: document.getElementById('bookSubject').value.trim() || null,
    material_type: document.getElementById('bookMaterialType').value.trim() || null,
    target_audience: document.getElementById('bookAudience').value.trim() || null,
    publisher: document.getElementById('bookPublisher').value.trim() || null,
    publication_date: yearRaw ? `${yearRaw}-01-01` : null,
    isbn: document.getElementById('bookIsbn').value.trim() || null,
    location: document.getElementById('bookLocation').value.trim() || null,
    status: document.getElementById('bookStatus').value,
    featured: document.getElementById('bookFeatured').checked
  };

  formSubmitBtn.disabled = true;
  try {
    if (editingId) {
      await api.update(editingId, payload);
    } else {
      await api.create(payload);
    }
    closeFormModal();
    await loadCatalog();
  } catch (err) {
    showFormError(err.message);
  } finally {
    formSubmitBtn.disabled = false;
  }
});

// ---------------------------------------------------------------------
// Modal de confirmación de baja (PATCH /books/:id/retire — el backend
// NO expone un DELETE físico, así que este modal nunca borra el
// registro, solo lo marca como "baja")
// ---------------------------------------------------------------------
function hideRetireError() {
  retireErrorEl.hidden = true;
  retireErrorEl.textContent = '';
}

function showRetireError(message) {
  retireErrorEl.textContent = message;
  retireErrorEl.hidden = false;
}

function openDeleteModal(book) {
  pendingRetireId = book.id;
  deleteBookNameEl.textContent = book.title;
  hideRetireError();
  deleteModal.hidden = false;
}

function closeDeleteModal() {
  deleteModal.hidden = true;
  pendingRetireId = null;
}

document.getElementById('deleteModalClose').addEventListener('click', closeDeleteModal);
document.getElementById('deleteCancel').addEventListener('click', closeDeleteModal);
deleteModal.addEventListener('click', e => { if (e.target === deleteModal) closeDeleteModal(); });

deleteConfirmBtn.addEventListener('click', async () => {
  if (!pendingRetireId) return;
  hideRetireError();
  deleteConfirmBtn.disabled = true;
  try {
    await api.retire(pendingRetireId);
    closeDeleteModal();
    await loadCatalog();
  } catch (err) {
    // Ej. "No se puede dar de baja un libro que está actualmente
    // prestado. Debe registrarse la devolución primero." — se muestra
    // tal cual la manda el backend, sin genericizarla.
    showRetireError(err.message);
  } finally {
    deleteConfirmBtn.disabled = false;
  }
});

// ---------------------------------------------------------------------
// Cerrar sesión (botón del sidebar)
// ---------------------------------------------------------------------
document.getElementById('logoutBtn').addEventListener('click', () => {
  window.BAGBAuth.logout();
});

// ---------------------------------------------------------------------
// Cerrar modales con Escape
// ---------------------------------------------------------------------
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!deleteModal.hidden) closeDeleteModal();
  else if (!formModal.hidden) closeFormModal();
  else if (!bookModal.hidden) closeBookModal();
});

// ---------------------------------------------------------------------
// Panel de filtros (desplegable, hoy solo muestra el aviso de "no
// disponible" — ver buildFilterGroups)
// ---------------------------------------------------------------------
filterToggleBtn.addEventListener('click', () => {
  const isHidden = filterPanelEl.hidden;
  filterPanelEl.hidden = !isHidden;
  filterToggleBtn.classList.toggle('is-active', isHidden);
});

document.getElementById('clearFilters').addEventListener('click', () => {
  searchInput.value = '';
  sortSelect.value = 'recent';
  currentSort = 'recent';
  currentPage = 1;
  loadCatalog();
});

// ---------------------------------------------------------------------
// Paginación (cada página dispara un fetch nuevo al servidor)
// ---------------------------------------------------------------------
function renderPagination() {
  paginationEl.innerHTML = '';
  const totalPages = Math.ceil(currentTotal / PAGE_SIZE);
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
searchInput.addEventListener('input', () => {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    currentPage = 1;
    loadCatalog();
  }, SEARCH_DEBOUNCE_MS);
});

sortSelect.addEventListener('change', () => {
  currentSort = sortSelect.value;
  renderBooks(applySort(CATALOG));
});

// ---------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------
buildFilterGroups();
loadCatalog();
