import { useRef, useEffect, useCallback } from 'react'
import './Graph.css'
import { canvasMetrics } from './stage'
import { canvasTheme, resolveColor, CANVAS_FONT } from './canvasTheme'

/**
 * Reusable Graph component with HiDPI support, axis labels, grid, and multiple series
 * 
 * @param {Object} props
 * @param {Array<Object>} props.series - Array of series to plot: { data: number[], color: string, lineWidth?: number, label?: string, dashed?: boolean, opacity?: number }
 * @param {Object} props.xAxis - X-axis config: { label?: string, min?: number, max?: number, ticks?: number[], tickFormat?: (v) => string }
 * @param {Object} props.yAxis - Y-axis config: { label?: string, min?: number, max?: number, ticks?: number[], tickFormat?: (v) => string }
 * @param {Object} props.margin - Custom margins: { top, right, bottom, left }
 * @param {string} props.background - Background color
 * @param {string} props.gridColor - Grid line color
 * @param {boolean} props.compact - Compact mode with smaller margins
 * @param {Function} props.onDraw - Custom draw callback for overlays: (ctx, { width, height, getX, getY, margin }) => void
 * @param {Object} props.highlight - Highlight config: { xRange?: [min, max], points?: [{x, y, color, radius}] }
 * @param {string} props.className - Additional CSS class
 */
export default function Graph({
  series = [],
  xAxis = {},
  yAxis = {},
  margin: customMargin,
  background = null,
  gridColor = null,
  compact = false,
  onDraw,
  highlight,
  className = ''
}) {
  const canvasRef = useRef()
  const containerRef = useRef()
  
  // Default margins
  // Left margin holds the rotated axis label plus the widest tick label at
  // CANVAS_FONT.tick; the rotated label is drawn hard against the left edge.
  const defaultMargin = compact
    ? { top: 26, right: 16, bottom: 40, left: 58 }
    : { top: 32, right: 22, bottom: 48, left: 66 }
  const margin = { ...defaultMargin, ...customMargin }
  
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    
    // HiDPI support
    const { width, height, dpr } = canvasMetrics(container)
    
    if (width === 0 || height === 0) return
    
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    
    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)

    const theme = canvasTheme()

    // Clear with background (theme-aware unless caller overrides)
    ctx.fillStyle = resolveColor(background) || theme.bg
    ctx.fillRect(0, 0, width, height)

    // Calculate plot area
    const plotWidth = width - margin.left - margin.right
    const plotHeight = height - margin.top - margin.bottom
    
    // Calculate data ranges
    let xMin = xAxis.min, xMax = xAxis.max
    let yMin = yAxis.min, yMax = yAxis.max
    
    // Auto-calculate if not provided
    if (xMin === undefined || xMax === undefined) {
      let allXValues = []
      series.forEach(s => {
        if (s.xData) {
          allXValues = allXValues.concat(s.xData)
        } else if (s.data) {
          allXValues = allXValues.concat(s.data.map((_, i) => i))
        }
      })
      if (allXValues.length > 0) {
        xMin = xMin ?? Math.min(...allXValues)
        xMax = xMax ?? Math.max(...allXValues)
      } else {
        xMin = 0
        xMax = 1
      }
    }
    
    if (yMin === undefined || yMax === undefined) {
      let allYValues = []
      series.forEach(s => {
        if (s.data) allYValues = allYValues.concat(s.data)
      })
      if (allYValues.length > 0) {
        const dataMin = Math.min(...allYValues)
        const dataMax = Math.max(...allYValues)
        const padding = (dataMax - dataMin) * 0.1 || 0.1
        yMin = yMin ?? dataMin - padding
        yMax = yMax ?? dataMax + padding
      } else {
        yMin = 0
        yMax = 1
      }
    }
    
    const xRange = xMax - xMin || 1
    const yRange = yMax - yMin || 1
    
    // Coordinate transforms
    const getX = (val) => margin.left + ((val - xMin) / xRange) * plotWidth
    const getY = (val) => margin.top + plotHeight - ((val - yMin) / yRange) * plotHeight
    
    // Draw grid
    ctx.strokeStyle = resolveColor(gridColor) || theme.grid
    ctx.lineWidth = 1.25

    // Horizontal grid lines
    const yTicks = yAxis.ticks || generateTicks(yMin, yMax, 5)
    yTicks.forEach(tick => {
      const y = getY(tick)
      ctx.beginPath()
      ctx.moveTo(margin.left, y)
      ctx.lineTo(width - margin.right, y)
      ctx.stroke()
    })
    
    // Vertical grid lines
    const xTicks = xAxis.ticks || generateTicks(xMin, xMax, 5)
    xTicks.forEach(tick => {
      const x = getX(tick)
      ctx.beginPath()
      ctx.moveTo(x, margin.top)
      ctx.lineTo(x, height - margin.bottom)
      ctx.stroke()
    })
    
    // Draw axis labels
    ctx.fillStyle = theme.text
    ctx.font = `bold ${CANVAS_FONT.tick}px Inter, system-ui, sans-serif`

    // X-axis tick labels
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    xTicks.forEach(tick => {
      const x = getX(tick)
      const label = xAxis.tickFormat ? xAxis.tickFormat(tick) : formatNumber(tick, xTicks)
      ctx.fillText(label, x, height - margin.bottom + 6)
    })
    
    // Y-axis tick labels
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    yTicks.forEach(tick => {
      const y = getY(tick)
      const label = yAxis.tickFormat ? yAxis.tickFormat(tick) : formatNumber(tick, yTicks)
      ctx.fillText(label, margin.left - 6, y)
    })
    
    // Axis labels
    ctx.font = `bold ${CANVAS_FONT.label}px Inter, system-ui, sans-serif`
    ctx.fillStyle = theme.textStrong
    
    if (xAxis.label) {
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.fillText(xAxis.label, margin.left + plotWidth / 2, height - 4)
    }
    
    if (yAxis.label) {
      ctx.save()
      ctx.translate(2, margin.top + plotHeight / 2)
      ctx.rotate(-Math.PI / 2)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(yAxis.label, 0, 0)
      ctx.restore()
    }
    
    // Draw highlight regions if specified
    if (highlight?.xRange) {
      const [hxMin, hxMax] = highlight.xRange
      const x1 = getX(hxMin)
      const x2 = getX(hxMax)
      ctx.fillStyle = resolveColor(highlight.color) || 'rgba(255, 170, 0, 0.15)'
      ctx.fillRect(x1, margin.top, x2 - x1, plotHeight)
      
      // Draw dashed borders
      ctx.strokeStyle = resolveColor(highlight.borderColor) || 'rgba(255, 170, 0, 0.6)'
      ctx.lineWidth = 1
      ctx.setLineDash([3, 3])
      ctx.beginPath()
      ctx.moveTo(x1, margin.top)
      ctx.lineTo(x1, height - margin.bottom)
      ctx.moveTo(x2, margin.top)
      ctx.lineTo(x2, height - margin.bottom)
      ctx.stroke()
      ctx.setLineDash([])
    }
    
    // Draw series
    series.forEach(s => {
      if (!s.data || s.data.length === 0) return
      
      const xData = s.xData || s.data.map((_, i) => xMin + (i / (s.data.length - 1 || 1)) * xRange)
      
      ctx.strokeStyle = resolveColor(s.color) || theme.cyan
      ctx.lineWidth = s.lineWidth || 2.5
      ctx.globalAlpha = s.opacity ?? 1
      
      if (s.dashed) {
        ctx.setLineDash(s.dashed === true ? [4, 4] : s.dashed)
      }
      
      // Draw line
      ctx.beginPath()
      const endIdx = s.endIndex ?? s.data.length
      for (let i = 0; i < Math.min(endIdx, s.data.length); i++) {
        const x = getX(xData[i])
        const y = getY(s.data[i])
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
      
      // Reset dash
      if (s.dashed) ctx.setLineDash([])
      ctx.globalAlpha = 1
      
      // Draw points if specified
      if (s.showPoints) {
        const pointRadius = s.pointRadius || 3
        ctx.fillStyle = resolveColor(s.pointColor || s.color) || theme.cyan
        for (let i = 0; i < Math.min(endIdx, s.data.length); i++) {
          const x = getX(xData[i])
          const y = getY(s.data[i])
          ctx.beginPath()
          ctx.arc(x, y, pointRadius, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    })
    
    // Draw highlight points
    if (highlight?.points) {
      highlight.points.forEach(pt => {
        const x = getX(pt.x)
        const y = getY(pt.y)
        ctx.beginPath()
        ctx.arc(x, y, pt.radius || 5, 0, Math.PI * 2)
        ctx.fillStyle = resolveColor(pt.color) || theme.amber
        ctx.fill()
        if (pt.stroke) {
          ctx.strokeStyle = resolveColor(pt.stroke)
          ctx.lineWidth = pt.strokeWidth || 2
          ctx.stroke()
        }
      })
    }
    
    // Call custom draw callback for overlays
    if (onDraw) {
      onDraw(ctx, { width, height, plotWidth, plotHeight, getX, getY, margin, xMin, xMax, yMin, yMax })
    }
  }, [series, xAxis, yAxis, margin, background, gridColor, compact, highlight, onDraw])
  
  // Initial draw, resize handling and theme-toggle redraw
  useEffect(() => {
    draw()

    const handleResize = () => draw()
    const observer = new ResizeObserver(handleResize)
    if (containerRef.current) observer.observe(containerRef.current)

    // Repaint when projector mode toggles (canvas colors are resolved at draw time)
    const themeObserver = new MutationObserver(draw)
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-projector'] })

    return () => {
      observer.disconnect()
      themeObserver.disconnect()
    }
  }, [draw])
  
  return (
    <div ref={containerRef} className={`graph-container ${className}`}>
      <canvas ref={canvasRef} />
    </div>
  )
}

// Bar chart variant
export function BarGraph({
  data = [],
  labels = [],
  colors = [],
  xAxis = {},
  yAxis = {},
  margin: customMargin,
  background = null,
  gridColor = null,
  barWidth = 0.8, // Fraction of available space
  compact = false,
  className = ''
}) {
  const canvasRef = useRef()
  const containerRef = useRef()
  
  // Left margin holds the rotated axis label plus the widest tick label at
  // CANVAS_FONT.tick; the rotated label is drawn hard against the left edge.
  const defaultMargin = compact
    ? { top: 26, right: 16, bottom: 40, left: 58 }
    : { top: 32, right: 22, bottom: 48, left: 66 }
  const margin = { ...defaultMargin, ...customMargin }
  
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container || data.length === 0) return
    
    const { width, height, dpr } = canvasMetrics(container)
    
    if (width === 0 || height === 0) return
    
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    
    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)
    
    const theme = canvasTheme()

    ctx.fillStyle = resolveColor(background) || theme.bg
    ctx.fillRect(0, 0, width, height)

    const plotWidth = width - margin.left - margin.right
    const plotHeight = height - margin.top - margin.bottom
    
    const yMin = yAxis.min ?? 0
    const yMax = yAxis.max ?? Math.max(...data) * 1.1
    const yRange = yMax - yMin || 1
    
    const getY = (val) => margin.top + plotHeight - ((val - yMin) / yRange) * plotHeight
    
    // Grid
    ctx.strokeStyle = resolveColor(gridColor) || theme.grid
    ctx.lineWidth = 1.25
    const yTicks = yAxis.ticks || generateTicks(yMin, yMax, 5)
    yTicks.forEach(tick => {
      const y = getY(tick)
      ctx.beginPath()
      ctx.moveTo(margin.left, y)
      ctx.lineTo(width - margin.right, y)
      ctx.stroke()
    })

    // Y-axis labels
    ctx.fillStyle = theme.text
    ctx.font = `bold ${CANVAS_FONT.tick}px Inter, system-ui, sans-serif`
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    yTicks.forEach(tick => {
      ctx.fillText(formatNumber(tick, yTicks), margin.left - 6, getY(tick))
    })
    
    // Bars
    const bw = plotWidth / data.length
    const actualBarWidth = bw * barWidth
    data.forEach((val, i) => {
      const x = margin.left + i * bw + (bw - actualBarWidth) / 2
      const barHeight = ((val - yMin) / yRange) * plotHeight
      const y = margin.top + plotHeight - barHeight
      
      ctx.fillStyle = resolveColor(colors[i]) || theme.pink
      ctx.fillRect(x, y, actualBarWidth, barHeight)
    })
    
    // X-axis labels
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    labels.forEach((label, i) => {
      const x = margin.left + i * bw + bw / 2
      ctx.fillText(label, x, height - margin.bottom + 6)
    })
  }, [data, labels, colors, yAxis, margin, background, gridColor, barWidth, compact])
  
  useEffect(() => {
    draw()

    const observer = new ResizeObserver(draw)
    if (containerRef.current) observer.observe(containerRef.current)

    const themeObserver = new MutationObserver(draw)
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-projector'] })

    return () => {
      observer.disconnect()
      themeObserver.disconnect()
    }
  }, [draw])

  return (
    <div ref={containerRef} className={`graph-container bar-graph ${className}`}>
      <canvas ref={canvasRef} />
    </div>
  )
}

// Helper functions
function generateTicks(min, max, count) {
  const range = max - min
  if (range === 0) return [min]
  
  const step = range / (count - 1)
  const ticks = []
  for (let i = 0; i < count; i++) {
    ticks.push(min + i * step)
  }
  return ticks
}

/* Decimal places come from the gap between ticks, not from the size of the
   value. An axis running 0 to 0.025 has every tick below 1, and a flat two
   decimals prints 0.00625 and 0.0125 as the same "0.01" twice over. */
function decimalsFor(step) {
  if (!(step > 0)) return 2
  let d = Math.max(0, -Math.floor(Math.log10(step)))
  while (d < 6 && Math.abs(Number(step.toFixed(d)) - step) > step * 0.05) d++
  return d
}

function formatNumber(val, ticks) {
  if (val === 0) return '0'
  if (Math.abs(val) >= 1000) return val.toFixed(0)
  if (Array.isArray(ticks) && ticks.length > 1) {
    return val.toFixed(decimalsFor(Math.abs(ticks[1] - ticks[0])))
  }
  if (Math.abs(val) >= 10) return val.toFixed(1)
  if (Math.abs(val) >= 1) return val.toFixed(1)
  return val.toFixed(2)
}
