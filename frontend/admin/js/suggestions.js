/* =====================================================================
   Panel Admin — Sugerencias
   Fuente de datos: data/suggestions.json
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
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  }

  function dateOnly(date){
    if(!date) return null;
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    return d;
  }

  function formatDateTimeEs(date){
    if(!date) return '–';
    const datePart = String(date.getDate()).padStart(2,'0') + '/' + String(date.getMonth()+1).padStart(2,'0') + '/' + date.getFullYear();
    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2,'0');
    const suffix = hours >= 12 ? 'p. m.' : 'a. m.';
    hours = hours % 12 || 12;
    return `${datePart} ${String(hours).padStart(2,'0')}:${minutes} ${suffix}`;
  }

  function normalize(str){
    return String(str||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  }

  /* ============ ESTADO ============ */

  let SUGGESTIONS = [];
  let deletingSuggestionId = null;

  const state = {
    search:'',
    status:'',
    dateFrom:null,
    dateTo:null,
    page:1,
    pageSize:10,
  };

  /* ============ CARGA INICIAL ============ */

  async function loadSuggestions(){
    SUGGESTIONS = await fetchJSON('suggestions.json', 'suggestions', 'records');
  }

  /* ============ ESTADÍSTICAS ============ */

  function renderStats(){
    document.getElementById('statTotal').textContent = SUGGESTIONS.length.toLocaleString('es-CO');
  }

  /* ============ FILTRADO / ORDEN / PAGINACIÓN ============ */

  function getFilteredSorted(){
    let rows = SUGGESTIONS.filter(s => {
      if(state.status && s.status !== state.status) return false;

      const submitted = dateOnly(parseDate(s.submitted_at));
      if(state.dateFrom && (!submitted || submitted < state.dateFrom)) return false;
      if(state.dateTo && (!submitted || submitted > state.dateTo)) return false;

      if(state.search){
        const term = normalize(state.search);
        const haystack = normalize([s.visitor_name, s.visitor_email, s.message].filter(Boolean).join(' '));
        if(!haystack.includes(term)) return false;
      }

      return true;
    });

    rows.sort((a,b) => (parseDate(b.submitted_at) || 0) - (parseDate(a.submitted_at) || 0));
    return rows;
  }

  /* ============ RENDER TABLA ============ */

  const STATUS_OPTIONS = ['Nueva', 'En revisión', 'Atendida'];

  function statusSlug(status){
    return normalize(status).replace(/\s+/g,'-');
  }

  function statusSelect(id, status){
    const key = statusSlug(status);
    const options = STATUS_OPTIONS.map(opt => `<option value="${opt}" ${opt === status ? 'selected' : ''}>${opt}</option>`).join('');
    return `<select class="suggestion-status suggestion-status--${key} suggestion-status-select" data-id="${id}">${options}</select>`;
  }

  function renderTable(){
    const filtered = getFilteredSorted();
    const totalPages = Math.max(1, Math.ceil(filtered.length / state.pageSize));
    if(state.page > totalPages) state.page = totalPages;
    const start = (state.page - 1) * state.pageSize;
    const pageRows = filtered.slice(start, start + state.pageSize);

    const tbody = document.getElementById('suggestionsTableBody');

    if(pageRows.length === 0){
      tbody.innerHTML = `<tr><td colspan="6" class="loans-table__empty">No se encontraron sugerencias con estos filtros.</td></tr>`;
    }else{
      tbody.innerHTML = pageRows.map(s => `
        <tr data-id="${s.id}">
          <td>${s.visitor_name || 'Anónimo'}</td>
          <td>${s.visitor_email || '–'}</td>
          <td>${formatDateTimeEs(parseDate(s.submitted_at))}</td>
          <td><span class="suggestions-table__message" title="${(s.message||'').replace(/"/g,'&quot;')}">${s.message || '–'}</span></td>
          <td>${statusSelect(s.id, s.status)}</td>
          <td>
            <div class="loans-table__actions">
              <button type="button" class="icon-action icon-action--danger suggestion-delete-btn" data-id="${s.id}" aria-label="Eliminar sugerencia">
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
      rangeEl.textContent = 'Mostrando 0 de 0 sugerencias';
    }else{
      rangeEl.textContent = `Mostrando ${start+1} – ${start+shown} de ${totalFiltered} sugerencias`;
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
    document.querySelectorAll('.suggestion-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => openDeleteModal(Number(btn.dataset.id)));
    });
    document.querySelectorAll('.suggestion-status-select').forEach(sel => {
      sel.addEventListener('change', () => updateStatus(Number(sel.dataset.id), sel.value, sel));
    });
  }

  function updateStatus(suggestionId, newStatus, selectEl){
    const s = SUGGESTIONS.find(x => x.id === suggestionId);
    if(!s) return;
    s.status = newStatus;
    STATUS_OPTIONS.forEach(opt => selectEl.classList.remove(`suggestion-status--${statusSlug(opt)}`));
    selectEl.classList.add(`suggestion-status--${statusSlug(newStatus)}`);
    if(state.status && state.status !== newStatus) renderTable();
  }

  /* ============ FILTROS: EVENTOS ============ */

  function initFilters(){
    const searchInput = document.getElementById('filterSearch');
    const statusSelect = document.getElementById('filterStatus');
    const dateFromInput = document.getElementById('filterDateFrom');
    const dateToInput = document.getElementById('filterDateTo');
    const pageSizeSelect = document.getElementById('pageSizeSelect');
    const clearBtn = document.getElementById('clearFiltersBtn');

    searchInput.addEventListener('input', () => { state.search = searchInput.value.trim(); state.page = 1; renderTable(); });
    statusSelect.addEventListener('change', () => { state.status = statusSelect.value; state.page = 1; renderTable(); });
    dateFromInput.addEventListener('change', () => { state.dateFrom = dateFromInput.value ? dateOnly(new Date(dateFromInput.value + 'T00:00:00')) : null; state.page = 1; renderTable(); });
    dateToInput.addEventListener('change', () => { state.dateTo = dateToInput.value ? dateOnly(new Date(dateToInput.value + 'T00:00:00')) : null; state.page = 1; renderTable(); });
    pageSizeSelect.addEventListener('change', () => { state.pageSize = Number(pageSizeSelect.value); state.page = 1; renderTable(); });

    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      statusSelect.value = '';
      dateFromInput.value = '';
      dateToInput.value = '';
      Object.assign(state, {search:'', status:'', dateFrom:null, dateTo:null, page:1});
      renderTable();
    });
  }

  /* ============ MODAL: CONFIRMAR ELIMINACIÓN ============ */

  function openDeleteModal(suggestionId){
    deletingSuggestionId = suggestionId;
    const s = SUGGESTIONS.find(x => x.id === suggestionId);
    document.getElementById('deleteSuggestionName').textContent = s.visitor_name || 'este visitante';
    document.getElementById('deleteSuggestionModal').hidden = false;
  }
  function closeDeleteModal(){
    document.getElementById('deleteSuggestionModal').hidden = true;
    deletingSuggestionId = null;
  }
  function confirmDelete(){
    SUGGESTIONS = SUGGESTIONS.filter(s => s.id !== deletingSuggestionId);
    closeDeleteModal();
    renderStats();
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
    await loadSuggestions();
    renderStats();
    initFilters();
    renderTable();

    document.getElementById('deleteSuggestionModalClose').addEventListener('click', closeDeleteModal);
    document.getElementById('deleteSuggestionCancel').addEventListener('click', closeDeleteModal);
    document.getElementById('deleteSuggestionConfirm').addEventListener('click', confirmDelete);
    initModalDismiss(document.getElementById('deleteSuggestionModal'), closeDeleteModal);
  }

  document.addEventListener('DOMContentLoaded', init);

})();
