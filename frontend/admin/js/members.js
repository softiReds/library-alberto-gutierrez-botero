/* =====================================================================
   Panel Admin — Afiliaciones (js)
   GET/POST/PUT /members y GET /members/filters, vía apiFetch.
   ===================================================================== */
(function () {
  'use strict';

  const token = window.BAGBAuth && window.BAGBAuth.getToken();
  if (!token) {
    window.location.replace('index.html');
    return;
  }

  const SEARCH_DEBOUNCE_MS = 350;

  // Misma lista oficial de localidades de Bogotá usada en el formulario
  // público de afiliación (frontend/public/js/affiliation.js), para que el
  // modal del panel ofrezca siempre las mismas opciones.
  const LOCALIDADES_BOGOTA = [
    'Usaquén', 'Chapinero', 'Santa Fe', 'San Cristóbal', 'Usme', 'Tunjuelito', 'Bosa',
    'Kennedy', 'Fontibón', 'Engativá', 'Suba', 'Barrios Unidos', 'Teusaquillo',
    'Los Mártires', 'Antonio Nariño', 'Puente Aranda', 'La Candelaria',
    'Rafael Uribe Uribe', 'Ciudad Bolívar', 'Sumapaz', 'Otra'
  ];

  let MEMBERS = [];       // solo los afiliados de la página actual
  let currentPage = 1;
  let currentPageSize = 10;
  let currentTotal = 0;
  let loadRequestId = 0;
  let searchDebounceTimer = null;
  let editingId = null;   // id del afiliado en edición (null = creando uno nuevo)

  const filters = {
    search: '',
    documentType: '',
    educationLevel: '',
    occupation: '',
    gender: '',
    locality: '',
    neighborhood: '',
    dateFrom: '',
    dateTo: ''
  };

  /* ============ API — apiFetch agrega el token y parsea errores ============ */

  const api = {
    async list() {
      const params = new URLSearchParams({
        page: String(currentPage),
        page_size: String(currentPageSize)
      });
      if (filters.search) params.set('search', filters.search);
      if (filters.documentType) params.set('document_type', filters.documentType);
      if (filters.educationLevel) params.set('education_level', filters.educationLevel);
      if (filters.occupation) params.set('occupation', filters.occupation);
      if (filters.gender) params.set('gender', filters.gender);
      if (filters.locality) params.set('locality', filters.locality);
      if (filters.neighborhood) params.set('neighborhood', filters.neighborhood);
      if (filters.dateFrom) params.set('date_from', filters.dateFrom);
      if (filters.dateTo) params.set('date_to', filters.dateTo);
      return window.BAGBApi.apiFetch(`/members?${params.toString()}`);
    },
    async filterOptions() {
      return window.BAGBApi.apiFetch('/members/filters');
    },
    async create(payload) {
      return window.BAGBApi.apiFetch('/members', { method: 'POST', body: payload });
    },
    async update(id, payload) {
      return window.BAGBApi.apiFetch(`/members/${id}`, { method: 'PUT', body: payload });
    }
  };

  /* ============ UTILIDADES ============ */

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

  function memberName(m) { return `${m.first_name || ''} ${m.last_name || ''}`.trim() || 'Sin nombre'; }
  function memberDocument(m) { return `${m.document_type || ''} ${m.document_number || ''}`.trim(); }
  function yesNo(value) { return value ? 'Sí' : 'No'; }

  /* ============ Referencias DOM ============ */

  const tbody = document.getElementById('membersTableBody');
  const statTotalEl = document.getElementById('statTotal');
  const rangeEl = document.getElementById('resultsRange');
  const paginationEl = document.getElementById('pagination');

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

  const memberModal = document.getElementById('memberModal');
  const memberForm = document.getElementById('memberForm');
  const memberFormTitle = document.getElementById('memberFormTitle');
  const memberFormSubmit = document.getElementById('memberFormSubmit');
  const memberFormError = document.getElementById('memberFormError');

  const memberDetailModal = document.getElementById('memberDetailModal');

  // Valores conocidos para los selects abiertos del modal (Ocupación,
  // Barrio) — se usan tanto para poblar el <select> como para decidir, al
  // editar un afiliado, si su valor actual ya está en la lista o si hay
  // que mostrarlo en el input "Otro (especificar)". Género, Nivel educativo
  // y Localidad no lo necesitan: son listas fijas (iguales a las del
  // formulario público de afiliación).
  const OTHER_VALUE = '__other__';
  let knownOccupations = [];
  let knownNeighborhoods = [];

  /* ============ Carga de opciones de filtro (GET /members/filters) ============ */

  function fillSelect(selectEl, values, allLabel) {
    const current = selectEl.value;
    selectEl.innerHTML = `<option value="">${allLabel}</option>` +
      values.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
    if (values.includes(current)) selectEl.value = current;
  }

  function fillModalSelect(selectEl, values, otherLabel) {
    const current = selectEl.value;
    selectEl.innerHTML = `<option value="">Selecciona…</option>` +
      values.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('') +
      `<option value="${OTHER_VALUE}">${escapeHtml(otherLabel)}</option>`;
    if (values.includes(current) || current === OTHER_VALUE) selectEl.value = current;
  }

  async function loadFilterOptions() {
    let opts;
    try {
      opts = await api.filterOptions();
    } catch (err) {
      console.error('No se pudieron cargar las opciones de filtro.', err);
      return;
    }

    fillSelect(docTypeSelect, opts.document_types, 'Todos');
    fillSelect(educationSelect, opts.education_levels, 'Todos');
    fillSelect(occupationSelect, opts.occupations, 'Todas');
    fillSelect(genderSelect, opts.genders, 'Todos');
    fillSelect(localitySelect, opts.localities, 'Todas');
    fillSelect(neighborhoodSelect, opts.neighborhoods, 'Todos');

    knownOccupations = opts.occupations;
    knownNeighborhoods = opts.neighborhoods;

    fillModalSelect(document.getElementById('memberOccupation'), knownOccupations, 'Otra (especificar)');
    fillModalSelect(document.getElementById('memberNeighborhood'), knownNeighborhoods, 'Otro (especificar)');
  }

  // Localidad usa la misma lista fija del formulario público — se puebla
  // una sola vez, no depende de los datos de afiliados existentes.
  function fillMemberLocalitySelect() {
    const selectEl = document.getElementById('memberLocality');
    selectEl.innerHTML = `<option value="">Selecciona…</option>` +
      LOCALIDADES_BOGOTA.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
  }

  /* ============ Selects del modal con opción "Otro (especificar)" ============ */

  function initOtherToggle(selectId, otherId) {
    const selectEl = document.getElementById(selectId);
    const otherEl = document.getElementById(otherId);
    selectEl.addEventListener('change', () => {
      const isOther = selectEl.value === OTHER_VALUE;
      otherEl.hidden = !isOther;
      if (isOther) otherEl.focus();
      else otherEl.value = '';
    });
  }

  // Al editar, si el valor guardado no está entre los conocidos, se
  // selecciona "Otro (especificar)" y se precarga ese valor en el input.
  function setSelectOrOther(selectId, otherId, knownValues, value) {
    const selectEl = document.getElementById(selectId);
    const otherEl = document.getElementById(otherId);
    if (value && !knownValues.includes(value)) {
      selectEl.value = OTHER_VALUE;
      otherEl.hidden = false;
      otherEl.value = value;
    } else {
      selectEl.value = value || '';
      otherEl.hidden = true;
      otherEl.value = '';
    }
  }

  function getSelectOrOtherValue(selectId, otherId) {
    const selectEl = document.getElementById(selectId);
    if (selectEl.value === OTHER_VALUE) {
      return document.getElementById(otherId).value.trim() || null;
    }
    return selectEl.value.trim() || null;
  }

  /* ============ Carga y render de la tabla ============ */

  async function loadMembers() {
    const requestId = ++loadRequestId;
    tbody.innerHTML = `<tr><td colspan="6" class="loans-table__empty">Cargando afiliados…</td></tr>`;
    paginationEl.innerHTML = '';

    let data;
    try {
      data = await api.list();
    } catch (err) {
      if (requestId !== loadRequestId) return;
      console.error('No se pudo cargar la lista de afiliados.', err);
      tbody.innerHTML = `<tr><td colspan="6" class="loans-table__empty">No se pudo cargar la lista: ${escapeHtml(err.message)}</td></tr>`;
      rangeEl.textContent = 'Sin resultados';
      return;
    }

    if (requestId !== loadRequestId) return; // respuesta obsoleta, se descarta

    MEMBERS = data.data;
    currentTotal = data.total;

    renderTable();
    renderPagination();
    statTotalEl.textContent = currentTotal.toLocaleString('es-CO');
    renderRange();
  }

  function renderRange() {
    if (currentTotal === 0) {
      rangeEl.textContent = 'Mostrando 0 de 0 afiliados';
      return;
    }
    const start = (currentPage - 1) * currentPageSize + 1;
    const end = Math.min(currentPage * currentPageSize, currentTotal);
    rangeEl.textContent = `Mostrando ${start} – ${end} de ${currentTotal.toLocaleString('es-CO')} afiliados`;
  }

  function renderTable() {
    if (!MEMBERS.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="loans-table__empty">No se encontraron afiliados con estos filtros.</td></tr>`;
      return;
    }

    tbody.innerHTML = MEMBERS.map(m => `
      <tr data-id="${m.id}">
        <td>${escapeHtml(memberDocument(m))}</td>
        <td>${escapeHtml(memberName(m))}</td>
        <td>${escapeHtml(m.email || '–')}</td>
        <td>${escapeHtml(m.contact_phone || '–')}</td>
        <td>${formatDateEs(m.created_at)}</td>
        <td>
          <div class="loans-table__actions">
            <button type="button" class="icon-action member-view-btn" data-id="${m.id}" aria-label="Ver detalle del afiliado">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            <button type="button" class="icon-action member-edit-btn" data-id="${m.id}" aria-label="Editar afiliado">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.member-view-btn').forEach(btn => {
      btn.addEventListener('click', () => openMemberDetailModal(btn.dataset.id));
    });
    tbody.querySelectorAll('.member-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => openMemberModal(btn.dataset.id));
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
          loadMembers();
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
    searchInput.addEventListener('input', () => {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        filters.search = searchInput.value.trim();
        currentPage = 1;
        loadMembers();
      }, SEARCH_DEBOUNCE_MS);
    });

    docTypeSelect.addEventListener('change', () => { filters.documentType = docTypeSelect.value; currentPage = 1; loadMembers(); });
    educationSelect.addEventListener('change', () => { filters.educationLevel = educationSelect.value; currentPage = 1; loadMembers(); });
    occupationSelect.addEventListener('change', () => { filters.occupation = occupationSelect.value; currentPage = 1; loadMembers(); });
    genderSelect.addEventListener('change', () => { filters.gender = genderSelect.value; currentPage = 1; loadMembers(); });
    localitySelect.addEventListener('change', () => { filters.locality = localitySelect.value; currentPage = 1; loadMembers(); });
    neighborhoodSelect.addEventListener('change', () => { filters.neighborhood = neighborhoodSelect.value; currentPage = 1; loadMembers(); });

    dateFromInput.addEventListener('change', () => { filters.dateFrom = dateFromInput.value; currentPage = 1; loadMembers(); });
    dateToInput.addEventListener('change', () => { filters.dateTo = dateToInput.value; currentPage = 1; loadMembers(); });

    pageSizeSelect.addEventListener('change', () => {
      currentPageSize = Number(pageSizeSelect.value);
      currentPage = 1;
      loadMembers();
    });

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
      Object.assign(filters, {
        search: '', documentType: '', educationLevel: '', occupation: '', gender: '',
        locality: '', neighborhood: '', dateFrom: '', dateTo: ''
      });
      currentPage = 1;
      loadMembers();
    });
  }

  /* ============ Modal: ver detalle del afiliado ============ */

  function openMemberDetailModal(id) {
    const m = MEMBERS.find(x => x.id === id);
    if (!m) return;

    document.getElementById('memberDetailName').textContent = memberName(m);

    const fields = [
      ['Documento', memberDocument(m) || '–'],
      ['Fecha de nacimiento', m.birth_date ? formatDateEs(m.birth_date) : '–'],
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
      ['Fecha de afiliación', m.created_at ? formatDateEs(m.created_at) : '–']
    ];

    document.getElementById('memberDetailFields').innerHTML = fields.map(([label, value]) => `
      <div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(String(value))}</dd></div>
    `).join('');

    memberDetailModal.hidden = false;
  }

  function closeMemberDetailModal() {
    memberDetailModal.hidden = true;
  }

  /* ============ Modal: agregar / editar afiliado ============ */

  function hideFormError() {
    memberFormError.hidden = true;
    memberFormError.textContent = '';
  }

  function showFormError(message) {
    memberFormError.textContent = message;
    memberFormError.hidden = false;
  }

  function openMemberModal(id) {
    memberForm.reset();
    hideFormError();

    const m = id ? MEMBERS.find(x => x.id === id) : null;
    editingId = m ? m.id : null;

    if (m) {
      memberFormTitle.textContent = 'Editar afiliado';
      memberFormSubmit.textContent = 'Guardar cambios';

      document.getElementById('memberFirstName').value = m.first_name || '';
      document.getElementById('memberLastName').value = m.last_name || '';
      document.getElementById('memberDocType').value = m.document_type || 'CC';
      document.getElementById('memberDocNumber').value = m.document_number || '';
      document.getElementById('memberEmail').value = m.email || '';
      document.getElementById('memberPhone').value = m.contact_phone || '';
      document.getElementById('memberBirthDate').value = m.birth_date ? m.birth_date.slice(0, 10) : '';
      document.getElementById('memberGender').value = m.gender || '';
      document.getElementById('memberEducation').value = m.education_level || '';
      document.getElementById('memberLocality').value = m.locality || '';
      setSelectOrOther('memberOccupation', 'memberOccupationOther', knownOccupations, m.occupation);
      setSelectOrOther('memberNeighborhood', 'memberNeighborhoodOther', knownNeighborhoods, m.neighborhood);
      document.getElementById('memberAddress').value = m.address || '';
      document.getElementById('memberEmergencyName').value = m.emergency_contact_name || '';
      document.getElementById('memberEmergencyPhone').value = m.emergency_contact_phone || '';
      document.getElementById('memberCreatedAt').value = m.created_at ? m.created_at.slice(0, 10) : '';
      document.getElementById('memberCulturalAgenda').checked = !!m.wants_cultural_agenda;
    } else {
      memberFormTitle.textContent = 'Agregar afiliado';
      memberFormSubmit.textContent = 'Guardar afiliado';
      document.getElementById('memberDocType').value = 'CC';
      document.getElementById('memberCreatedAt').value = '';
      document.getElementById('memberCreatedAt').placeholder = 'Se asigna automáticamente al guardar';
      ['memberOccupationOther', 'memberNeighborhoodOther'].forEach(otherId => {
        document.getElementById(otherId).hidden = true;
      });
    }

    document.getElementById('memberCreatedAt').disabled = true;

    memberModal.hidden = false;
    document.getElementById('memberFirstName').focus();
  }

  function closeMemberModal() {
    memberModal.hidden = true;
    editingId = null;
  }

  async function saveMemberForm(e) {
    e.preventDefault();
    hideFormError();

    const firstName = document.getElementById('memberFirstName').value.trim();
    const lastName = document.getElementById('memberLastName').value.trim();
    const documentNumber = document.getElementById('memberDocNumber').value.trim();
    const email = document.getElementById('memberEmail').value.trim();

    if (!firstName || !lastName || !documentNumber || !email) {
      showFormError('Nombres, apellidos, número de documento y correo electrónico son obligatorios.');
      return;
    }

    // nationality_country y contact_name no tienen campo propio en este
    // formulario — se conservan tal cual venían al editar, y quedan
    // vacíos al crear (no hay forma de capturarlos desde acá todavía).
    const existing = editingId ? MEMBERS.find(x => x.id === editingId) : null;

    const payload = {
      first_name: firstName,
      last_name: lastName,
      document_type: document.getElementById('memberDocType').value,
      document_number: documentNumber,
      email,
      contact_phone: document.getElementById('memberPhone').value.trim() || null,
      birth_date: document.getElementById('memberBirthDate').value || null,
      gender: document.getElementById('memberGender').value.trim() || null,
      education_level: document.getElementById('memberEducation').value.trim() || null,
      locality: document.getElementById('memberLocality').value.trim() || null,
      occupation: getSelectOrOtherValue('memberOccupation', 'memberOccupationOther'),
      neighborhood: getSelectOrOtherValue('memberNeighborhood', 'memberNeighborhoodOther'),
      address: document.getElementById('memberAddress').value.trim() || null,
      emergency_contact_name: document.getElementById('memberEmergencyName').value.trim() || null,
      emergency_contact_phone: document.getElementById('memberEmergencyPhone').value.trim() || null,
      wants_cultural_agenda: document.getElementById('memberCulturalAgenda').checked,
      nationality_country: existing ? existing.nationality_country : null,
      contact_name: existing ? existing.contact_name : null,
      // El acuerdo de responsabilidad ya se firmó al afiliarse (o la
      // coordinadora lo tiene en físico si registra desde el panel);
      // este formulario no vuelve a pedirlo.
      agreement_accepted: existing ? existing.agreement_accepted : true
    };

    memberFormSubmit.disabled = true;
    try {
      if (editingId) {
        await api.update(editingId, payload);
      } else {
        await api.create(payload);
      }
      closeMemberModal();
      await loadFilterOptions();
      await loadMembers();
    } catch (err) {
      showFormError(err.message);
    } finally {
      memberFormSubmit.disabled = false;
    }
  }

  /* ============ Modales: cierre genérico ============ */

  function initModalDismiss(modalEl, closeFn) {
    modalEl.addEventListener('click', (e) => { if (e.target === modalEl) closeFn(); });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!memberModal.hidden) closeMemberModal();
    else if (!memberDetailModal.hidden) closeMemberDetailModal();
  });

  /* ============ Cerrar sesión ============ */

  document.getElementById('logoutBtn').addEventListener('click', () => {
    window.BAGBAuth.logout();
  });

  /* ============ Init ============ */

  async function init() {
    initFilters();

    document.getElementById('addMemberBtn').addEventListener('click', () => openMemberModal(null));
    document.getElementById('memberModalClose').addEventListener('click', closeMemberModal);
    document.getElementById('memberFormCancel').addEventListener('click', closeMemberModal);
    memberForm.addEventListener('submit', saveMemberForm);
    initModalDismiss(memberModal, closeMemberModal);

    document.getElementById('memberDetailModalClose').addEventListener('click', closeMemberDetailModal);
    initModalDismiss(memberDetailModal, closeMemberDetailModal);

    initOtherToggle('memberOccupation', 'memberOccupationOther');
    initOtherToggle('memberNeighborhood', 'memberNeighborhoodOther');
    fillMemberLocalitySelect();

    await loadFilterOptions();
    await loadMembers();
  }

  init();
})();
