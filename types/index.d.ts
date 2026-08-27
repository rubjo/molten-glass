export type TextureSource =
  | string
  | HTMLImageElement
  | HTMLCanvasElement
  | HTMLVideoElement;

export interface MoltenGlassOptions {
  /** `null` (default) captures the real page DOM behind the lens and refracts it, following scroll. Or pass a URL/`<img>`/`<canvas>`/`<video>` to refract that source instead. */
  background: TextureSource | null;
  /** Element or selector to rasterize in capture mode. Defaults to `document.body`. */
  captureTarget: Element | string | null;
  /** Rasterization scale passed to html2canvas. */
  captureScale: number;
  /** Pass `useCORS: true` to html2canvas so cross-origin images can be captured. */
  useCORS: boolean;
  /** Inject html2canvas directly. Otherwise a global `window.html2canvas` or a dynamic import is used. */
  html2canvas: ((el: Element, opts?: object) => Promise<HTMLCanvasElement>) | null;
  /** Re-upload the texture every frame (for <video>/<canvas> sources). */
  live: boolean;
  /** crossOrigin attribute used when loading image URLs. */
  crossOrigin: string;

  /** Rotational "melt" distortion toward the edges. */
  twist: number;
  /** Edge refraction / pinch strength. */
  refraction: number;
  /** Edge falloff steepness (higher = clearer center, tighter edge band). */
  edgeExponent: number;
  /** Edge specular highlight intensity. */
  specular: number;
  /** RGB split at the edges (0 = off). Subtle values (~0.3) read as real glass. */
  chromaticAberration: number;

  /** Glass tint color. Hex string or normalized RGB array (0-1). */
  tint: string | [number, number, number];
  /** How strongly the tint mixes over the refracted content (0-1). */
  tintStrength: number;

  /** CSS blur (px) on the WebGL canvas — the frosted softening. */
  canvasBlur: number;
  /** CSS opacity (0-1) of the WebGL canvas. */
  canvasOpacity: number;
  /** Auto-lift the host's existing children above the glass canvas. */
  raiseContent: boolean;
  /** Let the user drag the lens around with the pointer. */
  draggable: boolean;
  /** Device pixel ratio cap. Defaults to min(devicePixelRatio, 2). */
  dpr: number;
}

export const DEFAULTS: MoltenGlassOptions;

export class MoltenGlass {
  constructor(element: HTMLElement, options?: Partial<MoltenGlassOptions>);
  readonly element: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly captureMode: boolean;
  options: MoltenGlassOptions;
  /** Merge new options and apply them. Reloads/recaptures the source if needed. */
  set(partial?: Partial<MoltenGlassOptions>): this;
  /** Swap the refracted source, or pass null/'capture' for page capture. */
  setBackground(background: TextureSource | null): this;
  /** Re-snapshot the page (capture mode only). Call after content behind the lens changes. */
  recapture(): this;
  /** Pause the animation loop (only relevant for live sources). */
  pause(): this;
  /** Resume after `pause()`. */
  resume(): this;
  /** Stop rendering, remove the canvas, release WebGL, and restore the host element. */
  destroy(): void;
}

/** Apply the molten-glass effect to an element and return a controllable instance. */
export function mount(
  target: HTMLElement | string,
  options?: Partial<MoltenGlassOptions>,
): MoltenGlass;

/** Apply the effect to every element matching a selector or list. */
export function mountAll(
  targets: string | NodeListOf<HTMLElement> | HTMLElement[],
  options?: Partial<MoltenGlassOptions>,
): MoltenGlass[];

export default mount;
