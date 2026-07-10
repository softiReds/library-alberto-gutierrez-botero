/* =====================================================================
   Panel Admin — Consultas en sala (js)
   GET/POST /in-house-readings, vía apiFetch.
   ===================================================================== */
(function () {
  'use strict';

  const token = window.BAGBAuth && window.BAGBAuth.getToken();
  if (!token) {
    window.location.replace('index.html');
    return;
  }

  let READINGS = [];       // solo las consultas de la página actual
  let currentPage = 1;
  let currentPageSize = 10;
  let currentTotal = 0;
  let currentSort = 'recent';
  let dateFrom = '';
  let dateTo = '';
  let loadRequestId = 0;

  /* ============ API — apiFetch agrega el token y parsea errores ============ */

  const api = {
    async list() {
      const params = new URLSearchParams({
        page: String(currentPage),
        page_size: String(currentPageSize)
      });
      if (dateFrom) params.set('from', dateFrom);
      if (dateTo) params.set('to', dateTo);
      return window.BAGBApi.apiFetch(`/in-house-readings?${params.toString()}`);
    },
    async statTotal(extra) {
      const params = new URLSearchParams({ page: '1', page_size: '1', ...extra });
      const data = await window.BAGBApi.apiFetch(`/in-house-readings?${params.toString()}`);
      return data.total;
    },
    async books() {
      return window.BAGBApi.apiFetch('/books?page=1&page_size=100');
    },
    async create(payload) {
      return window.BAGBApi.apiFetch('/in-house-readings', { method: 'POST', body: payload });
    }
  };

  /* ============ Utilidades ============ */

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  function formatDateEs(isoDate) {
    if (!isoDate) return '–';
    const [y, m, d] = isoDate.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function startOfWeekISO(date) {
    const d = new Date(date);
    const day = d.getDay(); // 0=domingo..6=sábado
    const diff = (day === 0 ? -6 : 1) - day;
    d.setDate(d.getDate() + diff);
    return d.toISOString().slice(0, 10);
  }

  function endOfWeekISO(date) {
    const start = new Date(startOfWeekISO(date));
    start.setDate(start.getDate() + 6);
    return start.toISOString().slice(0, 10);
  }

  function monthRangeISO(date) {
    const y = date.getFullYear();
    const m = date.getMonth();
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
  }

  function readingCode(reading) {
    return `CS-${reading.id.slice(0, 8).toUpperCase()}`;
  }

  function bookTitle(reading) {
    return (reading.book && reading.book.title) || reading.book_title_fallback || 'Libro no encontrado';
  }

  function bookAuthor(reading) {
    return (reading.book && reading.book.author) || '';
  }

  /* ============ Búsqueda de texto, filtro por libro y por tipo de
     material: el backend de gestión no los soporta todavía (GET
     /in-house-readings solo filtra por from/to), así que se
     deshabilitan en vez de simular un filtro que solo miraría la
     página ya cargada. ============ */
  function disableUnsupportedFilters() {
    const searchInput = document.getElementById('filterSearch');
    const bookSelect = document.getElementById('filterBook');
    const materialSelect = document.getElementById('filterMaterialType');

    searchInput.disabled = true;
    searchInput.placeholder = 'Búsqueda no disponible todavía';
    bookSelect.disabled = true;
    materialSelect.disabled = true;
  }

  /* ============ Estadísticas (reutilizan el total del envelope paginado) ============ */

  async function loadStats() {
    const now = new Date();
    const today = todayISO();
    const { from: monthFrom, to: monthTo } = monthRangeISO(now);

    const [countToday, countWeek, countMonth, total] = await Promise.all([
      api.statTotal({ from: today, to: today }).catch(() => null),
      api.statTotal({ from: startOfWeekISO(now), to: endOfWeekISO(now) }).catch(() => null),
      api.statTotal({ from: monthFrom, to: monthTo }).catch(() => null),
      api.statTotal({}).catch(() => null)
    ]);

    if (countToday !== null) document.getElementById('statToday').textContent = countToday.toLocaleString('es-CO');
    if (countWeek !== null) document.getElementById('statWeek').textContent = countWeek.toLocaleString('es-CO');
    if (countMonth !== null) document.getElementById('statMonth').textContent = countMonth.toLocaleString('es-CO');
    if (total !== null) document.getElementById('statTotal').textContent = total.toLocaleString('es-CO');
  }

  /* ============ Orden (solo sobre la página ya cargada — GET
     /in-house-readings no tiene un query param de orden, siempre
     viene por reading_date descendente) ============ */

  function applySort(readings) {
    const sorted = [...readings];
    if (currentSort === 'oldest') {
      sorted.sort((a, b) => a.reading_date.localeCompare(b.reading_date));
    }
    return sorted;
  }

  /* ============ Carga y render de la tabla ============ */

  async function loadReadings() {
    const requestId = ++loadRequestId;
    const tbody = document.getElementById('readingsTableBody');
    tbody.innerHTML = `<tr><td colspan="3" class="loans-table__empty">Cargando consultas…</td></tr>`;
    document.getElementById('pagination').innerHTML = '';

    let data;
    try {
      data = await api.list();
    } catch (err) {
      if (requestId !== loadRequestId) return;
      console.error('No se pudo cargar la lista de consultas.', err);
      tbody.innerHTML = `<tr><td colspan="3" class="loans-table__empty">No se pudo cargar la lista: ${escapeHtml(err.message)}</td></tr>`;
      document.getElementById('resultsRange').textContent = 'Sin resultados';
      return;
    }

    if (requestId !== loadRequestId) return; // respuesta obsoleta, se descarta

    READINGS = data.data;
    currentTotal = data.total;

    renderTable();
    renderPagination();
    renderRange();
  }

  function renderRange() {
    const rangeEl = document.getElementById('resultsRange');
    if (currentTotal === 0) {
      rangeEl.textContent = 'Mostrando 0 de 0 consultas';
      return;
    }
    const start = (currentPage - 1) * currentPageSize + 1;
    const end = Math.min(currentPage * currentPageSize, currentTotal);
    rangeEl.textContent = `Mostrando ${start} – ${end} de ${currentTotal.toLocaleString('es-CO')} consultas`;
  }

  function renderTable() {
    const tbody = document.getElementById('readingsTableBody');
    const readings = applySort(READINGS);

    if (!readings.length) {
      tbody.innerHTML = `<tr><td colspan="3" class="loans-table__empty">No se encontraron consultas con estos filtros.</td></tr>`;
      return;
    }

    tbody.innerHTML = readings.map(reading => `
      <tr data-id="${reading.id}">
        <td class="loans-table__id">${readingCode(reading)}</td>
        <td class="reading-book">
          <strong>${escapeHtml(bookTitle(reading))}</strong>
          ${bookAuthor(reading) ? `<span>${escapeHtml(bookAuthor(reading))}</span>` : ''}
        </td>
        <td>${formatDateEs(reading.reading_date)}</td>
      </tr>
    `).join('');
  }

  function renderPagination() {
    const nav = document.getElementById('pagination');
    nav.innerHTML = '';
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
          loadReadings();
        });
      }
      nav.appendChild(btn);
    }

    function addEllipsis() {
      const span = document.createElement('span');
      span.className = 'ellipsis';
      span.textContent = '…';
      nav.appendChild(span);
    }

    addBtn('‹', currentPage - 1, { disabled: currentPage === 1, ariaLabel: 'Anterior' });

    const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
    const sorted = [...pages].filter(p => p >= 1 && p <= totalPages).sort((a, b) => a - b);

    let prev = 0;
    sorted.forEach(p => {
      if (p - prev > 1) addEllipsis();
      addBtn(String(p), p, { active: p === currentPage });
      prev = p;
    });

    addBtn('›', currentPage + 1, { disabled: currentPage === totalPages, ariaLabel: 'Siguiente' });
  }

  /* ============ Filtros: eventos ============ */

  function initFilters() {
    const dateFromInput = document.getElementById('filterDateFrom');
    const dateToInput = document.getElementById('filterDateTo');
    const sortSelect = document.getElementById('sortSelect');
    const pageSizeSelect = document.getElementById('pageSizeSelect');
    const filterToggle = document.getElementById('filterToggle');
    const filterPanel = document.getElementById('filterPanel');
    const clearBtn = document.getElementById('clearFiltersBtn');

    dateFromInput.addEventListener('change', () => { dateFrom = dateFromInput.value; currentPage = 1; loadReadings(); });
    dateToInput.addEventListener('change', () => { dateTo = dateToInput.value; currentPage = 1; loadReadings(); });

    sortSelect.addEventListener('change', () => {
      currentSort = sortSelect.value;
      renderTable();
    });

    pageSizeSelect.addEventListener('change', () => {
      currentPageSize = Number(pageSizeSelect.value);
      currentPage = 1;
      loadReadings();
    });

    filterToggle.addEventListener('click', () => {
      const isHidden = filterPanel.hidden;
      filterPanel.hidden = !isHidden;
      filterToggle.classList.toggle('is-active', isHidden);
    });

    clearBtn.addEventListener('click', () => {
      dateFromInput.value = '';
      dateToInput.value = '';
      sortSelect.value = 'recent';
      dateFrom = '';
      dateTo = '';
      currentSort = 'recent';
      currentPage = 1;
      loadReadings();
    });
  }

  /* ============ Modal: nueva consulta (POST /in-house-readings) ============ */

  const readingBookSelect = document.getElementById('readingBook');
  const readingFallbackInput = document.getElementById('readingBookFallback');
  const readingFormError = document.getElementById('readingFormError');

  function hideFormError() {
    readingFormError.hidden = true;
    readingFormError.textContent = '';
  }

  function showFormError(message) {
    readingFormError.textContent = message;
    readingFormError.hidden = false;
  }

  async function populateReadingBookSelect() {
    readingBookSelect.innerHTML = '<option value="">Cargando catálogo…</option>';
    try {
      const data = await api.books();
      const books = [...data.data].sort((a, b) => a.title.localeCompare(b.title));
      readingBookSelect.innerHTML = '<option value="">— Sin registrar en catálogo —</option>' +
        books.map(b => `<option value="${b.id}">${escapeHtml(b.title)}${b.author ? ' — ' + escapeHtml(b.author) : ''}</option>`).join('');
    } catch (err) {
      readingBookSelect.innerHTML = '<option value="">No se pudo cargar el catálogo</option>';
    }
  }

  // Libro del catálogo y título de respaldo son mutuamente
  // excluyentes: elegir uno limpia y deshabilita el otro, para que
  // sea claro que basta con uno de los dos (el backend acepta
  // cualquiera, pero nunca ambos a la vez tiene sentido).
  function syncBookFields() {
    if (readingBookSelect.value) {
      readingFallbackInput.value = '';
      readingFallbackInput.disabled = true;
    } else {
      readingFallbackInput.disabled = false;
    }
  }

  function syncFallbackField() {
    if (readingFallbackInput.value.trim()) {
      readingBookSelect.value = '';
      readingBookSelect.disabled = true;
    } else {
      readingBookSelect.disabled = false;
    }
  }

  async function openReadingModal() {
    document.getElementById('readingForm').reset();
    hideFormError();
    readingBookSelect.disabled = false;
    readingFallbackInput.disabled = false;
    await populateReadingBookSelect();
    document.getElementById('readingModal').hidden = false;
  }

  function closeReadingModal() {
    document.getElementById('readingModal').hidden = true;
  }

  async function saveReadingForm(e) {
    e.preventDefault();
    hideFormError();

    const bookId = readingBookSelect.value;
    const fallbackTitle = readingFallbackInput.value.trim();
    const readingDate = document.getElementById('readingDate').value;

    if (!bookId && !fallbackTitle) {
      showFormError('Selecciona un libro del catálogo o escribe un título de respaldo.');
      return;
    }

    const payload = {};
    if (bookId) payload.book_id = bookId;
    else payload.book_title_fallback = fallbackTitle;
    // Si el campo de fecha se deja vacío, no se envía — el backend
    // pone la fecha de hoy por defecto.
    if (readingDate) payload.reading_date = readingDate;

    const submitBtn = document.getElementById('readingFormSubmit');
    submitBtn.disabled = true;
    try {
      await api.create(payload);
      closeReadingModal();
      await Promise.all([loadReadings(), loadStats()]);
    } catch (err) {
      // Ej. "El libro indicado no existe." (404 si book_id no existe)
      // se muestra tal cual la manda el backend.
      showFormError(err.message);
    } finally {
      submitBtn.disabled = false;
    }
  }

  /* ============ Modales: cierre genérico ============ */

  function initModalDismiss(modalEl, closeFn) {
    modalEl.addEventListener('click', (e) => { if (e.target === modalEl) closeFn(); });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const readingModal = document.getElementById('readingModal');
    if (!readingModal.hidden) closeReadingModal();
  });

  /* ============ Cerrar sesión ============ */

  document.getElementById('logoutBtn').addEventListener('click', () => {
    window.BAGBAuth.logout();
  });

  /* ============ Init ============ */

  async function init() {
    disableUnsupportedFilters();
    initFilters();

    document.getElementById('addReadingBtn').addEventListener('click', openReadingModal);
    document.getElementById('readingModalClose').addEventListener('click', closeReadingModal);
    document.getElementById('readingFormCancel').addEventListener('click', closeReadingModal);
    document.getElementById('readingForm').addEventListener('submit', saveReadingForm);
    initModalDismiss(document.getElementById('readingModal'), closeReadingModal);

    readingBookSelect.addEventListener('change', syncBookFields);
    readingFallbackInput.addEventListener('input', syncFallbackField);

    await Promise.all([loadReadings(), loadStats()]);
  }

  init();
})();
