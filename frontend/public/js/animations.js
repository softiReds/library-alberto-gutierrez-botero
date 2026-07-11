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

// ---------------------------------------------------------------------
// Navegación móvil (menú hamburguesa del header)
// ---------------------------------------------------------------------
function initMobileNav() {
  const toggleBtn = document.getElementById('navMobileToggle');
  const nav = document.querySelector('.main-nav');
  if (!toggleBtn || !nav) return;

  function closeNav() {
    nav.classList.remove('is-open');
    toggleBtn.setAttribute('aria-expanded', 'false');
  }

  toggleBtn.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('is-open');
    toggleBtn.setAttribute('aria-expanded', String(isOpen));
  });

  nav.querySelectorAll('a').forEach(link => link.addEventListener('click', closeNav));

  document.addEventListener('click', (e) => {
    if (nav.classList.contains('is-open') && !nav.contains(e.target) && e.target !== toggleBtn && !toggleBtn.contains(e.target)) {
      closeNav();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeNav();
  });
}

document.addEventListener('DOMContentLoaded', initMobileNav);