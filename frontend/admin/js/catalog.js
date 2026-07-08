// =====================================================================
// Catálogo (Admin) — filtros, búsqueda, orden, paginación y CRUD en memoria
//
// Los libros se cargan una sola vez desde admin/data/catalog.json.
// Agregar / editar / eliminar modifica únicamente el arreglo CATALOG en
// memoria: los cambios se reflejan al instante en la UI pero se pierden
// al recargar la página. Las funciones del objeto `api` (más abajo) son
// el único lugar que debe tocarse para conectar los endpoints reales
// (POST /books, PATCH /books/:id, DELETE /books/:id) más adelante.
// =====================================================================

const CATALOG_URL = 'data/catalog.json';
const PAGE_SIZE = 10;

const FALLBACK_COVERS = [
  'assets/catalog/book-cover-1.png',
  'assets/catalog/book-cover-2.png',
  'assets/catalog/book-cover-3.png'
];

const FILTER_GROUPS = [
  { key: 'material_type', label: 'Tipo de material' },
  { key: 'target_audience', label: 'Público objetivo' },
  { key: 'location', label: 'Ubicación' },
  { key: 'status', label: 'Disponibilidad' }
];

const STATUS_OPTIONS = [
  { value: 'Disponible', label: 'Disponible' },
  { value: 'Baja', label: 'Prestado' }
];

let CATALOG = [];
let currentPage = 1;
const activeFilters = {};
FILTER_GROUPS.forEach(g => { activeFilters[g.key] = new Set(); });

let editingId = null;   // __id del libro en edición (null = creando uno nuevo)
let pendingDeleteId = null;

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

const deleteModal = document.getElementById('deleteModal');
const deleteBookNameEl = document.getElementById('deleteBookName');

// ---------------------------------------------------------------------
// "API" — capa de datos en memoria
// Reemplazar el cuerpo de estas funciones por llamadas fetch() reales
// (POST/PUT/PATCH/DELETE a /books) sin tener que tocar el resto del
// archivo: el resto de la UI solo depende de estas cuatro funciones.
// ---------------------------------------------------------------------
const api = {
  async list() {
    // TODO: reemplazar por GET /books
    const res = await fetch(CATALOG_URL);
    if (!res.ok) throw new Error('No se pudo cargar catalog.json');
    const data = await res.json();
    return data.map((book, i) => ({ ...book, __id: book.barcode || `tmp-${i}` }));
  },
  async create(book) {
    // TODO: reemplazar por POST /books — usar el registro que devuelva el servidor
    const newBook = { ...book, __id: `tmp-${Date.now()}` };
    CATALOG = [newBook, ...CATALOG];
    return newBook;
  },
  async update(id, patch) {
    // TODO: reemplazar por PATCH /books/:id
    CATALOG = CATALOG.map(b => (b.__id === id ? { ...b, ...patch, __id: id } : b));
    return CATALOG.find(b => b.__id === id);
  },
  async remove(id) {
    // TODO: reemplazar por DELETE /books/:id
    CATALOG = CATALOG.filter(b => b.__id !== id);
  }
};

// ---------------------------------------------------------------------
// Portada de libro (misma lógica que el catálogo público: Open Library
// por ISBN, con imagen de respaldo local y título centrado si falla)
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
  div.textContent = str ?? '';
  return div.innerHTML;
}

function normalize(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// "Baja" se muestra a la coordinadora como "Prestado"
function displayStatus(status) {
  const s = normalize(status);
  if (s.includes('baja')) return 'Prestado';
  return status || '';
}

function statusClass(status) {
  const s = normalize(status);
  if (s.includes('disponible') || s === 'normal') return 'status--disponible';
  if (s.includes('prestado') || s.includes('baja')) return 'status--prestado';
  return 'status--otro';
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------
// Carga del catálogo
// ---------------------------------------------------------------------
async function loadCatalog() {
  try {
    CATALOG = await api.list();
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

function countActiveFilters() {
  return FILTER_GROUPS.reduce((sum, g) => sum + activeFilters[g.key].size, 0);
}

function updateFilterBadge() {
  const n = countActiveFilters();
  filterCountBadge.textContent = String(n);
  filterCountBadge.hidden = n === 0;
}

// ---------------------------------------------------------------------
// Listas para los <datalist> del formulario (valores ya usados en el
// catálogo, para que la coordinadora reutilice categorías existentes
// o escriba una nueva si lo necesita)
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
    case 'year_desc':
      books.sort((a, b) => Number(b.publication_date || 0) - Number(a.publication_date || 0));
      break;
    case 'year_asc':
      books.sort((a, b) => Number(a.publication_date || 9999) - Number(b.publication_date || 9999));
      break;
    case 'recent':
    default:
      books.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
      break;
  }

  return books;
}

// ---------------------------------------------------------------------
// Render de tarjetas
// ---------------------------------------------------------------------
function renderBooks(books) {
  gridEl.innerHTML = '';

  if (!books.length) {
    gridEl.innerHTML = '<div class="catalog-empty">No encontramos libros con los filtros actuales.<br>Prueba con otros términos o limpia los filtros.</div>';
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
      <span class="status ${statusClass(book.status)}">${escapeHtml(displayStatus(book.status))}</span>
    `;

    const actions = document.createElement('div');
    actions.className = 'book-card__actions';
    actions.innerHTML = `
      <button type="button" class="icon-action" data-action="edit" aria-label="Editar ${escapeHtml(book.title)}">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
      </button>
      <button type="button" class="icon-action icon-action--danger" data-action="delete" aria-label="Eliminar ${escapeHtml(book.title)}">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
      </button>
    `;
    actions.querySelector('[data-action="edit"]').addEventListener('click', e => {
      e.stopPropagation();
      openFormModal(book);
    });
    actions.querySelector('[data-action="delete"]').addEventListener('click', e => {
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
// Modal de detalle de libro (idéntico al del catálogo público)
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
    <div class="book-detail__actions">
      <button type="button" class="btn btn--outline" id="bookDetailEdit">Editar libro</button>
      <button type="button" class="btn btn--danger" id="bookDetailDelete">Eliminar libro</button>
    </div>
  `;

  bookDetailEl.appendChild(coverWrap);
  bookDetailEl.appendChild(info);

  info.querySelector('#bookDetailEdit').addEventListener('click', () => {
    closeBookModal();
    openFormModal(book);
  });
  info.querySelector('#bookDetailDelete').addEventListener('click', () => {
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
function openFormModal(book) {
  buildDatalists();
  bookForm.reset();
  document.getElementById('bookStatus').value = 'Disponible';

  if (book) {
    editingId = book.__id;
    formTitleEl.textContent = 'Editar libro';
    formSubmitBtn.textContent = 'Guardar cambios';

    document.getElementById('bookTitle').value = book.title || '';
    document.getElementById('bookAuthor').value = book.author || '';
    document.getElementById('bookClassification').value = book.classification || '';
    document.getElementById('bookSubject').value = book.subject || '';
    document.getElementById('bookMaterialType').value = book.material_type || '';
    document.getElementById('bookAudience').value = book.target_audience || '';
    document.getElementById('bookPublisher').value = book.publisher || '';
    document.getElementById('bookYear').value = book.publication_date || '';
    document.getElementById('bookIsbn').value = Array.isArray(book.isbn) ? book.isbn.join(', ') : (book.isbn || '');
    document.getElementById('bookLocation').value = book.location || '';
    document.getElementById('bookBarcode').value = book.barcode || '';
    document.getElementById('bookStatus').value = book.status || 'Disponible';
    document.getElementById('bookFeatured').checked = !!book.featured;
    document.getElementById('bookCreatedAt').value = book.created_at || todayISO();
    document.getElementById('bookCreatedAt').disabled = true;
  } else {
    editingId = null;
    formTitleEl.textContent = 'Agregar libro';
    formSubmitBtn.textContent = 'Guardar libro';
    document.getElementById('bookCreatedAt').value = todayISO();
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

  const isbnRaw = document.getElementById('bookIsbn').value.trim();
  const isbnList = isbnRaw ? isbnRaw.split(',').map(s => s.trim()).filter(Boolean) : [];

  const payload = {
    title: document.getElementById('bookTitle').value.trim(),
    author: document.getElementById('bookAuthor').value.trim(),
    classification: document.getElementById('bookClassification').value.trim(),
    subject: document.getElementById('bookSubject').value.trim(),
    material_type: document.getElementById('bookMaterialType').value.trim(),
    target_audience: document.getElementById('bookAudience').value.trim(),
    publisher: document.getElementById('bookPublisher').value.trim(),
    publication_date: document.getElementById('bookYear').value.trim(),
    isbn: isbnList,
    location: document.getElementById('bookLocation').value.trim(),
    barcode: document.getElementById('bookBarcode').value.trim(),
    status: document.getElementById('bookStatus').value,
    featured: document.getElementById('bookFeatured').checked,
    created_at: document.getElementById('bookCreatedAt').value || todayISO()
  };

  if (editingId) {
    await api.update(editingId, payload);
  } else {
    await api.create(payload);
  }

  closeFormModal();
  buildFilterGroups();
  update();
});

// ---------------------------------------------------------------------
// Modal de confirmación de eliminación
// ---------------------------------------------------------------------
function openDeleteModal(book) {
  pendingDeleteId = book.__id;
  deleteBookNameEl.textContent = book.title;
  deleteModal.hidden = false;
}

function closeDeleteModal() {
  deleteModal.hidden = true;
  pendingDeleteId = null;
}

document.getElementById('deleteModalClose').addEventListener('click', closeDeleteModal);
document.getElementById('deleteCancel').addEventListener('click', closeDeleteModal);
deleteModal.addEventListener('click', e => { if (e.target === deleteModal) closeDeleteModal(); });

document.getElementById('deleteConfirm').addEventListener('click', async () => {
  if (!pendingDeleteId) return;
  await api.remove(pendingDeleteId);
  closeDeleteModal();
  buildFilterGroups();
  update();
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
// Panel de filtros (desplegable)
// ---------------------------------------------------------------------
filterToggleBtn.addEventListener('click', () => {
  const isHidden = filterPanelEl.hidden;
  filterPanelEl.hidden = !isHidden;
  filterToggleBtn.classList.toggle('is-active', isHidden);
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

  const totalPages = Math.max(1, Math.ceil(books.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;

  renderBooks(books);
  renderPagination(books.length);
  updateFilterBadge();

  statTotalEl.textContent = CATALOG.length.toLocaleString('es-CO');
  countEl.textContent = books.length.toLocaleString('es-CO');

  if (books.length) {
    const start = (currentPage - 1) * PAGE_SIZE + 1;
    const end = Math.min(currentPage * PAGE_SIZE, books.length);
    rangeEl.textContent = `Mostrando ${start} – ${end} de ${books.length.toLocaleString('es-CO')} libros`;
  } else {
    rangeEl.textContent = 'Sin resultados';
  }
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
  sortSelect.value = 'recent';
  currentPage = 1;
  filterGroupsEl.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = false; });
  update();
});

// ---------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------
loadCatalog();