/**
 * Color normalization. Accepts a hex string or a normalized RGB array and always
 * returns a `[r, g, b]` array in the 0-1 range the shader expects.
 */

/**
 * @param {string|number[]} value - `'#rrggbb'`, `'#rgb'`, or `[r, g, b]` in 0-1.
 * @param {number[]} [fallback] - Returned if `value` cannot be parsed.
 * @returns {[number, number, number]}
 */
export function normalizeColor(value, fallback = [0, 0, 0]) {
  if (Array.isArray(value) && value.length === 3) {
    return [clamp01(value[0]), clamp01(value[1]), clamp01(value[2])];
  }

  if (typeof value === 'string') {
    let hex = value.trim().replace(/^#/, '');
    if (hex.length === 3) {
      hex = hex.split('').map((c) => c + c).join('');
    }
    if (hex.length === 6 && /^[0-9a-f]{6}$/i.test(hex)) {
      return [
        parseInt(hex.slice(0, 2), 16) / 255,
        parseInt(hex.slice(2, 4), 16) / 255,
        parseInt(hex.slice(4, 6), 16) / 255,
      ];
    }
  }

  return /** @type {[number, number, number]} */ (fallback.slice(0, 3));
}

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}
