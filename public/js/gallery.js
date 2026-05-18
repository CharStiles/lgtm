// Gallery — handles image loading, upload, and tile display
(function () {
  const gallery = document.getElementById('gallery');
  const fileInput = document.getElementById('file-input');
  const fileInputMain = document.getElementById('file-input-main');
  const progressBar = document.getElementById('upload-progress');
  const progressFill = progressBar.querySelector('.progress-fill');
  const uploadDrop = document.getElementById('upload-drop-area');

  // Persistent client identifier — scoped to this browser
  function getClientId() {
    let id = localStorage.getItem('lgtm-client-id');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('lgtm-client-id', id);
    }
    return id;
  }
  const CLIENT_ID = getClientId();

  // Download an image to camera roll / device
  function downloadImage(url, filename) {
    fetch(url)
      .then(res => res.blob())
      .then(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename || 'lisbon-tile.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
      });
  }

  window.downloadImage = downloadImage;

  loadImages();
  setInterval(loadImages, 10000);

  // Shared upload handler
  async function handleUpload(files) {
    if (!files.length) return;
    progressBar.hidden = false;
    let done = 0;

    for (const file of files) {
      const form = new FormData();
      form.append('image', file);
      try {
        const res = await fetch('/api/upload', { method: 'POST', body: form, headers: { 'x-client-id': CLIENT_ID } });
        if (!res.ok) {
          const err = await res.json();
          alert(`Upload failed: ${err.error}`);
        }
      } catch {
        alert('Upload failed \u2014 check your connection');
      }
      done++;
      progressFill.style.width = `${(done / files.length) * 100}%`;
    }

    progressBar.hidden = true;
    progressFill.style.width = '0%';
    loadImages();
  }

  // Wire both file inputs
  fileInput.addEventListener('change', (e) => {
    void handleUpload(Array.from(e.target.files));
    fileInput.value = '';
  });

  if (fileInputMain) {
    fileInputMain.addEventListener('change', (e) => {
      void handleUpload(Array.from(e.target.files));
      fileInputMain.value = '';
    });
  }

  // Drag and drop on upload zone
  if (uploadDrop) {
    uploadDrop.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadDrop.style.borderColor = 'var(--color-yellow)';
      uploadDrop.style.background = '#FFF7CC';
    });
    uploadDrop.addEventListener('dragleave', () => {
      uploadDrop.style.borderColor = '';
      uploadDrop.style.background = '';
    });
    uploadDrop.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadDrop.style.borderColor = '';
      uploadDrop.style.background = '';
      const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
      void handleUpload(files);
    });
  }

  async function loadImages() {
    try {
      const res = await fetch('/api/images');
      const images = await res.json();
      renderGallery(images);
    } catch {
      // silent retry on next interval
    }
  }

  let lastImagesJSON = '';

  function renderGallery(images) {
    const newJSON = JSON.stringify(images);
    if (newJSON === lastImagesJSON) return;
    lastImagesJSON = newJSON;

    if (!images.length) {
      gallery.innerHTML = `
        <div class="empty-state">
          <span class="empty-state-icon">🇵🇹</span>
          <p class="empty-state-title">The tile wall is empty</p>
          <p class="empty-state-description">Walk around Lisbon, snap photos of great design, and turn them into Portuguese tile prints.</p>
        </div>`;
      return;
    }

    const scrollY = window.scrollY;

    gallery.innerHTML = images.map(img => {
      const owned = img.creatorId === CLIENT_ID;
      return `
      <div class="tile" data-id="${img.id}">
        <img src="${img.url}" alt="${img.originalName}" loading="lazy" width="400" height="400">
        ${img.handle ? `<div class="tile-handle">@${img.handle}</div>` : ''}
        <div class="tile-actions">
          ${owned ? `<button class="tile-btn edit-btn" data-id="${img.id}">✏️ Edit</button>` : ''}
          <button class="tile-btn download-btn" data-url="${img.url}" data-name="${img.originalName}">📥 Save</button>
          ${owned ? `<button class="tile-btn delete-btn" data-id="${img.id}">🗑</button>` : ''}
        </div>
      </div>`;
    }).join('');

    window.scrollTo(0, scrollY);

    gallery.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const img = images.find(i => i.id === id);
        if (img) window.openEditor(img);
      });
    });

    gallery.querySelectorAll('.download-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        downloadImage(btn.dataset.url, btn.dataset.name);
      });
    });

    gallery.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this photo?')) return;
        await fetch(`/api/images/${btn.dataset.id}`, { method: 'DELETE', headers: { 'x-client-id': CLIENT_ID } });
        loadImages();
      });
    });
  }

  window.reloadGallery = loadImages;
})();
