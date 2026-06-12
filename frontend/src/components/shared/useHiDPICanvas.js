import { useRef, useEffect, useCallback } from 'react'
import { canvasMetrics } from './stage'

/**
 * Shared HiDPI canvas hook. Sizes the canvas backing store at
 * devicePixelRatio resolution, keeps CSS size in logical pixels,
 * redraws on container resize (ResizeObserver) and when deps change.
 *
 * The draw callback receives (ctx, { width, height }) in LOGICAL pixels;
 * the context is already scaled by dpr, so all drawing code works in
 * logical coordinates (mouse coordinates need no dpr correction).
 *
 * @param {(ctx: CanvasRenderingContext2D, size: {width: number, height: number}) => void} drawFn
 * @param {Array} deps - dependency list that should trigger a redraw
 * @returns {{ canvasRef, containerRef, redraw: () => void }}
 */
export default function useHiDPICanvas(drawFn, deps = []) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const { width, height, dpr } = canvasMetrics(container)
    if (width === 0 || height === 0) return

    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`

    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    drawFn(ctx, { width, height })
  }, deps)

  useEffect(() => {
    redraw()
    const observer = new ResizeObserver(redraw)
    if (containerRef.current) observer.observe(containerRef.current)

    // Repaint on projector-mode toggle so theme-resolved canvas colors update
    const themeObserver = new MutationObserver(redraw)
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-projector'] })

    // The stage is scaled by a CSS transform, which leaves the layout size
    // untouched - ResizeObserver stays silent, so track the window directly
    // to re-rasterize at the new device resolution.
    window.addEventListener('resize', redraw)

    return () => {
      observer.disconnect()
      themeObserver.disconnect()
      window.removeEventListener('resize', redraw)
    }
  }, [redraw])

  return { canvasRef, containerRef, redraw }
}
