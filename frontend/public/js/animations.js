// =====================================================================
// Animaciones compartidas — Biblioteca Alberto Gutiérrez Botero
// =====================================================================

// ---------------------------------------------------------------------
// Scroll reveal
// ---------------------------------------------------------------------
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.15 });

function makeReveal(el, delayIndex = 0) {
  el.classList.add('reveal');
  el.style.transitionDelay = `${Math.min(delayIndex, 6) * 70}ms`;
  revealObserver.observe(el);
}

function initStaticReveals() {
  document.querySelectorAll('.reveal').forEach((el, i) => {
    if (!el.style.transitionDelay) {
      el.style.transitionDelay = `${(i % 4) * 80}ms`;
    }
    revealObserver.observe(el);
  });
}