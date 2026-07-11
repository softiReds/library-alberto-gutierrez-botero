// =====================================================================
// Biblioteca Alberto Gutiérrez Botero — Homepage
// =====================================================================

const API_BASE_URL = (window.LIBRARY_API && window.LIBRARY_API.baseUrl) || '';
const BOOKS_URL = `${API_BASE_URL}/books`;
const FEATURED_BOOKS_URL = `${API_BASE_URL}/books/featured`;
const FEATURED_EVENTS_URL = `${API_BASE_URL}/events/featured`;
const EVENTS_URL = `${API_BASE_URL}/events`;
const MEMBERS_COUNT_URL = `${API_BASE_URL}/members/count`;
const SEARCH_DEBOUNCE_MS = 350;

const FALLBACK_COVERS = [
  'assets/home/book-cover-1.png',
  'assets/home/book-cover-2.png',
  'assets/home/book-cover-3.png'
];

const MESES_ABREV = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
const MESES_LARGO = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

let CATALOG = [];
let RANDOM_BOOKS = [];
let EVENTS = [];
let ALL_EVENTS = [];

function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

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
const lightboxPrev = document.getElementById('lightboxPrev');
const lightboxNext = document.getElementById('lightboxNext');
const lightboxCounter = document.getElementById('lightboxCounter');

let lightboxIndex = 0;

function showLightboxPhoto(index) {
  lightboxIndex = (index + GALLERY_IMAGES.length) % GALLERY_IMAGES.length;
  const src = GALLERY_IMAGES[lightboxIndex];
  lightboxImg.src = src;
  lightboxImg.alt = `Foto de la galería ${lightboxIndex + 1}`;
  lightboxCounter.textContent = `${lightboxIndex + 1} / ${GALLERY_IMAGES.length}`;
}

function openLightbox(src) {
  const index = GALLERY_IMAGES.indexOf(src);
  showLightboxPhoto(index === -1 ? 0 : index);
  lightbox.classList.add('is-open');
}

function closeLightbox() {
  lightbox.classList.remove('is-open');
}

lightboxClose.addEventListener('click', closeLightbox);
lightboxPrev.addEventListener('click', () => showLightboxPhoto(lightboxIndex - 1));
lightboxNext.addEventListener('click', () => showLightboxPhoto(lightboxIndex + 1));
lightbox.addEventListener('click', e => { if (e.target === lightbox) closeLightbox(); });
document.addEventListener('keydown', e => {
  if (!lightbox.classList.contains('is-open')) return;
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowLeft') showLightboxPhoto(lightboxIndex - 1);
  if (e.key === 'ArrowRight') showLightboxPhoto(lightboxIndex + 1);
});

// ---------------------------------------------------------------------
// Carga del catálogo (destacados para el home)
// ---------------------------------------------------------------------
async function loadCatalog() {
  try {
    const res = await fetch(FEATURED_BOOKS_URL);
    if (!res.ok) throw new Error(`El servidor respondió con el código ${res.status}.`);
    CATALOG = await res.json();
  } catch (err) {
    console.error('No se pudieron cargar los libros destacados.', err);
    CATALOG = [];
  }

  renderRecommended();
}

// ---------------------------------------------------------------------
// Carrusel "Catálogo" de la portada — no son los destacados, sino ~10
// libros al azar de todo el catálogo, para dar variedad cada vez que se
// carga la página.
// ---------------------------------------------------------------------
async function loadRandomBooks() {
  try {
    const res = await fetch(`${BOOKS_URL}?page=1&page_size=50`);
    if (!res.ok) throw new Error(`El servidor respondió con el código ${res.status}.`);
    const data = await res.json();
    RANDOM_BOOKS = shuffleArray(data.data || []).slice(0, 10);
  } catch (err) {
    console.error('No se pudieron cargar libros del catálogo.', err);
    RANDOM_BOOKS = [];
  }

  renderFeaturedBookCarousel();
}

// ---------------------------------------------------------------------
// Total de libros del catálogo (para la estadística, independiente de
// los destacados de arriba)
// ---------------------------------------------------------------------
async function loadBooksTotal() {
  try {
    const res = await fetch(`${BOOKS_URL}?page=1&page_size=1`);
    if (!res.ok) throw new Error(`El servidor respondió con el código ${res.status}.`);
    const data = await res.json();
    setCounterTarget('statBooks', data.total || 0);
  } catch (err) {
    console.error('No se pudo obtener el total del catálogo.', err);
  }
}

// ---------------------------------------------------------------------
// Evento destacado (GET /events/featured) — para la tarjeta de "Evento
// recomendado" en la sección "Recomendados para ti".
// ---------------------------------------------------------------------
async function loadEvents() {
  try {
    const res = await fetch(FEATURED_EVENTS_URL);
    if (!res.ok) throw new Error(`El servidor respondió con el código ${res.status}.`);
    EVENTS = await res.json();
  } catch (err) {
    console.error('No se pudieron cargar los eventos destacados.', err);
    EVENTS = [];
  }

  renderRecommendedEvent();
}

// ---------------------------------------------------------------------
// Lista "Próximos eventos y talleres" — todos los eventos futuros (GET
// /events, no solo los destacados), ordenados por fecha, hasta 10. El
// mismo total también alimenta la estadística "Próximos talleres".
// ---------------------------------------------------------------------
async function loadAllEvents() {
  try {
    const res = await fetch(EVENTS_URL);
    if (!res.ok) throw new Error(`El servidor respondió con el código ${res.status}.`);
    ALL_EVENTS = await res.json();
  } catch (err) {
    console.error('No se pudieron cargar los eventos.', err);
    ALL_EVENTS = [];
  }

  setCounterTarget('statWorkshops', ALL_EVENTS.length || 0);
  renderEvents();
}

// ---------------------------------------------------------------------
// Evento destacado
// ---------------------------------------------------------------------
function renderRecommendedEvent() {
  const container = document.getElementById('recommendedEvent');
  const event = EVENTS[0];

  if (!event) {
    container.innerHTML = '<p class="event-highlight__empty">No hay eventos destacados por ahora.</p>';
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
        <div><span>Fecha</span><strong>${formatEventDateLong(event.event_date)}</strong></div>
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
  if (!hhmm) return 'Hora por confirmar';
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

  if (!ALL_EVENTS.length) {
    list.innerHTML = '<li class="search-results__empty">Aún no hay eventos programados por ahora.</li>';
    return;
  }

  // GET /events no garantiza orden — se ordena por fecha (y hora) ascendente
  // para mostrar primero los próximos, y se limita a 10.
  const toShow = [...ALL_EVENTS]
    .sort((a, b) => `${a.event_date}T${a.start_time || ''}`.localeCompare(`${b.event_date}T${b.start_time || ''}`))
    .slice(0, 10);

  toShow.forEach((ev, i) => {
    const li = document.createElement('li');
    const { day, month } = formatEventDate(ev.event_date);

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

// "Usuarios registrados" — GET /members/count, endpoint público de
// solo conteo (nunca expone datos individuales de afiliados).
async function loadUsersTotal() {
  try {
    const res = await fetch(MEMBERS_COUNT_URL);
    if (!res.ok) throw new Error(`El servidor respondió con el código ${res.status}.`);
    const data = await res.json();
    setCounterTarget('statUsers', data.total || 0);
  } catch (err) {
    console.error('No se pudo obtener el total de usuarios registrados.', err);
  }
}

// ---------------------------------------------------------------------
// Estadísticas: statBooks lo pone loadBooksTotal() (GET /books, campo
// "total"), statWorkshops lo pone loadAllEvents() (GET /events),
// statUsers lo pone loadUsersTotal() (GET /members/count), y statVisits
// lo pone js/visit-counter.js disparando "bagb:visits-updated" con el
// total real apenas responde la API (ver el listener abajo).
// ---------------------------------------------------------------------
window.addEventListener('bagb:visits-updated', e => {
  setCounterTarget('statVisits', e.detail);
});

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
    img.addEventListener('click', () => openLightbox(src));
    img.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openLightbox(src);
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

  if (!RANDOM_BOOKS.length) {
    track.innerHTML = '<p class="search-results__empty">Aún no hay libros en el catálogo.</p>';
    return;
  }

  RANDOM_BOOKS.forEach((book, i) => {
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

  setupDots(track, document.getElementById('featuredBookDots'), RANDOM_BOOKS.length);
}

// ---------------------------------------------------------------------
// Recomendados — se muestran TODOS los libros destacados (GET
// /books/featured), sin límite de 3.
// ---------------------------------------------------------------------
function renderRecommended() {
  const track = document.getElementById('recommendedTrack');
  track.innerHTML = '';

  const featured = CATALOG;

  if (!featured.length) {
    track.innerHTML = '<p class="search-results__empty">No hay libros destacados por ahora.</p>';
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

// Nota: GET /books?search= busca por título O autor combinados — el
// backend no soporta filtrar por un campo específico (autor/editorial/
// materia por separado), así que estos tags ya no cambian el resultado
// de la búsqueda, solo quedan como acento visual.
filterTags.addEventListener('click', e => {
  const btn = e.target.closest('.tag');
  if (!btn) return;
  filterTags.querySelectorAll('.tag').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
});

let searchDebounceTimer = null;
let searchRequestId = 0;

searchInput.addEventListener('input', () => {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(runSearch, SEARCH_DEBOUNCE_MS);
});

async function runSearch() {
  const q = searchInput.value.trim();

  if (!q) {
    searchResults.hidden = true;
    searchResults.innerHTML = '';
    return;
  }

  const requestId = ++searchRequestId;
  searchResults.hidden = false;
  searchResults.innerHTML = '<div class="search-results__empty">Buscando…</div>';

  try {
    const res = await fetch(`${BOOKS_URL}?search=${encodeURIComponent(q)}&page=1&page_size=8`);
    if (!res.ok) throw new Error(`El servidor respondió con el código ${res.status}.`);
    const data = await res.json();

    // Si el usuario siguió escribiendo, esta respuesta ya quedó vieja.
    if (requestId !== searchRequestId) return;

    const results = data.data || [];

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
  } catch (err) {
    if (requestId !== searchRequestId) return;
    console.error('Error buscando en el catálogo.', err);
    searchResults.innerHTML = '<div class="search-results__empty">No pudimos completar la búsqueda. Intenta de nuevo en un momento.</div>';
  }
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
renderGallery();
loadBooksTotal();
loadUsersTotal();
loadCatalog();
loadRandomBooks();
loadEvents();
loadAllEvents();