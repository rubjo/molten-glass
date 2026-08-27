/**
 * molten-glass
 * Plug-and-play WebGL molten / liquid glass effect for any DOM element.
 *
 * @example
 * import { mount } from 'molten-glass';
 * const glass = mount('#card', { twist: 1.4, specular: 0.5 });
 * // later...
 * glass.set({ twist: 0.6 });
 * glass.destroy();
 */

import { MoltenGlass } from './molten-glass.js';

export { MoltenGlass } from './molten-glass.js';
export { DEFAULTS } from './defaults.js';

/**
 * Apply the molten-glass effect to an element and return a controllable instance.
 *
 * @param {HTMLElement|string} target - An element or a CSS selector string.
 * @param {Partial<import('./defaults.js').MoltenGlassOptions>} [options]
 * @returns {MoltenGlass}
 */
export function mount(target, options = {}) {
  const el = typeof target === 'string' ? document.querySelector(target) : target;
  if (!el) {
    throw new Error(`[molten-glass] No element found for target: ${String(target)}`);
  }
  return new MoltenGlass(/** @type {HTMLElement} */ (el), options);
}

/**
 * Apply the effect to every element matching a selector.
 *
 * @param {string|NodeListOf<HTMLElement>|HTMLElement[]} targets
 * @param {Partial<import('./defaults.js').MoltenGlassOptions>} [options]
 * @returns {MoltenGlass[]}
 */
export function mountAll(targets, options = {}) {
  const list = typeof targets === 'string' ? document.querySelectorAll(targets) : targets;
  return Array.from(list).map((el) => new MoltenGlass(/** @type {HTMLElement} */ (el), options));
}

export default mount;
