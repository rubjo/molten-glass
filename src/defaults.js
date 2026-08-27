/**
 * Default options for a MoltenGlass instance.
 *
 * Every value can be overridden per-instance in `mount(el, options)` and changed
 * later with `instance.set(partialOptions)`.
 *
 * @typedef {Object} MoltenGlassOptions
 * @property {string|HTMLImageElement|HTMLCanvasElement|HTMLVideoElement|null} background
 *   `null` (default) → the lens captures the real page DOM behind it (via html2canvas)
 *   and refracts it, following the page as it scrolls. Alternatively pass a URL or an
 *   <img>/<canvas>/<video> element to refract that specific source instead of the page.
 * @property {Element|string|null} captureTarget
 *   Element (or selector) to rasterize in capture mode. Defaults to `document.body`.
 * @property {number}  captureScale  Rasterization scale passed to html2canvas (sharpness vs. cost).
 * @property {boolean} useCORS       Pass `useCORS: true` to html2canvas so cross-origin images can be captured.
 * @property {Function|null} html2canvas
 *   Inject the html2canvas function directly. If omitted, a global `window.html2canvas`
 *   is used when present, otherwise it is dynamically imported (needs a bundler).
 * @property {boolean} live          Re-upload the texture every frame (for <video>/<canvas> sources).
 * @property {string}  crossOrigin   crossOrigin attribute used when loading image URLs.
 *
 * @property {number}  twist         Rotational "melt" distortion toward the edges.
 * @property {number}  refraction    Edge refraction / pinch strength.
 * @property {number}  edgeExponent  Edge falloff steepness (higher = clearer center, tighter edge band).
 * @property {number}  specular      Edge specular highlight intensity.
 * @property {number}  chromaticAberration  RGB split at the edges (0 = off). Subtle values (~0.3) read as real glass.
 *
 * @property {string|number[]} tint  Glass tint color. Hex (`'#1a1f2e'`) or normalized RGB (`[0.1,0.12,0.18]`).
 * @property {number}  tintStrength  How strongly the tint mixes over the refracted content (0-1).
 *
 * @property {number}  canvasBlur    CSS blur (px) on the WebGL canvas — the frosted softening.
 * @property {number}  canvasOpacity CSS opacity (0-1) of the WebGL canvas.
 * @property {boolean} raiseContent  Auto-lift the host's existing children above the glass canvas.
 * @property {boolean} draggable      Let the user drag the lens around with the pointer.
 * @property {number}  dpr           Device pixel ratio cap. Defaults to min(devicePixelRatio, 2).
 */

const DPR = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);

/** @type {MoltenGlassOptions} */
export const DEFAULTS = {
  background: null,
  captureTarget: null,
  captureScale: DPR,
  useCORS: true,
  html2canvas: null,
  live: false,
  crossOrigin: 'anonymous',

  twist: 0.75,
  refraction: 0.34,
  edgeExponent: 4,
  specular: 0.35,
  chromaticAberration: 0.5,

  tint: [0.1, 0.12, 0.18],
  tintStrength: 0.3,

  canvasBlur: 3,
  canvasOpacity: 1.0,
  raiseContent: true,
  draggable: false,
  dpr: DPR,
};
