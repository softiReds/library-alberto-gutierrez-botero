/* ==========================================================
   API CLIENT — capa compartida de llamadas autenticadas
   para el panel de gestión.

   Requiere que ya estén cargados, en este orden, antes de este
   archivo:
     1. js/config.js   (expone window.LIBRARY_API.baseUrl)
     2. js/login.js     (expone window.BAGBAuth.getToken/logout)

   Uso desde cualquier página del panel:

     try {
       const books = await window.BAGBApi.apiFetch('/books');
     } catch (err) {
       showAlert(err.message); // err.message ya es legible
     }

     // POST/PUT/PATCH: el body puede ser un objeto plano, se
     // serializa solo.
     await window.BAGBApi.apiFetch('/books', {
       method: 'POST',
       body: { title: 'Cien años de soledad', author: '...' }
     });
   ========================================================== */

(function () {
  'use strict';

  const BASE_URL = (window.LIBRARY_API && window.LIBRARY_API.baseUrl) || '';

  /**
   * Error de API con .status (código HTTP, 0 si fue de red) y
   * .code (el "code" del envelope { error: { code, message } },
   * si el servidor lo mandó).
   */
  class ApiError extends Error {
    constructor(message, status, code) {
      super(message);
      this.name = 'ApiError';
      this.status = status || 0;
      this.code = code || null;
    }
  }

  function isPlainBody(body) {
    return (
      body != null &&
      typeof body === 'object' &&
      !(body instanceof FormData) &&
      !(body instanceof Blob) &&
      !(body instanceof ArrayBuffer)
    );
  }

  /**
   * apiFetch(path, options) — wrapper de fetch() para el backend.
   * - Arma la URL completa contra window.LIBRARY_API.baseUrl.
   * - Agrega "Authorization: Bearer {token}" automáticamente.
   * - Si el body es un objeto plano, lo serializa y pone
   *   Content-Type: application/json solo.
   * - Si la respuesta es 401, cierra sesión (window.BAGBAuth.logout())
   *   y redirige a index.html antes de lanzar el error.
   * - En cualquier otro error, lanza ApiError con .message legible
   *   tomado del envelope { error: { code, message } } del backend.
   * - En 204 No Content (o cualquier respuesta sin cuerpo), resuelve
   *   con null.
   */
  async function apiFetch(path, options) {
    options = options || {};

    if (!window.BAGBAuth || typeof window.BAGBAuth.getToken !== 'function') {
      throw new ApiError(
        'No se encontró BAGBAuth. Cargá js/login.js antes que js/api-client.js.',
        0,
        'client_misconfigured'
      );
    }

    const token = window.BAGBAuth.getToken();

    const headers = Object.assign({}, options.headers || {});
    let body = options.body;

    if (isPlainBody(body)) {
      body = JSON.stringify(body);
      if (!headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }
    }

    if (token) {
      headers['Authorization'] = 'Bearer ' + token;
    }

    const normalizedPath = path.indexOf('/') === 0 ? path : '/' + path;

    let res;
    try {
      res = await fetch(BASE_URL + normalizedPath, Object.assign({}, options, {
        headers: headers,
        body: body
      }));
    } catch (err) {
      throw new ApiError(
        'No pudimos conectar con el servidor. Verifica tu conexión a internet.',
        0,
        'network_error'
      );
    }

    if (res.status === 401) {
      window.BAGBAuth.logout();
      throw new ApiError(
        'Tu sesión expiró. Iniciando sesión de nuevo...',
        401,
        'unauthorized'
      );
    }

    let data = null;
    const text = await res.text();
    if (text) {
      try { data = JSON.parse(text); } catch (_) { /* respuesta sin JSON */ }
    }

    if (!res.ok) {
      const message =
        (data && data.error && data.error.message) ||
        ('El servidor respondió con el código ' + res.status + '.');
      const code = (data && data.error && data.error.code) || null;
      throw new ApiError(message, res.status, code);
    }

    return data;
  }

  window.BAGBApi = {
    apiFetch: apiFetch,
    ApiError: ApiError
  };
})();
