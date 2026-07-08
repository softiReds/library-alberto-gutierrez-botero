/* =====================================================================
   Panel Admin — Consultas en sala (js)
   Fuente de datos: data/inhousereading.json, data/catalog.json
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

  async function fetchJSONAny(filenames, ...keys){
    for(const filename of filenames){
      try{
        const res = await fetch(DATA_PATH + filename);
        if(!res.ok) continue;
        const json = await res.json();
        return toArray(json, ...keys);
      }catch(err){
        // probar el siguiente nombre
      }
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

  function formatDateEs(date){
    if(!date) return '–';
    return String(date.getDate()).padStart(2,'0') + '/' + String(date.getMonth()+1).padStart(2,'0') + '/' + date.getFullYear();
  }

  function todayAtMidnight(){
    const d = new Date();
    d.setHours(0,0,0,0);
    return d;
  }

  // Lunes de la semana que contiene `date`.
  function startOfWeek(date){
    const d = new Date(date);
    const day = d.getDay(); // 0=domingo..6=sábado
    const diff = (day === 0 ? -6 : 1) - day;
    d.setDate(d.getDate() + diff);
    return d;
  }
  function endOfWeek(date){
    const start = startOfWeek(date);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return end;
  }

  function normalize(str){
    return String(str||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  }

  function isbnToString(isbn){
    if(Array.isArray(isbn)) return isbn.join(' ');
    return isbn || '';
  }

  /* ============ ESTADO ============ */

  let READINGS = [];
  let CATALOG_MAP = new Map();
  let deletingReadingId = null;

  const state = {
    search:'',
    dateFrom:null,
    dateTo:null,
    bookId:'',
    materialType:'',
    sort:'recent',
    page:1,
    pageSize:10,
  };

  /* ============ HELPERS DE DATOS RELACIONADOS ============ */

  function getBook(bookId){ return CATALOG_MAP.get(String(bookId)) || null; }

  function bookTitle(reading){
    const b = getBook(reading.book_id);
    return (b && b.title) || reading.book_title_fallback || 'Libro no encontrado';
  }
  function bookAuthor(reading){
    const b = getBook(reading.book_id);
    return (b && b.author) || '';
  }

  function readingCode(reading){
    const d = parseDate(reading.reading_date);
    const year = d ? d.getFullYear() : new Date().getFullYear();
    return `CS-${year}-${String(reading.id).padStart(5,'0')}`;
  }

  /* ============ CARGA INICIAL ============ */

  async function loadAllData(){
    const [readingsRaw, catalogRaw] = await Promise.all([
      fetchJSONAny(['inhousereading.json','inhouse_reading.json'], 'inhousereading', 'readings', 'records'),
      fetchJSON('catalog.json', 'books', 'catalog'),
    ]);
    READINGS = readingsRaw;
    CATALOG_MAP = new Map(catalogRaw.map(b => [String(b.id), b]));
  }

  /* ============ ESTADÍSTICAS ============ */

  function renderStats(){
    const today = todayAtMidnight();
    const wStart = startOfWeek(today), wEnd = endOfWeek(today);
    const now = new Date();

    let countToday=0, countWeek=0, countMonth=0;
    READINGS.forEach(r => {
      const d = parseDate(r.reading_date);
      if(!d) return;
      if(d.getTime() === today.getTime()) countToday++;
      if(d >= wStart && d <= wEnd) countWeek++;
      if(d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) countMonth++;
    });

    document.getElementById('statToday').textContent = countToday.toLocaleString('es-CO');
    document.getElementById('statWeek').textContent = countWeek.toLocaleString('es-CO');
    document.getElementById('statMonth').textContent = countMonth.toLocaleString('es-CO');
    document.getElementById('statTotal').textContent = READINGS.length.toLocaleString('es-CO');
  }

  /* ============ FILTRADO / ORDEN / PAGINACIÓN ============ */

  function getFilteredSorted(){
    let rows = READINGS.filter(r => {
      const d = parseDate(r.reading_date);

      if(state.dateFrom && d < state.dateFrom) return false;
      if(state.dateTo && d > state.dateTo) return false;

      if(state.bookId && String(r.book_id) !== String(state.bookId)) return false;

      if(state.materialType){
        const b = getBook(r.book_id);
        if(!b || b.material_type !== state.materialType) return false;
      }

      if(state.search){
        const term = normalize(state.search);
        const b = getBook(r.book_id);
        const haystack = normalize([
          bookTitle(r), b && b.author, b && isbnToString(b.isbn), readingCode(r),
        ].filter(Boolean).join(' '));
        if(!haystack.includes(term)) return false;
      }

      return true;
    });

    rows.sort((a,b) => {
      const da = parseDate(a.reading_date), db = parseDate(b.reading_date);
      return state.sort === 'oldest' ? da - db : db - da;
    });

    return rows;
  }

  /* ============ RENDER TABLA ============ */

  function renderTable(){
    const filtered = getFilteredSorted();
    const totalPages = Math.max(1, Math.ceil(filtered.length / state.pageSize));
    if(state.page > totalPages) state.page = totalPages;
    const start = (state.page - 1) * state.pageSize;
    const pageRows = filtered.slice(start, start + state.pageSize);

    const tbody = document.getElementById('readingsTableBody');

    if(pageRows.length === 0){
      tbody.innerHTML = `<tr><td colspan="4" class="loans-table__empty">No se encontraron consultas con estos filtros.</td></tr>`;
    }else{
      tbody.innerHTML = pageRows.map(reading => {
        const d = parseDate(reading.reading_date);
        return `
          <tr data-id="${reading.id}">
            <td class="loans-table__id">${readingCode(reading)}</td>
            <td class="reading-book">
              <strong>${bookTitle(reading)}</strong>
              ${bookAuthor(reading) ? `<span>${bookAuthor(reading)}</span>` : ''}
            </td>
            <td>${formatDateEs(d)}</td>
            <td>
              <div class="loans-table__actions">
                <button type="button" class="icon-action icon-action--danger reading-delete-btn" data-id="${reading.id}" aria-label="Eliminar consulta">
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
  }

  function renderRange(totalFiltered, start, shown){
    const rangeEl = document.getElementById('resultsRange');
    if(totalFiltered === 0){
      rangeEl.textContent = 'Mostrando 0 de 0 consultas';
    }else{
      rangeEl.textContent = `Mostrando ${start+1} – ${start+shown} de ${totalFiltered} consultas`;
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
    document.querySelectorAll('.reading-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => openDeleteModal(Number(btn.dataset.id)));
    });
  }

  /* ============ FILTROS: SELECTS DINÁMICOS ============ */

  function populateFilterSelects(){
    const bookSelect = document.getElementById('filterBook');
    const distinctBookIds = Array.from(new Set(READINGS.map(r => r.book_id)));
    const bookOptions = distinctBookIds
      .map(id => ({id, title: (getBook(id) && getBook(id).title) || (READINGS.find(r=>r.book_id===id)||{}).book_title_fallback || `Libro #${id}`}))
      .sort((a,b) => a.title.localeCompare(b.title));
    bookSelect.innerHTML = '<option value="">Todos</option>' + bookOptions.map(b => `<option value="${b.id}">${b.title}</option>`).join('');

    const materialSelect = document.getElementById('filterMaterialType');
    const materials = Array.from(new Set(
      distinctBookIds.map(id => getBook(id) && getBook(id).material_type).filter(Boolean)
    )).sort();
    materialSelect.innerHTML = '<option value="">Todos</option>' + materials.map(m => `<option value="${m}">${m}</option>`).join('');
  }

  /* ============ FILTROS: EVENTOS ============ */

  function initFilters(){
    const searchInput = document.getElementById('filterSearch');
    const dateFromInput = document.getElementById('filterDateFrom');
    const dateToInput = document.getElementById('filterDateTo');
    const bookSelect = document.getElementById('filterBook');
    const materialSelect = document.getElementById('filterMaterialType');
    const sortSelect = document.getElementById('sortSelect');
    const pageSizeSelect = document.getElementById('pageSizeSelect');
    const filterToggle = document.getElementById('filterToggle');
    const filterPanel = document.getElementById('filterPanel');
    const clearBtn = document.getElementById('clearFiltersBtn');

    searchInput.addEventListener('input', () => { state.search = searchInput.value.trim(); state.page = 1; renderTable(); });
    dateFromInput.addEventListener('change', () => { state.dateFrom = dateFromInput.value ? parseDate(dateFromInput.value) : null; state.page = 1; renderTable(); });
    dateToInput.addEventListener('change', () => { state.dateTo = dateToInput.value ? parseDate(dateToInput.value) : null; state.page = 1; renderTable(); });
    bookSelect.addEventListener('change', () => { state.bookId = bookSelect.value; state.page = 1; renderTable(); });
    materialSelect.addEventListener('change', () => { state.materialType = materialSelect.value; state.page = 1; renderTable(); });
    sortSelect.addEventListener('change', () => { state.sort = sortSelect.value; renderTable(); });
    pageSizeSelect.addEventListener('change', () => { state.pageSize = Number(pageSizeSelect.value); state.page = 1; renderTable(); });

    filterToggle.addEventListener('click', () => {
      const isHidden = filterPanel.hidden;
      filterPanel.hidden = !isHidden;
      filterToggle.classList.toggle('is-active', isHidden);
    });

    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      dateFromInput.value = '';
      dateToInput.value = '';
      bookSelect.value = '';
      materialSelect.value = '';
      sortSelect.value = 'recent';
      Object.assign(state, {search:'', dateFrom:null, dateTo:null, bookId:'', materialType:'', sort:'recent', page:1});
      renderTable();
    });
  }

  /* ============ MODAL: NUEVA CONSULTA ============ */

  function populateReadingBookSelect(){
    const select = document.getElementById('readingBook');
    const books = Array.from(CATALOG_MAP.values()).sort((a,b) => String(a.title).localeCompare(String(b.title)));
    select.innerHTML = '<option value="">— Sin registrar en catálogo —</option>' +
      books.map(b => `<option value="${b.id}">${b.title}${b.author ? ' — ' + b.author : ''}</option>`).join('');
  }

  function openReadingModal(){
    document.getElementById('readingForm').reset();
    document.getElementById('readingModal').hidden = false;
  }
  function closeReadingModal(){
    document.getElementById('readingModal').hidden = true;
  }

  function saveReadingForm(e){
    e.preventDefault();
    const bookSelectVal = document.getElementById('readingBook').value;
    const fallbackTitle = document.getElementById('readingBookFallback').value.trim();
    const readingDate = document.getElementById('readingDate').value;

    if(!bookSelectVal && !fallbackTitle){
      alert('Selecciona un libro del catálogo o escribe un título de respaldo.');
      return;
    }

    const newId = READINGS.length ? Math.max(...READINGS.map(r => r.id)) + 1 : 1;
    READINGS.push({
      id: newId,
      book_id: bookSelectVal ? Number(bookSelectVal) : null,
      book_title_fallback: fallbackTitle || null,
      reading_date: readingDate,
    });

    closeReadingModal();
    renderStats();
    populateFilterSelects();
    renderTable();
  }

  /* ============ MODAL: CONFIRMAR ELIMINACIÓN ============ */

  function openDeleteModal(readingId){
    deletingReadingId = readingId;
    const reading = READINGS.find(r => r.id === readingId);
    document.getElementById('deleteReadingName').textContent = `${readingCode(reading)} — ${bookTitle(reading)}`;
    document.getElementById('deleteReadingModal').hidden = false;
  }
  function closeDeleteModal(){
    document.getElementById('deleteReadingModal').hidden = true;
    deletingReadingId = null;
  }
  function confirmDelete(){
    READINGS = READINGS.filter(r => r.id !== deletingReadingId);
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
    await loadAllData();
    renderStats();
    populateFilterSelects();
    populateReadingBookSelect();
    initFilters();
    renderTable();

    document.getElementById('addReadingBtn').addEventListener('click', openReadingModal);
    document.getElementById('readingModalClose').addEventListener('click', closeReadingModal);
    document.getElementById('readingFormCancel').addEventListener('click', closeReadingModal);
    document.getElementById('readingForm').addEventListener('submit', saveReadingForm);
    initModalDismiss(document.getElementById('readingModal'), closeReadingModal);

    document.getElementById('deleteReadingModalClose').addEventListener('click', closeDeleteModal);
    document.getElementById('deleteReadingCancel').addEventListener('click', closeDeleteModal);
    document.getElementById('deleteReadingConfirm').addEventListener('click', confirmDelete);
    initModalDismiss(document.getElementById('deleteReadingModal'), closeDeleteModal);
  }

  document.addEventListener('DOMContentLoaded', init);

})();