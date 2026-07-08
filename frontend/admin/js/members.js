/* =====================================================================
   Panel Admin — Afiliaciones (js)
   Fuente de datos: data/member.json
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
      }catch(err){ /* probar el siguiente nombre */ }
    }
    console.warn('No se pudo cargar ninguno de estos archivos:', filenames.join(', '));
    return [];
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

  let MEMBERS = [];
  let editingMemberId = null;
  let deletingMemberId = null;

  const state = {
    search:'',
    docType:'',
    education:'',
    occupation:'',
    gender:'',
    locality:'',
    neighborhood:'',
    dateFrom:null,
    dateTo:null,
    page:1,
    pageSize:10,
  };

  /* ============ CARGA INICIAL ============ */

  async function loadMembers(){
    MEMBERS = await fetchJSONAny(['member.json','members.json'], 'members', 'records');
  }

  function memberName(m){ return `${m.first_name || ''} ${m.last_name || ''}`.trim() || 'Sin nombre'; }
  function memberDocument(m){ return `${m.document_type || ''} ${m.document_number || ''}`.trim(); }

  /* ============ ESTADÍSTICAS ============ */

  function renderStats(){
    document.getElementById('statTotal').textContent = MEMBERS.length.toLocaleString('es-CO');
  }

  /* ============ SELECTS DE FILTRO (DINÁMICOS) ============ */

  function populateFilterSelects(){
    fillSelect(document.getElementById('filterDocType'), uniqueSorted(MEMBERS.map(m => m.document_type)), 'Todos');
    fillSelect(document.getElementById('filterEducation'), uniqueSorted(MEMBERS.map(m => m.education_level)), 'Todos');
    fillSelect(document.getElementById('filterOccupation'), uniqueSorted(MEMBERS.map(m => m.occupation)), 'Todas');
    fillSelect(document.getElementById('filterGender'), uniqueSorted(MEMBERS.map(m => m.gender)), 'Todos');
    fillSelect(document.getElementById('filterLocality'), uniqueSorted(MEMBERS.map(m => m.locality)), 'Todas');
    updateNeighborhoodOptions();
  }

  // Barrio depende de la localidad seleccionada (si hay alguna).
  function updateNeighborhoodOptions(){
    const localitySel = document.getElementById('filterLocality').value;
    const pool = localitySel ? MEMBERS.filter(m => m.locality === localitySel) : MEMBERS;
    fillSelect(document.getElementById('filterNeighborhood'), uniqueSorted(pool.map(m => m.neighborhood)), 'Todos');
  }

  function populateFormDatalists(){
    const setDatalist = (id, values) => {
      document.getElementById(id).innerHTML = values.map(v => `<option value="${v}"></option>`).join('');
    };
    setDatalist('genderOptions', uniqueSorted(MEMBERS.map(m => m.gender)));
    setDatalist('occupationOptions', uniqueSorted(MEMBERS.map(m => m.occupation)));
    setDatalist('educationOptions', uniqueSorted(MEMBERS.map(m => m.education_level)));
    setDatalist('localityOptions', uniqueSorted(MEMBERS.map(m => m.locality)));
    setDatalist('neighborhoodOptions', uniqueSorted(MEMBERS.map(m => m.neighborhood)));
  }

  /* ============ FILTRADO / ORDEN / PAGINACIÓN ============ */

  function getFilteredSorted(){
    let rows = MEMBERS.filter(m => {
      if(state.docType && m.document_type !== state.docType) return false;
      if(state.education && m.education_level !== state.education) return false;
      if(state.occupation && m.occupation !== state.occupation) return false;
      if(state.gender && m.gender !== state.gender) return false;
      if(state.locality && m.locality !== state.locality) return false;
      if(state.neighborhood && m.neighborhood !== state.neighborhood) return false;

      const created = parseDate(m.created_at);
      if(state.dateFrom && (!created || created < state.dateFrom)) return false;
      if(state.dateTo && (!created || created > state.dateTo)) return false;

      if(state.search){
        const term = normalize(state.search);
        const haystack = normalize([memberName(m), memberDocument(m), m.email].filter(Boolean).join(' '));
        if(!haystack.includes(term)) return false;
      }

      return true;
    });

    rows.sort((a,b) => (parseDate(b.created_at) || 0) - (parseDate(a.created_at) || 0));
    return rows;
  }

  /* ============ RENDER TABLA ============ */

  function renderTable(){
    const filtered = getFilteredSorted();
    const totalPages = Math.max(1, Math.ceil(filtered.length / state.pageSize));
    if(state.page > totalPages) state.page = totalPages;
    const start = (state.page - 1) * state.pageSize;
    const pageRows = filtered.slice(start, start + state.pageSize);

    const tbody = document.getElementById('membersTableBody');

    if(pageRows.length === 0){
      tbody.innerHTML = `<tr><td colspan="6" class="loans-table__empty">No se encontraron afiliados con estos filtros.</td></tr>`;
    }else{
      tbody.innerHTML = pageRows.map(m => `
        <tr data-id="${m.id}">
          <td>${memberDocument(m)}</td>
          <td>${memberName(m)}</td>
          <td>${m.email || '–'}</td>
          <td>${m.contact_phone || '–'}</td>
          <td>${formatDateEs(parseDate(m.created_at))}</td>
          <td>
            <div class="loans-table__actions">
              <button type="button" class="icon-action member-view-btn" data-id="${m.id}" aria-label="Ver detalle del afiliado">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>
              </button>
              <button type="button" class="icon-action member-edit-btn" data-id="${m.id}" aria-label="Editar afiliado">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>
              </button>
              <button type="button" class="icon-action icon-action--danger member-delete-btn" data-id="${m.id}" aria-label="Eliminar afiliado">
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
      rangeEl.textContent = 'Mostrando 0 de 0 afiliados';
    }else{
      rangeEl.textContent = `Mostrando ${start+1} – ${start+shown} de ${totalFiltered} afiliados`;
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
    document.querySelectorAll('.member-view-btn').forEach(btn => {
      btn.addEventListener('click', () => openMemberDetailModal(Number(btn.dataset.id)));
    });
    document.querySelectorAll('.member-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => openMemberModal(Number(btn.dataset.id)));
    });
    document.querySelectorAll('.member-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => openDeleteModal(Number(btn.dataset.id)));
    });
  }

  /* ============ FILTROS: EVENTOS ============ */

  function initFilters(){
    const searchInput = document.getElementById('filterSearch');
    const docTypeSelect = document.getElementById('filterDocType');
    const educationSelect = document.getElementById('filterEducation');
    const occupationSelect = document.getElementById('filterOccupation');
    const genderSelect = document.getElementById('filterGender');
    const localitySelect = document.getElementById('filterLocality');
    const neighborhoodSelect = document.getElementById('filterNeighborhood');
    const dateFromInput = document.getElementById('filterDateFrom');
    const dateToInput = document.getElementById('filterDateTo');
    const pageSizeSelect = document.getElementById('pageSizeSelect');
    const filterToggle = document.getElementById('filterToggle');
    const filterRowExtra = document.getElementById('filterRowExtra');
    const clearBtn = document.getElementById('clearFiltersBtn');

    searchInput.addEventListener('input', () => { state.search = searchInput.value.trim(); state.page = 1; renderTable(); });
    docTypeSelect.addEventListener('change', () => { state.docType = docTypeSelect.value; state.page = 1; renderTable(); });
    educationSelect.addEventListener('change', () => { state.education = educationSelect.value; state.page = 1; renderTable(); });
    occupationSelect.addEventListener('change', () => { state.occupation = occupationSelect.value; state.page = 1; renderTable(); });
    genderSelect.addEventListener('change', () => { state.gender = genderSelect.value; state.page = 1; renderTable(); });

    localitySelect.addEventListener('change', () => {
      state.locality = localitySelect.value;
      state.neighborhood = '';
      updateNeighborhoodOptions();
      state.page = 1;
      renderTable();
    });
    neighborhoodSelect.addEventListener('change', () => { state.neighborhood = neighborhoodSelect.value; state.page = 1; renderTable(); });

    dateFromInput.addEventListener('change', () => { state.dateFrom = dateFromInput.value ? parseDate(dateFromInput.value) : null; state.page = 1; renderTable(); });
    dateToInput.addEventListener('change', () => { state.dateTo = dateToInput.value ? parseDate(dateToInput.value) : null; state.page = 1; renderTable(); });

    pageSizeSelect.addEventListener('change', () => { state.pageSize = Number(pageSizeSelect.value); state.page = 1; renderTable(); });

    filterToggle.addEventListener('click', () => {
      const isHidden = filterRowExtra.hidden;
      filterRowExtra.hidden = !isHidden;
      filterToggle.classList.toggle('is-active', isHidden);
    });

    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      docTypeSelect.value = ''; educationSelect.value = ''; occupationSelect.value = ''; genderSelect.value = '';
      localitySelect.value = ''; neighborhoodSelect.value = '';
      dateFromInput.value = ''; dateToInput.value = '';
      Object.assign(state, {
        search:'', docType:'', education:'', occupation:'', gender:'',
        locality:'', neighborhood:'', dateFrom:null, dateTo:null, page:1,
      });
      updateNeighborhoodOptions();
      renderTable();
    });
  }

  /* ============ MODAL: VER DETALLE DEL AFILIADO ============ */

  function yesNo(value){ return value ? 'Sí' : 'No'; }

  function openMemberDetailModal(memberId){
    const m = MEMBERS.find(x => x.id === memberId);
    if(!m) return;

    document.getElementById('memberDetailName').textContent = memberName(m);

    const fields = [
      ['Documento', memberDocument(m) || '–'],
      ['Fecha de nacimiento', m.birth_date ? formatDateEs(parseDate(m.birth_date)) : '–'],
      ['Nacionalidad', m.nationality_country || '–'],
      ['Género', m.gender || '–'],
      ['Correo electrónico', m.email || '–'],
      ['Teléfono de contacto', m.contact_phone || '–'],
      ['Nombre de contacto', m.contact_name || '–'],
      ['Ocupación', m.occupation || '–'],
      ['Nivel educativo', m.education_level || '–'],
      ['Localidad', m.locality || '–'],
      ['Barrio', m.neighborhood || '–'],
      ['Dirección', m.address || '–'],
      ['Contacto de emergencia', m.emergency_contact_name || '–'],
      ['Teléfono de emergencia', m.emergency_contact_phone || '–'],
      ['Desea agenda cultural', yesNo(m.wants_cultural_agenda)],
      ['Acuerdo aceptado', yesNo(m.agreement_accepted)],
      ['Fecha de afiliación', m.created_at ? formatDateEs(parseDate(m.created_at)) : '–'],
    ];

    document.getElementById('memberDetailFields').innerHTML = fields.map(([label, value]) => `
      <div><dt>${label}</dt><dd>${value}</dd></div>
    `).join('');

    document.getElementById('memberDetailModal').hidden = false;
  }
  function closeMemberDetailModal(){
    document.getElementById('memberDetailModal').hidden = true;
  }

  /* ============ MODAL: EDITAR AFILIADO ============ */

  function openMemberModal(memberId){
    editingMemberId = memberId;
    const m = MEMBERS.find(x => x.id === memberId);
    if(!m) return;

    document.getElementById('memberFirstName').value = m.first_name || '';
    document.getElementById('memberLastName').value = m.last_name || '';
    document.getElementById('memberDocType').value = m.document_type || 'CC';
    document.getElementById('memberDocNumber').value = m.document_number || '';
    document.getElementById('memberEmail').value = m.email || '';
    document.getElementById('memberPhone').value = m.contact_phone || '';
    document.getElementById('memberBirthDate').value = m.birth_date ? String(m.birth_date).slice(0,10) : '';
    document.getElementById('memberGender').value = m.gender || '';
    document.getElementById('memberOccupation').value = m.occupation || '';
    document.getElementById('memberEducation').value = m.education_level || '';
    document.getElementById('memberLocality').value = m.locality || '';
    document.getElementById('memberNeighborhood').value = m.neighborhood || '';
    document.getElementById('memberAddress').value = m.address || '';
    document.getElementById('memberEmergencyName').value = m.emergency_contact_name || '';
    document.getElementById('memberEmergencyPhone').value = m.emergency_contact_phone || '';
    document.getElementById('memberCreatedAt').value = m.created_at ? String(m.created_at).slice(0,10) : '';
    document.getElementById('memberCulturalAgenda').checked = !!m.wants_cultural_agenda;

    document.getElementById('memberModal').hidden = false;
  }
  function closeMemberModal(){
    document.getElementById('memberModal').hidden = true;
    editingMemberId = null;
  }

  function saveMemberForm(e){
    e.preventDefault();
    const m = MEMBERS.find(x => x.id === editingMemberId);
    if(!m) return;

    Object.assign(m, {
      first_name: document.getElementById('memberFirstName').value.trim(),
      last_name: document.getElementById('memberLastName').value.trim(),
      document_type: document.getElementById('memberDocType').value,
      document_number: document.getElementById('memberDocNumber').value.trim(),
      email: document.getElementById('memberEmail').value.trim() || null,
      contact_phone: document.getElementById('memberPhone').value.trim() || null,
      birth_date: document.getElementById('memberBirthDate').value || null,
      gender: document.getElementById('memberGender').value.trim() || null,
      occupation: document.getElementById('memberOccupation').value.trim() || null,
      education_level: document.getElementById('memberEducation').value.trim() || null,
      locality: document.getElementById('memberLocality').value.trim() || null,
      neighborhood: document.getElementById('memberNeighborhood').value.trim() || null,
      address: document.getElementById('memberAddress').value.trim() || null,
      emergency_contact_name: document.getElementById('memberEmergencyName').value.trim() || null,
      emergency_contact_phone: document.getElementById('memberEmergencyPhone').value.trim() || null,
      created_at: document.getElementById('memberCreatedAt').value || m.created_at,
      wants_cultural_agenda: document.getElementById('memberCulturalAgenda').checked,
    });

    closeMemberModal();
    renderStats();
    populateFilterSelects();
    populateFormDatalists();
    renderTable();
  }

  /* ============ MODAL: CONFIRMAR ELIMINACIÓN ============ */

  function openDeleteModal(memberId){
    deletingMemberId = memberId;
    const m = MEMBERS.find(x => x.id === memberId);
    document.getElementById('deleteMemberName').textContent = `${memberName(m)} (${memberDocument(m)})`;
    document.getElementById('deleteMemberModal').hidden = false;
  }
  function closeDeleteModal(){
    document.getElementById('deleteMemberModal').hidden = true;
    deletingMemberId = null;
  }
  function confirmDelete(){
    MEMBERS = MEMBERS.filter(m => m.id !== deletingMemberId);
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
    await loadMembers();
    renderStats();
    populateFilterSelects();
    populateFormDatalists();
    initFilters();
    renderTable();

    document.getElementById('memberModalClose').addEventListener('click', closeMemberModal);
    document.getElementById('memberFormCancel').addEventListener('click', closeMemberModal);
    document.getElementById('memberForm').addEventListener('submit', saveMemberForm);
    initModalDismiss(document.getElementById('memberModal'), closeMemberModal);

    document.getElementById('memberDetailModalClose').addEventListener('click', closeMemberDetailModal);
    initModalDismiss(document.getElementById('memberDetailModal'), closeMemberDetailModal);

    document.getElementById('deleteMemberModalClose').addEventListener('click', closeDeleteModal);
    document.getElementById('deleteMemberCancel').addEventListener('click', closeDeleteModal);
    document.getElementById('deleteMemberConfirm').addEventListener('click', confirmDelete);
    initModalDismiss(document.getElementById('deleteMemberModal'), closeDeleteModal);
  }

  document.addEventListener('DOMContentLoaded', init);

})();