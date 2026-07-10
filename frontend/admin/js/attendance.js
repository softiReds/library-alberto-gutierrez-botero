/* =====================================================================
   Panel Admin — Asistencia
   GET/POST /attendance, vía apiFetch.
   ===================================================================== */
(function () {
  'use strict';

  const token = window.BAGBAuth && window.BAGBAuth.getToken();
  if (!token) {
    window.location.replace('index.html');
    return;
  }

  const GENDER_OPTIONS = ['Femenino', 'Masculino', 'Otro'];

  let ATTENDANCE = [];     // solo las asistencias de la página actual
  let currentPage = 1;
  let currentPageSize = 10;
  let currentTotal = 0;
  let currentSort = 'recent';
  let dateFrom = '';
  let dateTo = '';
  let filterGender = '';
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
      if (filterGender) params.set('gender', filterGender);
      return window.BAGBApi.apiFetch(`/attendance?${params.toString()}`);
    },
    async statTotal(extra) {
      const params = new URLSearchParams({ page: '1', page_size: '1', ...extra });
      const data = await window.BAGBApi.apiFetch(`/attendance?${params.toString()}`);
      return data.total;
    },
    async create(payload) {
      return window.BAGBApi.apiFetch('/attendance', { method: 'POST', body: payload });
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

  function startOfMonthISO(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1).toISOString().slice(0, 10);
  }

  function genderTag(gender) {
    const norm = String(gender || '').toLowerCase();
    const cls = norm === 'femenino' ? 'gender-dot--femenino' : norm === 'masculino' ? 'gender-dot--masculino' : '';
    return `<span class="gender-dot ${cls}">${escapeHtml(gender || '–')}</span>`;
  }

  /* ============ Búsqueda de texto y rango de edad: el backend de
     gestión no los soporta todavía (GET /attendance solo filtra por
     from/to y gender), así que se deshabilitan en vez de simular un
     filtro que solo miraría la página ya cargada. ============ */
  function disableUnsupportedFilters() {
    const searchInput = document.getElementById('filterSearch');
    const ageRangeSelect = document.getElementById('filterAgeRange');
    searchInput.disabled = true;
    searchInput.placeholder = 'Búsqueda no disponible todavía';
    ageRangeSelect.disabled = true;
  }

  function populateGenderFilter() {
    const genderSelect = document.getElementById('filterGender');
    genderSelect.innerHTML = '<option value="">Todos</option>' +
      GENDER_OPTIONS.map(g => `<option value="${g}">${g}</option>`).join('');
  }

  /* ============ Estadísticas (reutilizan el total del envelope
     paginado). Nota: "esta semana"/"este mes" van desde el inicio del
     período hasta HOY (no hasta el fin del período), tal como se
     pidió. ============ */

  async function loadStats() {
    const now = new Date();
    const today = todayISO();

    const [total, todayCount, weekCount, monthCount] = await Promise.all([
      api.statTotal({}).catch(() => null),
      api.statTotal({ from: today, to: today }).catch(() => null),
      api.statTotal({ from: startOfWeekISO(now), to: today }).catch(() => null),
      api.statTotal({ from: startOfMonthISO(now), to: today }).catch(() => null)
    ]);

    if (total !== null) document.getElementById('statTotal').textContent = total.toLocaleString('es-CO');
    if (todayCount !== null) document.getElementById('statToday').textContent = todayCount.toLocaleString('es-CO');
    if (weekCount !== null) document.getElementById('statWeek').textContent = weekCount.toLocaleString('es-CO');
    if (monthCount !== null) document.getElementById('statMonth').textContent = monthCount.toLocaleString('es-CO');
  }

  /* ============ Orden (solo sobre la página ya cargada — GET
     /attendance no tiene un query param de orden, siempre viene por
     visit_date descendente) ============ */

  function applySort(rows) {
    const sorted = [...rows];
    if (currentSort === 'oldest') {
      sorted.sort((a, b) => a.visit_date.localeCompare(b.visit_date));
    }
    return sorted;
  }

  /* ============ Carga y render de la tabla ============ */

  async function loadAttendance() {
    const requestId = ++loadRequestId;
    const tbody = document.getElementById('attendanceTableBody');
    tbody.innerHTML = `<tr><td colspan="5" class="loans-table__empty">Cargando asistencias…</td></tr>`;
    document.getElementById('pagination').innerHTML = '';

    let data;
    try {
      data = await api.list();
    } catch (err) {
      if (requestId !== loadRequestId) return;
      console.error('No se pudo cargar la lista de asistencias.', err);
      tbody.innerHTML = `<tr><td colspan="5" class="loans-table__empty">No se pudo cargar la lista: ${escapeHtml(err.message)}</td></tr>`;
      document.getElementById('resultsRange').textContent = 'Sin resultados';
      return;
    }

    if (requestId !== loadRequestId) return; // respuesta obsoleta, se descarta

    ATTENDANCE = data.data;
    currentTotal = data.total;

    renderTable();
    renderPagination();
    renderRange();
  }

  function renderRange() {
    const rangeEl = document.getElementById('resultsRange');
    if (currentTotal === 0) {
      rangeEl.textContent = 'Mostrando 0 de 0 asistencias';
      return;
    }
    const start = (currentPage - 1) * currentPageSize + 1;
    const end = Math.min(currentPage * currentPageSize, currentTotal);
    rangeEl.textContent = `Mostrando ${start} – ${end} de ${currentTotal.toLocaleString('es-CO')} asistencias`;
  }

  function renderTable() {
    const tbody = document.getElementById('attendanceTableBody');
    const rows = applySort(ATTENDANCE);

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="loans-table__empty">No se encontraron asistencias con estos filtros.</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map(a => `
      <tr data-id="${a.id}">
        <td>${escapeHtml(a.visitor_name || 'Sin nombre')}</td>
        <td>${escapeHtml(a.visitor_phone || '–')}</td>
        <td>${genderTag(a.gender)}</td>
        <td>${a.age ?? '–'}</td>
        <td>${formatDateEs(a.visit_date)}</td>
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
          loadAttendance();
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
    const genderSelect = document.getElementById('filterGender');
    const dateFromInput = document.getElementById('filterDateFrom');
    const dateToInput = document.getElementById('filterDateTo');
    const sortSelect = document.getElementById('sortSelect');
    const pageSizeSelect = document.getElementById('pageSizeSelect');
    const filterToggle = document.getElementById('filterToggle');
    const filterRowExtra = document.getElementById('filterRowExtra');
    const clearBtn = document.getElementById('clearFiltersBtn');

    genderSelect.addEventListener('change', () => { filterGender = genderSelect.value; currentPage = 1; loadAttendance(); });
    dateFromInput.addEventListener('change', () => { dateFrom = dateFromInput.value; currentPage = 1; loadAttendance(); });
    dateToInput.addEventListener('change', () => { dateTo = dateToInput.value; currentPage = 1; loadAttendance(); });

    sortSelect.addEventListener('change', () => {
      currentSort = sortSelect.value;
      renderTable();
    });

    pageSizeSelect.addEventListener('change', () => {
      currentPageSize = Number(pageSizeSelect.value);
      currentPage = 1;
      loadAttendance();
    });

    filterToggle.addEventListener('click', () => {
      const isHidden = filterRowExtra.hidden;
      filterRowExtra.hidden = !isHidden;
      filterToggle.classList.toggle('is-active', isHidden);
    });

    clearBtn.addEventListener('click', () => {
      genderSelect.value = '';
      dateFromInput.value = '';
      dateToInput.value = '';
      sortSelect.value = 'recent';
      filterGender = '';
      dateFrom = '';
      dateTo = '';
      currentSort = 'recent';
      currentPage = 1;
      loadAttendance();
    });
  }

  /* ============ Modal: nueva asistencia (POST /attendance) ============ */

  const attendanceFormError = document.getElementById('attendanceFormError');

  function hideFormError() {
    attendanceFormError.hidden = true;
    attendanceFormError.textContent = '';
  }

  function showFormError(message) {
    attendanceFormError.textContent = message;
    attendanceFormError.hidden = false;
  }

  function openAttendanceModal() {
    document.getElementById('attendanceForm').reset();
    hideFormError();
    document.getElementById('attendanceModal').hidden = false;
  }

  function closeAttendanceModal() {
    document.getElementById('attendanceModal').hidden = true;
  }

  async function saveAttendanceForm(e) {
    e.preventDefault();
    hideFormError();

    const name = document.getElementById('attendanceName').value.trim();
    const phone = document.getElementById('attendancePhone').value.trim();
    const gender = document.getElementById('attendanceGender').value;
    const ageRaw = document.getElementById('attendanceAge').value;
    const visitDate = document.getElementById('attendanceDate').value;

    if (!gender || ageRaw === '') {
      showFormError('Género y edad son obligatorios.');
      return;
    }

    const payload = { age: Number(ageRaw), gender };
    // visitor_name, visitor_phone y visit_date son opcionales — solo
    // se incluyen en el body si la coordinadora los llenó.
    if (name) payload.visitor_name = name;
    if (phone) payload.visitor_phone = phone;
    if (visitDate) payload.visit_date = visitDate;

    const submitBtn = document.getElementById('attendanceFormSubmit');
    submitBtn.disabled = true;
    try {
      await api.create(payload);
      closeAttendanceModal();
      await Promise.all([loadAttendance(), loadStats()]);
    } catch (err) {
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
    const attendanceModal = document.getElementById('attendanceModal');
    if (!attendanceModal.hidden) closeAttendanceModal();
  });

  /* ============ Cerrar sesión ============ */

  document.getElementById('logoutBtn').addEventListener('click', () => {
    window.BAGBAuth.logout();
  });

  /* ============ Init ============ */

  async function init() {
    disableUnsupportedFilters();
    populateGenderFilter();
    initFilters();

    document.getElementById('addAttendanceBtn').addEventListener('click', openAttendanceModal);
    document.getElementById('attendanceModalClose').addEventListener('click', closeAttendanceModal);
    document.getElementById('attendanceFormCancel').addEventListener('click', closeAttendanceModal);
    document.getElementById('attendanceForm').addEventListener('submit', saveAttendanceForm);
    initModalDismiss(document.getElementById('attendanceModal'), closeAttendanceModal);

    await Promise.all([loadAttendance(), loadStats()]);
  }

  init();
})();
