/**
 * The presentation is authored on a fixed 16:9 design surface and scaled
 * proportionally to the window (see .tour-stage in tour.css). Everything below
 * works in DESIGN pixels, so layout and drawing code never has to know the
 * current scale: a slide that fits the surface fits every window size.
 */
import { useEffect, useState } from 'react'

export const STAGE_W = 1440
export const STAGE_H = 810

function fitScale() {
  return Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H)
}

/**
 * Scale that fits the whole design surface inside the window. A 16:9 window
 * lands on an exact fit (1920x1080 -> 1.333), anything else is letterboxed by
 * whichever ratio is smaller, so nothing is ever clipped.
 */
export function useStageScale() {
  const [scale, setScale] = useState(fitScale)

  useEffect(() => {
    const onResize = () => setScale(fitScale())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return scale
}

/**
 * Canvas metrics for an element inside the scaled stage.
 *
 * width/height are design pixels (the coordinate system every draw callback
 * uses). dpr already includes the stage scale, so the backing store matches
 * real device pixels and the canvas stays crisp at any window size.
 */
export function canvasMetrics(el) {
  const width = el.clientWidth
  const height = el.clientHeight
  const rect = el.getBoundingClientRect()
  const stageScale = width > 0 ? rect.width / width : 1
  return { width, height, stageScale, dpr: (window.devicePixelRatio || 1) * stageScale }
}

/** Pointer position in design pixels, relative to the element. */
export function pointerPos(event, el) {
  const rect = el.getBoundingClientRect()
  const scale = rect.width > 0 ? el.clientWidth / rect.width : 1
  return {
    x: (event.clientX - rect.left) * scale,
    y: (event.clientY - rect.top) * scale
  }
}
