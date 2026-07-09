// =====================================================================
// Contador de visitas — se inyecta en todas las páginas públicas.
// POST {baseUrl}/site-visits/increment  (pública)
//
// Cada carga real de página incrementa el contador una vez. Dispara
// "bagb:visits-updated" en window con el total actualizado, para que
// cualquier página que muestre el número (hoy solo index.html) lo
// pueda pintar sin tener que pedirlo de nuevo con un GET aparte.
// =====================================================================

(function () {
  'use strict';

  // Guarda contra que este mismo script corra más de una vez en la
  // misma carga de página (ej. si el tag <script> quedara duplicado
  // por error). No usamos sessionStorage/localStorage a propósito:
  // el requisito es contar CADA carga de página, así que el conteo no
  // debe "recordarse" entre navegaciones — solo protegemos la carga
  // actual de una doble ejecución accidental.
  if (window.__bagbVisitCounted) return;
  window.__bagbVisitCounted = true;

  const baseUrl = (window.LIBRARY_API && window.LIBRARY_API.baseUrl) || '';
  if (!baseUrl || baseUrl.includes('TU-API-AQUI')) {
    console.warn('Contador de visitas: baseUrl sin configurar en js/config.js, no se incrementó.');
    return;
  }

  fetch(`${baseUrl}/site-visits/increment`, { method: 'POST' })
    .then(res => {
      if (!res.ok) throw new Error(`El servidor respondió con el código ${res.status}.`);
      return res.json();
    })
    .then(data => {
      if (data && typeof data.total_visits === 'number') {
        window.dispatchEvent(new CustomEvent('bagb:visits-updated', { detail: data.total_visits }));
      }
    })
    .catch(err => {
      console.error('No se pudo incrementar el contador de visitas.', err);
    });
})();
