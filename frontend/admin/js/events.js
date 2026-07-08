/* =====================================================================
   Panel Admin — Eventos y talleres (js)
   Fuente de datos: data/events.json
   ===================================================================== */
(function(){

  const DATA_PATH = (window.CONFIG && window.CONFIG.DATA_PATH) || 'data/';

  const MESES_LARGO = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const MESES_CORTO = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  const DIAS_SEMANA = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];

  /* ============ UTILIDADES ============ */

  function toArray(json, ...keys){
    if(Array.isArray(json)) return json;
    if(json && typeof json === 'object'){
      for(const k of keys){
        if(Array.isArray(json[k])) return json[k];
      }
      const firstArray = Object.values(json).find(v => Array.isArray(v));
      if(firstArray) return firstArray;
    }
    return [];
  }

  async function fetchJSONAny(filenames, ...keys){
    for(const filename of filenames){
      try{
        const res = await fetch(DATA_PATH + filename);
        if(!res.ok) continue;
        const json = await res.json();
        return toArray(json, ...keys);
      }catch(err){ /* probar el siguiente nombre */ }
    }
    console.warn('No se pudo cargar ninguno de estos archivos:', filenames.join(', '));
    return [];
  }
  async function fetchJSON(filename, ...keys){ return fetchJSONAny([filename], ...keys); }

  function parseDate(str){
    if(!str) return null;
    const datePart = String(str).slice(0,10);
    const [y,m,d] = datePart.split('-').map(Number);
    if(!y || !m || !d) return null;
    return new Date(y, m-1, d);
  }

  function formatDateShort(date){
    if(!date) return '–';
    return `${date.getDate()} ${MESES_CORTO[date.getMonth()]} ${date.getFullYear()}`;
  }

  function formatTime12h(hhmm){
    if(!hhmm) return '';
    const [h,m] = hhmm.split(':').map(Number);
    const mm = String(m).padStart(2,'0');
    if(h === 12 && m === 0) return '12:00 m.';
    if(h === 0 && m === 0) return `12:${mm} a. m.`;
    const period = h < 12 ? 'a. m.' : 'p. m.';
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${hour12}:${mm} ${period}`;
  }

  function todayAtMidnight(){
    const d = new Date();
    d.setHours(0,0,0,0);
    return d;
  }

  function dateKey(year, month, day){
    return `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }

  function normalize(str){
    return String(str||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  }

  function escapeHtml(str){
    const div = document.createElement('div');
    div.textContent = str == null ? '' : str;
    return div.innerHTML;
  }

  /* ============ ESTADO ============ */

  let EVENTS = [];
  let editingEventId = null;
  let deletingEventId = null;
  let calYear, calMonth;
  let selectedDateKey = null;

  const state = {
    search:'',
    range:'todos',       // todos | proximos | mes | pasados
    featured:'',          // '' | featured | regular
    dateFrom:null,
    dateTo:null,
    page:1,
    pageSize:10,
  };

  /* ============ CARGA INICIAL ============ */

  async function loadEvents(){
    EVENTS = await fetchJSON('events.json', 'events', 'records');
  }

  /* ============ ESTADÍSTICAS ============ */

  function renderStats(){
    document.getElementById('statTotal').textContent = EVENTS.length.toLocaleString('es-CO');
  }

  /* ============ FILTRADO / ORDEN / PAGINACIÓN ============ */

  function getFilteredSorted(){
    const today = todayAtMidnight();

    let rows = EVENTS.filter(ev => {
      const d = parseDate(ev.event_date);
      if(!d) return false;

      if(state.dateFrom && d < state.dateFrom) return false;
      if(state.dateTo && d > state.dateTo) return false;

      if(state.range === 'proximos' && d < today) return false;
      if(state.range === 'pasados' && d >= today) return false;
      if(state.range === 'mes' && !(d.getFullYear() === calYear && d.getMonth() === calMonth)) return false;

      if(state.featured === 'featured' && !ev.featured) return false;
      if(state.featured === 'regular' && ev.featured) return false;

      if(state.search){
        const term = normalize(state.search);
        const haystack = normalize([ev.title, ev.description].filter(Boolean).join(' '));
        if(!haystack.includes(term)) return false;
      }

      return true;
    });

    rows.sort((a,b) => parseDate(a.event_date) - parseDate(b.event_date));
    return rows;
  }

  /* ============ RENDER TABLA ============ */

  function renderTable(){
    const filtered = getFilteredSorted();
    const totalPages = Math.max(1, Math.ceil(filtered.length / state.pageSize));
    if(state.page > totalPages) state.page = totalPages;
    const start = (state.page - 1) * state.pageSize;
    const pageRows = filtered.slice(start, start + state.pageSize);

    const tbody = document.getElementById('eventsTableBody');

    if(pageRows.length === 0){
      tbody.innerHTML = `<tr><td colspan="3" class="loans-table__empty">No se encontraron eventos con estos filtros.</td></tr>`;
    }else{
      tbody.innerHTML = pageRows.map(ev => {
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
                  <span class="time-range">${formatTime12h(ev.start_time)} – ${formatTime12h(ev.end_time)}</span>
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
    }

    renderPagination(totalPages);
    renderRange(filtered.length, start, pageRows.length);
    attachRowActionListeners();
    highlightSelectedRow();
  }

  function renderRange(totalFiltered, start, shown){
    const rangeEl = document.getElementById('resultsRange');
    if(totalFiltered === 0){
      rangeEl.textContent = 'Mostrando 0 de 0 eventos y talleres';
    }else{
      rangeEl.textContent = `Mostrando ${start+1} – ${start+shown} de ${totalFiltered} eventos y talleres`;
    }
  }

  function renderPagination(totalPages){
    const nav = document.getElementById('pagination');
    if(totalPages <= 1){ nav.innerHTML = ''; return; }

    const page = state.page;
    const pagesToShow = new Set([1, totalPages, page, page-1, page+1].filter(p => p>=1 && p<=totalPages));
    const sorted = Array.from(pagesToShow).sort((a,b)=>a-b);

    let html = `<button type="button" data-page="${page-1}" ${page===1?'disabled':''} aria-label="Anterior">‹</button>`;
    let prev = 0;
    sorted.forEach(p => {
      if(prev && p - prev > 1) html += `<span class="ellipsis">…</span>`;
      html += `<button type="button" data-page="${p}" class="${p===page?'active':''}">${p}</button>`;
      prev = p;
    });
    html += `<button type="button" data-page="${page+1}" ${page===totalPages?'disabled':''} aria-label="Siguiente">›</button>`;

    nav.innerHTML = html;
    nav.querySelectorAll('button[data-page]').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = Number(btn.dataset.page);
        if(p >= 1 && p <= totalPages){ state.page = p; renderTable(); }
      });
    });
  }

  function attachRowActionListeners(){
    document.querySelectorAll('.event-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => openEventModal(Number(btn.dataset.id)));
    });
    document.querySelectorAll('.event-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => openDeleteModal(Number(btn.dataset.id)));
    });
  }

  function highlightSelectedRow(){
    const tbody = document.getElementById('eventsTableBody');
    tbody.querySelectorAll('tr').forEach(tr => tr.classList.remove('is-highlighted'));
    if(!selectedDateKey) return;
    const row = tbody.querySelector(`tr[data-date="${selectedDateKey}"]`);
    if(row){
      row.classList.add('is-highlighted');
      row.scrollIntoView({behavior:'smooth', block:'nearest'});
    }
  }

  /* ============ CALENDARIO ============ */

  function eventsByDay(year, month){
    const map = new Map();
    EVENTS.forEach(ev => {
      const d = parseDate(ev.event_date);
      if(d && d.getFullYear() === year && d.getMonth() === month){
        const day = d.getDate();
        if(!map.has(day)) map.set(day, []);
        map.get(day).push(ev);
      }
    });
    return map;
  }

  function renderCalendar(){
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
    const daysInMonth = new Date(calYear, calMonth+1, 0).getDate();
    const daysInPrev = new Date(calYear, calMonth, 0).getDate();
    const startOffset = (firstOfMonth.getDay() + 6) % 7;

    const today = new Date();
    const isTodayMonth = today.getFullYear() === calYear && today.getMonth() === calMonth;

    const dayEvents = eventsByDay(calYear, calMonth);
    const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

    for(let cell = 0; cell < totalCells; cell++){
      const dayNum = cell - startOffset + 1;
      const inMonth = dayNum >= 1 && dayNum <= daysInMonth;

      const evs = inMonth ? dayEvents.get(dayNum) : null;
      const el = document.createElement(evs ? 'button' : 'div');
      el.className = 'cal-day';

      const num = document.createElement('span');
      num.className = 'cal-day__num';

      if(!inMonth){
        el.classList.add('cal-day--muted');
        num.textContent = dayNum < 1 ? daysInPrev + dayNum : dayNum - daysInMonth;
        el.setAttribute('aria-hidden', 'true');
      }else{
        num.textContent = dayNum;
        if(isTodayMonth && today.getDate() === dayNum) el.classList.add('cal-day--today');

        if(evs){
          const key = dateKey(calYear, calMonth, dayNum);
          el.type = 'button';
          el.classList.add('cal-day--event');
          el.setAttribute('aria-label', `${dayNum} de ${MESES_LARGO[calMonth]}: ${evs.map(e=>e.title).join(', ')}`);
          el.title = evs.map(e=>e.title).join('\n');
          if(selectedDateKey === key) el.classList.add('cal-day--selected');

          const dot = document.createElement('span');
          dot.className = 'cal-day__dot';

          el.addEventListener('click', () => {
            selectedDateKey = key;
            state.range = 'mes';
            document.getElementById('filterRangePanel').value = 'mes';
            syncTopRangeSelect();
            renderCalendar();
            renderTable();
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

  function changeMonth(delta){
    calMonth += delta;
    if(calMonth < 0){ calMonth = 11; calYear--; }
    if(calMonth > 11){ calMonth = 0; calYear++; }
    renderCalendar();
    if(state.range === 'mes') renderTable();
  }

  /* ============ FILTROS: SINCRONIZACIÓN TOP <-> PANEL ============ */

  function syncTopRangeSelect(){
    const topSelect = document.getElementById('filterRangeTop');
    topSelect.value = state.featured === 'featured' ? 'destacados' : state.range;
  }

  function initFilters(){
    const searchTop = document.getElementById('filterSearchTop');
    const searchPanel = document.getElementById('filterSearchPanel');
    const rangeTop = document.getElementById('filterRangeTop');
    const rangePanel = document.getElementById('filterRangePanel');
    const featuredSelect = document.getElementById('filterFeatured');
    const dateFromInput = document.getElementById('filterDateFrom');
    const dateToInput = document.getElementById('filterDateTo');
    const pageSizeSelect = document.getElementById('pageSizeSelect');
    const clearBtn = document.getElementById('clearFiltersBtn');

    function onSearchChange(value){
      state.search = value.trim();
      searchTop.value = value;
      searchPanel.value = value;
      state.page = 1;
      renderTable();
    }
    searchTop.addEventListener('input', () => onSearchChange(searchTop.value));
    searchPanel.addEventListener('input', () => onSearchChange(searchPanel.value));

    rangeTop.addEventListener('change', () => {
      if(rangeTop.value === 'destacados'){
        state.featured = 'featured';
        state.range = 'todos';
      }else{
        state.featured = '';
        state.range = rangeTop.value;
      }
      rangePanel.value = state.range;
      featuredSelect.value = state.featured;
      state.page = 1;
      renderTable();
    });

    rangePanel.addEventListener('change', () => {
      state.range = rangePanel.value;
      if(state.featured === 'featured' && state.range !== 'todos') state.featured = '';
      featuredSelect.value = state.featured;
      syncTopRangeSelect();
      state.page = 1;
      renderTable();
    });

    featuredSelect.addEventListener('change', () => {
      state.featured = featuredSelect.value;
      syncTopRangeSelect();
      state.page = 1;
      renderTable();
    });

    dateFromInput.addEventListener('change', () => {
      state.dateFrom = dateFromInput.value ? parseDate(dateFromInput.value) : null;
      state.page = 1;
      renderTable();
    });
    dateToInput.addEventListener('change', () => {
      state.dateTo = dateToInput.value ? parseDate(dateToInput.value) : null;
      state.page = 1;
      renderTable();
    });

    pageSizeSelect.addEventListener('change', () => {
      state.pageSize = Number(pageSizeSelect.value);
      state.page = 1;
      renderTable();
    });

    clearBtn.addEventListener('click', () => {
      searchTop.value = ''; searchPanel.value = '';
      rangeTop.value = 'todos'; rangePanel.value = 'todos';
      featuredSelect.value = '';
      dateFromInput.value = ''; dateToInput.value = '';
      Object.assign(state, {search:'', range:'todos', featured:'', dateFrom:null, dateTo:null, page:1});
      selectedDateKey = null;
      renderCalendar();
      renderTable();
    });
  }

  /* ============ MODAL: NUEVO / EDITAR EVENTO ============ */

  function openEventModal(eventId){
    editingEventId = eventId || null;
    const modal = document.getElementById('eventModal');
    const title = document.getElementById('eventFormTitle');
    const form = document.getElementById('eventForm');
    form.reset();

    if(editingEventId){
      const ev = EVENTS.find(e => e.id === editingEventId);
      title.textContent = 'Editar evento o taller';
      document.getElementById('eventTitle').value = ev.title || '';
      document.getElementById('eventDescription').value = ev.description || '';
      document.getElementById('eventDate').value = ev.event_date ? String(ev.event_date).slice(0,10) : '';
      document.getElementById('eventStartTime').value = ev.start_time || '';
      document.getElementById('eventEndTime').value = ev.end_time || '';
      document.getElementById('eventFeatured').checked = !!ev.featured;
    }else{
      title.textContent = 'Nuevo evento o taller';
    }

    modal.hidden = false;
  }
  function closeEventModal(){
    document.getElementById('eventModal').hidden = true;
    editingEventId = null;
  }

  function saveEventForm(e){
    e.preventDefault();
    const payload = {
      title: document.getElementById('eventTitle').value.trim(),
      description: document.getElementById('eventDescription').value.trim() || null,
      event_date: document.getElementById('eventDate').value,
      start_time: document.getElementById('eventStartTime').value,
      end_time: document.getElementById('eventEndTime').value,
      featured: document.getElementById('eventFeatured').checked,
    };

    if(editingEventId){
      Object.assign(EVENTS.find(ev => ev.id === editingEventId), payload);
    }else{
      const newId = EVENTS.length ? Math.max(...EVENTS.map(ev => ev.id)) + 1 : 1;
      EVENTS.push({ id: newId, ...payload });
    }

    closeEventModal();
    renderStats();
    renderCalendar();
    renderTable();
  }

  /* ============ MODAL: CONFIRMAR ELIMINACIÓN ============ */

  function openDeleteModal(eventId){
    deletingEventId = eventId;
    const ev = EVENTS.find(e => e.id === eventId);
    document.getElementById('deleteEventName').textContent = ev.title;
    document.getElementById('deleteEventModal').hidden = false;
  }
  function closeDeleteModal(){
    document.getElementById('deleteEventModal').hidden = true;
    deletingEventId = null;
  }
  function confirmDelete(){
    EVENTS = EVENTS.filter(ev => ev.id !== deletingEventId);
    closeDeleteModal();
    renderStats();
    renderCalendar();
    renderTable();
  }

  /* ============ EXPORTAR CSV ============ */

  function exportCSV(){
    const rows = getFilteredSorted();
    const header = ['Título','Fecha','Hora inicio','Hora fin','Descripción','Destacado'];
    const lines = [header.join(',')];
    rows.forEach(ev => {
      const cells = [
        ev.title, formatDateShort(parseDate(ev.event_date)),
        formatTime12h(ev.start_time), formatTime12h(ev.end_time),
        ev.description || '', ev.featured ? 'Sí' : 'No',
      ].map(v => `"${String(v).replace(/"/g,'""')}"`);
      lines.push(cells.join(','));
    });
    const blob = new Blob([lines.join('\n')], {type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'eventos.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  /* ============ MODALES: CIERRE GENÉRICO ============ */

  function initModalDismiss(modalEl, closeFn){
    modalEl.addEventListener('click', (e) => { if(e.target === modalEl) closeFn(); });
    document.addEventListener('keydown', (e) => {
      if(e.key === 'Escape' && !modalEl.hidden) closeFn();
    });
  }

  /* ============ INIT ============ */

  async function init(){
    const now = new Date();
    calYear = now.getFullYear();
    calMonth = now.getMonth();

    await loadEvents();
    renderStats();
    renderCalendar();
    initFilters();
    renderTable();

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
  }

  document.addEventListener('DOMContentLoaded', init);

})();