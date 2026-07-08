// =====================================================================
// Biblioteca Alberto Gutiérrez Botero — Homepage
// =====================================================================

const CATALOG_URL = 'data/catalog.json';
const EVENTS_URL = 'data/events.json';

const FALLBACK_COVERS = [
  'assets/home/book-cover-1.png',
  'assets/home/book-cover-2.png',
  'assets/home/book-cover-3.png'
];

const STATIC_STATS = {
  workshops: 85,
  users: 3214,
  visits: 101
};

const MESES_ABREV = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
const MESES_LARGO = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

let CATALOG = [];
let EVENTS = [];

// ---------------------------------------------------------------------
// Portada de libro
// ---------------------------------------------------------------------
function firstIsbn(book) {
  if (Array.isArray(book.isbn) && book.isbn.length) return book.isbn[0];
  if (typeof book.isbn === 'string') return book.isbn;
  return null;
}

function buildCoverWrap(book, index, imgClassName, wrapClassName) {
  const wrap = document.createElement('div');
  wrap.className = wrapClassName;

  const img = document.createElement('img');
  img.className = imgClassName;
  img.alt = `Portada de ${book.title}`;
  img.loading = 'lazy';

  const overlay = document.createElement('span');
  overlay.className = 'cover-fallback-title';
  overlay.textContent = book.title;

  function useFallback() {
    img.src = FALLBACK_COVERS[index % FALLBACK_COVERS.length];
    wrap.classList.add('cover-wrap--fallback');
  }

  const isbn = firstIsbn(book);

  if (isbn) {
    img.src = `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false`;
    img.onerror = () => { img.onerror = null; useFallback(); };
  } else {
    useFallback();
  }

  wrap.appendChild(img);
  wrap.appendChild(overlay);
  return wrap;
}

// ---------------------------------------------------------------------
// Animaciones: contador de estadísticas
// ---------------------------------------------------------------------
let statsRevealed = false;

function animateCounter(el, target, duration = 1300) {
  const start = 0;
  const startTime = performance.now();

  function tick(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = Math.round(start + (target - start) * eased);
    el.textContent = value.toLocaleString('es-CO');
    if (progress < 1) {
      requestAnimationFrame(tick);
    } else {
      el.textContent = target.toLocaleString('es-CO');
    }
  }
  requestAnimationFrame(tick);
}

function setCounterTarget(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.dataset.target = value;
  if (statsRevealed) {
    animateCounter(el, value);
  }
}

function initStatsCounter() {
  const section = document.getElementById('statsSection');
  if (!section) return;

  const statsObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !statsRevealed) {
        statsRevealed = true;
        section.querySelectorAll('.stats__number strong, .stats__visits strong').forEach(el => {
          const target = Number(el.dataset.target || 0);
          animateCounter(el, target);
        });
        statsObserver.unobserve(section);
      }
    });
  }, { threshold: 0.3 });

  statsObserver.observe(section);
}

// ---------------------------------------------------------------------
// Animaciones: lightbox de galería
// ---------------------------------------------------------------------
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightboxImg');
const lightboxClose = document.getElementById('lightboxClose');

function openLightbox(src, alt) {
  lightboxImg.src = src;
  lightboxImg.alt = alt || '';
  lightbox.classList.add('is-open');
}

function closeLightbox() {
  lightbox.classList.remove('is-open');
}

lightboxClose.addEventListener('click', closeLightbox);
lightbox.addEventListener('click', e => { if (e.target === lightbox) closeLightbox(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLightbox(); });

// ---------------------------------------------------------------------
// Carga del catálogo
// ---------------------------------------------------------------------
async function loadCatalog() {
  try {
    const res = await fetch(CATALOG_URL);
    if (!res.ok) throw new Error('No se pudo cargar catalog.json');
    CATALOG = await res.json();
  } catch (err) {
    console.error(err);
    CATALOG = [];
  }

  renderStats();
  renderGallery();
  renderFeaturedBookCarousel();
  renderRecommended();
}

// ---------------------------------------------------------------------
// Carga de eventos y talleres
// ---------------------------------------------------------------------
async function loadEvents() {
  try {
    const res = await fetch(EVENTS_URL);
    if (!res.ok) throw new Error('No se pudo cargar events.json');
    EVENTS = await res.json();
  } catch (err) {
    console.error(err);
    EVENTS = [];
  }

  renderEvents();
  renderWorkshopsStat();
  renderRecommendedEvent();
}

// ---------------------------------------------------------------------
// Evento destacado
// ---------------------------------------------------------------------
function renderRecommendedEvent() {
  const container = document.getElementById('recommendedEvent');
  const event = EVENTS.find(ev => ev.featured === true);

  if (!event) {
    container.innerHTML = '<p class="event-highlight__empty">Marca un evento con "featured": true en events.json para destacarlo aquí.</p>';
    return;
  }

  const timeRange = `${formatTime12h(event.start_time)} - ${formatTime12h(event.end_time)}`;

  container.innerHTML = `
    <div class="event-highlight__top">
      <div class="event-highlight__text">
        <span class="event-highlight__badge">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>
          Evento recomendado
        </span>
        <h3>${escapeHtml(event.title)}</h3>
        <p>${escapeHtml(event.description || '')}</p>
      </div>
      <img class="event-highlight__art" src="assets/home/event.png" alt="">
    </div>
    <div class="event-highlight__stats">
      <div class="event-highlight__stat">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>
        <div><span>Fecha</span><strong>${formatEventDateLong(event.date)}</strong></div>
      </div>
      <div class="event-highlight__stat">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>
        <div><span>Horario</span><strong>${timeRange}</strong></div>
      </div>
    </div>
  `;
}

function formatEventDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  return { day: d.getDate(), month: MESES_ABREV[d.getMonth()] };
}

function formatEventDateLong(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  return `${d.getDate()} de ${MESES_LARGO[d.getMonth()]}, ${d.getFullYear()}`;
}

function formatTime12h(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const mm = String(m).padStart(2, '0');
  if (h === 12 && m === 0) return '12:00 m.';
  if (h === 0 && m === 0) return `12:${mm} a.m.`;
  const period = h < 12 ? 'a.m.' : 'p.m.';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${mm} ${period}`;
}

function renderEvents() {
  const list = document.getElementById('eventsList');
  list.innerHTML = '';

  if (!EVENTS.length) {
    list.innerHTML = '<li class="search-results__empty">Aún no hay eventos programados.</li>';
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const sorted = [...EVENTS].sort((a, b) => new Date(a.date) - new Date(b.date));
  const upcoming = sorted.filter(ev => new Date(`${ev.date}T00:00:00`) >= today);
  const toShow = (upcoming.length ? upcoming : sorted).slice(0, 3);

  toShow.forEach((ev, i) => {
    const li = document.createElement('li');
    const { day, month } = formatEventDate(ev.date);

    const dateEl = document.createElement('span');
    dateEl.className = 'event-date';
    dateEl.innerHTML = `<strong>${day}</strong>${month}`;

    const infoEl = document.createElement('span');
    infoEl.className = 'event-info';
    infoEl.innerHTML = `<strong>${escapeHtml(ev.title)}</strong>${formatTime12h(ev.start_time)} - ${formatTime12h(ev.end_time)}`;

    li.appendChild(dateEl);
    li.appendChild(infoEl);
    list.appendChild(li);
    makeReveal(li, i);
  });
}

function renderWorkshopsStat() {
  const currentYear = new Date().getFullYear();
  const count = EVENTS.filter(ev => new Date(`${ev.date}T00:00:00`).getFullYear() === currentYear).length;
  const value = count || STATIC_STATS.workshops;
  setCounterTarget('statWorkshops', value);
}

// ---------------------------------------------------------------------
// Estadísticas
// ---------------------------------------------------------------------
function renderStats() {
  setCounterTarget('statBooks', CATALOG.length);
  setCounterTarget('statWorkshops', STATIC_STATS.workshops);
  setCounterTarget('statUsers', STATIC_STATS.users);
  setCounterTarget('statVisits', STATIC_STATS.visits);
}

// ---------------------------------------------------------------------
// Galería
// ---------------------------------------------------------------------
const GALLERY_IMAGES = [
  'assets/gallery/galeria-1.jpeg',
  'assets/gallery/galeria-2.jpeg',
  'assets/gallery/galeria-3.jpeg',
  'assets/gallery/galeria-4.jpeg',
  'assets/gallery/galeria-5.jpeg'
];

function renderGallery() {
  const track = document.getElementById('galleryTrack');
  track.innerHTML = '';
  GALLERY_IMAGES.forEach((src, i) => {
    const img = document.createElement('img');
    img.src = src;
    img.alt = `Foto de la galería ${i + 1}`;
    img.tabIndex = 0;
    img.addEventListener('click', () => openLightbox(src, img.alt));
    img.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openLightbox(src, img.alt);
      }
    });
    track.appendChild(img);
    makeReveal(img, i);
  });
  setupDots(track, document.getElementById('galleryDots'), GALLERY_IMAGES.length);
}

// ---------------------------------------------------------------------
// Catálogo destacado
// ---------------------------------------------------------------------
function renderFeaturedBookCarousel() {
  const track = document.getElementById('featuredBookTrack');
  track.innerHTML = '';

  if (!CATALOG.length) {
    track.innerHTML = '<p class="search-results__empty">Aún no hay libros en el catálogo.</p>';
    return;
  }

  CATALOG.forEach((book, i) => {
    const card = document.createElement('div');
    card.className = 'catalog-mini-card';

    const coverWrap = buildCoverWrap(book, i, 'catalog-mini-card__cover', 'catalog-mini-card__cover-wrap');

    const title = document.createElement('h4');
    title.textContent = book.title;

    const author = document.createElement('span');
    author.className = 'author';
    author.textContent = book.author || '';

    card.appendChild(coverWrap);
    card.appendChild(title);
    card.appendChild(author);
    track.appendChild(card);
    makeReveal(card, i);
  });

  setupDots(track, document.getElementById('featuredBookDots'), CATALOG.length);
}

// ---------------------------------------------------------------------
// Recomendados
// ---------------------------------------------------------------------
function renderRecommended() {
  const track = document.getElementById('recommendedTrack');
  track.innerHTML = '';

  const featured = CATALOG.filter(b => b.featured === true).slice(0, 3);

  if (!featured.length) {
    track.innerHTML = '<p class="search-results__empty">Marca libros con "featured": true en catalog.json para que aparezcan aquí.</p>';
    return;
  }

  featured.forEach((book, i) => {
    const card = document.createElement('div');
    card.className = 'reco-card';

    const coverWrap = buildCoverWrap(book, i, 'reco-card__cover', 'reco-card__cover-wrap');
    const info = document.createElement('div');
    info.innerHTML = `
      <h4>${escapeHtml(book.title)}</h4>
      <span class="author">${escapeHtml(book.author || '')}</span>
    `;

    card.appendChild(coverWrap);
    card.appendChild(info);
    track.appendChild(card);
    makeReveal(card, i);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------------------------------------------------------------------
// Carruseles
// ---------------------------------------------------------------------
function setupDots(track, dotsContainer, count) {
  dotsContainer.innerHTML = '';
  const maxDots = Math.min(count, 6);
  for (let i = 0; i < maxDots; i++) {
    const dot = document.createElement('span');
    if (i === 0) dot.classList.add('active');
    dotsContainer.appendChild(dot);
  }

  track.addEventListener('scroll', () => {
    const ratio = track.scrollLeft / (track.scrollWidth - track.clientWidth || 1);
    const activeIndex = Math.round(ratio * (maxDots - 1));
    [...dotsContainer.children].forEach((d, i) => d.classList.toggle('active', i === activeIndex));
  }, { passive: true });
}

document.querySelectorAll('[data-carousel]').forEach(wrapper => {
  const track = wrapper.querySelector('.mini-carousel__track');
  const prev = wrapper.querySelector('.mini-carousel__nav--prev');
  const next = wrapper.querySelector('.mini-carousel__nav--next');
  if (!track || !prev || !next) return;

  const scrollStep = () => Math.max(track.clientWidth * 0.8, 160);
  prev.addEventListener('click', () => track.scrollBy({ left: -scrollStep(), behavior: 'smooth' }));
  next.addEventListener('click', () => track.scrollBy({ left: scrollStep(), behavior: 'smooth' }));
});

// ---------------------------------------------------------------------
// Búsqueda del catálogo
// ---------------------------------------------------------------------
const searchInput = document.getElementById('catalogSearchInput');
const searchResults = document.getElementById('searchResults');
const filterTags = document.getElementById('filterTags');
let activeFilter = 'title';

filterTags.addEventListener('click', e => {
  const btn = e.target.closest('.tag');
  if (!btn) return;
  filterTags.querySelectorAll('.tag').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  activeFilter = btn.dataset.filter;
  runSearch();
});

searchInput.addEventListener('input', runSearch);

function runSearch() {
  const q = searchInput.value.trim().toLowerCase();

  if (!q) {
    searchResults.hidden = true;
    searchResults.innerHTML = '';
    return;
  }

  const results = CATALOG.filter(book => {
    const field = book[activeFilter];
    if (!field) return false;
    return String(field).toLowerCase().includes(q);
  });

  searchResults.hidden = false;

  if (!results.length) {
    searchResults.innerHTML = '<div class="search-results__empty">No encontramos resultados para tu búsqueda.</div>';
    return;
  }

  searchResults.innerHTML = results.map(book => `
    <div class="search-results__item">
      <div>
        <strong>${escapeHtml(book.title)}</strong>
        <span>${escapeHtml(book.author || '')}</span>
      </div>
      <span>${escapeHtml(book.publication_date || '')}</span>
    </div>
  `).join('');
}

// ---------------------------------------------------------------------
// Toggle de búsqueda en el header
// ---------------------------------------------------------------------
document.getElementById('navSearchToggle').addEventListener('click', () => {
  document.getElementById('catalogo').scrollIntoView({ behavior: 'smooth' });
  searchInput.focus();
});

// ---------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------
initStaticReveals();
initStatsCounter();
loadCatalog();
loadEvents();