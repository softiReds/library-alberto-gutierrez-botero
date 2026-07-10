// =====================================================================
// Kiosco de auto-registro de asistencia
// POST {baseUrl}/attendance (pública, sin token) — un solo propósito:
// registrar visitas desde una tablet fija en recepción, sin login ni
// navegación hacia el resto del sitio.
// =====================================================================

(function () {
  'use strict';

  const API_BASE_URL = (window.LIBRARY_API && window.LIBRARY_API.baseUrl) || '';
  const ATTENDANCE_URL = `${API_BASE_URL}/attendance`;
  const THANKS_DURATION_MS = 3500;

  const form = document.getElementById('attendanceForm');
  const nameInput = document.getElementById('visitorName');
  const phoneInput = document.getElementById('visitorPhone');
  const ageInput = document.getElementById('visitorAge');
  const genderGroup = document.getElementById('genderGroup');
  const genderButtons = Array.from(genderGroup.querySelectorAll('.kiosk-gender-btn'));
  const errorEl = document.getElementById('kioskError');
  const submitBtn = document.getElementById('submitBtn');

  const formScreen = document.getElementById('formScreen');
  const thanksScreen = document.getElementById('thanksScreen');

  let selectedGender = null;

  // ---------------------------------------------------------------------
  // Selector de género
  // ---------------------------------------------------------------------
  genderButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      selectedGender = btn.dataset.value;
      genderButtons.forEach(b => b.classList.toggle('is-selected', b === btn));
      genderGroup.classList.remove('is-invalid');
    });
  });

  // ---------------------------------------------------------------------
  // Errores
  // ---------------------------------------------------------------------
  function hideError() {
    errorEl.hidden = true;
    errorEl.textContent = '';
  }

  function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  // ---------------------------------------------------------------------
  // Reset y cambio de pantalla
  // ---------------------------------------------------------------------
  function resetForm() {
    form.reset();
    selectedGender = null;
    genderButtons.forEach(b => b.classList.remove('is-selected'));
    ageInput.classList.remove('is-invalid');
    genderGroup.classList.remove('is-invalid');
    hideError();
  }

  function showThanks() {
    formScreen.hidden = true;
    thanksScreen.hidden = false;
    setTimeout(() => {
      resetForm();
      thanksScreen.hidden = true;
      formScreen.hidden = false;
    }, THANKS_DURATION_MS);
  }

  // ---------------------------------------------------------------------
  // Envío
  // ---------------------------------------------------------------------
  form.addEventListener('submit', async e => {
    e.preventDefault();
    hideError();

    const ageRaw = ageInput.value.trim();
    let valid = true;

    if (!ageRaw || Number(ageRaw) < 0 || Number(ageRaw) > 120) {
      ageInput.classList.add('is-invalid');
      valid = false;
    } else {
      ageInput.classList.remove('is-invalid');
    }

    if (!selectedGender) {
      genderGroup.classList.add('is-invalid');
      valid = false;
    }

    if (!valid) {
      showError('Por favor indica tu edad y selecciona tu género para continuar.');
      return;
    }

    const payload = { age: Number(ageRaw), gender: selectedGender };
    const name = nameInput.value.trim();
    const phone = phoneInput.value.trim();
    if (name) payload.visitor_name = name;
    if (phone) payload.visitor_phone = phone;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Enviando...';

    try {
      const res = await fetch(ATTENDANCE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        throw new Error(`El servidor respondió con el código ${res.status}.`);
      }

      showThanks();
    } catch (err) {
      console.error('No se pudo registrar la visita.', err);
      showError('No pudimos registrar tu visita. Intenta de nuevo.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Registrar visita';
    }
  });
})();
