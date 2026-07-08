/* =====================================================================
   Panel Admin — Asistencia
   Fuente de datos: data/attendance.json
   ===================================================================== */
(function(){

  const DATA_PATH = (window.CONFIG && window.CONFIG.DATA_PATH) || 'data/';

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

  async function fetchJSON(filename, ...keys){
    try{
      const res = await fetch(DATA_PATH + filename);
      if(!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      return toArray(json, ...keys);
    }catch(err){
      console.warn('No se pudo cargar', filename, err);
      return [];
    }
  }

  function parseDate(str){
    if(!str) return null;
    const datePart = String(str).slice(0,10);
    const [y,m,d] = datePart.split('-').map(Number);
    if(!y || !m || !d) return null;
    return new Date(y, m-1, d);
  }

  function formatDateEs(date){
    if(!date) return '–';
    return String(date.getDate()).padStart(2,'0') + '/' + String(date.getMonth()+1).padStart(2,'0') + '/' + date.getFullYear();
  }

  function todayAtMidnight(){
    const d = new Date();
    d.setHours(0,0,0,0);
    return d;
  }

  function weekRange(date){
    const day = date.getDay();
    const diffToMonday = (day === 0) ? -6 : 1 - day;
    const start = new Date(date);
    start.setDate(date.getDate() + diffToMonday);
    start.setHours(0,0,0,0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23,59,59,999);
    return {start, end};
  }

  function normalize(str){
    return String(str||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  }

  function uniqueSorted(values){
    return Array.from(new Set(values.filter(v => v !== undefined && v !== null && v !== ''))).sort((a,b) => String(a).localeCompare(String(b)));
  }

  function fillSelect(selectEl, values, allLabel){
    const current = selectEl.value;
    selectEl.innerHTML = `<option value="">${allLabel}</option>` + values.map(v => `<option value="${v}">${v}</option>`).join('');
    if(values.includes(current)) selectEl.value = current;
  }

  /* ============ ESTADO ============ */

  let ATTENDANCE = [];
  let editingAttendanceId = null;
  let deletingAttendanceId = null;

  const state = {
    search:'',
    gender:'',
    ageRange:'',
    dateFrom:null,
    dateTo:null,
    sort:'recent',
    page:1,
    pageSize:10,
  };

  /* ============ CARGA INICIAL ============ */

  async function loadAttendance(){
    ATTENDANCE = await fetchJSON('attendance.json', 'attendance', 'records');
  }

  /* ============ ESTADÍSTICAS ============ */

  function renderStats(){
    const today = todayAtMidnight();
    const {start: weekStart, end: weekEnd} = weekRange(today);

    let todayCount = 0, weekCount = 0, monthCount = 0;
    ATTENDANCE.forEach(a => {
      const visit = parseDate(a.visit_date);
      if(!visit) return;
      if(visit.getTime() === today.getTime()) todayCount++;
      if(visit >= weekStart && visit <= weekEnd) weekCount++;
      if(visit.getFullYear() === today.getFullYear() && visit.getMonth() === today.getMonth()) monthCount++;
    });

    document.getElementById('statTotal').textContent = ATTENDANCE.length.toLocaleString('es-CO');
    document.getElementById('statToday').textContent = todayCount.toLocaleString('es-CO');
    document.getElementById('statWeek').textContent = weekCount.toLocaleString('es-CO');
    document.getElementById('statMonth').textContent = monthCount.toLocaleString('es-CO');
  }

  /* ============ SELECTS DE FILTRO (DINÁMICOS) ============ */

  function populateFilterSelects(){
    fillSelect(document.getElementById('filterGender'), uniqueSorted(ATTENDANCE.map(a => a.gender)), 'Todos');
  }

  /* ============ FILTRADO / ORDEN / PAGINACIÓN ============ */

  function ageInRange(age, range){
    if(!range) return true;
    const [min, max] = range.split('-').map(Number);
    return age >= min && age <= max;
  }

  function getFilteredSorted(){
    let rows = ATTENDANCE.filter(a => {
      if(state.gender && a.gender !== state.gender) return false;
      if(state.ageRange && !ageInRange(Number(a.age), state.ageRange)) return false;

      const visit = parseDate(a.visit_date);
      if(state.dateFrom && (!visit || visit < state.dateFrom)) return false;
      if(state.dateTo && (!visit || visit > state.dateTo)) return false;

      if(state.search){
        const term = normalize(state.search);
        const haystack = normalize([a.visitor_name, a.visitor_phone].filter(Boolean).join(' '));
        if(!haystack.includes(term)) return false;
      }

      return true;
    });

    rows.sort((a,b) => {
      const da = parseDate(a.visit_date), db = parseDate(b.visit_date);
      return state.sort === 'oldest' ? da - db : db - da;
    });

    return rows;
  }

  /* ============ RENDER TABLA ============ */

  function genderTag(gender){
    const cls = normalize(gender) === 'femenino' ? 'gender-dot--femenino' : normalize(gender) === 'masculino' ? 'gender-dot--masculino' : '';
    return `<span class="gender-dot ${cls}">${gender || '–'}</span>`;
  }

  function renderTable(){
    const filtered = getFilteredSorted();
    const totalPages = Math.max(1, Math.ceil(filtered.length / state.pageSize));
    if(state.page > totalPages) state.page = totalPages;
    const start = (state.page - 1) * state.pageSize;
    const pageRows = filtered.slice(start, start + state.pageSize);

    const tbody = document.getElementById('attendanceTableBody');

    if(pageRows.length === 0){
      tbody.innerHTML = `<tr><td colspan="6" class="loans-table__empty">No se encontraron asistencias con estos filtros.</td></tr>`;
    }else{
      tbody.innerHTML = pageRows.map(a => `
        <tr data-id="${a.id}">
          <td>${a.visitor_name || 'Sin nombre'}</td>
          <td>${a.visitor_phone || '–'}</td>
          <td>${genderTag(a.gender)}</td>
          <td>${a.age ?? '–'}</td>
          <td>${formatDateEs(parseDate(a.visit_date))}</td>
          <td>
            <div class="loans-table__actions">
              <button type="button" class="icon-action attendance-edit-btn" data-id="${a.id}" aria-label="Editar asistencia">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>
              </button>
              <button type="button" class="icon-action icon-action--danger attendance-delete-btn" data-id="${a.id}" aria-label="Eliminar asistencia">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
              </button>
            </div>
          </td>
        </tr>
      `).join('');
    }

    renderPagination(totalPages);
    renderRange(filtered.length, start, pageRows.length);
    attachRowActionListeners();
  }

  function renderRange(totalFiltered, start, shown){
    const rangeEl = document.getElementById('resultsRange');
    if(totalFiltered === 0){
      rangeEl.textContent = 'Mostrando 0 de 0 asistencias';
    }else{
      rangeEl.textContent = `Mostrando ${start+1} – ${start+shown} de ${totalFiltered} asistencias`;
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
    document.querySelectorAll('.attendance-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => openAttendanceModal(Number(btn.dataset.id)));
    });
    document.querySelectorAll('.attendance-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => openDeleteModal(Number(btn.dataset.id)));
    });
  }

  /* ============ FILTROS: EVENTOS ============ */

  function initFilters(){
    const searchInput = document.getElementById('filterSearch');
    const genderSelect = document.getElementById('filterGender');
    const ageRangeSelect = document.getElementById('filterAgeRange');
    const dateFromInput = document.getElementById('filterDateFrom');
    const dateToInput = document.getElementById('filterDateTo');
    const sortSelect = document.getElementById('sortSelect');
    const pageSizeSelect = document.getElementById('pageSizeSelect');
    const filterToggle = document.getElementById('filterToggle');
    const filterRowExtra = document.getElementById('filterRowExtra');
    const clearBtn = document.getElementById('clearFiltersBtn');

    searchInput.addEventListener('input', () => { state.search = searchInput.value.trim(); state.page = 1; renderTable(); });
    genderSelect.addEventListener('change', () => { state.gender = genderSelect.value; state.page = 1; renderTable(); });
    ageRangeSelect.addEventListener('change', () => { state.ageRange = ageRangeSelect.value; state.page = 1; renderTable(); });
    dateFromInput.addEventListener('change', () => { state.dateFrom = dateFromInput.value ? parseDate(dateFromInput.value) : null; state.page = 1; renderTable(); });
    dateToInput.addEventListener('change', () => { state.dateTo = dateToInput.value ? parseDate(dateToInput.value) : null; state.page = 1; renderTable(); });
    sortSelect.addEventListener('change', () => { state.sort = sortSelect.value; renderTable(); });
    pageSizeSelect.addEventListener('change', () => { state.pageSize = Number(pageSizeSelect.value); state.page = 1; renderTable(); });

    filterToggle.addEventListener('click', () => {
      const isHidden = filterRowExtra.hidden;
      filterRowExtra.hidden = !isHidden;
      filterToggle.classList.toggle('is-active', isHidden);
    });

    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      genderSelect.value = ''; ageRangeSelect.value = '';
      dateFromInput.value = ''; dateToInput.value = '';
      sortSelect.value = 'recent';
      Object.assign(state, {
        search:'', gender:'', ageRange:'', dateFrom:null, dateTo:null, sort:'recent', page:1,
      });
      renderTable();
    });
  }

  /* ============ MODAL: REGISTRAR / EDITAR ASISTENCIA ============ */

  function openAttendanceModal(attendanceId){
    editingAttendanceId = attendanceId || null;
    const modal = document.getElementById('attendanceModal');
    const title = document.getElementById('attendanceFormTitle');
    const form = document.getElementById('attendanceForm');
    form.reset();

    if(editingAttendanceId){
      const a = ATTENDANCE.find(x => x.id === editingAttendanceId);
      title.textContent = 'Editar asistencia';
      document.getElementById('attendanceName').value = a.visitor_name || '';
      document.getElementById('attendancePhone').value = a.visitor_phone || '';
      document.getElementById('attendanceGender').value = a.gender || 'Femenino';
      document.getElementById('attendanceAge').value = a.age ?? '';
      document.getElementById('attendanceDate').value = a.visit_date ? String(a.visit_date).slice(0,10) : '';
    }else{
      title.textContent = 'Nueva asistencia';
      document.getElementById('attendanceDate').value = new Date().toISOString().slice(0,10);
    }

    modal.hidden = false;
  }

  function closeAttendanceModal(){
    document.getElementById('attendanceModal').hidden = true;
    editingAttendanceId = null;
  }

  function saveAttendanceForm(e){
    e.preventDefault();
    const name = document.getElementById('attendanceName').value.trim();
    const phone = document.getElementById('attendancePhone').value.trim() || null;
    const gender = document.getElementById('attendanceGender').value;
    const age = Number(document.getElementById('attendanceAge').value);
    const visitDate = document.getElementById('attendanceDate').value;

    if(editingAttendanceId){
      const a = ATTENDANCE.find(x => x.id === editingAttendanceId);
      Object.assign(a, {visitor_name: name, visitor_phone: phone, gender, age, visit_date: visitDate});
    }else{
      const newId = ATTENDANCE.length ? Math.max(...ATTENDANCE.map(a => a.id)) + 1 : 1;
      ATTENDANCE.push({id: newId, visitor_name: name, visitor_phone: phone, gender, age, visit_date: visitDate});
    }

    closeAttendanceModal();
    renderStats();
    populateFilterSelects();
    renderTable();
  }

  /* ============ MODAL: CONFIRMAR ELIMINACIÓN ============ */

  function openDeleteModal(attendanceId){
    deletingAttendanceId = attendanceId;
    const a = ATTENDANCE.find(x => x.id === attendanceId);
    document.getElementById('deleteAttendanceName').textContent = a.visitor_name || 'este visitante';
    document.getElementById('deleteAttendanceModal').hidden = false;
  }
  function closeDeleteModal(){
    document.getElementById('deleteAttendanceModal').hidden = true;
    deletingAttendanceId = null;
  }
  function confirmDelete(){
    ATTENDANCE = ATTENDANCE.filter(a => a.id !== deletingAttendanceId);
    closeDeleteModal();
    renderStats();
    populateFilterSelects();
    renderTable();
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
    await loadAttendance();
    renderStats();
    populateFilterSelects();
    initFilters();
    renderTable();

    document.getElementById('addAttendanceBtn').addEventListener('click', () => openAttendanceModal(null));
    document.getElementById('attendanceModalClose').addEventListener('click', closeAttendanceModal);
    document.getElementById('attendanceFormCancel').addEventListener('click', closeAttendanceModal);
    document.getElementById('attendanceForm').addEventListener('submit', saveAttendanceForm);
    initModalDismiss(document.getElementById('attendanceModal'), closeAttendanceModal);

    document.getElementById('deleteAttendanceModalClose').addEventListener('click', closeDeleteModal);
    document.getElementById('deleteAttendanceCancel').addEventListener('click', closeDeleteModal);
    document.getElementById('deleteAttendanceConfirm').addEventListener('click', confirmDelete);
    initModalDismiss(document.getElementById('deleteAttendanceModal'), closeDeleteModal);
  }

  document.addEventListener('DOMContentLoaded', init);

})();
