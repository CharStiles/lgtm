// Editor — canvas drawing + mirror tool with touch support
(function () {
  const overlay = document.getElementById('editor-overlay');
  const canvas = document.getElementById('draw-canvas');
  const ctx = canvas.getContext('2d');
  const backBtn = document.getElementById('editor-back');
  const saveBtn = document.getElementById('save-btn');
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
  const modeResizeBtn = document.getElementById('mode-resize');
  const resizeControls = document.getElementById('resize-controls');
  const resizeDimensions = document.getElementById('resize-dimensions');
  const resizeLockBtn = document.getElementById('resize-lock');
  const resizeApplyBtn = document.getElementById('resize-apply');
  const resizeHandles = document.getElementById('resize-handles');

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
  let mode = 'draw'; // 'draw', 'mirror', 'filter', or 'resize'
  let resizeLocked = true; // aspect ratio lock
  let resizePreviewW = 0, resizePreviewH = 0; // dimensions while dragging

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
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    mode = 'draw';
    undoStack = [];
    updateModeUI();

    // Pre-fill caption from image data
    if (editorCaptionInput) editorCaptionInput.value = imgData.caption || '';

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
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
    modeResizeBtn.classList.toggle('active', mode === 'resize');
    drawControls.hidden = mode !== 'draw';
    mirrorControls.hidden = mode !== 'mirror';
    filterControls.hidden = mode !== 'filter';
    resizeControls.hidden = mode !== 'resize';
    resizeHandles.hidden = mode !== 'resize';
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

  modeResizeBtn.addEventListener('click', () => {
    mode = 'resize';
    resizePreviewW = canvas.width;
    resizePreviewH = canvas.height;
    resizeDimensions.textContent = `${canvas.width} × ${canvas.height}`;
    updateModeUI();
    positionResizeHandles();
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

  // Drawing & panning — unified mouse/touch
  let pinchStartDist = 0;
  let pinchStartW = 0, pinchStartH = 0;
  let isPinching = false;

  function getTouchDist(e) {
    const t = e.touches;
    const dx = t[0].clientX - t[1].clientX;
    const dy = t[0].clientY - t[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches ? e.touches[0] : e;
    return {
      x: (touch.clientX - rect.left) * (canvas.width / rect.width),
      y: (touch.clientY - rect.top) * (canvas.height / rect.height)
    };
  }

  function getClientPos(e) {
    const touch = e.touches ? e.touches[0] : e;
    return { x: touch.clientX, y: touch.clientY };
  }

  function startInteraction(e) {
    e.preventDefault();

    // Two-finger touch = pinch to resize
    if (e.touches && e.touches.length >= 2) {
      isPinching = true;
      isDrawing = false;
      pinchStartDist = getTouchDist(e);
      pinchStartW = canvas.width;
      pinchStartH = canvas.height;
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
      // mirror/filter: drag to pan
      startPan(e);
    }
  }

  function moveInteraction(e) {
    // Two-finger touch = pinch to resize
    if (e.touches && e.touches.length >= 2 && isPinching) {
      e.preventDefault();
      const dist = getTouchDist(e);
      const scale = dist / pinchStartDist;
      const newW = Math.max(16, Math.round(pinchStartW * scale));
      const newH = Math.max(16, Math.round(pinchStartH * scale));

      const container = canvas.parentElement;
      const maxW = container.clientWidth;
      const maxH = container.clientHeight;
      const displayScale = Math.min(maxW / newW, maxH / newH, 1);
      canvas.style.width = (newW * displayScale) + 'px';
      canvas.style.height = (newH * displayScale) + 'px';
      resizePreviewW = newW;
      resizePreviewH = newH;
      return;
    }

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
  }

  function endInteraction(e) {
    if (isPinching) {
      isPinching = false;
      // Commit the pinch resize
      const newW = resizePreviewW;
      const newH = resizePreviewH;
      if (newW && newH && (newW !== canvas.width || newH !== canvas.height)) {
        undoStack.push({
          baseImageData: new ImageData(
            new Uint8ClampedArray(baseImageData.data),
            baseImageData.width,
            baseImageData.height
          ),
          strokes: JSON.parse(JSON.stringify(strokes))
        });

        replayStrokes();
        const tmpCanvas = document.createElement('canvas');
        tmpCanvas.width = canvas.width;
        tmpCanvas.height = canvas.height;
        tmpCanvas.getContext('2d').drawImage(canvas, 0, 0);

        canvas.width = newW;
        canvas.height = newH;
        canvas.style.width = '';
        canvas.style.height = '';
        ctx.drawImage(tmpCanvas, 0, 0, tmpCanvas.width, tmpCanvas.height, 0, 0, newW, newH);
        baseImageData = ctx.getImageData(0, 0, newW, newH);
        strokes = [];
        positionCropFrame();
      } else {
        canvas.style.width = '';
        canvas.style.height = '';
      }
      return;
    }

    if (isPanning) {
      endPan();
      return;
    }

    if (mode === 'draw') {
      if (!isDrawing) return;
      e.preventDefault();
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
    const pos = getClientPos(e);
    panStartX = pos.x;
    panStartY = pos.y;
    panStartOffsetX = panX;
    panStartOffsetY = panY;
  }

  function movePan(e) {
    if (!isPanning) return;
    e.preventDefault();
    const pos = getClientPos(e);
    const dx = (pos.x - panStartX) / imgScale;
    const dy = (pos.y - panStartY) / imgScale;
    panX = panStartOffsetX - dx;
    panY = panStartOffsetY - dy;
    clampPan();
    rebasePan();

    if (mode === 'mirror') applyKaleidPreview();
    if (mode === 'filter') applyFilterPreview();
  }

  function endPan() {
    isPanning = false;
  }

  // Mouse events
  canvas.addEventListener('mousedown', startInteraction);
  canvas.addEventListener('mousemove', moveInteraction);
  canvas.addEventListener('mouseup', endInteraction);
  canvas.addEventListener('mouseleave', endInteraction);

  // Touch events
  canvas.addEventListener('touchstart', startInteraction, { passive: false });
  canvas.addEventListener('touchmove', moveInteraction, { passive: false });
  canvas.addEventListener('touchend', endInteraction, { passive: false });
  canvas.addEventListener('touchcancel', endInteraction, { passive: false });

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

  // --- Resize (corner drag) ---
  resizeLockBtn.addEventListener('click', () => {
    resizeLocked = !resizeLocked;
    resizeLockBtn.classList.toggle('active', resizeLocked);
  });

  function positionResizeHandles() {
    if (mode !== 'resize') return;
    const rect = canvas.getBoundingClientRect();
    const container = canvas.parentElement.getBoundingClientRect();
    const offsetX = rect.left - container.left;
    const offsetY = rect.top - container.top;

    resizeHandles.style.left = offsetX + 'px';
    resizeHandles.style.top = offsetY + 'px';
    resizeHandles.style.width = rect.width + 'px';
    resizeHandles.style.height = rect.height + 'px';
  }

  let resizeDragDir = null;
  let resizeDragStartX = 0, resizeDragStartY = 0;
  let resizeDragStartW = 0, resizeDragStartH = 0;

  resizeHandles.addEventListener('mousedown', startResizeDrag);
  resizeHandles.addEventListener('touchstart', startResizeDrag, { passive: false });

  function startResizeDrag(e) {
    const handle = e.target.closest('.resize-handle');
    if (!handle) return;
    e.preventDefault();
    resizeDragDir = handle.dataset.dir;
    const pos = e.touches ? e.touches[0] : e;
    resizeDragStartX = pos.clientX;
    resizeDragStartY = pos.clientY;
    resizeDragStartW = canvas.width;
    resizeDragStartH = canvas.height;

    document.addEventListener('mousemove', moveResizeDrag);
    document.addEventListener('mouseup', endResizeDrag);
    document.addEventListener('touchmove', moveResizeDrag, { passive: false });
    document.addEventListener('touchend', endResizeDrag);
  }

  function moveResizeDrag(e) {
    if (!resizeDragDir) return;
    e.preventDefault();
    const pos = e.touches ? e.touches[0] : e;
    let dx = pos.clientX - resizeDragStartX;
    let dy = pos.clientY - resizeDragStartY;

    // Invert for top/left handles
    if (resizeDragDir.includes('w')) dx = -dx;
    if (resizeDragDir.includes('n')) dy = -dy;

    const container = canvas.parentElement;
    const scaleX = resizeDragStartW / canvas.getBoundingClientRect().width;
    const scaleY = resizeDragStartH / canvas.getBoundingClientRect().height;

    let newW = Math.max(16, Math.round(resizeDragStartW + dx * scaleX));
    let newH = Math.max(16, Math.round(resizeDragStartH + dy * scaleY));

    if (resizeLocked) {
      const aspect = resizeDragStartW / resizeDragStartH;
      // Use the larger delta to drive both
      if (Math.abs(dx) > Math.abs(dy)) {
        newH = Math.max(16, Math.round(newW / aspect));
      } else {
        newW = Math.max(16, Math.round(newH * aspect));
      }
    }

    resizePreviewW = newW;
    resizePreviewH = newH;
    resizeDimensions.textContent = `${newW} × ${newH}`;

    // Live preview: resize the canvas display (CSS only, not the actual canvas buffer)
    const maxW = container.clientWidth;
    const maxH = container.clientHeight;
    const displayScale = Math.min(maxW / newW, maxH / newH, 1);
    canvas.style.width = (newW * displayScale) + 'px';
    canvas.style.height = (newH * displayScale) + 'px';
    positionResizeHandles();
  }

  function endResizeDrag() {
    resizeDragDir = null;
    document.removeEventListener('mousemove', moveResizeDrag);
    document.removeEventListener('mouseup', endResizeDrag);
    document.removeEventListener('touchmove', moveResizeDrag);
    document.removeEventListener('touchend', endResizeDrag);
  }

  resizeApplyBtn.addEventListener('click', () => {
    const newW = resizePreviewW;
    const newH = resizePreviewH;
    if (!newW || !newH || newW < 16 || newH < 16) return;

    // Save undo snapshot
    undoStack.push({
      baseImageData: new ImageData(
        new Uint8ClampedArray(baseImageData.data),
        baseImageData.width,
        baseImageData.height
      ),
      strokes: JSON.parse(JSON.stringify(strokes))
    });

    // Render current state to a temp canvas, then resize
    replayStrokes();
    const tmpCanvas = document.createElement('canvas');
    tmpCanvas.width = canvas.width;
    tmpCanvas.height = canvas.height;
    tmpCanvas.getContext('2d').drawImage(canvas, 0, 0);

    canvas.width = newW;
    canvas.height = newH;
    canvas.style.width = '';
    canvas.style.height = '';
    ctx.drawImage(tmpCanvas, 0, 0, tmpCanvas.width, tmpCanvas.height, 0, 0, newW, newH);
    baseImageData = ctx.getImageData(0, 0, newW, newH);
    strokes = [];

    positionCropFrame();
    positionResizeHandles();
    showToast(`Resized to ${newW}×${newH}`, 'success');
  });

  // Undo
  undoBtn.addEventListener('click', () => {
    if ((mode === 'mirror' || mode === 'filter' || mode === 'resize') && undoStack.length > 0) {
      const prev = undoStack.pop();
      baseImageData = prev.baseImageData;
      strokes = prev.strokes;
      canvas.width = baseImageData.width;
      canvas.height = baseImageData.height;
      replayStrokes();
      if (mode === 'mirror') applyKaleidPreview();
      if (mode === 'filter') applyFilterPreview();
      if (mode === 'resize') {
        resizeWidthInput.value = canvas.width;
        resizeHeightInput.value = canvas.height;
      }
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
  saveBtn.addEventListener('click', async () => {
    if (!currentImage) return;
    saveBtn.textContent = 'Saving\u2026';
    saveBtn.disabled = true;

    try {
      // Save handle to localStorage
      const handle = editorHandleInput ? editorHandleInput.value.trim().replace(/^@/, '') : '';
      const caption = editorCaptionInput ? editorCaptionInput.value.trim() : '';
      if (handle) localStorage.setItem('lgtm-handle', handle);

      // If in filter mode, commit the filter preview before capturing
      if (mode === 'filter') {
        const filtered = getFilteredImageData();
        ctx.putImageData(filtered, 0, 0);
      }

      // Save the flattened canvas as a new image
      const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
      const file = new File([blob], 'edited.png', { type: 'image/png' });
      const form = new FormData();
      form.append('image', file);
      if (handle) form.append('handle', handle);
      if (caption) form.append('caption', caption);

      // Upload the edited version, replacing the original
      const res = await fetch(`/api/canvas/${currentImage.id}`, {
        method: 'POST',
        body: form,
        headers: { 'x-client-id': localStorage.getItem('lgtm-client-id') || '' }
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.error);
      }

      // Update currentImage so subsequent saves use the new filename
      const result = await res.json();
      if (result.filename) {
        currentImage.url = '/uploads/' + result.filename;
      }

      showToast('Saved!', 'success');
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

  // Download current canvas to device
  const downloadBtn = document.getElementById('download-btn');
  downloadBtn.addEventListener('click', () => {
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const name = currentImage ? (currentImage.originalName || 'lisbon-tile.png') : 'lisbon-tile.png';
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Saved to device!', 'success');
    }, 'image/png');
  });
})();
