// =====================================================================
// Sugerencias
// =====================================================================

(function () {
  const baseUrl = (window.LIBRARY_API && window.LIBRARY_API.baseUrl) || '';
  const SUGGESTIONS_ENDPOINT = `${baseUrl}/suggestions`;

  // -------------------------------------------------------------------
  // Estilos propios del widget
  // -------------------------------------------------------------------
  const style = document.createElement('style');
  style.textContent = `
    .suggestion-fields{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;}
    .suggestion-fields input{
      width:100%;border:1px solid var(--border);border-radius:10px;padding:10px 12px;
      font-family:inherit;font-size:.86rem;color:var(--ink);
    }
    .suggestion-fields input:focus{outline:none;border-color:var(--orange-500);}
    .suggestion-fields input.is-invalid,
    #suggestionForm textarea.is-invalid{border-color:#C33;}
    .suggestion-error{
      background:#FDECEA;color:#B3261E;border:1px solid #F5C6C1;border-radius:10px;
      padding:10px 14px;font-size:.82rem;margin:0 0 12px;
    }
    .suggestion-success{text-align:center;padding:10px 4px;}
    .suggestion-success__icon{
      width:58px;height:58px;border-radius:50%;background:#E6F4EA;color:#1E8E3E;
      display:flex;align-items:center;justify-content:center;margin:0 auto 12px;
    }
    .suggestion-success h3{margin-bottom:6px;}
    .suggestion-success p{color:var(--muted);font-size:.9rem;margin:0 0 16px;}
    @media(max-width:480px){.suggestion-fields{grid-template-columns:1fr;}}
  `;
  document.head.appendChild(style);

  // -------------------------------------------------------------------
  // Inyección del botón flotante y el modal
  // -------------------------------------------------------------------
  const fab = document.createElement('button');
  fab.className = 'fab';
  fab.id = 'suggestionFab';
  fab.type = 'button';
  fab.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
    <span>Deja tu<br>sugerencia</span>
  `;

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'suggestionModal';
  modal.hidden = true;
  modal.innerHTML = `
    <div class="modal__panel">
      <button class="modal__close" id="suggestionClose" aria-label="Cerrar" type="button">✕</button>
      <div id="suggestionBody">
        <h3>Cuéntanos tu sugerencia</h3>
        <p>Tu opinión nos ayuda a mejorar la biblioteca.</p>
        <form id="suggestionForm" novalidate>
          <div class="suggestion-fields">
            <input type="text" name="visitor_name" placeholder="Tu nombre" required>
            <input type="email" name="visitor_email" placeholder="Tu correo electrónico" required>
          </div>
          <textarea name="message" rows="4" placeholder="Escribe aquí tu idea o comentario..." required></textarea>
          <p class="suggestion-error" id="suggestionError" hidden></p>
          <button type="submit" class="btn btn--primary" id="suggestionSubmit">Enviar sugerencia</button>
        </form>
      </div>
      <div class="suggestion-success" id="suggestionSuccess" hidden>
        <span class="suggestion-success__icon">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M20 6 9 17l-5-5"/></svg>
        </span>
        <h3>¡Gracias por tu sugerencia!</h3>
        <p>La tendremos en cuenta para seguir mejorando la biblioteca.</p>
        <button type="button" class="btn btn--primary" id="suggestionDone">Cerrar</button>
      </div>
    </div>
  `;

  document.body.appendChild(fab);
  document.body.appendChild(modal);

  const body = modal.querySelector('#suggestionBody');
  const success = modal.querySelector('#suggestionSuccess');
  const formEl = modal.querySelector('#suggestionForm');
  const errorEl = modal.querySelector('#suggestionError');
  const submitBtn = modal.querySelector('#suggestionSubmit');

  // -------------------------------------------------------------------
  // Abrir / cerrar
  // -------------------------------------------------------------------
  function openModal() {
    body.hidden = false;
    success.hidden = true;
    errorEl.hidden = true;
    modal.hidden = false;
  }

  function closeModal() {
    modal.hidden = true;
    formEl.reset();
    formEl.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
  }

  fab.addEventListener('click', openModal);
  modal.querySelector('#suggestionClose').addEventListener('click', closeModal);
  modal.querySelector('#suggestionDone').addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !modal.hidden) closeModal();
  });

  // -------------------------------------------------------------------
  // Validación y envío
  // -------------------------------------------------------------------
  function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  function validate() {
    let valid = true;
    formEl.querySelectorAll('input, textarea').forEach(el => {
      const ok = el.checkValidity() && el.value.trim().length > 0;
      el.classList.toggle('is-invalid', !ok);
      valid = valid && ok;
    });
    return valid;
  }

  formEl.querySelectorAll('input, textarea').forEach(el => {
    el.addEventListener('input', () => el.classList.remove('is-invalid'));
  });

  formEl.addEventListener('submit', async e => {
    e.preventDefault();
    errorEl.hidden = true;

    if (!validate()) {
      showError('Completa tu nombre, un correo válido y tu sugerencia.');
      return;
    }

    if (!baseUrl || baseUrl.includes('TU-API-AQUI')) {
      showError('El formulario aún no está conectado al servidor. Configura baseUrl en js/config.js.');
      return;
    }

    const data = new FormData(formEl);
    const payload = {
      message: data.get('message').trim(),
      visitor_name: data.get('visitor_name').trim(),
      visitor_email: data.get('visitor_email').trim()
    };

    submitBtn.disabled = true;
    submitBtn.textContent = 'Enviando...';

    try {
      const res = await fetch(SUGGESTIONS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        let detail = '';
        try {
          const resBody = await res.json();
          detail = (resBody.error && resBody.error.message) || resBody.message || '';
        } catch (_) { /* respuesta sin JSON */ }
        throw new Error(detail || `El servidor respondió con el código ${res.status}.`);
      }

      formEl.reset();
      body.hidden = true;
      success.hidden = false;
    } catch (err) {
      console.error(err);
      const message = err instanceof TypeError
        ? 'No pudimos conectar con el servidor. Verifica tu conexión y la configuración del API (CORS).'
        : `No pudimos enviar tu sugerencia: ${err.message}`;
      showError(`${message} Inténtalo de nuevo.`);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Enviar sugerencia';
    }
  });
})();