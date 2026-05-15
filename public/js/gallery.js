// Gallery — handles image loading, upload, and tile display
(function () {
  const gallery = document.getElementById('gallery');
  const fileInput = document.getElementById('file-input');
  const progressBar = document.getElementById('upload-progress');
  const progressFill = progressBar.querySelector('.progress-fill');

  // Load images on start
  loadImages();

  // Poll for new images every 10 seconds (other users' uploads)
  setInterval(loadImages, 10000);

  fileInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    progressBar.hidden = false;
    let done = 0;

    for (const file of files) {
      const form = new FormData();
      form.append('image', file);

      try {
        const res = await fetch('/api/upload', { method: 'POST', body: form });
        if (!res.ok) {
          const err = await res.json();
          alert(`Upload failed: ${err.error}`);
        }
      } catch (err) {
        alert('Upload failed — check your connection');
      }

      done++;
      progressFill.style.width = `${(done / files.length) * 100}%`;
    }

    fileInput.value = '';
    progressBar.hidden = true;
    progressFill.style.width = '0%';
    loadImages();
  });

  async function loadImages() {
    try {
      const res = await fetch('/api/images');
      const images = await res.json();
      renderGallery(images);
    } catch {
      // silent retry on next interval
    }
  }

  function renderGallery(images) {
    if (!images.length) {
      gallery.innerHTML = `
        <div class="empty-state">
          <span class="empty-state-icon">🇵🇹</span>
          <p class="empty-state-title">The tile wall is empty</p>
          <p class="empty-state-description">Walk around Lisbon, snap photos of great design, and turn them into Portuguese tile prints.</p>
        </div>`;
      return;
    }

    // Preserve scroll position
    const scrollY = window.scrollY;

    gallery.innerHTML = images.map(img => `
      <div class="tile" data-id="${img.id}">
        <img src="${img.url}" alt="${img.originalName}" loading="lazy" width="400" height="400">
        <div class="tile-actions">
          <button class="tile-btn edit-btn" data-id="${img.id}">✏️ Edit</button>
          <button class="tile-btn delete-btn" data-id="${img.id}">🗑</button>
        </div>
      </div>
    `).join('');

    window.scrollTo(0, scrollY);

    // Attach edit handlers
    gallery.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const img = images.find(i => i.id === id);
        if (img) window.openEditor(img);
      });
    });

    // Attach delete handlers
    gallery.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this photo?')) return;
        await fetch(`/api/images/${btn.dataset.id}`, { method: 'DELETE' });
        loadImages();
      });
    });
  }

  // Expose for editor
  window.reloadGallery = loadImages;
})();
