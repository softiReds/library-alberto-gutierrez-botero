/* =====================================================================
   Panel Admin — Préstamos
   Fuentes de datos: data/loans.json, data/catalog.json, data/member.json
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

  function normalize(str){
    return String(str||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  }

  /* ============ ESTADO ============ */

  let LOANS = [];
  let CATALOG_MAP = new Map();
  let MEMBERS_MAP = new Map();
  let editingLoanId = null;
  let deletingLoanId = null;

  const state = {
    search:'',
    status:'',
    dateFrom:null,
    dateTo:null,
    sort:'recent',
    page:1,
    pageSize:10,
  };

  /* ============ HELPERS DE DATOS RELACIONADOS ============ */

  function getBook(bookId){ return CATALOG_MAP.get(String(bookId)) || null; }
  function getMember(memberId){ return MEMBERS_MAP.get(String(memberId)) || null; }

  function bookTitle(bookId){
    const b = getBook(bookId);
    return b ? b.title : 'Libro no encontrado';
  }
  function bookAuthor(bookId){
    const b = getBook(bookId);
    return b ? (b.author || '') : '';
  }
  function memberName(memberId){
    const m = getMember(memberId);
    return m ? `${m.first_name || ''} ${m.last_name || ''}`.trim() : 'Usuario no encontrado';
  }
  function memberDocument(memberId){
    const m = getMember(memberId);
    return m ? `${m.document_type || ''} ${m.document_number || ''}`.trim() : '';
  }

  function computeStatus(loan){
    if(loan.return_date) return 'devuelto';
    const due = parseDate(loan.due_date);
    if(due && due < todayAtMidnight()) return 'vencido';
    return 'activo';
  }

  function loanCode(loan){
    const loanDate = parseDate(loan.loan_date);
    const year = loanDate ? loanDate.getFullYear() : new Date().getFullYear();
    return `PR-${year}-${String(loan.id).padStart(4,'0')}`;
  }

  /* ============ CARGA INICIAL ============ */

  async function loadAllData(){
    const [loansRaw, catalogRaw, membersRaw] = await Promise.all([
      fetchJSON('loans.json', 'loans', 'records'),
      fetchJSON('catalog.json', 'books', 'catalog'),
      fetchJSON('member.json', 'members', 'records'),
    ]);
    LOANS = loansRaw;
    CATALOG_MAP = new Map(catalogRaw.map(b => [String(b.id), b]));
    MEMBERS_MAP = new Map(membersRaw.map(m => [String(m.id), m]));
  }

  /* ============ ESTADÍSTICAS ============ */

  function renderStats(){
    const now = new Date();
    let active=0, overdue=0, returnedThisMonth=0;
    LOANS.forEach(loan => {
      const status = computeStatus(loan);
      if(status === 'activo') active++;
      if(status === 'vencido') overdue++;
      if(status === 'devuelto'){
        const rd = parseDate(loan.return_date);
        if(rd && rd.getFullYear() === now.getFullYear() && rd.getMonth() === now.getMonth()) returnedThisMonth++;
      }
    });
    document.getElementById('statActive').textContent = active.toLocaleString('es-CO');
    document.getElementById('statOverdue').textContent = overdue.toLocaleString('es-CO');
    document.getElementById('statReturnedMonth').textContent = returnedThisMonth.toLocaleString('es-CO');
    document.getElementById('statTotal').textContent = LOANS.length.toLocaleString('es-CO');
  }

  /* ============ FILTRADO / ORDEN / PAGINACIÓN ============ */

  function getFilteredSorted(){
    let rows = LOANS.filter(loan => {
      if(state.status && computeStatus(loan) !== state.status) return false;

      if(state.dateFrom || state.dateTo){
        const ld = parseDate(loan.loan_date);
        if(state.dateFrom && ld < state.dateFrom) return false;
        if(state.dateTo && ld > state.dateTo) return false;
      }

      if(state.search){
        const term = normalize(state.search);
        const book = getBook(loan.book_id);
        const member = getMember(loan.member_id);
        const haystack = normalize([
          book?.title, book?.author, book?.isbn,
          member?.first_name, member?.last_name, member?.document_number,
          loanCode(loan),
        ].flat().filter(Boolean).join(' '));
        if(!haystack.includes(term)) return false;
      }

      return true;
    });

    rows.sort((a,b) => {
      if(state.sort === 'overdue_first'){
        const aOverdue = computeStatus(a) === 'vencido';
        const bOverdue = computeStatus(b) === 'vencido';
        if(aOverdue !== bOverdue) return aOverdue ? -1 : 1;
      }
      const da = parseDate(a.loan_date), db = parseDate(b.loan_date);
      if(state.sort === 'oldest') return da - db;
      return db - da; 
    });

    return rows;
  }

  /* ============ RENDER TABLA ============ */

  function statusBadge(status){
    const labels = {activo:'Activo', devuelto:'Devuelto', vencido:'Vencido'};
    return `<span class="loan-status loan-status--${status}">${labels[status]}</span>`;
  }

  function renderTable(){
    const filtered = getFilteredSorted();
    const totalPages = Math.max(1, Math.ceil(filtered.length / state.pageSize));
    if(state.page > totalPages) state.page = totalPages;
    const start = (state.page - 1) * state.pageSize;
    const pageRows = filtered.slice(start, start + state.pageSize);

    const tbody = document.getElementById('loansTableBody');

    if(pageRows.length === 0){
      tbody.innerHTML = `<tr><td colspan="9" class="loans-table__empty">No se encontraron préstamos con estos filtros.</td></tr>`;
    }else{
      tbody.innerHTML = pageRows.map(loan => {
        const status = computeStatus(loan);
        const loanDate = parseDate(loan.loan_date);
        const dueDate = parseDate(loan.due_date);
        const returnDate = parseDate(loan.return_date);
        return `
          <tr data-id="${loan.id}">
            <td class="loans-table__id">${loanCode(loan)}</td>
            <td class="loans-table__book">
              <strong>${bookTitle(loan.book_id)}</strong>
              <span>${bookAuthor(loan.book_id)}</span>
            </td>
            <td class="loans-table__member">
              <strong>${memberName(loan.member_id)}</strong>
              <span>${memberDocument(loan.member_id)}</span>
            </td>
            <td>${formatDateEs(loanDate)}</td>
            <td>${formatDateEs(dueDate)}</td>
            <td class="${returnDate ? '' : 'loans-table__muted'}">${returnDate ? formatDateEs(returnDate) : '–'}</td>
            <td>${statusBadge(status)}</td>
            <td class="${loan.condition_at_return ? '' : 'loans-table__muted'}">${loan.condition_at_return || '–'}</td>
            <td>
              <div class="loans-table__actions">
                <button type="button" class="icon-action loan-edit-btn" data-id="${loan.id}" aria-label="Editar préstamo">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>
                </button>
                <button type="button" class="icon-action icon-action--danger loan-delete-btn" data-id="${loan.id}" aria-label="Eliminar préstamo">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }

    renderPagination(filtered.length, totalPages);
    renderRange(filtered.length, start, pageRows.length);
    attachRowActionListeners();
  }

  function renderRange(totalFiltered, start, shown){
    const rangeEl = document.getElementById('resultsRange');
    if(totalFiltered === 0){
      rangeEl.textContent = 'Mostrando 0 de 0 préstamos';
    }else{
      rangeEl.textContent = `Mostrando ${start+1} – ${start+shown} de ${totalFiltered} préstamos`;
    }
  }

  function renderPagination(totalFiltered, totalPages){
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

  /* ============ ACCIONES DE FILA (editar / eliminar) ============ */

  function attachRowActionListeners(){
    document.querySelectorAll('.loan-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => openLoanModal(Number(btn.dataset.id)));
    });
    document.querySelectorAll('.loan-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => openDeleteModal(Number(btn.dataset.id)));
    });
  }

  /* ============ FILTROS: EVENTOS ============ */

  function initFilters(){
    const searchInput = document.getElementById('filterSearch');
    const statusSelect = document.getElementById('filterStatus');
    const dateFromInput = document.getElementById('filterDateFrom');
    const dateToInput = document.getElementById('filterDateTo');
    const sortSelect = document.getElementById('sortSelect');
    const pageSizeSelect = document.getElementById('pageSizeSelect');
    const filterToggle = document.getElementById('filterToggle');
    const filterPanel = document.getElementById('filterPanel');
    const clearBtn = document.getElementById('clearFiltersBtn');

    searchInput.addEventListener('input', () => {
      state.search = searchInput.value.trim();
      state.page = 1;
      renderTable();
    });
    statusSelect.addEventListener('change', () => {
      state.status = statusSelect.value;
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
    sortSelect.addEventListener('change', () => {
      state.sort = sortSelect.value;
      renderTable();
    });
    pageSizeSelect.addEventListener('change', () => {
      state.pageSize = Number(pageSizeSelect.value);
      state.page = 1;
      renderTable();
    });
    filterToggle.addEventListener('click', () => {
      const isHidden = filterPanel.hidden;
      filterPanel.hidden = !isHidden;
      filterToggle.classList.toggle('is-active', isHidden);
    });
    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      statusSelect.value = '';
      dateFromInput.value = '';
      dateToInput.value = '';
      sortSelect.value = 'recent';
      state.search = '';
      state.status = '';
      state.dateFrom = null;
      state.dateTo = null;
      state.sort = 'recent';
      state.page = 1;
      renderTable();
    });
  }

  /* ============ MODAL: REGISTRAR / EDITAR PRÉSTAMO ============ */

  function populateSelectOptions(){
    const bookSelect = document.getElementById('loanBook');
    const memberSelect = document.getElementById('loanMember');

    const books = Array.from(CATALOG_MAP.values()).sort((a,b) => String(a.title).localeCompare(String(b.title)));
    bookSelect.innerHTML = books.map(b => `<option value="${b.id}">${b.title}${b.author ? ' — ' + b.author : ''}</option>`).join('');

    const members = Array.from(MEMBERS_MAP.values()).sort((a,b) => String(a.first_name).localeCompare(String(b.first_name)));
    memberSelect.innerHTML = members.map(m => `<option value="${m.id}">${m.first_name} ${m.last_name} — ${m.document_type || ''} ${m.document_number || ''}</option>`).join('');
  }

  function openLoanModal(loanId){
    editingLoanId = loanId || null;
    const modal = document.getElementById('loanModal');
    const title = document.getElementById('loanFormTitle');
    const form = document.getElementById('loanForm');
    form.reset();

    if(editingLoanId){
      const loan = LOANS.find(l => l.id === editingLoanId);
      title.textContent = 'Editar préstamo';
      document.getElementById('loanBook').value = loan.book_id;
      document.getElementById('loanMember').value = loan.member_id;
      document.getElementById('loanDate').value = loan.loan_date ? String(loan.loan_date).slice(0,10) : '';
      document.getElementById('loanDueDate').value = loan.due_date ? String(loan.due_date).slice(0,10) : '';
      document.getElementById('loanReturnDate').value = loan.return_date ? String(loan.return_date).slice(0,10) : '';
      document.getElementById('loanCondition').value = loan.condition_at_return || '';
    }else{
      title.textContent = 'Registrar préstamo';
    }

    modal.hidden = false;
  }

  function closeLoanModal(){
    document.getElementById('loanModal').hidden = true;
    editingLoanId = null;
  }

  function saveLoanForm(e){
    e.preventDefault();
    const bookId = Number(document.getElementById('loanBook').value);
    const memberId = Number(document.getElementById('loanMember').value);
    const loanDate = document.getElementById('loanDate').value;
    const dueDate = document.getElementById('loanDueDate').value;
    const returnDate = document.getElementById('loanReturnDate').value || null;
    const condition = document.getElementById('loanCondition').value.trim() || null;

    if(editingLoanId){
      const loan = LOANS.find(l => l.id === editingLoanId);
      Object.assign(loan, {
        book_id: bookId, member_id: memberId,
        loan_date: loanDate, due_date: dueDate,
        return_date: returnDate, condition_at_return: condition,
      });
    }else{
      const newId = LOANS.length ? Math.max(...LOANS.map(l => l.id)) + 1 : 1;
      LOANS.push({
        id: newId, book_id: bookId, member_id: memberId,
        loan_date: loanDate, due_date: dueDate,
        return_date: returnDate, condition_at_return: condition,
      });
    }

    closeLoanModal();
    renderStats();
    renderTable();
  }

  /* ============ MODAL: CONFIRMAR ELIMINACIÓN ============ */

  function openDeleteModal(loanId){
    deletingLoanId = loanId;
    const loan = LOANS.find(l => l.id === loanId);
    document.getElementById('deleteLoanName').textContent = `${loanCode(loan)} — ${bookTitle(loan.book_id)}`;
    document.getElementById('deleteLoanModal').hidden = false;
  }
  function closeDeleteModal(){
    document.getElementById('deleteLoanModal').hidden = true;
    deletingLoanId = null;
  }
  function confirmDelete(){
    LOANS = LOANS.filter(l => l.id !== deletingLoanId);
    closeDeleteModal();
    renderStats();
    renderTable();
  }

  /* ============ EXPORTAR CSV ============ */

  function exportCSV(){
    const rows = getFilteredSorted();
    const header = ['ID Préstamo','Libro','Autor','Usuario','Documento','Fecha préstamo','Fecha devolución','Fecha retorno','Estado','Condición al retorno'];
    const lines = [header.join(',')];
    rows.forEach(loan => {
      const status = computeStatus(loan);
      const cells = [
        loanCode(loan),
        bookTitle(loan.book_id),
        bookAuthor(loan.book_id),
        memberName(loan.member_id),
        memberDocument(loan.member_id),
        formatDateEs(parseDate(loan.loan_date)),
        formatDateEs(parseDate(loan.due_date)),
        loan.return_date ? formatDateEs(parseDate(loan.return_date)) : '',
        status,
        loan.condition_at_return || '',
      ].map(v => `"${String(v).replace(/"/g,'""')}"`);
      lines.push(cells.join(','));
    });
    const blob = new Blob([lines.join('\n')], {type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'prestamos.csv';
    a.click();
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
    await loadAllData();
    populateSelectOptions();
    renderStats();
    initFilters();
    renderTable();

    document.getElementById('addLoanBtn').addEventListener('click', () => openLoanModal(null));
    document.getElementById('loanModalClose').addEventListener('click', closeLoanModal);
    document.getElementById('loanFormCancel').addEventListener('click', closeLoanModal);
    document.getElementById('loanForm').addEventListener('submit', saveLoanForm);
    initModalDismiss(document.getElementById('loanModal'), closeLoanModal);

    document.getElementById('deleteLoanModalClose').addEventListener('click', closeDeleteModal);
    document.getElementById('deleteLoanCancel').addEventListener('click', closeDeleteModal);
    document.getElementById('deleteLoanConfirm').addEventListener('click', confirmDelete);
    initModalDismiss(document.getElementById('deleteLoanModal'), closeDeleteModal);

    document.getElementById('exportBtn').addEventListener('click', exportCSV);
  }

  document.addEventListener('DOMContentLoaded', init);

})();