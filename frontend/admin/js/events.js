/* =====================================================================
   Panel Admin — Eventos y talleres (js)
   GET /events/all (gestión, trae pasados y futuros) + POST/PUT/DELETE
   /events, vía apiFetch.
   ===================================================================== */
(function () {
  'use strict';

  const token = window.BAGBAuth && window.BAGBAuth.getToken();
  if (!token) {
    window.location.replace('index.html');
    return;
  }

  const MESES_LARGO = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const MESES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

  // Cuántos eventos se traen de una sola vez para armar el calendario
  // (GET /events/all no tiene filtro por mes/rango de fechas, así que
  // esto es un "traer casi todo" de mejor esfuerzo, no una garantía
  // de completitud si la biblioteca llega a tener más de esta
  // cantidad de eventos históricos + futuros).
  const CALENDAR_FETCH_SIZE = 100;

  let EVENTS_PAGE = [];    // solo los eventos de la página actual de la tabla
  let CALENDAR_EVENTS = []; // set "casi completo" para armar el calendario
  let currentPage = 1;
  let currentPageSize = 10;
  let currentTotal = 0;
  let editingEventId = null;
  let deletingEventId = null;
  let calYear, calMonth;
  let selectedDateKey = null;

  /* ============ API — apiFetch agrega el token y parsea errores ============ */

  const api = {
    async listPage(page, pageSize) {
      return window.BAGBApi.apiFetch(`/events/all?page=${page}&page_size=${pageSize}`);
    },
    async listForCalendar() {
      return window.BAGBApi.apiFetch(`/events/all?page=1&page_size=${CALENDAR_FETCH_SIZE}`);
    },
    async create(payload) {
      return window.BAGBApi.apiFetch('/events', { method: 'POST', body: payload });
    },
    async update(id, payload) {
      return window.BAGBApi.apiFetch(`/events/${id}`, { method: 'PUT', body: payload });
    },
    async remove(id) {
      return window.BAGBApi.apiFetch(`/events/${id}`, { method: 'DELETE' });
    }
  };

  /* ============ Utilidades ============ */

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : str;
    return div.innerHTML;
  }

  function parseDate(isoDate) {
    if (!isoDate) return null;
    const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  }

  function formatDateShort(date) {
    if (!date) return '–';
    return `${date.getDate()} ${MESES_CORTO[date.getMonth()]} ${date.getFullYear()}`;
  }

  function formatTime12h(hhmm) {
    if (!hhmm) return '';
    const [h, m] = hhmm.split(':').map(Number);
    const mm = String(m).padStart(2, '0');
    if (h === 12 && m === 0) return '12:00 m.';
    if (h === 0 && m === 0) return `12:${mm} a. m.`;
    const period = h < 12 ? 'a. m.' : 'p. m.';
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${hour12}:${mm} ${period}`;
  }

  function dateKey(year, month, day) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  /* ============ Búsqueda, rango (próximos/mes/pasados/destacados) y
     fecha desde/hasta: GET /events/all no soporta ningún filtro más
     allá de page/page_size, así que se deshabilitan en vez de simular
     un filtro que solo miraría la página ya cargada. ============ */
  function disableUnsupportedFilters() {
    const ids = ['filterSearchTop', 'filterSearchPanel', 'filterDateFrom', 'filterDateTo'];
    ids.forEach(id => {
      const el = document.getElementById(id);
      el.disabled = true;
    });
    document.getElementById('filterSearchTop').placeholder = 'Búsqueda no disponible todavía';
    document.getElementById('filterSearchPanel').placeholder = 'Búsqueda no disponible todavía';

    ['filterRangeTop', 'filterRangePanel', 'filterFeatured'].forEach(id => {
      document.getElementById(id).disabled = true;
    });
  }

  /* ============ Carga: tabla (paginada de verdad) ============ */

  async function loadTable() {
    const tbody = document.getElementById('eventsTableBody');
    tbody.innerHTML = `<tr><td colspan="3" class="loans-table__empty">Cargando eventos…</td></tr>`;
    document.getElementById('pagination').innerHTML = '';

    let data;
    try {
      data = await api.listPage(currentPage, currentPageSize);
    } catch (err) {
      console.error('No se pudo cargar la lista de eventos.', err);
      tbody.innerHTML = `<tr><td colspan="3" class="loans-table__empty">No se pudo cargar la lista: ${escapeHtml(err.message)}</td></tr>`;
      document.getElementById('resultsRange').textContent = 'Sin resultados';
      return;
    }

    EVENTS_PAGE = data.data;
    currentTotal = data.total;

    renderTable();
    renderPagination();
    renderRange();
    document.getElementById('statTotal').textContent = currentTotal.toLocaleString('es-CO');
  }

  function renderRange() {
    const rangeEl = document.getElementById('resultsRange');
    if (currentTotal === 0) {
      rangeEl.textContent = 'Mostrando 0 de 0 eventos y talleres';
      return;
    }
    const start = (currentPage - 1) * currentPageSize + 1;
    const end = Math.min(currentPage * currentPageSize, currentTotal);
    rangeEl.textContent = `Mostrando ${start} – ${end} de ${currentTotal.toLocaleString('es-CO')} eventos y talleres`;
  }

  function renderTable() {
    const tbody = document.getElementById('eventsTableBody');

    if (!EVENTS_PAGE.length) {
      tbody.innerHTML = `<tr><td colspan="3" class="loans-table__empty">No se encontraron eventos.</td></tr>`;
      return;
    }

    tbody.innerHTML = EVENTS_PAGE.map(ev => {
      const d = parseDate(ev.event_date);
      return `
        <tr data-id="${ev.id}" data-date="${ev.event_date}">
          <td>
            <div class="events-table__title">
              <strong>${escapeHtml(ev.title)}${ev.featured ? '<span class="featured-chip">★ Destacado</span>' : ''}</strong>
              ${ev.description ? `<span>${escapeHtml(ev.description)}</span>` : ''}
            </div>
          </td>
          <td>
            <div class="events-table__datetime">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>
              <div>
                <span>${formatDateShort(d)}</span>
                ${(ev.start_time || ev.end_time) ? `<span class="time-range">${formatTime12h(ev.start_time)} – ${formatTime12h(ev.end_time)}</span>` : ''}
              </div>
            </div>
          </td>
          <td>
            <div class="loans-table__actions">
              <button type="button" class="icon-action event-edit-btn" data-id="${ev.id}" aria-label="Editar evento">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>
              </button>
              <button type="button" class="icon-action icon-action--danger event-delete-btn" data-id="${ev.id}" aria-label="Eliminar evento">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    document.querySelectorAll('.event-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => openEventModal(btn.dataset.id));
    });
    document.querySelectorAll('.event-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => openDeleteModal(btn.dataset.id));
    });

    highlightSelectedRow();
  }

  function highlightSelectedRow() {
    const tbody = document.getElementById('eventsTableBody');
    tbody.querySelectorAll('tr').forEach(tr => tr.classList.remove('is-highlighted'));
    if (!selectedDateKey) return;
    const row = tbody.querySelector(`tr[data-date="${selectedDateKey}"]`);
    if (row) {
      row.classList.add('is-highlighted');
      row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
          loadTable();
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

  document.getElementById('pageSizeSelect').addEventListener('change', (e) => {
    currentPageSize = Number(e.target.value);
    currentPage = 1;
    loadTable();
  });

  /* ============ Carga: calendario (set "casi completo") ============ */

  async function loadCalendarData() {
    try {
      const data = await api.listForCalendar();
      CALENDAR_EVENTS = data.data;
    } catch (err) {
      console.error('No se pudo cargar el calendario.', err);
      CALENDAR_EVENTS = [];
    }
    renderCalendar();
  }

  function eventsByDay(year, month) {
    const map = new Map();
    CALENDAR_EVENTS.forEach(ev => {
      const d = parseDate(ev.event_date);
      if (d && d.getFullYear() === year && d.getMonth() === month) {
        const day = d.getDate();
        if (!map.has(day)) map.set(day, []);
        map.get(day).push(ev);
      }
    });
    return map;
  }

  function renderCalendar() {
    document.getElementById('calTitle').textContent = `${MESES_LARGO[calMonth]} ${calYear}`;

    const gridEl = document.getElementById('calendarGrid');
    gridEl.innerHTML = '';

    DIAS_SEMANA.forEach(d => {
      const el = document.createElement('span');
      el.className = 'cal-weekday';
      el.textContent = d;
      gridEl.appendChild(el);
    });

    const firstOfMonth = new Date(calYear, calMonth, 1);
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const daysInPrev = new Date(calYear, calMonth, 0).getDate();
    const startOffset = (firstOfMonth.getDay() + 6) % 7;

    const today = new Date();
    const isTodayMonth = today.getFullYear() === calYear && today.getMonth() === calMonth;

    const dayEvents = eventsByDay(calYear, calMonth);
    const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

    for (let cell = 0; cell < totalCells; cell++) {
      const dayNum = cell - startOffset + 1;
      const inMonth = dayNum >= 1 && dayNum <= daysInMonth;

      const evs = inMonth ? dayEvents.get(dayNum) : null;
      const el = document.createElement(evs ? 'button' : 'div');
      el.className = 'cal-day';

      const num = document.createElement('span');
      num.className = 'cal-day__num';

      if (!inMonth) {
        el.classList.add('cal-day--muted');
        num.textContent = dayNum < 1 ? daysInPrev + dayNum : dayNum - daysInMonth;
        el.setAttribute('aria-hidden', 'true');
      } else {
        num.textContent = dayNum;
        if (isTodayMonth && today.getDate() === dayNum) el.classList.add('cal-day--today');

        if (evs) {
          const key = dateKey(calYear, calMonth, dayNum);
          el.type = 'button';
          el.classList.add('cal-day--event');
          el.setAttribute('aria-label', `${dayNum} de ${MESES_LARGO[calMonth]}: ${evs.map(e => e.title).join(', ')}`);
          el.title = evs.map(e => e.title).join('\n');
          if (selectedDateKey === key) el.classList.add('cal-day--selected');

          const dot = document.createElement('span');
          dot.className = 'cal-day__dot';

          el.addEventListener('click', () => {
            selectedDateKey = selectedDateKey === key ? null : key;
            renderCalendar();
            highlightSelectedRow();
          });

          el.appendChild(num);
          el.appendChild(dot);
          gridEl.appendChild(el);
          continue;
        }
      }

      el.appendChild(num);
      gridEl.appendChild(el);
    }
  }

  function changeMonth(delta) {
    calMonth += delta;
    if (calMonth < 0) { calMonth = 11; calYear--; }
    if (calMonth > 11) { calMonth = 0; calYear++; }
    renderCalendar();
  }

  /* ============ Modal: nuevo / editar evento ============ */

  const eventFormError = document.getElementById('eventFormError');

  function hideFormError() {
    eventFormError.hidden = true;
    eventFormError.textContent = '';
  }

  function showFormError(message) {
    eventFormError.textContent = message;
    eventFormError.hidden = false;
  }

  function openEventModal(id) {
    editingEventId = id || null;
    const modal = document.getElementById('eventModal');
    const title = document.getElementById('eventFormTitle');
    const form = document.getElementById('eventForm');
    form.reset();
    hideFormError();

    if (editingEventId) {
      const ev = EVENTS_PAGE.find(e => e.id === editingEventId) || CALENDAR_EVENTS.find(e => e.id === editingEventId);
      title.textContent = 'Editar evento o taller';
      document.getElementById('eventTitle').value = ev.title || '';
      document.getElementById('eventDescription').value = ev.description || '';
      document.getElementById('eventDate').value = ev.event_date ? ev.event_date.slice(0, 10) : '';
      document.getElementById('eventStartTime').value = ev.start_time ? ev.start_time.slice(0, 5) : '';
      document.getElementById('eventEndTime').value = ev.end_time ? ev.end_time.slice(0, 5) : '';
      document.getElementById('eventFeatured').checked = !!ev.featured;
    } else {
      title.textContent = 'Nuevo evento o taller';
    }

    modal.hidden = false;
  }

  function closeEventModal() {
    document.getElementById('eventModal').hidden = true;
    editingEventId = null;
  }

  async function saveEventForm(e) {
    e.preventDefault();
    hideFormError();

    const title = document.getElementById('eventTitle').value.trim();
    const eventDate = document.getElementById('eventDate').value;

    if (!title || !eventDate) {
      showFormError('Título y fecha son obligatorios.');
      return;
    }

    const description = document.getElementById('eventDescription').value.trim();
    const startTime = document.getElementById('eventStartTime').value;
    const endTime = document.getElementById('eventEndTime').value;

    const payload = {
      title,
      event_date: eventDate,
      description: description || null,
      start_time: startTime || null,
      end_time: endTime || null,
      featured: document.getElementById('eventFeatured').checked
    };

    const submitBtn = document.getElementById('eventFormSubmit');
    submitBtn.disabled = true;
    try {
      if (editingEventId) {
        await api.update(editingEventId, payload);
      } else {
        await api.create(payload);
      }
      closeEventModal();
      await Promise.all([loadTable(), loadCalendarData()]);
    } catch (err) {
      // Ej. "end_time debe ser posterior a start_time." se muestra tal
      // cual la manda el backend.
      showFormError(err.message);
    } finally {
      submitBtn.disabled = false;
    }
  }

  /* ============ Modal: confirmar eliminación (DELETE /events/:id —
     borrado real y permanente, a diferencia de dar de baja un libro) ============ */

  const deleteEventError = document.getElementById('deleteEventError');

  function hideDeleteError() {
    deleteEventError.hidden = true;
    deleteEventError.textContent = '';
  }

  function showDeleteError(message) {
    deleteEventError.textContent = message;
    deleteEventError.hidden = false;
  }

  function openDeleteModal(id) {
    deletingEventId = id;
    const ev = EVENTS_PAGE.find(e => e.id === id) || CALENDAR_EVENTS.find(e => e.id === id);
    document.getElementById('deleteEventName').textContent = ev ? ev.title : 'este evento';
    hideDeleteError();
    document.getElementById('deleteEventModal').hidden = false;
  }

  function closeDeleteModal() {
    document.getElementById('deleteEventModal').hidden = true;
    deletingEventId = null;
  }

  async function confirmDelete() {
    if (!deletingEventId) return;
    hideDeleteError();
    const confirmBtn = document.getElementById('deleteEventConfirm');
    confirmBtn.disabled = true;
    try {
      await api.remove(deletingEventId);
      closeDeleteModal();
      await Promise.all([loadTable(), loadCalendarData()]);
    } catch (err) {
      showDeleteError(err.message);
    } finally {
      confirmBtn.disabled = false;
    }
  }

  /* ============ Exportar CSV (solo la página actualmente cargada) ============ */

  function exportCSV() {
    const header = ['Título', 'Fecha', 'Hora inicio', 'Hora fin', 'Descripción', 'Destacado'];
    const lines = [header.join(',')];
    EVENTS_PAGE.forEach(ev => {
      const cells = [
        ev.title, formatDateShort(parseDate(ev.event_date)),
        formatTime12h(ev.start_time), formatTime12h(ev.end_time),
        ev.description || '', ev.featured ? 'Sí' : 'No'
      ].map(v => `"${String(v).replace(/"/g, '""')}"`);
      lines.push(cells.join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'eventos.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  /* ============ Modales: cierre genérico ============ */

  function initModalDismiss(modalEl, closeFn) {
    modalEl.addEventListener('click', (e) => { if (e.target === modalEl) closeFn(); });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!document.getElementById('deleteEventModal').hidden) closeDeleteModal();
    else if (!document.getElementById('eventModal').hidden) closeEventModal();
  });

  /* ============ Cerrar sesión ============ */

  document.getElementById('logoutBtn').addEventListener('click', () => {
    window.BAGBAuth.logout();
  });

  /* ============ Init ============ */

  async function init() {
    const now = new Date();
    calYear = now.getFullYear();
    calMonth = now.getMonth();

    disableUnsupportedFilters();

    document.getElementById('calPrev').addEventListener('click', () => changeMonth(-1));
    document.getElementById('calNext').addEventListener('click', () => changeMonth(1));

    document.getElementById('addEventBtn').addEventListener('click', () => openEventModal(null));
    document.getElementById('eventModalClose').addEventListener('click', closeEventModal);
    document.getElementById('eventFormCancel').addEventListener('click', closeEventModal);
    document.getElementById('eventForm').addEventListener('submit', saveEventForm);
    initModalDismiss(document.getElementById('eventModal'), closeEventModal);

    document.getElementById('deleteEventModalClose').addEventListener('click', closeDeleteModal);
    document.getElementById('deleteEventCancel').addEventListener('click', closeDeleteModal);
    document.getElementById('deleteEventConfirm').addEventListener('click', confirmDelete);
    initModalDismiss(document.getElementById('deleteEventModal'), closeDeleteModal);

    document.getElementById('exportBtn').addEventListener('click', exportCSV);

    await Promise.all([loadTable(), loadCalendarData()]);
  }

  init();
})();
