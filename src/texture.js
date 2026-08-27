/**
 * Texture loading and lens-to-texture coordinate mapping.
 *
 * Textures are configured to be NPOT-safe (CLAMP_TO_EDGE, linear, no mipmaps) so
 * arbitrary-sized images work everywhere, including iOS Safari / WebGL1.
 */

/**
 * Create an empty (1x1) texture so the shader always has something to sample.
 * @param {WebGLRenderingContext} gl
 * @returns {WebGLTexture}
 */
export function createTexture(gl) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(
    gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
    new Uint8Array([0, 0, 0, 0]),
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return tex;
}

/**
 * Upload an image/canvas/video source into an existing texture.
 * @param {WebGLRenderingContext} gl
 * @param {WebGLTexture} tex
 * @param {TexImageSource} source
 */
export function uploadTexture(gl, tex, source) {
  gl.bindTexture(gl.TEXTURE_2D, tex);
  // No Y-flip: the shader samples in top-left (y-down) screen space and expects
  // texture row 0 to be the top of the image, which is the default upload order.
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
}

/**
 * Resolve an option value into a drawable source.
 * Returns `{ element, ready, promise }`. `ready` is true when it can be uploaded now.
 *
 * @param {string|HTMLImageElement|HTMLCanvasElement|HTMLVideoElement} value
 * @param {string} crossOrigin
 */
export function resolveSource(value, crossOrigin) {
  if (!value) return { element: null, ready: false, promise: Promise.resolve(null) };

  // Already a live element we can draw from.
  if (value instanceof HTMLCanvasElement) {
    return { element: value, ready: true, promise: Promise.resolve(value) };
  }
  if (value instanceof HTMLVideoElement) {
    const ready = value.readyState >= 2;
    const promise = ready
      ? Promise.resolve(value)
      : new Promise((res) => value.addEventListener('loadeddata', () => res(value), { once: true }));
    return { element: value, ready, promise };
  }
  if (value instanceof HTMLImageElement) {
    const ready = value.complete && value.naturalWidth > 0;
    const promise = ready
      ? Promise.resolve(value)
      : new Promise((res, rej) => {
          value.addEventListener('load', () => res(value), { once: true });
          value.addEventListener('error', rej, { once: true });
        });
    return { element: value, ready, promise };
  }

  // A URL string: load into a new Image.
  const img = new Image();
  if (crossOrigin) img.crossOrigin = crossOrigin;
  const promise = new Promise((res, rej) => {
    img.addEventListener('load', () => res(img), { once: true });
    img.addEventListener('error', rej, { once: true });
  });
  img.src = value;
  return { element: img, ready: false, promise };
}

/** Natural pixel size of a drawable source. */
export function sourceSize(source) {
  if (source instanceof HTMLVideoElement) {
    return { w: source.videoWidth || 1, h: source.videoHeight || 1 };
  }
  return {
    w: source.naturalWidth || source.width || 1,
    h: source.naturalHeight || source.height || 1,
  };
}

/**
 * Compute the linear mapping (scale + offset) from lens-local UV (0..1, top-left)
 * to texture UV. The backdrop is treated as a `cover`, viewport-filling image, and
 * the lens samples the slice sitting behind its on-screen position.
 *
 * @param {DOMRect} rect  Bounding rect of the WebGL canvas in the viewport.
 * @param {{w:number,h:number}} img  Natural image size.
 * @returns {{scale:[number,number], offset:[number,number]}}
 */
export function computeMapping(rect, img) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cover = Math.max(vw / img.w, vh / img.h);
  const dw = img.w * cover;
  const dh = img.h * cover;
  const ox = (vw - dw) / 2;
  const oy = (vh - dh) / 2;
  return {
    scale: [rect.width / dw, rect.height / dh],
    offset: [(rect.left - ox) / dw, (rect.top - oy) / dh],
  };
}

/**
 * Mapping for a full-document capture. The texture is a raster of the whole page,
 * so the lens (fixed on screen) samples the document slice at its current scroll
 * position — content flows through as the page scrolls.
 *
 * @param {DOMRect} rect   Bounding rect of the WebGL canvas in the viewport.
 * @param {{w:number,h:number}} doc  Document (capture target) size in CSS px.
 * @param {{x:number,y:number}} scroll  Current window scroll offset.
 * @returns {{scale:[number,number], offset:[number,number]}}
 */
export function computeCaptureMapping(rect, doc, scroll) {
  return {
    scale: [rect.width / doc.w, rect.height / doc.h],
    offset: [(rect.left + scroll.x) / doc.w, (rect.top + scroll.y) / doc.h],
  };
}
