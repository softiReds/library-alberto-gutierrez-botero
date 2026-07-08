/* ==========================================================
   LOGIN — Autenticación
   POST {baseUrl}/auth/login  (pública)
   ========================================================== */

(function () {
  'use strict';

  /* ---------- Configuración ---------- */

  // js/config.js
  const API_BASE = (window.LIBRARY_API && window.LIBRARY_API.baseUrl);

  const REDIRECT_URL = 'reporte.html';

  const TOKEN_KEY   = 'bagb_token';
  const EXPIRES_KEY = 'bagb_token_expires';
  const REMEMBER_USER_KEY = 'bagb_remember_user';

  const form        = document.getElementById('loginForm');
  const usernameEl  = document.getElementById('username');
  const passwordEl  = document.getElementById('password');
  const rememberEl  = document.getElementById('rememberMe');
  const alertEl     = document.getElementById('loginAlert');
  const submitBtn   = document.getElementById('submitBtn');
  const submitLabel = submitBtn.querySelector('.login-form__submit-label');
  const spinner     = submitBtn.querySelector('.login-form__spinner');
  const toggleBtn   = document.getElementById('togglePassword');
  const eyeOn       = toggleBtn.querySelector('.field__toggle-eye');
  const eyeOff      = toggleBtn.querySelector('.field__toggle-eye-off');
  const forgotLink  = document.getElementById('forgotLink');


  function saveSession(token, expiresAt, remember) {
    const store = remember ? window.localStorage : window.sessionStorage;
    const other = remember ? window.sessionStorage : window.localStorage;
    store.setItem(TOKEN_KEY, token);
    store.setItem(EXPIRES_KEY, expiresAt || '');
    other.removeItem(TOKEN_KEY);
    other.removeItem(EXPIRES_KEY);
  }

  function getValidSession() {
    const token =
      window.sessionStorage.getItem(TOKEN_KEY) ||
      window.localStorage.getItem(TOKEN_KEY);
    const expires =
      window.sessionStorage.getItem(EXPIRES_KEY) ||
      window.localStorage.getItem(EXPIRES_KEY);

    if (!token) return null;
    if (expires) {
      const expMs = Date.parse(expires);
      if (!Number.isNaN(expMs) && expMs <= Date.now()) {
        clearSession();
        return null;
      }
    }
    return token;
  }

  function clearSession() {
    [window.sessionStorage, window.localStorage].forEach(function (s) {
      s.removeItem(TOKEN_KEY);
      s.removeItem(EXPIRES_KEY);
    });
  }

  /* ---------- Estado inicial ---------- */

  if (getValidSession()) {
    window.location.replace(REDIRECT_URL);
    return;
  }
  
  const rememberedUser = window.localStorage.getItem(REMEMBER_USER_KEY);
  if (rememberedUser) {
    usernameEl.value = rememberedUser;
    rememberEl.checked = true;
  }

  /* ---------- Contraseña ---------- */

  toggleBtn.addEventListener('click', function () {
    const show = passwordEl.type === 'password';
    passwordEl.type = show ? 'text' : 'password';
    eyeOn.toggleAttribute('hidden', show);
    eyeOff.toggleAttribute('hidden', !show);
    toggleBtn.setAttribute('aria-pressed', String(show));
    toggleBtn.setAttribute(
      'aria-label',
      show ? 'Ocultar contraseña' : 'Mostrar contraseña'
    );
    passwordEl.focus();
  });

  /* ---------- Alertas ---------- */

  function showAlert(message) {
    alertEl.textContent = message;
    alertEl.hidden = false;
  }

  function hideAlert() {
    alertEl.hidden = true;
    alertEl.textContent = '';
  }

  function setLoading(loading) {
    submitBtn.disabled = loading;
    spinner.hidden = !loading;
    submitLabel.textContent = loading ? 'Verificando…' : 'Iniciar sesión';
  }

  /* ---------- Envío del formulario ---------- */

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    hideAlert();

    const username = usernameEl.value.trim();
    const password = passwordEl.value;

    if (!username || !password) {
      showAlert('Ingresa tu usuario y contraseña para continuar.');
      (!username ? usernameEl : passwordEl).focus();
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(API_BASE + '/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username, password: password })
      });

      let data = null;
      try { data = await res.json(); } catch (_) { /* respuesta sin cuerpo */ }

      if (res.ok && data && data.token) {
        saveSession(data.token, data.expires_at, rememberEl.checked);
        if (rememberEl.checked) {
          window.localStorage.setItem(REMEMBER_USER_KEY, username);
        } else {
          window.localStorage.removeItem(REMEMBER_USER_KEY);
        }
        window.location.assign(REDIRECT_URL);
        return;
      }

      if (res.status === 401) {
        showAlert(
          (data && data.error && data.error.message) ||
          'Usuario o contraseña incorrectos.'
        );
        passwordEl.value = '';
        passwordEl.focus();
      } else {
        showAlert(
          (data && data.error && data.error.message) ||
          'No se pudo iniciar sesión (error ' + res.status + '). Intenta de nuevo.'
        );
      }
    } catch (err) {
      showAlert('No hay conexión con el servidor. Verifica tu red e intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  });

  /* ---------- Recuperación de contraseña (pendiente de endpoint) ---------- */

  forgotLink.addEventListener('click', function (e) {
    e.preventDefault();
    showAlert('Para restablecer tu contraseña, comunícate con la administración de la Fundación Servimos.');
  });

  /* ---------- API pública para las páginas del panel ----------
     En catalog.html (o cualquier página protegida) cargar este
     archivo o copiar los helpers y usar:

       const token = window.BAGBAuth.getToken();
       if (!token) location.replace('index.html');

     y para las peticiones autenticadas:
       headers: { 'Authorization': 'Bearer ' + token }

     El botón "Cerrar sesión" del sidebar llama:
       window.BAGBAuth.logout();
  ------------------------------------------------------------------ */

  window.BAGBAuth = {
    getToken: getValidSession,
    logout: function () {
      clearSession();
      window.location.replace('index.html');
    }
  };
})();