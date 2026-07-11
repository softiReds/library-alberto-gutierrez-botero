// =====================================================================
// Galería — mosaico + lightbox con navegación
// =====================================================================

const API_BASE_URL = (window.LIBRARY_API && window.LIBRARY_API.baseUrl) || '';
const GALLERY_URL = `${API_BASE_URL}/gallery`;

const MOSAIC_PATTERN = ['big', '', '', 'tall', '', '', 'wide', '', '', 'tall'];

let PHOTOS = [];
let currentIndex = 0;

const mosaicEl = document.getElementById('galleryMosaic');
const emptyEl = document.getElementById('galleryEmpty');

const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightboxImg');
const lightboxClose = document.getElementById('lightboxClose');
const lightboxPrev = document.getElementById('lightboxPrev');
const lightboxNext = document.getElementById('lightboxNext');
const lightboxCounter = document.getElementById('lightboxCounter');

// ---------------------------------------------------------------------
// Carga de fotos desde la API
// ---------------------------------------------------------------------
async function loadPhotos() {
  try {
    const res = await fetch(GALLERY_URL);
    if (!res.ok) throw new Error(`El servidor respondió con el código ${res.status}.`);
    const photos = await res.json();
    return photos.map(photo => API_BASE_URL + photo.image_url);
  } catch (err) {
    console.error('No se pudieron cargar las fotos de la galería.', err);
    return [];
  }
}

// ---------------------------------------------------------------------
// Mosaico
// ---------------------------------------------------------------------
function renderMosaic() {
  mosaicEl.innerHTML = '';

  if (!PHOTOS.length) {
    emptyEl.hidden = false;
    return;
  }
  emptyEl.hidden = true;

  PHOTOS.forEach((src, i) => {
    const size = MOSAIC_PATTERN[i % MOSAIC_PATTERN.length];

    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'gallery-tile' + (size ? ` gallery-tile--${size}` : '');
    tile.setAttribute('aria-label', `Ampliar foto ${i + 1} de la galería`);

    const img = document.createElement('img');
    img.src = src;
    img.alt = `Foto de la galería ${i + 1}`;
    img.loading = 'lazy';

    const zoom = document.createElement('span');
    zoom.className = 'gallery-tile__zoom';
    zoom.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3M11 8v6M8 11h6"/></svg>';

    tile.appendChild(img);
    tile.appendChild(zoom);
    tile.addEventListener('click', () => openLightbox(i));

    mosaicEl.appendChild(tile);
    makeReveal(tile, i % 8);
  });
}

// ---------------------------------------------------------------------
// Lightbox
// ---------------------------------------------------------------------
function showPhoto(index) {
  currentIndex = (index + PHOTOS.length) % PHOTOS.length;
  lightboxImg.src = PHOTOS[currentIndex];
  lightboxImg.alt = `Foto de la galería ${currentIndex + 1}`;
  lightboxCounter.textContent = `${currentIndex + 1} / ${PHOTOS.length}`;
}

function openLightbox(index) {
  showPhoto(index);
  lightbox.classList.add('is-open');
}

function closeLightbox() {
  lightbox.classList.remove('is-open');
}

lightboxClose.addEventListener('click', closeLightbox);
lightboxPrev.addEventListener('click', () => showPhoto(currentIndex - 1));
lightboxNext.addEventListener('click', () => showPhoto(currentIndex + 1));
lightbox.addEventListener('click', e => { if (e.target === lightbox) closeLightbox(); });

document.addEventListener('keydown', e => {
  if (!lightbox.classList.contains('is-open')) return;
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowLeft') showPhoto(currentIndex - 1);
  if (e.key === 'ArrowRight') showPhoto(currentIndex + 1);
});

// ---------------------------------------------------------------------
// Controles
// ---------------------------------------------------------------------
document.getElementById('navSearchToggle').addEventListener('click', () => {
  window.location.href = 'index.html#catalogo';
});

// ---------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------
initStaticReveals();

loadPhotos().then(photos => {
  PHOTOS = photos;
  renderMosaic();
});