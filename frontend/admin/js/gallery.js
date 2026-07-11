/* =====================================================================
   Panel Admin — Galería
   GET/POST/DELETE /gallery, vía apiFetch.
   ===================================================================== */
(function () {
  'use strict';

  const token = window.BAGBAuth && window.BAGBAuth.getToken();
  if (!token) {
    window.location.replace('index.html');
    return;
  }

  const MAX_FILE_BYTES = 8 * 1024 * 1024;
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  const API_BASE_URL = (window.LIBRARY_API && window.LIBRARY_API.baseUrl) || '';

  let PHOTOS = [];
  let deletingPhotoId = null;

  const api = {
    async list() {
      return window.BAGBApi.apiFetch('/gallery');
    },
    async upload(file) {
      const formData = new FormData();
      formData.append('file', file);
      return window.BAGBApi.apiFetch('/gallery', { method: 'POST', body: formData });
    },
    async remove(id) {
      return window.BAGBApi.apiFetch(`/gallery/${id}`, { method: 'DELETE' });
    }
  };

  const gridEl = document.getElementById('galleryGrid');
  const emptyEl = document.getElementById('galleryEmpty');
  const uploadErrorEl = document.getElementById('galleryUploadError');
  const fileInput = document.getElementById('galleryFileInput');

  function showUploadError(message) {
    uploadErrorEl.textContent = message;
    uploadErrorEl.hidden = false;
  }

  function hideUploadError() {
    uploadErrorEl.hidden = true;
  }

  function renderGrid() {
    gridEl.innerHTML = '';
    emptyEl.hidden = PHOTOS.length > 0;

    PHOTOS.forEach(photo => {
      const tile = document.createElement('div');
      tile.className = 'gallery-admin-tile';

      const img = document.createElement('img');
      img.src = API_BASE_URL + photo.image_url;
      img.alt = 'Foto de la galería';
      img.loading = 'lazy';

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'gallery-admin-tile__delete';
      deleteBtn.setAttribute('aria-label', 'Eliminar foto');
      deleteBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>';
      deleteBtn.addEventListener('click', () => openDeleteModal(photo.id));

      tile.appendChild(img);
      tile.appendChild(deleteBtn);
      gridEl.appendChild(tile);
    });
  }

  async function loadPhotos() {
    PHOTOS = await api.list();
    renderGrid();
  }

  async function handleFileSelected() {
    hideUploadError();
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      showUploadError('Solo se permiten imágenes JPEG, PNG o WebP.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      showUploadError('La imagen no puede superar los 8 MB.');
      return;
    }

    try {
      await api.upload(file);
      await loadPhotos();
    } catch (err) {
      showUploadError(err.message);
    }
  }

  /* ============ Modal: eliminar foto ============ */

  function openDeleteModal(id) {
    deletingPhotoId = id;
    document.getElementById('deleteGalleryPhotoModal').hidden = false;
  }

  function closeDeleteModal() {
    deletingPhotoId = null;
    document.getElementById('deleteGalleryPhotoModal').hidden = true;
  }

  async function confirmDelete() {
    if (!deletingPhotoId) return;
    try {
      await api.remove(deletingPhotoId);
      closeDeleteModal();
      await loadPhotos();
    } catch (err) {
      closeDeleteModal();
      showUploadError(err.message);
    }
  }

  function initModalDismiss(modalEl, closeFn) {
    modalEl.addEventListener('click', (e) => { if (e.target === modalEl) closeFn(); });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const modal = document.getElementById('deleteGalleryPhotoModal');
    if (!modal.hidden) closeDeleteModal();
  });

  /* ============ Cerrar sesión ============ */

  document.getElementById('logoutBtn').addEventListener('click', () => {
    window.BAGBAuth.logout();
  });

  /* ============ Init ============ */

  async function init() {
    fileInput.addEventListener('change', handleFileSelected);
    document.getElementById('deleteGalleryPhotoModalClose').addEventListener('click', closeDeleteModal);
    document.getElementById('deleteGalleryPhotoCancel').addEventListener('click', closeDeleteModal);
    document.getElementById('deleteGalleryPhotoConfirm').addEventListener('click', confirmDelete);
    initModalDismiss(document.getElementById('deleteGalleryPhotoModal'), closeDeleteModal);

    await loadPhotos();
  }

  init();
})();
