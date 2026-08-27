/**
 * DOM capture via html2canvas.
 *
 * html2canvas is an optional peer dependency — it's only needed when the lens
 * refracts the live page (the default `background: null`). It can be provided
 * three ways, in order of preference:
 *   1. injected directly through the `html2canvas` option,
 *   2. a global `window.html2canvas` (e.g. a <script> tag / CDN build),
 *   3. dynamically imported from the `html2canvas` package (needs a bundler).
 */

async function resolveHtml2Canvas(injected) {
  if (typeof injected === 'function') return injected;
  if (typeof window !== 'undefined' && typeof window.html2canvas === 'function') {
    return window.html2canvas;
  }
  try {
    const mod = await import('html2canvas');
    return mod.default || mod;
  } catch (err) {
    throw new Error(
      '[molten-glass] Capturing the page needs html2canvas. Install it (`npm i html2canvas`), '
      + 'expose it as window.html2canvas, or pass it via the `html2canvas` option.',
    );
  }
}

/**
 * Rasterize a DOM element to a canvas.
 *
 * @param {HTMLElement} target
 * @param {Object} opts
 * @param {number} opts.scale
 * @param {boolean} opts.useCORS
 * @param {Function} [opts.html2canvas]
 * @param {(el: Element) => boolean} [opts.ignoreElements]
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function captureElement(target, opts) {
  const html2canvas = await resolveHtml2Canvas(opts.html2canvas);
  return html2canvas(target, {
    backgroundColor: null,
    scale: opts.scale,
    useCORS: opts.useCORS,
    logging: false,
    ignoreElements: opts.ignoreElements,
    width: target.scrollWidth,
    height: target.scrollHeight,
    windowWidth: target.scrollWidth,
    windowHeight: target.scrollHeight,
    scrollX: 0,
    scrollY: 0,
  });
}
