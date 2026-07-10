/* =====================================================================
   Panel Admin — Préstamos
   GET/POST /loans y PATCH /loans/:id/return, vía apiFetch.
   ===================================================================== */
(function () {
  'use strict';

  const token = window.BAGBAuth && window.BAGBAuth.getToken();
  if (!token) {
    window.location.replace('index.html');
    return;
  }

  const PAGE_SIZE_OPTIONS_DEFAULT = 10;

  // El select de la UI usa estas etiquetas; el backend espera el nombre
  // real del enum (Prestado/Devuelto/Vencido, no "activo").
  const STATUS_UI_TO_API = { activo: 'prestado', devuelto: 'devuelto', vencido: 'vencido' };
  const STATUS_API_LABEL = { prestado: 'Activo', devuelto: 'Devuelto', vencido: 'Vencido' };
  const STATUS_API_CLASS = { prestado: 'activo', devuelto: 'devuelto', vencido: 'vencido' };

  let LOANS = [];         // solo los préstamos de la página actual
  let currentPage = 1;
  let currentPageSize = PAGE_SIZE_OPTIONS_DEFAULT;
  let currentTotal = 0;
  let currentSort = 'recent';
  let filterStatus = '';  // valor de #filterStatus: '', 'activo', 'devuelto', 'vencido'
  let loadRequestId = 0;
  let returningLoanId = null;

  /* ============ API — apiFetch agrega el token y parsea errores ============ */

  const api = {
    async list() {
      const params = new URLSearchParams({
        page: String(currentPage),
        page_size: String(currentPageSize)
      });
      if (filterStatus) params.set('status', STATUS_UI_TO_API[filterStatus]);
      return window.BAGBApi.apiFetch(`/loans?${params.toString()}`);
    },
    async statTotal(extra) {
      const params = new URLSearchParams({ page: '1', page_size: '1', ...extra });
      const data = await window.BAGBApi.apiFetch(`/loans?${params.toString()}`);
      return data.total;
    },
    async books() {
      return window.BAGBApi.apiFetch('/books?page=1&page_size=100');
    },
    async members() {
      return window.BAGBApi.apiFetch('/members?page=1&page_size=100');
    },
    async create(payload) {
      return window.BAGBApi.apiFetch('/loans', { method: 'POST', body: payload });
    },
    async returnLoan(id, payload) {
      return window.BAGBApi.apiFetch(`/loans/${id}/return`, { method: 'PATCH', body: payload });
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

  function loanCode(loan) {
    return `PR-${loan.id.slice(0, 8).toUpperCase()}`;
  }

  function monthRange(date) {
    const y = date.getFullYear();
    const m = date.getMonth();
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    const iso = d => d.toISOString().slice(0, 10);
    return { from: iso(first), to: iso(last) };
  }

  /* ============ Referencias DOM ============ */

  const tbody = document.getElementById('loansTableBody');
  const rangeEl = document.getElementById('resultsRange');
  const paginationEl = document.getElementById('pagination');

  const searchInput = document.getElementById('filterSearch');
  const statusSelect = document.getElementById('filterStatus');
  const dateFromInput = document.getElementById('filterDateFrom');
  const dateToInput = document.getElementById('filterDateTo');
  const sortSelect = document.getElementById('sortSelect');
  const pageSizeSelect = document.getElementById('pageSizeSelect');
  const filterToggle = document.getElementById('filterToggle');
  const filterPanel = document.getElementById('filterPanel');
  const clearBtn = document.getElementById('clearFiltersBtn');

  const loanModal = document.getElementById('loanModal');
  const loanForm = document.getElementById('loanForm');
  const loanFormError = document.getElementById('loanFormError');
  const loanBookSelect = document.getElementById('loanBook');
  const loanMemberSelect = document.getElementById('loanMember');

  const returnLoanModal = document.getElementById('returnLoanModal');
  const returnLoanForm = document.getElementById('returnLoanForm');
  const returnLoanError = document.getElementById('returnLoanError');
  const returnLoanNameEl = document.getElementById('returnLoanName');

  /* ============ Búsqueda de texto y rango de fecha de préstamo:
     el backend de gestión no los soporta todavía (GET /loans solo
     filtra por status, member_id, book_id y return_date_from/to), así
     que se deshabilitan en vez de simular un filtro que solo miraría
     la página ya cargada. ============ */
  function disableUnsupportedFilters() {
    searchInput.disabled = true;
    searchInput.placeholder = 'Búsqueda no disponible todavía';
    dateFromInput.disabled = true;
    dateToInput.disabled = true;
    dateFromInput.title = 'Filtrar por fecha de préstamo no está disponible todavía';
    dateToInput.title = 'Filtrar por fecha de préstamo no está disponible todavía';
  }

  /* ============ Estadísticas (reutilizan el total del envelope paginado) ============ */

  async function loadStats() {
    const now = new Date();
    const { from, to } = monthRange(now);

    const [active, overdue, returnedMonth, total] = await Promise.all([
      api.statTotal({ status: 'prestado' }).catch(() => null),
      api.statTotal({ status: 'vencido' }).catch(() => null),
      api.statTotal({ status: 'devuelto', return_date_from: from, return_date_to: to }).catch(() => null),
      api.statTotal({}).catch(() => null)
    ]);

    if (active !== null) document.getElementById('statActive').textContent = active.toLocaleString('es-CO');
    if (overdue !== null) document.getElementById('statOverdue').textContent = overdue.toLocaleString('es-CO');
    if (returnedMonth !== null) document.getElementById('statReturnedMonth').textContent = returnedMonth.toLocaleString('es-CO');
    if (total !== null) document.getElementById('statTotal').textContent = total.toLocaleString('es-CO');
  }

  /* ============ Orden (solo sobre la página ya cargada — GET /loans
     no tiene un query param de orden, siempre viene por loan_date
     descendente) ============ */

  function applySort(loans) {
    const sorted = [...loans];
    if (currentSort === 'oldest') {
      sorted.sort((a, b) => a.loan_date.localeCompare(b.loan_date));
    } else if (currentSort === 'overdue_first') {
      sorted.sort((a, b) => {
        const aOverdue = a.status === 'vencido';
        const bOverdue = b.status === 'vencido';
        if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
        return b.loan_date.localeCompare(a.loan_date);
      });
    }
    // 'recent': el orden que ya trae el backend (loan_date descendente).
    return sorted;
  }

  /* ============ Carga y render de la tabla ============ */

  async function loadLoans() {
    const requestId = ++loadRequestId;
    tbody.innerHTML = `<tr><td colspan="9" class="loans-table__empty">Cargando préstamos…</td></tr>`;
    paginationEl.innerHTML = '';

    let data;
    try {
      data = await api.list();
    } catch (err) {
      if (requestId !== loadRequestId) return;
      console.error('No se pudo cargar la lista de préstamos.', err);
      tbody.innerHTML = `<tr><td colspan="9" class="loans-table__empty">No se pudo cargar la lista: ${escapeHtml(err.message)}</td></tr>`;
      rangeEl.textContent = 'Sin resultados';
      return;
    }

    if (requestId !== loadRequestId) return; // respuesta obsoleta, se descarta

    LOANS = data.data;
    currentTotal = data.total;

    renderTable();
    renderPagination();
    renderRange();
  }

  function renderRange() {
    if (currentTotal === 0) {
      rangeEl.textContent = 'Mostrando 0 de 0 préstamos';
      return;
    }
    const start = (currentPage - 1) * currentPageSize + 1;
    const end = Math.min(currentPage * currentPageSize, currentTotal);
    rangeEl.textContent = `Mostrando ${start} – ${end} de ${currentTotal.toLocaleString('es-CO')} préstamos`;
  }

  function statusBadge(status) {
    const cls = STATUS_API_CLASS[status] || status;
    const label = STATUS_API_LABEL[status] || status;
    return `<span class="loan-status loan-status--${cls}">${label}</span>`;
  }

  function renderTable() {
    const loans = applySort(LOANS);

    if (!loans.length) {
      tbody.innerHTML = `<tr><td colspan="9" class="loans-table__empty">No se encontraron préstamos con estos filtros.</td></tr>`;
      return;
    }

    tbody.innerHTML = loans.map(loan => `
      <tr data-id="${loan.id}">
        <td class="loans-table__id">${loanCode(loan)}</td>
        <td class="loans-table__book">
          <strong>${escapeHtml(loan.book.title)}</strong>
          <span>${escapeHtml(loan.book.author)}</span>
        </td>
        <td class="loans-table__member">
          <strong>${escapeHtml(loan.member.first_name + ' ' + loan.member.last_name)}</strong>
          <span>${escapeHtml(loan.member.document_number)}</span>
        </td>
        <td>${formatDateEs(loan.loan_date)}</td>
        <td>${formatDateEs(loan.due_date)}</td>
        <td class="${loan.return_date ? '' : 'loans-table__muted'}">${loan.return_date ? formatDateEs(loan.return_date) : '–'}</td>
        <td>${statusBadge(loan.status)}</td>
        <td class="${loan.condition_at_return ? '' : 'loans-table__muted'}">${escapeHtml(loan.condition_at_return || '–')}</td>
        <td>
          <div class="loans-table__actions">
            ${loan.status !== 'devuelto' ? `
            <button type="button" class="icon-action loan-return-btn" data-id="${loan.id}" aria-label="Marcar como devuelto">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/><path d="m9 12 2 2 4-4"/></svg>
            </button>` : ''}
          </div>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.loan-return-btn').forEach(btn => {
      btn.addEventListener('click', () => openReturnModal(btn.dataset.id));
    });
  }

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
          loadLoans();
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
    statusSelect.addEventListener('change', () => {
      filterStatus = statusSelect.value;
      currentPage = 1;
      loadLoans();
    });

    sortSelect.addEventListener('change', () => {
      currentSort = sortSelect.value;
      renderTable();
    });

    pageSizeSelect.addEventListener('change', () => {
      currentPageSize = Number(pageSizeSelect.value);
      currentPage = 1;
      loadLoans();
    });

    filterToggle.addEventListener('click', () => {
      const isHidden = filterPanel.hidden;
      filterPanel.hidden = !isHidden;
      filterToggle.classList.toggle('is-active', isHidden);
    });

    clearBtn.addEventListener('click', () => {
      statusSelect.value = '';
      sortSelect.value = 'recent';
      filterStatus = '';
      currentSort = 'recent';
      currentPage = 1;
      loadLoans();
    });
  }

  /* ============ Modal: registrar préstamo (POST /loans) ============ */

  function hideLoanFormError() {
    loanFormError.hidden = true;
    loanFormError.textContent = '';
  }

  function showLoanFormError(message) {
    loanFormError.textContent = message;
    loanFormError.hidden = false;
  }

  async function populateLoanFormSelects() {
    loanBookSelect.innerHTML = '<option value="">Cargando libros…</option>';
    loanMemberSelect.innerHTML = '<option value="">Cargando usuarios…</option>';

    const [booksResult, membersResult] = await Promise.allSettled([api.books(), api.members()]);

    if (booksResult.status === 'fulfilled') {
      const available = booksResult.value.data
        .filter(b => b.status === 'disponible')
        .sort((a, b) => a.title.localeCompare(b.title));
      loanBookSelect.innerHTML = available.length
        ? available.map(b => `<option value="${b.id}">${escapeHtml(b.title)} — ${escapeHtml(b.author)}</option>`).join('')
        : '<option value="">No hay libros disponibles</option>';
    } else {
      loanBookSelect.innerHTML = '<option value="">No se pudieron cargar los libros</option>';
    }

    if (membersResult.status === 'fulfilled') {
      const members = [...membersResult.value.data].sort((a, b) => a.first_name.localeCompare(b.first_name));
      loanMemberSelect.innerHTML = members.length
        ? members.map(m => `<option value="${m.id}">${escapeHtml(m.first_name)} ${escapeHtml(m.last_name)} — ${escapeHtml(m.document_type)} ${escapeHtml(m.document_number)}</option>`).join('')
        : '<option value="">No hay afiliados registrados</option>';
    } else {
      loanMemberSelect.innerHTML = '<option value="">No se pudieron cargar los afiliados</option>';
    }
  }

  async function openLoanModal() {
    loanForm.reset();
    hideLoanFormError();
    await populateLoanFormSelects();
    loanModal.hidden = false;
  }

  function closeLoanModal() {
    loanModal.hidden = true;
  }

  async function saveLoanForm(e) {
    e.preventDefault();
    hideLoanFormError();

    const bookId = loanBookSelect.value;
    const memberId = loanMemberSelect.value;
    const dueDate = document.getElementById('loanDueDate').value;

    if (!bookId || !memberId || !dueDate) {
      showLoanFormError('Selecciona el libro, el usuario y la fecha de devolución.');
      return;
    }

    const payload = { book_id: bookId, member_id: memberId, due_date: dueDate };

    const submitBtn = document.getElementById('loanFormSubmit');
    submitBtn.disabled = true;
    try {
      await api.create(payload);
      closeLoanModal();
      await Promise.all([loadLoans(), loadStats()]);
    } catch (err) {
      // Ej. "El libro no está disponible para préstamo (estado actual:
      // 'Prestado')." — se muestra tal cual la manda el backend.
      showLoanFormError(err.message);
    } finally {
      submitBtn.disabled = false;
    }
  }

  /* ============ Modal: marcar como devuelto (PATCH /loans/:id/return) ============ */

  function hideReturnError() {
    returnLoanError.hidden = true;
    returnLoanError.textContent = '';
  }

  function showReturnError(message) {
    returnLoanError.textContent = message;
    returnLoanError.hidden = false;
  }

  function openReturnModal(id) {
    const loan = LOANS.find(l => l.id === id);
    if (!loan) return;

    returningLoanId = id;
    returnLoanNameEl.textContent = `${loanCode(loan)} — ${loan.book.title}`;
    document.getElementById('returnCondition').value = 'Bueno';
    hideReturnError();
    returnLoanModal.hidden = false;
  }

  function closeReturnModal() {
    returnLoanModal.hidden = true;
    returningLoanId = null;
  }

  async function submitReturnForm(e) {
    e.preventDefault();
    if (!returningLoanId) return;
    hideReturnError();

    const condition = document.getElementById('returnCondition').value;
    const submitBtn = document.getElementById('returnLoanSubmit');
    submitBtn.disabled = true;
    try {
      await api.returnLoan(returningLoanId, { condition_at_return: condition });
      closeReturnModal();
      await Promise.all([loadLoans(), loadStats()]);
    } catch (err) {
      // Ej. "Este préstamo ya figura como 'Devuelto' y no puede
      // devolverse de nuevo." — se muestra tal cual la manda el backend.
      showReturnError(err.message);
    } finally {
      submitBtn.disabled = false;
    }
  }

  /* ============ Exportar CSV (solo la página actualmente cargada) ============ */

  function exportCSV() {
    const rows = applySort(LOANS);
    const header = ['ID Préstamo', 'Libro', 'Autor', 'Usuario', 'Documento', 'Fecha préstamo', 'Fecha devolución', 'Fecha retorno', 'Estado', 'Condición al retorno'];
    const lines = [header.join(',')];
    rows.forEach(loan => {
      const cells = [
        loanCode(loan),
        loan.book.title,
        loan.book.author,
        `${loan.member.first_name} ${loan.member.last_name}`,
        loan.member.document_number,
        formatDateEs(loan.loan_date),
        formatDateEs(loan.due_date),
        loan.return_date ? formatDateEs(loan.return_date) : '',
        STATUS_API_LABEL[loan.status] || loan.status,
        loan.condition_at_return || ''
      ].map(v => `"${String(v).replace(/"/g, '""')}"`);
      lines.push(cells.join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'prestamos.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ============ Modales: cierre genérico ============ */

  function initModalDismiss(modalEl, closeFn) {
    modalEl.addEventListener('click', (e) => { if (e.target === modalEl) closeFn(); });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!returnLoanModal.hidden) closeReturnModal();
    else if (!loanModal.hidden) closeLoanModal();
  });

  /* ============ Cerrar sesión ============ */

  document.getElementById('logoutBtn').addEventListener('click', () => {
    window.BAGBAuth.logout();
  });

  /* ============ Init ============ */

  async function init() {
    disableUnsupportedFilters();
    initFilters();

    document.getElementById('addLoanBtn').addEventListener('click', openLoanModal);
    document.getElementById('loanModalClose').addEventListener('click', closeLoanModal);
    document.getElementById('loanFormCancel').addEventListener('click', closeLoanModal);
    loanForm.addEventListener('submit', saveLoanForm);
    initModalDismiss(loanModal, closeLoanModal);

    document.getElementById('returnLoanModalClose').addEventListener('click', closeReturnModal);
    document.getElementById('returnLoanCancel').addEventListener('click', closeReturnModal);
    returnLoanForm.addEventListener('submit', submitReturnForm);
    initModalDismiss(returnLoanModal, closeReturnModal);

    document.getElementById('exportBtn').addEventListener('click', exportCSV);

    await Promise.all([loadLoans(), loadStats()]);
  }

  init();
})();
