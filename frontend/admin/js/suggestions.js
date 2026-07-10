/* =====================================================================
   Panel Admin — Sugerencias
   GET /suggestions y PATCH /suggestions/:id/mark-read, vía apiFetch.
   No hay alta, edición ni borrado desde el panel: las sugerencias las
   crea el público desde el widget flotante, y el único cambio de
   estado posible es nueva -> leída.
   ===================================================================== */
(function () {
  'use strict';

  const token = window.BAGBAuth && window.BAGBAuth.getToken();
  if (!token) {
    window.location.replace('index.html');
    return;
  }

  let SUGGESTIONS = [];    // solo las sugerencias de la página actual
  let currentPage = 1;
  let currentPageSize = 10;
  let currentTotal = 0;
  let filterStatus = '';
  let loadRequestId = 0;

  /* ============ API — apiFetch agrega el token y parsea errores ============ */

  const api = {
    async list() {
      const params = new URLSearchParams({
        page: String(currentPage),
        page_size: String(currentPageSize)
      });
      if (filterStatus) params.set('status', filterStatus);
      return window.BAGBApi.apiFetch(`/suggestions?${params.toString()}`);
    },
    async markRead(id) {
      return window.BAGBApi.apiFetch(`/suggestions/${id}/mark-read`, { method: 'PATCH' });
    }
  };

  /* ============ Utilidades ============ */

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  function formatDateTimeEs(isoDateTime) {
    if (!isoDateTime) return '–';
    const date = new Date(isoDateTime);
    if (isNaN(date.getTime())) return '–';
    const datePart = String(date.getDate()).padStart(2, '0') + '/' + String(date.getMonth() + 1).padStart(2, '0') + '/' + date.getFullYear();
    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const suffix = hours >= 12 ? 'p. m.' : 'a. m.';
    hours = hours % 12 || 12;
    return `${datePart} ${String(hours).padStart(2, '0')}:${minutes} ${suffix}`;
  }

  /* ============ Búsqueda de texto y rango de fecha: el backend no
     los soporta todavía (GET /suggestions solo filtra por status),
     así que se deshabilitan en vez de simular un filtro que solo
     miraría la página ya cargada. ============ */
  function disableUnsupportedFilters() {
    const searchInput = document.getElementById('filterSearch');
    const dateFromInput = document.getElementById('filterDateFrom');
    const dateToInput = document.getElementById('filterDateTo');
    searchInput.disabled = true;
    searchInput.placeholder = 'Búsqueda no disponible todavía';
    dateFromInput.disabled = true;
    dateToInput.disabled = true;
  }

  /* ============ Carga y render de la tabla ============ */

  async function loadSuggestions() {
    const requestId = ++loadRequestId;
    const tbody = document.getElementById('suggestionsTableBody');
    tbody.innerHTML = `<tr><td colspan="6" class="loans-table__empty">Cargando sugerencias…</td></tr>`;
    document.getElementById('pagination').innerHTML = '';

    let data;
    try {
      data = await api.list();
    } catch (err) {
      if (requestId !== loadRequestId) return;
      console.error('No se pudo cargar la lista de sugerencias.', err);
      tbody.innerHTML = `<tr><td colspan="6" class="loans-table__empty">No se pudo cargar la lista: ${escapeHtml(err.message)}</td></tr>`;
      document.getElementById('resultsRange').textContent = 'Sin resultados';
      return;
    }

    if (requestId !== loadRequestId) return; // respuesta obsoleta, se descarta

    // El backend ya ordena por submitted_at descendente (OrderByDescending
    // en GetSuggestions), así que no hace falta reordenar acá.
    SUGGESTIONS = data.data;
    currentTotal = data.total;

    renderTable();
    renderPagination();
    renderRange();
    document.getElementById('statTotal').textContent = currentTotal.toLocaleString('es-CO');
  }

  function renderRange() {
    const rangeEl = document.getElementById('resultsRange');
    if (currentTotal === 0) {
      rangeEl.textContent = 'Mostrando 0 de 0 sugerencias';
      return;
    }
    const start = (currentPage - 1) * currentPageSize + 1;
    const end = Math.min(currentPage * currentPageSize, currentTotal);
    rangeEl.textContent = `Mostrando ${start} – ${end} de ${currentTotal.toLocaleString('es-CO')} sugerencias`;
  }

  function statusBadge(status) {
    const isRead = status === 'leída';
    return `<span class="suggestion-status suggestion-status--${isRead ? 'leida' : 'nueva'}">${escapeHtml(isRead ? 'Leída' : 'Nueva')}</span>`;
  }

  function renderTable() {
    const tbody = document.getElementById('suggestionsTableBody');

    if (!SUGGESTIONS.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="loans-table__empty">No se encontraron sugerencias con estos filtros.</td></tr>`;
      return;
    }

    tbody.innerHTML = SUGGESTIONS.map(s => `
      <tr data-id="${s.id}">
        <td>${escapeHtml(s.visitor_name || 'Anónimo')}</td>
        <td>${escapeHtml(s.visitor_email || '–')}</td>
        <td>${formatDateTimeEs(s.submitted_at)}</td>
        <td><span class="suggestions-table__message" title="${escapeHtml(s.message || '')}">${escapeHtml(s.message || '–')}</span></td>
        <td>${statusBadge(s.status)}</td>
        <td>
          <div class="loans-table__actions">
            ${s.status !== 'leída' ? `
            <button type="button" class="icon-action suggestion-mark-read-btn" data-id="${s.id}" aria-label="Marcar como leída">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>
            </button>` : ''}
          </div>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.suggestion-mark-read-btn').forEach(btn => {
      btn.addEventListener('click', () => markAsRead(btn.dataset.id, btn));
    });
  }

  async function markAsRead(id, btn) {
    btn.disabled = true;
    try {
      await api.markRead(id);
      await loadSuggestions();
    } catch (err) {
      console.error('No se pudo marcar la sugerencia como leída.', err);
      alert(err.message);
      btn.disabled = false;
    }
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
          loadSuggestions();
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
    const statusSelect = document.getElementById('filterStatus');
    const pageSizeSelect = document.getElementById('pageSizeSelect');
    const clearBtn = document.getElementById('clearFiltersBtn');

    statusSelect.addEventListener('change', () => {
      filterStatus = statusSelect.value;
      currentPage = 1;
      loadSuggestions();
    });

    pageSizeSelect.addEventListener('change', () => {
      currentPageSize = Number(pageSizeSelect.value);
      currentPage = 1;
      loadSuggestions();
    });

    clearBtn.addEventListener('click', () => {
      statusSelect.value = '';
      filterStatus = '';
      currentPage = 1;
      loadSuggestions();
    });
  }

  /* ============ Cerrar sesión ============ */

  document.getElementById('logoutBtn').addEventListener('click', () => {
    window.BAGBAuth.logout();
  });

  /* ============ Init ============ */

  async function init() {
    disableUnsupportedFilters();
    initFilters();
    await loadSuggestions();
  }

  init();
})();
