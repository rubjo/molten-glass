import { DEFAULTS } from './defaults.js';
import { VERTEX_SRC, FRAGMENT_SRC } from './shaders.js';
import { createProgram, createQuad } from './gl-utils.js';
import { normalizeColor } from './color.js';
import {
  createTexture, uploadTexture, resolveSource, sourceSize,
  computeMapping, computeCaptureMapping,
} from './texture.js';
import { captureElement } from './capture.js';

const CANVAS_CLASS = 'molten-glass-canvas';
const CANVAS_OVERSCAN = 30; // px the canvas bleeds past the host to hide edge sampling artifacts.
const RECAPTURE_DEBOUNCE = 250;

/**
 * A single molten-glass lens bound to one host element.
 * Prefer the `mount()` helper; instantiate directly only to manage lifecycle yourself.
 */
export class MoltenGlass {
  /**
   * @param {HTMLElement} element
   * @param {Partial<import('./defaults.js').MoltenGlassOptions>} [options]
   */
  constructor(element, options = {}) {
    if (!(element instanceof HTMLElement)) {
      throw new Error('[molten-glass] mount target must be an HTMLElement.');
    }

    this.element = element;
    this.options = { ...DEFAULTS, ...options };
    this._destroyed = false;
    this._raf = 0;
    this._renderQueued = false;
    this._source = null;       // current drawable source (img/canvas/video)
    this._imgSize = { w: 1, h: 1 };
    this._docSize = { w: 1, h: 1 };
    this._hasTexture = false;
    this._live = false;
    this._capturing = false;
    this._pendingCapture = false;
    this._cornerRadius = 0;
    this._recaptureTimer = 0;
    this._rect = null;         // cached lens rect; refreshed only when the lens can move
    this._restore = { position: '', overflow: '' };
    this._raisedChildren = [];
    this._dragRestore = null;
    this._drag = null;

    this._render = this._render.bind(this);
    this._loop = this._loop.bind(this);
    this._scheduleRender = this._scheduleRender.bind(this);

    this._createCanvas();
    this._initGL();
    this._prepareHost();
    this._observe();
    this._resize();
    this._applyCssFilters();
    this._pushStaticUniforms();
    this._start();
    if (this.options.draggable) this._enableDrag();
  }

  get captureMode() {
    return !this.options.background || this.options.background === 'capture';
  }

  get captureTarget() {
    const t = this.options.captureTarget;
    if (t instanceof Element) return t;
    if (typeof t === 'string') return document.querySelector(t) || document.body;
    return document.body;
  }

  /* ---------------------------------------------------------------- setup -- */

  _createCanvas() {
    const canvas = document.createElement('canvas');
    canvas.className = CANVAS_CLASS;
    Object.assign(canvas.style, {
      position: 'absolute',
      top: `${-CANVAS_OVERSCAN}px`,
      left: `${-CANVAS_OVERSCAN}px`,
      width: `calc(100% + ${CANVAS_OVERSCAN * 2}px)`,
      height: `calc(100% + ${CANVAS_OVERSCAN * 2}px)`,
      zIndex: '0',
      pointerEvents: 'none',
      borderRadius: 'inherit',
    });
    this.canvas = canvas;
  }

  _initGL() {
    // antialias is off: the shader fills the whole quad (no internal geometry edges),
    // so MSAA has no visible effect here but costs GPU — the CSS blur softens edges.
    const attrs = { alpha: true, premultipliedAlpha: true, antialias: false };
    const gl = this.canvas.getContext('webgl', attrs)
      || this.canvas.getContext('experimental-webgl', attrs);
    if (!gl) throw new Error('[molten-glass] WebGL is not supported in this environment.');
    this.gl = gl;

    this.program = createProgram(gl, VERTEX_SRC, FRAGMENT_SRC);
    gl.useProgram(this.program);
    this.quad = createQuad(gl, this.program);
    this.texture = createTexture(gl);
    gl.clearColor(0, 0, 0, 0);

    const names = [
      'u_res', 'u_tex', 'u_texScale', 'u_texOffset', 'u_twist', 'u_refract',
      'u_exponent', 'u_specular', 'u_chroma', 'u_tint', 'u_tintStrength',
      'u_overscan', 'u_cornerRadius',
    ];
    this.uniforms = {};
    for (const name of names) this.uniforms[name] = gl.getUniformLocation(this.program, name);

    gl.uniform1i(this.uniforms.u_tex, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
  }

  _prepareHost() {
    const el = this.element;
    const computed = getComputedStyle(el);

    this._restore.position = el.style.position;
    this._restore.overflow = el.style.overflow;

    if (computed.position === 'static') el.style.position = 'relative';
    el.style.overflow = 'hidden';
    el.insertBefore(this.canvas, el.firstChild);

    if (this.options.raiseContent) {
      for (const child of Array.from(el.children)) {
        if (child === this.canvas) continue;
        const cs = getComputedStyle(child);
        this._raisedChildren.push({ el: child, position: child.style.position, zIndex: child.style.zIndex });
        if (cs.position === 'static') child.style.position = 'relative';
        if (cs.zIndex === 'auto') child.style.zIndex = '1';
      }
    }
  }

  _observe() {
    const onResize = () => {
      this._resize();
      this._scheduleRender();
      if (this.captureMode) this._debouncedRecapture();
    };
    if (typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver(onResize);
      this._resizeObserver.observe(this.element);
    }
    this._onResize = onResize;
    window.addEventListener('resize', this._onResize);
    // A fixed lens samples a new document slice as the page scrolls.
    this._onScroll = () => { this._updateRect(); this._scheduleRender(); };
    window.addEventListener('scroll', this._onScroll, { passive: true });
  }

  /* ------------------------------------------------------------- sourcing -- */

  _start() {
    if (this.captureMode) this._capture();
    else this._loadBackground(this._resolveBackgroundOption());
  }

  _resolveBackgroundOption() {
    if (this.options.background && this.options.background !== 'capture') return this.options.background;
    const bg = getComputedStyle(this.element).backgroundImage;
    const match = bg && bg.match(/url\(["']?(.*?)["']?\)/);
    return match ? match[1] : null;
  }

  _capture() {
    if (this._destroyed) return;
    // If a capture is already running, remember to run one more when it finishes,
    // so a background swap during a slow capture isn't dropped.
    if (this._capturing) { this._pendingCapture = true; return; }
    this._capturing = true;
    const target = this.captureTarget;

    // Keep the raster within the GPU's max texture size (important on iOS).
    const maxTex = this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) || 4096;
    const w = target.scrollWidth || 1;
    const h = target.scrollHeight || 1;
    const scale = Math.max(0.25, Math.min(this.options.captureScale, maxTex / w, maxTex / h));

    captureElement(target, {
      scale,
      useCORS: this.options.useCORS,
      html2canvas: this.options.html2canvas,
      ignoreElements: (el) => el === this.element
        || el === this.canvas
        || (el instanceof HTMLElement && el.dataset && 'moltenIgnore' in el.dataset),
    })
      .then((canvas) => {
        if (this._destroyed) return;
        this._docSize = { w: target.scrollWidth, h: target.scrollHeight };
        this._live = false; // a snapshot; scrolling only changes the sample offset
        this._commitSource(canvas);
      })
      .catch((err) => console.warn(err.message || err))
      .finally(() => {
        this._capturing = false;
        if (this._pendingCapture && !this._destroyed) {
          this._pendingCapture = false;
          this._capture();
        }
      });
  }

  _debouncedRecapture() {
    clearTimeout(this._recaptureTimer);
    this._recaptureTimer = setTimeout(() => this._capture(), RECAPTURE_DEBOUNCE);
  }

  _loadBackground(value) {
    const { element, ready, promise } = resolveSource(value, this.options.crossOrigin);
    this._source = element;
    this._hasTexture = false;

    if (!element) {
      console.warn('[molten-glass] No background to refract. Pass `background`, set a CSS background-image, or use capture mode.');
      this._scheduleRender();
      return;
    }
    this._live = this.options.live
      || element instanceof HTMLVideoElement
      || element instanceof HTMLCanvasElement;

    if (ready) this._commitSource(element);
    promise
      .then((el) => { if (!this._destroyed && el) this._commitSource(el); })
      .catch(() => console.warn('[molten-glass] Failed to load background source.'));
  }

  _commitSource(element) {
    this._source = element;
    if (!this.captureMode) this._imgSize = sourceSize(element);
    uploadTexture(this.gl, this.texture, element);
    this._hasTexture = true;
    this._updateActivity();
    this._scheduleRender();
  }

  /* -------------------------------------------------------------- runtime -- */

  _resize() {
    const { gl, canvas } = this;
    const dpr = this.options.dpr;
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    this._cornerRadius = this._readCornerRadius();
    this._updateRect();
    if (canvas.width === w && canvas.height === h) return;
    canvas.width = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);
  }

  // Cache the lens rect so the render loop needn't force a layout every frame.
  _updateRect() {
    this._rect = this.canvas.getBoundingClientRect();
  }

  // Resolve the host's border-radius to CSS pixels so the specular can follow the shape.
  _readCornerRadius() {
    const el = this.element;
    const brs = getComputedStyle(el).borderTopLeftRadius || '0';
    const value = parseFloat(brs) || 0;
    if (brs.indexOf('%') !== -1) {
      return (value / 100) * Math.min(el.clientWidth, el.clientHeight);
    }
    return value;
  }

  _applyCssFilters() {
    const o = this.options;
    this.canvas.style.filter = o.canvasBlur > 0 ? `blur(${o.canvasBlur}px)` : 'none';
    this.canvas.style.opacity = String(o.canvasOpacity);
  }

  _pushStaticUniforms() {
    const { gl, uniforms, options: o } = this;
    gl.useProgram(this.program);
    const tint = normalizeColor(o.tint, DEFAULTS.tint);
    gl.uniform1f(uniforms.u_twist, o.twist);
    gl.uniform1f(uniforms.u_refract, o.refraction);
    gl.uniform1f(uniforms.u_exponent, o.edgeExponent);
    gl.uniform1f(uniforms.u_specular, o.specular);
    gl.uniform1f(uniforms.u_chroma, o.chromaticAberration);
    gl.uniform3f(uniforms.u_tint, tint[0], tint[1], tint[2]);
    gl.uniform1f(uniforms.u_tintStrength, o.tintStrength);
  }

  _updateActivity() {
    if (this._live && !this._raf) {
      this._raf = requestAnimationFrame(this._loop);
    } else if (!this._live && this._raf) {
      cancelAnimationFrame(this._raf);
      this._raf = 0;
    }
  }

  _loop() {
    if (this._destroyed) return;
    if (this._hasTexture && this._source) uploadTexture(this.gl, this.texture, this._source);
    this._render();
    this._raf = requestAnimationFrame(this._loop);
  }

  _scheduleRender() {
    if (this._destroyed || this._raf || this._renderQueued) return;
    this._renderQueued = true;
    requestAnimationFrame(() => { this._renderQueued = false; this._render(); });
  }

  _render() {
    if (this._destroyed) return;
    const { gl, uniforms } = this;
    gl.useProgram(this.program);
    gl.uniform2f(uniforms.u_res, this.canvas.width, this.canvas.height);
    gl.uniform1f(uniforms.u_overscan, CANVAS_OVERSCAN * this.options.dpr);
    gl.uniform1f(uniforms.u_cornerRadius, this._cornerRadius * this.options.dpr);

    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!this._hasTexture) return;

    const rect = this._rect || this.canvas.getBoundingClientRect();
    const { scale, offset } = this.captureMode
      ? computeCaptureMapping(rect, this._docSize, { x: window.scrollX, y: window.scrollY })
      : computeMapping(rect, this._imgSize);
    gl.uniform2f(uniforms.u_texScale, scale[0], scale[1]);
    gl.uniform2f(uniforms.u_texOffset, offset[0], offset[1]);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  /* ----------------------------------------------------------------- api -- */

  /**
   * Merge new options and apply them. Reloads/recaptures the source if needed.
   * @param {Partial<import('./defaults.js').MoltenGlassOptions>} partial
   * @returns {this}
   */
  set(partial = {}) {
    if (this._destroyed) return this;
    const sourceChanged = 'background' in partial || 'captureTarget' in partial || 'captureScale' in partial;
    this.options = { ...this.options, ...partial };
    this._applyCssFilters();
    this._pushStaticUniforms();
    if (sourceChanged) this._start();
    this._updateActivity();
    this._scheduleRender();
    return this;
  }

  /** Swap the refracted source (URL/element), or pass `null`/`'capture'` for page capture. */
  setBackground(background) {
    return this.set({ background });
  }

  /** Re-snapshot the page (capture mode only). Call after the content behind the lens changes. */
  recapture() {
    if (!this._destroyed && this.captureMode) this._capture();
    return this;
  }

  /** Pause the animation loop (only relevant for live sources). */
  pause() {
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; }
    return this;
  }

  /** Resume after `pause()`. */
  resume() {
    this._updateActivity();
    this._scheduleRender();
    return this;
  }

  /* ---------------------------------------------------------------- drag -- */

  _enableDrag() {
    const el = this.element;
    this._dragRestore = {
      position: el.style.position,
      left: el.style.left,
      top: el.style.top,
      transform: el.style.transform,
      cursor: el.style.cursor,
      touchAction: el.style.touchAction,
      userSelect: el.style.userSelect,
    };

    // Pin the element at its current spot in viewport coordinates so pointer
    // deltas map 1:1, regardless of any centering transform it started with.
    const rect = el.getBoundingClientRect();
    el.style.position = 'fixed';
    el.style.left = `${rect.left}px`;
    el.style.top = `${rect.top}px`;
    el.style.transform = 'none';
    el.style.cursor = 'grab';
    el.style.touchAction = 'none';
    el.style.userSelect = 'none';
    this._updateRect();

    this._onPointerDown = (e) => {
      this._drag = { px: e.clientX, py: e.clientY, left: parseFloat(el.style.left), top: parseFloat(el.style.top) };
      el.style.cursor = 'grabbing';
      if (el.setPointerCapture) el.setPointerCapture(e.pointerId);
      e.preventDefault();
    };
    this._onPointerMove = (e) => {
      if (!this._drag) return;
      el.style.left = `${this._drag.left + (e.clientX - this._drag.px)}px`;
      el.style.top = `${this._drag.top + (e.clientY - this._drag.py)}px`;
      this._updateRect();
      this._scheduleRender();
    };
    this._onPointerUp = (e) => {
      this._drag = null;
      el.style.cursor = 'grab';
      if (el.releasePointerCapture) el.releasePointerCapture(e.pointerId);
    };

    el.addEventListener('pointerdown', this._onPointerDown);
    el.addEventListener('pointermove', this._onPointerMove);
    el.addEventListener('pointerup', this._onPointerUp);
    el.addEventListener('pointercancel', this._onPointerUp);
  }

  _disableDrag() {
    const el = this.element;
    if (!this._dragRestore) return;
    el.removeEventListener('pointerdown', this._onPointerDown);
    el.removeEventListener('pointermove', this._onPointerMove);
    el.removeEventListener('pointerup', this._onPointerUp);
    el.removeEventListener('pointercancel', this._onPointerUp);
    Object.assign(el.style, this._dragRestore);
    this._dragRestore = null;
    this._drag = null;
  }

  /** Stop rendering, remove the canvas, release WebGL, and restore the host element. */
  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;

    if (this._raf) cancelAnimationFrame(this._raf);
    clearTimeout(this._recaptureTimer);
    this._disableDrag();
    if (this._resizeObserver) this._resizeObserver.disconnect();
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('scroll', this._onScroll);

    if (this.gl) {
      const ext = this.gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
    }
    if (this.canvas && this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);

    const el = this.element;
    el.style.position = this._restore.position;
    el.style.overflow = this._restore.overflow;
    for (const { el: child, position, zIndex } of this._raisedChildren) {
      child.style.position = position;
      child.style.zIndex = zIndex;
    }
    this._raisedChildren = [];
  }
}
