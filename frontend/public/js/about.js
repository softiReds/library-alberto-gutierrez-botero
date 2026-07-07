// =====================================================================
// Biblioteca Alberto Gutiérrez Botero — Sobre la biblioteca
// =====================================================================

const ABOUT_URL = 'data/about.json';

const ICONS = {
  target: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.2"/><circle cx="12" cy="12" r=".8" fill="currentColor" stroke="none"/></svg>',
  eye: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.8-7 10-7 10 7 10 7-3.8 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
  users: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="3"/><path d="M2 20c0-3.3 3-5.5 7-5.5s7 2.2 7 5.5"/><circle cx="17" cy="8" r="2.5"/><path d="M16 14.5c2.7.3 5 2.2 5 5.5"/></svg>',
  bulb: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3Z"/></svg>',
  'heart-hand': '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20s-6.5-4.2-9-8.2C1.2 8.6 3 5.5 6 5.5c1.8 0 3 1 4 2.4 1-1.4 2.2-2.4 4-2.4 3 0 4.8 3.1 3 6.3-2.5 4-9 8.2-9 8.2Z"/></svg>',
  handshake: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m2 12 4-3 4 2 3-2 4 3"/><path d="m6 9 5 5 2-2"/><path d="M18 9l4 3-3 4-3-2"/></svg>',
  shield: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3 4 6v6c0 4.4 3.4 7.6 8 9 4.6-1.4 8-4.6 8-9V6l-8-3Z"/><path d="m9 12 2 2 4-4"/></svg>',
  service: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.2"/><path d="m5.3 5.3 3 3M18.7 5.3l-3 3M5.3 18.7l3-3M18.7 18.7l-3-3"/></svg>',
  group: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="7" cy="7" r="2.4"/><circle cx="17" cy="7" r="2.4"/><circle cx="12" cy="9.5" r="2.6"/><path d="M2 20c0-2.9 2.2-4.8 5-4.8M22 20c0-2.9-2.2-4.8-5-4.8M7 20c0-3.3 2.2-5.5 5-5.5s5 2.2 5 5.5"/></svg>',
  book: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 6.5c-1.6-1.3-3.6-2-6.5-2v13c2.9 0 4.9.7 6.5 2 1.6-1.3 3.6-2 6.5-2V4.5c-2.9 0-4.9.7-6.5 2Z"/><path d="M12 6.5v13"/></svg>'
};

function icon(name) {
  return ICONS[name] || '';
}

async function loadAbout() {
  let data;
  try {
    const res = await fetch(ABOUT_URL);
    if (!res.ok) throw new Error('No se pudo cargar about.json');
    data = await res.json();
  } catch (err) {
    console.error(err);
    return;
  }

  renderHero(data.hero);
  renderQuienesSomos(data.quienesSomos);
  renderMisionVision(data.mision, data.vision);
  renderValores(data.valores);
  renderReglamento(data.reglamento, data.closingNote);

  initStaticReveals();
}

function renderHero(hero) {
  const el = document.getElementById('aboutHeroCopy');
  if (!el || !hero) return;
  el.querySelector('h1').innerHTML = `
    <span class="eyebrow">${escapeHtml(hero.eyebrow)}</span>
    <span class="highlight">${escapeHtml(hero.highlight)}</span>
  `;
  el.querySelector('p').textContent = hero.subtitle;
}

function renderQuienesSomos(quienes) {
  const textContainer = document.getElementById('quienesText');
  if (!textContainer || !quienes) return;

  textContainer.querySelector('h2').textContent = quienes.title;
  const paragraphsHost = textContainer.querySelector('.about-quienes__paragraphs');
  paragraphsHost.innerHTML = quienes.paragraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('');
}

function renderMisionVision(mision, vision) {
  const misionCard = document.getElementById('misionCard');
  const visionCard = document.getElementById('visionCard');

  if (misionCard && mision) {
    misionCard.querySelector('.mv-icon').innerHTML = icon('target');
    misionCard.querySelector('h3').textContent = mision.title;
    misionCard.querySelector('p').textContent = mision.text;
  }
  if (visionCard && vision) {
    visionCard.querySelector('.mv-icon').innerHTML = icon('eye');
    visionCard.querySelector('h3').textContent = vision.title;
    visionCard.querySelector('p').textContent = vision.text;
  }
}

function renderValores(valores) {
  const track = document.getElementById('valoresTimeline');
  if (!track || !valores) return;

  track.innerHTML = valores.map((v, i) => `
    <div class="valor-item">
      <span class="valor-index">${String(i + 1).padStart(2, '0')}</span>
      <span class="valor-icon">${icon(v.icon)}</span>
      <span class="valor-label">${escapeHtml(v.label)}</span>
    </div>
  `).join('');

  [...track.children].forEach((el, i) => makeReveal(el, i));
}

function renderReglamento(reglamento, closingNote) {
  const box = document.getElementById('reglamentoBox');
  const grid = document.getElementById('reglamentoGrid');
  const closing = document.getElementById('closingNoteText');

  if (box && reglamento) {
    box.querySelector('.section-heading-center').textContent = reglamento.title;
    box.querySelector('.section-subtitle').textContent = reglamento.subtitle;
  }

  if (grid && reglamento) {
    grid.innerHTML = reglamento.reglas.map((regla, i) => `
      <div class="reglamento-item">
        <span class="reglamento-item__index">${i + 1}</span>
        <span>${escapeHtml(regla)}</span>
      </div>
    `).join('');
  }

  if (closing) {
    closing.textContent = closingNote || '';
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

loadAbout();

// ---------------------------------------------------------------------
// Botón flotante de sugerencias
// ---------------------------------------------------------------------
const fab = document.getElementById('suggestionFab');
const modal = document.getElementById('suggestionModal');
const modalClose = document.getElementById('suggestionClose');
const suggestionForm = document.getElementById('suggestionForm');

fab.addEventListener('click', () => { modal.hidden = false; });
modalClose.addEventListener('click', () => { modal.hidden = true; });
modal.addEventListener('click', e => { if (e.target === modal) modal.hidden = true; });

suggestionForm.addEventListener('submit', e => {
  e.preventDefault();
  alert('¡Gracias por tu sugerencia! La tendremos en cuenta.');
  suggestionForm.reset();
  modal.hidden = true;
});
