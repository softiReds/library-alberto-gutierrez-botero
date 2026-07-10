// =====================================================================
// Afiliación — validación, envío al API y mensaje de éxito
// =====================================================================

const API_BASE_URL = (window.LIBRARY_API && window.LIBRARY_API.baseUrl) || '';
const MEMBERS_ENDPOINT = `${API_BASE_URL}/members`;

const PAISES = [
  'Colombia','Venezuela','Ecuador','Perú','Bolivia','Brasil','Chile','Argentina',
  'Uruguay','Paraguay','Panamá','Costa Rica','Nicaragua','Honduras','El Salvador',
  'Guatemala','México','Cuba','República Dominicana','Haití','Estados Unidos',
  'Canadá','España','Otro'
];

const LOCALIDADES_BOGOTA = [
  'Usaquén','Chapinero','Santa Fe','San Cristóbal','Usme','Tunjuelito','Bosa',
  'Kennedy','Fontibón','Engativá','Suba','Barrios Unidos','Teusaquillo',
  'Los Mártires','Antonio Nariño','Puente Aranda','La Candelaria',
  'Rafael Uribe Uribe','Ciudad Bolívar','Sumapaz','Otra'
];

const form = document.getElementById('affiliationForm');
const successEl = document.getElementById('affiliationSuccess');
const errorEl = document.getElementById('formError');
const submitBtn = document.getElementById('submitBtn');

// ---------------------------------------------------------------------
// Poblar selects
// ---------------------------------------------------------------------
function fillSelect(name, options) {
  const select = form.querySelector(`select[name="${name}"]`);
  options.forEach(opt => {
    const el = document.createElement('option');
    el.value = opt;
    el.textContent = opt;
    select.appendChild(el);
  });
}

fillSelect('nationality_country', PAISES);
fillSelect('locality', LOCALIDADES_BOGOTA);

// ---------------------------------------------------------------------
// Validación
// ---------------------------------------------------------------------
function validateField(el) {
  let valid = el.checkValidity();

  if (valid && (el.name === 'contact_phone' || el.name === 'emergency_contact_phone')) {
    valid = /^\d{7,10}$/.test(el.value.trim());
  }
  if (valid && el.name === 'document_number') {
    valid = /^[\dA-Za-z-]{4,15}$/.test(el.value.trim());
  }
  if (valid && el.name === 'birth_date' && el.value) {
    const d = new Date(el.value);
    const now = new Date();
    valid = d < now && d.getFullYear() > 1900;
  }

  el.classList.toggle('is-invalid', !valid);
  return valid;
}

function validateForm() {
  let allValid = true;
  let firstInvalid = null;

  form.querySelectorAll('input, select').forEach(el => {
    const ok = validateField(el);
    if (!ok && !firstInvalid) firstInvalid = el;
    allValid = allValid && ok;
  });

  if (firstInvalid) {
    firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
    firstInvalid.focus({ preventScroll: true });
  }
  return allValid;
}

form.querySelectorAll('input, select').forEach(el => {
  el.addEventListener('input', () => el.classList.remove('is-invalid'));
  el.addEventListener('blur', () => { if (el.value) validateField(el); });
});

// ---------------------------------------------------------------------
// Construcción del payload
// ---------------------------------------------------------------------
function buildPayload() {
  const data = new FormData(form);
  const emergencyName = data.get('emergency_contact_name').trim();

  return {
    document_type: data.get('document_type'),
    document_number: data.get('document_number').trim(),
    birth_date: data.get('birth_date'),
    nationality_country: data.get('nationality_country'),
    email: data.get('email').trim(),
    gender: data.get('gender'),
    first_name: data.get('first_name').trim(),
    last_name: data.get('last_name').trim(),
    occupation: data.get('occupation').trim(),
    education_level: data.get('education_level'),
    locality: data.get('locality'),
    neighborhood: data.get('neighborhood').trim(),
    address: data.get('address').trim(),
    contact_phone: data.get('contact_phone').trim(),
    contact_name: emergencyName,
    emergency_contact_name: emergencyName,
    emergency_contact_phone: data.get('emergency_contact_phone').trim(),
    agreement_accepted: document.getElementById('agreementAccepted').checked
  };
}

// ---------------------------------------------------------------------
// Envío
// ---------------------------------------------------------------------
function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
  errorEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function showSuccess() {
  form.hidden = true;
  successEl.hidden = false;
  successEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  errorEl.hidden = true;

  const agreementCheckbox = document.getElementById('agreementAccepted');
  if (!agreementCheckbox.checked) {
    agreementCheckbox.classList.add('is-invalid');
    showError('Debes aceptar el compromiso de responsabilidad para continuar con la afiliación.');
    agreementCheckbox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  if (!validateForm()) {
    showError('Por favor revisa los campos marcados en rojo. Todos los datos son requeridos.');
    return;
  }

  if (!API_BASE_URL || API_BASE_URL.includes('TU-API-AQUI')) {
    showError('El formulario aún no está conectado al servidor. Configura baseUrl en js/config.js con la URL de tu API.');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Registrando...';

  try {
    const res = await fetch(MEMBERS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload())
    });

    if (!res.ok) {
      let detail = '';
      try {
        const body = await res.json();
        detail = (body.error && body.error.message) || body.message || '';
      } catch (_) { /* respuesta sin JSON */ }
      throw new Error(detail || `El servidor respondió con el código ${res.status}.`);
    }

    showSuccess();
  } catch (err) {
    console.error(err);
    const message = err instanceof TypeError
      ? 'No pudimos conectar con el servidor. Verifica tu conexión a internet, que la URL del API sea correcta y que el servidor permita peticiones desde esta página (CORS).'
      : `No pudimos registrar tu afiliación: ${err.message}`;
    showError(`${message} Inténtalo de nuevo o acércate a la biblioteca.`);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Registrar afiliación';
  }
});

// ---------------------------------------------------------------------
// Controles
// ---------------------------------------------------------------------
document.getElementById('navSearchToggle').addEventListener('click', () => {
  window.location.href = 'index.html#catalogo';
});

// ---------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------
initStaticReveals();