# molten-glass

Plug-and-play WebGL **molten / liquid glass** lens for any DOM element.

**[▶ Live demo](https://rubjo.github.io/molten-glass/examples/)**

Point it at a selector and it becomes a fixed glass lens that refracts the **real
page behind it** — background, headings, text, images, everything — bending it
like liquid at the edges while the center stays clear. It snapshots the page with
html2canvas, uploads that to a WebGL texture, and offsets the sample as you
scroll, so real content flows through the lens.

```js
import { mount } from 'molten-glass';

const glass = mount('#lens'); // captures and refracts the page behind it
```

Runs on iOS Safari and every modern browser (pure WebGL — no `backdrop-filter`
`url()` / SVG-filter tricks).

---

## Install

```bash
npm install molten-glass html2canvas
```

`html2canvas` is an **optional peer dependency** — it's only needed for the
default page-capture mode. If you only refract images/video/canvas you supply, you
can skip it. The library itself ships as native ES modules with hand-written
TypeScript definitions and no other dependencies.

---

## Quick start

```html
<div id="lens" style="position:fixed; top:40%; left:50%; width:420px; height:300px; border-radius:48px;"></div>
```

```js
import { mount } from 'molten-glass';

const glass = mount('#lens', {
  twist: 0.75,
  refraction: 0.34,
  specular: 0.35,
});
```

The element gets a WebGL canvas inserted beneath its content, is given
`overflow: hidden` and (if needed) `position: relative`, and its own children are
lifted above the glass. With no `background` set, it captures the page and
refracts it.

Provide `html2canvas` however suits your setup — a bundler resolves the import
automatically; otherwise inject it:

```js
import html2canvas from 'html2canvas';
mount('#lens', { html2canvas });
```

---

## How it works

1. **Capture** — html2canvas rasterizes the page (`captureTarget`, default
   `document.body`) to a canvas, once. The lens element and anything marked
   `data-molten-ignore` are excluded.
2. **Upload** — that canvas becomes a WebGL texture (NPOT-safe, iOS-friendly).
3. **Sample + melt** — the fragment shader warps the sampling coordinate toward
   the edges (rotational melt + refraction pinch), samples the real content there,
   and adds an optional chromatic split, a glass tint, and a specular rim.
4. **Scroll** — the lens is fixed, so as the page scrolls the sample offset moves,
   and the captured content flows through. Scrolling only updates a uniform, so
   it's smooth; the expensive capture happens only occasionally.

### Refreshing the snapshot

The capture is a snapshot, so content that changes *after* it (a dropdown opens,
a route changes, an animation plays) won't show until you refresh it:

```js
glass.recapture(); // re-snapshot the page
```

Resizes trigger an automatic (debounced) recapture.

### Refracting a specific source instead of the page

Pass an image, video, or canvas to skip capture and refract just that:

```js
mount('#lens', { background: '/photo.jpg' });        // an image
mount('#lens', { background: videoEl, live: true }); // live video
```

---

## API

### `mount(target, options?) → MoltenGlass`

Applies the lens and returns an instance. `target` is an `HTMLElement` or a CSS
selector string.

### `mountAll(targets, options?) → MoltenGlass[]`

Applies the lens to every element matching a selector string, `NodeList`, or
array of elements.

### Instance methods

| Method                 | Description                                                        |
| ---------------------- | ------------------------------------------------------------------ |
| `set(partial)`         | Merge new options and apply them live. Recaptures/reloads if the source changed. |
| `recapture()`          | Re-snapshot the page (capture mode only).                          |
| `setBackground(src)`   | Refract a specific source, or `null`/`'capture'` for page capture. |
| `pause()` / `resume()` | Pause/resume the loop (only relevant for live sources).            |
| `destroy()`            | Remove the canvas, release WebGL, and restore the element exactly. |

```js
glass.set({ twist: 0.4, specular: 0.7 });
glass.recapture();
glass.destroy(); // fully reversible
```

---

## Options

All options are optional; defaults are shown.

| Option                | Type                              | Default             | Description                                                                 |
| --------------------- | --------------------------------- | ------------------- | --------------------------------------------------------------------------- |
| `background`          | `string \| HTMLImageElement \| HTMLCanvasElement \| HTMLVideoElement \| null` | `null` | `null` captures the page. Or a URL/element to refract that instead.         |
| `captureTarget`       | `Element \| string \| null`       | `document.body`     | What to rasterize in capture mode.                                          |
| `captureScale`        | `number`                          | `min(dpr, 2)`       | Rasterization sharpness (auto-clamped to the GPU's max texture size).       |
| `useCORS`             | `boolean`                         | `true`              | Let html2canvas capture cross-origin images.                                |
| `html2canvas`         | `Function \| null`                | `null`              | Inject html2canvas (else a global or dynamic import is used).               |
| `live`                | `boolean`                         | `false`             | Re-upload every frame (for `<video>`/`<canvas>` sources).                   |
| `twist`               | `number`                          | `0.75`              | Rotational "melt" distortion toward the edges.                             |
| `refraction`          | `number`                          | `0.34`              | Edge refraction / pinch strength.                                          |
| `edgeExponent`        | `number`                          | `4`                 | Edge falloff steepness (higher = clearer center, tighter edge band).       |
| `specular`            | `number`                          | `0.35`              | Edge specular highlight intensity.                                         |
| `chromaticAberration` | `number`                          | `0.5`               | RGB split at the edges. Subtle values (~0.3) read as real glass.           |
| `tint`                | `string \| [r,g,b]`               | `[0.1, 0.12, 0.18]` | Glass tint color. Hex or normalized RGB (0–1).                             |
| `tintStrength`        | `number`                          | `0.3`               | How strongly the tint mixes over the refracted content (0–1).              |
| `canvasBlur`          | `number`                          | `3`                 | CSS blur (px) on the WebGL canvas — the frosted softening.                 |
| `canvasOpacity`       | `number`                          | `1.0`               | CSS opacity (0–1) of the WebGL canvas.                                     |
| `raiseContent`        | `boolean`                         | `true`              | Auto-lift the host's children above the glass canvas.                      |
| `draggable`           | `boolean`                         | `false`             | Let the user drag the lens with the pointer (pins it to `position: fixed`). |
| `dpr`                 | `number`                          | `min(devicePixelRatio, 2)` | Device pixel ratio cap for sharpness vs. performance.               |

---

## Framework usage

Plain DOM, so it drops into any framework. Create on mount, `destroy()` on teardown.

```jsx
import { useEffect, useRef } from 'react';
import { mount } from 'molten-glass';
import html2canvas from 'html2canvas';

function GlassLens(props) {
  const ref = useRef(null);
  useEffect(() => {
    const glass = mount(ref.current, { html2canvas, ...props });
    return () => glass.destroy();
  }, []);
  return <div ref={ref} style={{ position: 'fixed', width: 420, height: 300, borderRadius: 48 }} />;
}
```

---

### Draggable lens

Set `draggable: true` and the user can grab and move the lens with the mouse or
touch. It pins the element to `position: fixed` and re-samples the page at each
new spot as it moves — no recapture needed.

```js
mount('#lens', { draggable: true });
```

---

## Run the demo

```bash
npm run example
```

Serves the package root; open the printed URL with `/examples/` appended (e.g.
`http://localhost:3000/examples/`). ES modules require `http://`, so opening the
file directly from `file://` will not work. The demo loads html2canvas from a CDN,
puts a **draggable** lens over a tall scrolling page, lets you **swap the page
background image** (or load your own), and drives every option from a live panel
(`window.glass` is exposed for console tinkering).

---

## Requirements & browser support

- **WebGL** (all evergreen browsers, including iOS Safari).
- **html2canvas** for page capture (optional peer dependency).
- No dependence on `backdrop-filter: url()` or SVG filters, so it renders
  consistently across Chromium, Firefox, and Safari.

---

## Limitations & notes

- **Snapshots, not live DOM.** Capture mode rasterizes the page at a moment in
  time; call `recapture()` after the content behind the lens changes. Truly live
  per-frame DOM refraction isn't feasible cheaply in the browser.
- **html2canvas fidelity.** It re-implements CSS rendering, so some effects
  (certain shadows, filters, fonts, cross-origin images without CORS) may capture
  imperfectly. Cross-origin images need CORS headers or they'll taint the canvas.
- **Cost.** A capture is comparatively expensive; scrolling is not (it only moves a
  sample offset). Very tall pages are auto-downscaled to fit the GPU texture limit.
- The host element is given `overflow: hidden` and, when `static`,
  `position: relative`. `destroy()` restores both.

---

## License

MIT
