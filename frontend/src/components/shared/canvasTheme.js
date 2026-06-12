/**
 * Canvas colours for the active theme (dark / light projector).
 *
 * Canvas paint is not CSS, so a canvas cannot inherit a theme: every bespoke
 * draw callback resolves the tokens from :root at draw time instead. Call this
 * once per draw and read the fields - never hardcode a background, text or grid
 * colour, or the canvas stays dark on a white slide.
 *
 * Series colours (cyan signal, gold coefficients) are here too: they keep their
 * meaning across themes but need darker values on white to stay visible.
 */
let cached = null
const tokenCache = new Map()

/** True while the light projector theme is active. For generated hue ramps
 *  (hsl per level) that have no token to point at and need a darker lightness
 *  on white. */
export function isLight() {
  return document.documentElement.hasAttribute('data-projector')
}

function resolve() {
  const cs = getComputedStyle(document.documentElement)
  const pick = (name, fallback) => cs.getPropertyValue(name).trim() || fallback

  return {
    bg: pick('--graph-background', '#050510'),
    panel: pick('--canvas-panel', '#0a0a1a'),
    raised: pick('--canvas-raised', '#1a1a3a'),
    grid: pick('--graph-grid', '#34345e'),
    border: pick('--canvas-border', '#3a3a5a'),
    text: pick('--graph-text', '#c0c0e0'),
    textStrong: pick('--graph-text-strong', '#d8d8f0'),
    textFaint: pick('--canvas-text-faint', '#8888aa'),

    cyan: pick('--series-cyan', '#00d9ff'),
    blue: pick('--series-blue', '#8db4ff'),
    gold: pick('--series-gold', '#ffd700'),
    amber: pick('--series-amber', '#ffaa00'),
    green: pick('--series-green', '#00ff88'),
    pink: pick('--series-pink', '#ff6b9d'),
    orange: pick('--series-orange', '#ff9f43'),
    purple: pick('--series-purple', '#c9b1ff'),
    red: pick('--series-red', '#ff6666')
  }
}

// Resolving eight custom properties per frame would force a style recalc inside
// every animation loop, so the palette is cached until the theme attribute flips.
if (typeof MutationObserver !== 'undefined') {
  new MutationObserver(() => { cached = null; tokenCache.clear() })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-projector'] })
}

export function canvasTheme() {
  if (!cached) cached = resolve()
  return cached
}

/**
 * Canvas paint takes a colour value, never a CSS reference: assigning
 * `var(--primary)` to ctx.strokeStyle is ignored and the previous colour keeps
 * painting. Anything that travels from JSX into a canvas goes through here.
 */
export function resolveColor(color) {
  if (typeof color !== 'string') return color
  const token = color.match(/^var\((--[\w-]+)\)$/)
  if (!token) return color

  const name = token[1]
  if (!tokenCache.has(name)) {
    tokenCache.set(name, getComputedStyle(document.documentElement).getPropertyValue(name).trim() || color)
  }
  return tokenCache.get(name)
}

/**
 * Canvas type scale in design pixels. The stage renders 1.33x on a 1920-wide
 * screen, so these are the smallest sizes that stay readable from the back of a
 * lecture hall: axis ticks at 13 design px land at ~17 real px projected.
 */
export const CANVAS_FONT = {
  tick: 13,
  label: 15,
  title: 17
}
