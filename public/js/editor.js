// Editor — canvas drawing + mirror tool with touch support
(function () {
  const overlay = document.getElementById('editor-overlay');
  const canvas = document.getElementById('draw-canvas');
  const ctx = canvas.getContext('2d');
  const backBtn = document.getElementById('editor-back');
  const undoBtn = document.getElementById('undo-btn');
  const eraserBtn = document.getElementById('eraser-btn');
  const colorInput = document.getElementById('brush-color');
  const sizeInput = document.getElementById('brush-size');
  const modeDrawBtn = document.getElementById('mode-draw');
  const modeMirrorBtn = document.getElementById('mode-mirror');
  const drawControls = document.getElementById('draw-controls');
  const mirrorControls = document.getElementById('mirror-controls');

  // Toast helper
  function showToast(message, type = 'success') {
    let toast = document.querySelector('.toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'toast';
      toast.setAttribute('aria-live', 'polite');
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.className = `toast ${type}`;
    requestAnimationFrame(() => {
      toast.classList.add('visible');
    });
    setTimeout(() => {
      toast.classList.remove('visible');
    }, 2500);
  }
  const kaleidSegments = document.getElementById('kaleid-segments');
  const kaleidCount = document.getElementById('kaleid-count');
  const kaleidApply = document.getElementById('kaleid-apply');
  const cropFrame = document.getElementById('crop-frame');
  const modeFilterBtn = document.getElementById('mode-filter');
  const filterControls = document.getElementById('filter-controls');
  const filterPalette = document.getElementById('filter-palette');
  const filterLevels = document.getElementById('filter-levels');
  const filterApplyBtn = document.getElementById('filter-apply');

  let currentImage = null;
  let isDrawing = false;
  let isEraser = false;
  let strokes = [];
  let currentStroke = [];
  let baseImageData = null;

  // Handle input in editor
  const editorHandleInput = document.getElementById('editor-handle');
  const editorCaptionInput = document.getElementById('editor-caption');
  const savedHandle = localStorage.getItem('lgtm-handle');
  if (editorHandleInput && savedHandle) editorHandleInput.value = savedHandle;
  let mode = 'draw'; // 'draw', 'mirror', or 'filter'

  // Color palettes for posterization
  const PALETTES = {
    azulejo: [
      [240, 244, 248], // white
      [200, 215, 230], // light blue
      [100, 145, 190], // medium blue
      [43, 92, 138],   // deep azulejo blue
      [20, 50, 85],    // dark navy
      [250, 250, 250], // bright white
    ],
    earth: [
      [250, 246, 239], // cream
      [200, 169, 110], // tan/gold
      [180, 130, 70],  // warm brown
      [120, 80, 45],   // dark brown
      [210, 160, 90],  // amber
      [160, 110, 60],  // sienna
    ],
    terracotta: [
      [250, 240, 230], // warm white
      [220, 150, 100], // terracotta
      [180, 100, 60],  // burnt orange
      [140, 70, 40],   // dark terra
      [200, 170, 130], // sand
      [100, 50, 30],   // deep brown
    ],
    ocean: [
      [250, 248, 240], // shell white
      [200, 190, 160], // sand
      [120, 170, 190], // sea foam
      [60, 120, 160],  // ocean blue
      [180, 160, 120], // driftwood
      [40, 80, 120],   // deep water
    ],
  };

  // Mirror / kaleidoscope state
  let undoStack = [];

  // Pan state — offset into the full-size source image
  let fullImage = null; // the full Image element
  let panX = 0, panY = 0; // offset in source image pixels
  let imgScale = 1; // scale factor from source to canvas
  let isPanning = false;
  let panStartX = 0, panStartY = 0;
  let panStartOffsetX = 0, panStartOffsetY = 0;

  // Open editor
  window.openEditor = function (imgData) {
    currentImage = imgData;
    window.currentEditorImage = currentImage;
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    mode = 'draw';
    undoStack = [];
    updateModeUI();

    // Show loading state
    canvas.style.opacity = '0.3';
    let loader = document.getElementById('editor-loader');
    if (!loader) {
      loader = document.createElement('div');
      loader.id = 'editor-loader';
      loader.className = 'editor-loader';
      loader.textContent = 'Loading...';
      canvas.parentElement.appendChild(loader);
    }
    loader.hidden = false;

    // Pre-fill caption from image data
    if (editorCaptionInput) editorCaptionInput.value = imgData.caption || '';

    const img = new Image();
    if (!imgData.url.startsWith('blob:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => {
      // Hide loading state
      canvas.style.opacity = '1';
      const loader = document.getElementById('editor-loader');
      if (loader) loader.hidden = true;

      fullImage = img;
      const container = canvas.parentElement;
      const maxW = container.clientWidth;
      const maxH = container.clientHeight;
      imgScale = Math.min(maxW / img.width, maxH / img.height);

      canvas.width = img.width * imgScale;
      canvas.height = img.height * imgScale;

      panX = 0;
      panY = 0;
      drawImageAtOffset();
      baseImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      // Position the square crop frame
      positionCropFrame();

      strokes = [];
      if (imgData.drawings) {
        strokes = imgData.drawings;
        replayStrokes();
      }

      // Apply azulejo filter by default, switch to filter mode
      mode = 'filter';
      filterPalette.value = 'azulejo';
      filterLevels.value = '4';
      updateModeUI();
      applyFilterPreview();
    };
    img.onerror = () => {
      canvas.style.opacity = '1';
      const loader = document.getElementById('editor-loader');
      if (loader) loader.textContent = 'Failed to load image';
    };
    img.src = imgData.url;
  };

  function closeEditor() {
    overlay.hidden = true;
    document.body.style.overflow = '';
    currentImage = null;
    fullImage = null;
    strokes = [];
    currentStroke = [];
    undoStack = [];
    currentScale = 1;
    translateX = 0;
    translateY = 0;
    canvas.style.transform = '';
    cropFrame.style.display = 'none';
  }

  backBtn.addEventListener('click', closeEditor);

  // Draw the source image onto the canvas at the current pan offset
  function drawImageAtOffset() {
    if (!fullImage) return;
    ctx.fillStyle = '#FAFAF9';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(-panX * imgScale, -panY * imgScale);
    ctx.drawImage(fullImage, 0, 0, fullImage.width * imgScale, fullImage.height * imgScale);
    ctx.restore();
  }

  // Clamp pan — allow dragging well beyond the image edges
  function clampPan() {
    // No clamping — allow free movement in any direction
  }

  // Replace fullImage with the current canvas so panning uses the committed state
  function bakeFullImage() {
    const img = new Image();
    const w = canvas.width;
    const h = canvas.height;
    img.src = canvas.toDataURL();
    img.onload = () => {
      fullImage = img;
      panX = 0;
      panY = 0;
      imgScale = 1;
    };
    // Set synchronously so panning doesn't break before onload
    fullImage = img;
    img.width = w;
    img.height = h;
    panX = 0;
    panY = 0;
    imgScale = 1;
  }

  // Rebase: bake current pan into baseImageData and reset offset
  function rebasePan() {
    drawImageAtOffset();
    baseImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    strokes = [];
  }

  // Position the square crop frame centered on the canvas
  function positionCropFrame() {
    requestAnimationFrame(() => {
      const rect = canvas.getBoundingClientRect();
      const container = canvas.parentElement.getBoundingClientRect();
      const side = Math.min(rect.width, rect.height);
      cropFrame.style.display = 'block';
      cropFrame.style.width = side + 'px';
      cropFrame.style.height = side + 'px';
      cropFrame.style.left = (rect.left - container.left + (rect.width - side) / 2) + 'px';
      cropFrame.style.top = (rect.top - container.top + (rect.height - side) / 2) + 'px';
    });
  }

  // Mode switching
  function updateModeUI() {
    modeDrawBtn.classList.toggle('active', mode === 'draw');
    modeMirrorBtn.classList.toggle('active', mode === 'mirror');
    modeFilterBtn.classList.toggle('active', mode === 'filter');
    drawControls.hidden = mode !== 'draw';
    mirrorControls.hidden = mode !== 'mirror';
    filterControls.hidden = mode !== 'filter';
  }

  modeDrawBtn.addEventListener('click', () => {
    mode = 'draw';
    updateModeUI();
    replayStrokes();
  });

  modeMirrorBtn.addEventListener('click', () => {
    mode = 'mirror';
    updateModeUI();
    applyKaleidPreview();
  });

  modeFilterBtn.addEventListener('click', () => {
    mode = 'filter';
    updateModeUI();
    // Show live preview
    applyFilterPreview();
  });

  // --- Kaleidoscope ---

  kaleidSegments.addEventListener('input', () => {
    kaleidCount.textContent = kaleidSegments.value;
    applyKaleidPreview();
  });

  function applyKaleidPreview() {
    if (mode !== 'mirror') return;
    const segments = parseInt(kaleidSegments.value);
    replayStrokes();
    renderKaleidoscope(segments, false);
  }

  function renderKaleidoscope(segments, commit) {
    replayStrokes();
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.sqrt(cx * cx + cy * cy) + 1;

    // Get source image data
    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = w;
    srcCanvas.height = h;
    const srcCtx = srcCanvas.getContext('2d');
    srcCtx.drawImage(canvas, 0, 0);

    // Fill background, then draw kaleidoscope
    ctx.fillStyle = '#FAFAF9';
    ctx.fillRect(0, 0, w, h);
    const sliceAngle = (Math.PI * 2) / segments;

    for (let i = 0; i < segments; i++) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(sliceAngle * i);

      // Clip to pie wedge FIRST (before any mirroring)
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(radius, 0);
      ctx.arc(0, 0, radius, 0, sliceAngle);
      ctx.closePath();
      ctx.clip();

      // Mirror alternate slices within the clipped wedge
      if (i % 2 === 1) {
        ctx.rotate(sliceAngle);
        ctx.scale(1, -1);
      }

      // Draw the source image offset so center maps to origin
      ctx.drawImage(srcCanvas, -cx, -cy);
      ctx.restore();
    }

    if (!commit) {
      // Draw guide lines to show segments
      ctx.save();
      ctx.strokeStyle = 'rgba(196, 151, 61, 0.5)';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 4]);
      for (let i = 0; i < segments; i++) {
        const angle = sliceAngle * i;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
        ctx.stroke();
      }
      // Center dot
      ctx.setLineDash([]);
      ctx.fillStyle = '#C4973D';
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  kaleidApply.addEventListener('click', () => {
    // Save undo snapshot
    undoStack.push({
      baseImageData: new ImageData(
        new Uint8ClampedArray(baseImageData.data),
        baseImageData.width,
        baseImageData.height
      ),
      strokes: JSON.parse(JSON.stringify(strokes))
    });

    const segments = parseInt(kaleidSegments.value);
    renderKaleidoscope(segments, true);
    baseImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    strokes = [];
    bakeFullImage();
  });

  // Drawing & gestures — pointer events for pinch-to-scale everywhere
  const pointerCache = [];
  let pinchStartDist = 0;
  let pinchStartScale = 1;
  let currentScale = 1; // cumulative scale applied to canvas
  let translateX = 0, translateY = 0; // CSS pan offset in px
  let isPinching = false;
  let pinchJustEnded = false;

  function updateCanvasTransform() {
    canvas.style.transform = `translate(${translateX}px, ${translateY}px) scale(${currentScale})`;
  }

  function getPointerDist() {
    const dx = pointerCache[0].clientX - pointerCache[1].clientX;
    const dy = pointerCache[0].clientY - pointerCache[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height)
    };
  }

  function getClientPos(e) {
    return { x: e.clientX, y: e.clientY };
  }

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    pointerCache.push(e);

    if (pointerCache.length === 2) {
      // Start pinch — cancel any in-progress pan or draw
      isPinching = true;
      isDrawing = false;
      isPanning = false;
      currentStroke = [];
      pinchStartDist = getPointerDist();
      pinchStartScale = currentScale;
      return;
    }

    if (pointerCache.length > 2) return;

    // Single pointer — ignore if pinch just ended
    if (pinchJustEnded) {
      pinchJustEnded = false;
      return;
    }

    if (mode === 'draw') {
      isDrawing = true;
      currentStroke = [];
      const pos = getPos(e);
      currentStroke.push({
        ...pos,
        color: isEraser ? 'eraser' : colorInput.value,
        size: parseInt(sizeInput.value)
      });
    } else {
      // mirror/filter: single-finger pan via CSS translate
      isPanning = true;
      panStartX = e.clientX;
      panStartY = e.clientY;
      panStartOffsetX = translateX;
      panStartOffsetY = translateY;
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    // Update pointer in cache
    const idx = pointerCache.findIndex(p => p.pointerId === e.pointerId);
    if (idx >= 0) pointerCache[idx] = e;

    if (isPinching && pointerCache.length >= 2) {
      e.preventDefault();
      const dist = getPointerDist();
      const scale = (dist / pinchStartDist) * pinchStartScale;
      currentScale = Math.max(0.1, scale);
      updateCanvasTransform();
      return;
    }

    if (isPinching) return;

    if (isPanning) {
      movePan(e);
      return;
    }

    if (mode === 'draw') {
      if (!isDrawing) return;
      e.preventDefault();
      const pos = getPos(e);
      const point = {
        ...pos,
        color: isEraser ? 'eraser' : colorInput.value,
        size: parseInt(sizeInput.value)
      };
      currentStroke.push(point);
      drawSegment(currentStroke[currentStroke.length - 2], point);
    }
  });

  canvas.addEventListener('pointerup', handlePointerUp);
  canvas.addEventListener('pointercancel', handlePointerUp);

  function handlePointerUp(e) {
    const idx = pointerCache.findIndex(p => p.pointerId === e.pointerId);
    if (idx >= 0) pointerCache.splice(idx, 1);

    if (isPinching) {
      if (pointerCache.length > 0) return; // still have fingers down
      isPinching = false;
      pinchJustEnded = true;
      // Keep currentScale applied — don't commit to buffer until Save
      return;
    }

    if (isPanning) {
      endPan();
      return;
    }

    if (mode === 'draw') {
      if (!isDrawing) return;
      isDrawing = false;
      if (currentStroke.length > 0) {
        strokes.push([...currentStroke]);
        currentStroke = [];
      }
    }
  }

  function startPan(e) {
    isPanning = true;
    isDrawing = false;
    panStartX = e.clientX;
    panStartY = e.clientY;
    panStartOffsetX = translateX;
    panStartOffsetY = translateY;
  }

  function movePan(e) {
    if (!isPanning) return;
    e.preventDefault();
    translateX = panStartOffsetX + (e.clientX - panStartX);
    translateY = panStartOffsetY + (e.clientY - panStartY);
    updateCanvasTransform();
  }

  function endPan() {
    isPanning = false;
  }

  function drawSegment(from, to) {
    ctx.beginPath();
    if (to.color === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = to.color;
    }
    ctx.lineWidth = to.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }

  function replayStrokes() {
    ctx.putImageData(baseImageData, 0, 0);
    for (const stroke of strokes) {
      for (let i = 1; i < stroke.length; i++) {
        drawSegment(stroke[i - 1], stroke[i]);
      }
    }
  }

  // --- Filter / Posterization ---

  function nearestPaletteColor(r, g, b, palette) {
    let minDist = Infinity;
    let best = palette[0];
    for (const c of palette) {
      const dr = r - c[0], dg = g - c[1], db = b - c[2];
      const dist = dr * dr + dg * dg + db * db;
      if (dist < minDist) { minDist = dist; best = c; }
    }
    return best;
  }

  function posterize(imageData, levels) {
    const data = imageData.data;
    const step = 255 / (levels - 1);
    for (let i = 0; i < data.length; i += 4) {
      data[i]     = Math.round(Math.round(data[i] / step) * step);
      data[i + 1] = Math.round(Math.round(data[i + 1] / step) * step);
      data[i + 2] = Math.round(Math.round(data[i + 2] / step) * step);
    }
    return imageData;
  }

  function applyPalette(imageData, palette) {
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b] = nearestPaletteColor(data[i], data[i + 1], data[i + 2], palette);
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }
    return imageData;
  }

  function getFilteredImageData() {
    const paletteName = filterPalette.value;
    const levels = parseInt(filterLevels.value);

    // Start from base + strokes
    replayStrokes();
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    if (paletteName === 'none') return imgData;

    // First posterize to reduce tonal range
    posterize(imgData, levels);

    // Convert to grayscale first for better palette mapping
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      data[i] = gray;
      data[i + 1] = gray;
      data[i + 2] = gray;
    }

    // Map to palette
    const palette = PALETTES[paletteName];
    if (palette) applyPalette(imgData, palette);

    return imgData;
  }

  function applyFilterPreview() {
    if (mode !== 'filter') return;
    const filtered = getFilteredImageData();
    ctx.putImageData(filtered, 0, 0);
  }

  function applyFilterCommit() {
    // Save undo snapshot
    undoStack.push({
      baseImageData: new ImageData(
        new Uint8ClampedArray(baseImageData.data),
        baseImageData.width,
        baseImageData.height
      ),
      strokes: JSON.parse(JSON.stringify(strokes))
    });

    const filtered = getFilteredImageData();
    ctx.putImageData(filtered, 0, 0);
    baseImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    strokes = [];
    bakeFullImage();
  }

  // Live preview when changing palette or levels
  filterPalette.addEventListener('change', applyFilterPreview);
  filterLevels.addEventListener('input', applyFilterPreview);
  filterApplyBtn.addEventListener('click', () => {
    applyFilterCommit();
    mode = 'draw';
    updateModeUI();
  });

  // Undo
  undoBtn.addEventListener('click', () => {
    if (undoStack.length > 0 && strokes.length === 0) {
      const prev = undoStack.pop();
      baseImageData = prev.baseImageData;
      strokes = prev.strokes;
      canvas.width = baseImageData.width;
      canvas.height = baseImageData.height;
      replayStrokes();
      if (mode === 'mirror') applyKaleidPreview();
      if (mode === 'filter') applyFilterPreview();
      positionCropFrame();
      return;
    }
    if (strokes.length === 0) return;
    strokes.pop();
    replayStrokes();
  });

  // Eraser toggle
  eraserBtn.addEventListener('click', () => {
    isEraser = !isEraser;
    eraserBtn.classList.toggle('active', isEraser);
  });

  // Save
  const saveBtn = document.getElementById('save-btn');
  saveBtn.addEventListener('click', async () => {
    if (!currentImage) return;
    saveBtn.textContent = 'Saving\u2026';
    saveBtn.disabled = true;

    try {
      const handle = editorHandleInput ? editorHandleInput.value.trim().replace(/^@/, '') : '';
      const caption = editorCaptionInput ? editorCaptionInput.value.trim() : '';
      if (handle) localStorage.setItem('lgtm-handle', handle);

      // If in filter mode, commit the filter preview before capturing
      if (mode === 'filter') {
        const filtered = getFilteredImageData();
        ctx.putImageData(filtered, 0, 0);
      }

      // Export the visible crop region (what's inside the crop frame)
      let exportCanvas = canvas;
      if (Math.abs(currentScale - 1) > 0.01 || Math.abs(translateX) > 1 || Math.abs(translateY) > 1) {
        const container = canvas.parentElement;
        const contW = container.clientWidth;
        const contH = container.clientHeight;

        // Canvas natural size in CSS pixels (before transform)
        const natW = canvas.offsetWidth;
        const natH = canvas.offsetHeight;

        // The canvas is centered in container, then transform applied
        const canvasLeftInContainer = (contW - natW) / 2 + translateX;
        const canvasTopInContainer = (contH - natH) / 2 + translateY;

        // Visible region in CSS pixels relative to canvas origin
        const visLeft = -canvasLeftInContainer / currentScale;
        const visTop = -canvasTopInContainer / currentScale;
        const visW = contW / currentScale;
        const visH = contH / currentScale;

        // Convert CSS coords to canvas buffer coords
        const bufferRatioX = canvas.width / natW;
        const bufferRatioY = canvas.height / natH;

        const sx = Math.max(0, visLeft * bufferRatioX);
        const sy = Math.max(0, visTop * bufferRatioY);
        const sw = Math.min(canvas.width - sx, visW * bufferRatioX);
        const sh = Math.min(canvas.height - sy, visH * bufferRatioY);

        // Export as square (crop frame is square)
        const side = Math.min(sw, sh);
        const cropX = sx + (sw - side) / 2;
        const cropY = sy + (sh - side) / 2;

        exportCanvas = document.createElement('canvas');
        exportCanvas.width = Math.round(side);
        exportCanvas.height = Math.round(side);
        exportCanvas.getContext('2d').drawImage(canvas, cropX, cropY, side, side, 0, 0, Math.round(side), Math.round(side));
      }

      const blob = await new Promise(r => exportCanvas.toBlob(r, 'image/png'));
      const file = new File([blob], 'edited.png', { type: 'image/png' });
      const form = new FormData();
      form.append('image', file);
      if (handle) form.append('handle', handle);
      if (caption) form.append('caption', caption);

      if (!currentImage.id) {
        alert('Still uploading \u2014 try saving again in a moment');
        saveBtn.textContent = 'Save';
        saveBtn.disabled = false;
        return;
      }

      const res = await fetch(`/api/canvas/${currentImage.id}`, {
        method: 'POST',
        body: form,
        headers: { 'x-client-id': localStorage.getItem('lgtm-client-id') || '' }
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.error);
      }

      const result = await res.json();
      if (result.filename) {
        currentImage.url = '/uploads/' + result.filename;
      }

      saveBtn.textContent = 'Saved!';
      setTimeout(() => {
        saveBtn.textContent = 'Save';
        saveBtn.disabled = false;
      }, 1000);
      window.reloadGallery();
    } catch (err) {
      showToast('Save failed: ' + err.message, 'error');
      saveBtn.textContent = 'Save';
      saveBtn.disabled = false;
    }
  });

})();
