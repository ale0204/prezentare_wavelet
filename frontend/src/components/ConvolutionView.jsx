import { useState, useEffect, useRef } from 'react'
import LaTeX, { LaTeXBlock } from './LaTeX'
import { canvasMetrics } from './shared/stage'
import { canvasTheme, resolveColor } from './shared/canvasTheme'
import {
  PlayIcon, PauseIcon, ResetIcon, PrevIcon, NextIcon,
  StepBackIcon, StepForwardIcon, ClockIcon
} from './shared/TransportIcons'

// Kernel generators for different sizes
const KERNEL_TYPES = {
  'moving-avg': {
    name: 'Moving Average',
    category: 'smoothing',
    scalable: true,
    generate: (size) => Array(size).fill(1 / size),
    sizes: [3, 5, 7, 9, 11]
  },
  'gaussian': {
    name: 'Gaussian',
    category: 'smoothing',
    scalable: true,
    generate: (size) => {
      const sigma = size / 4
      const kernel = []
      const half = Math.floor(size / 2)
      let sum = 0
      for (let i = 0; i < size; i++) {
        const x = i - half
        const val = Math.exp(-(x * x) / (2 * sigma * sigma))
        kernel.push(val)
        sum += val
      }
      return kernel.map(v => v / sum)
    },
    sizes: [3, 5, 7, 9, 11]
  },
  'derivative': {
    name: 'Derivată',
    category: 'edge',
    scalable: true,
    generate: (size) => {
      // Central difference derivative
      const kernel = Array(size).fill(0)
      kernel[0] = -1
      kernel[size - 1] = 1
      return kernel
    },
    sizes: [3, 5, 7, 9]
  },
  'laplacian': {
    name: 'Laplacian',
    category: 'edge',
    scalable: true,
    generate: (size) => {
      // Discrete Laplacian (second derivative)
      const kernel = Array(size).fill(0)
      const half = Math.floor(size / 2)
      kernel[half] = -2
      kernel[0] = 1
      kernel[size - 1] = 1
      return kernel
    },
    sizes: [3, 5, 7, 9]
  },
  'sharpen': {
    name: 'Sharpening',
    category: 'enhance',
    scalable: true,
    generate: (size) => {
      const kernel = Array(size).fill(0)
      const half = Math.floor(size / 2)
      const alpha = 0.5
      kernel[half] = 1 + 2 * alpha
      kernel[0] = -alpha
      kernel[size - 1] = -alpha
      return kernel
    },
    sizes: [3, 5, 7, 9]
  }
}

// Generate noisy signal
function generateNoisySignal(samples = 200, noiseLevel = 0.3) {
  const t = []
  const clean = []
  const noisy = []
  
  for (let i = 0; i < samples; i++) {
    const ti = i / samples
    t.push(ti)
    // Clean signal: smooth wave
    const cleanVal = Math.sin(2 * Math.PI * 3 * ti) + 0.5 * Math.sin(2 * Math.PI * 7 * ti)
    clean.push(cleanVal)
    // Add noise
    noisy.push(cleanVal + (Math.random() - 0.5) * 2 * noiseLevel)
  }
  
  return { t, clean, noisy }
}

// Apply 1D convolution
function convolve1D(signal, kernel) {
  const result = []
  const halfK = Math.floor(kernel.length / 2)
  
  for (let i = 0; i < signal.length; i++) {
    let sum = 0
    for (let j = 0; j < kernel.length; j++) {
      const idx = i + j - halfK
      if (idx >= 0 && idx < signal.length) {
        sum += signal[idx] * kernel[j]
      } else {
        // Edge handling: replicate border
        const clampedIdx = Math.max(0, Math.min(signal.length - 1, idx))
        sum += signal[clampedIdx] * kernel[j]
      }
    }
    result.push(sum)
  }
  
  return result
}

export default function ConvolutionView({ compact = false }) {
  const [kernelType, setKernelType] = useState('gaussian')
  const [kernelSize, setKernelSize] = useState(5)
  const [noiseLevel, setNoiseLevel] = useState(0.3)
  const [signalData, setSignalData] = useState(null)
  const [filteredSignal, setFilteredSignal] = useState(null)
  const [animStep, setAnimStep] = useState(-1)
  const [isAnimating, setIsAnimating] = useState(false)
  const [canvasSize, setCanvasSize] = useState({ width: 700, height: 280 })
  const [frameByFrame, setFrameByFrame] = useState(true) // New: frame-by-frame mode
  const [animSpeed, setAnimSpeed] = useState(100) // Animation speed in ms
  
  const canvasSignalRef = useRef()
  const canvasConvRef = useRef()
  const canvasKernelRef = useRef()
  const canvasDotProductRef = useRef() // New: for dot product visualization
  const containerRef = useRef()

  // Get current kernel
  const kernelConfig = KERNEL_TYPES[kernelType]
  const kernel = kernelConfig ? kernelConfig.generate(kernelSize) : [1]
  const kernelName = kernelConfig ? `${kernelConfig.name} (${kernelSize})` : 'Unknown'
  // Only smoothing kernels denoise and only edge kernels detect edges - a
  // sharpening kernel gets neither label when the full curve is shown.
  const kernelEffect = kernelConfig?.category === 'smoothing' ? 'Denoising'
    : kernelConfig?.category === 'edge' ? 'Detecție muchii'
    : ''

  // Ensure kernel size is valid for the type
  useEffect(() => {
    if (kernelConfig && !kernelConfig.sizes.includes(kernelSize)) {
      setKernelSize(kernelConfig.sizes[0])
    }
  }, [kernelType])

  // Generate initial signal
  useEffect(() => {
    regenerateSignal()
  }, [noiseLevel])

  // Apply convolution when kernel or signal changes
  useEffect(() => {
    if (signalData && kernel) {
      const filtered = convolve1D(signalData.noisy, kernel)
      setFilteredSignal(filtered)
    }
  }, [signalData, kernelType, kernelSize])

  // Handle canvas resize for HiDPI support
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current && canvasSignalRef.current) {
        const { width: boxW, height: boxH } = canvasMetrics(containerRef.current)
        const width = Math.floor(boxW)
        const height = Math.floor(boxH)
        if (width > 0 && height > 0) {
          setCanvasSize({ width, height })
        }
      }
    }

    // Initial size
    handleResize()

    // Observe resize
    const resizeObserver = new ResizeObserver(handleResize)
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    return () => resizeObserver.disconnect()
  }, [compact])

  // Draw effects - redraw when size changes
  useEffect(() => {
    if (signalData && filteredSignal) {
      drawSignals()
      drawKernel()
      if (animStep >= 0) {
        drawDotProduct()
      }
    }
  }, [signalData, filteredSignal, animStep, canvasSize])

  const regenerateSignal = () => {
    const data = generateNoisySignal(200, noiseLevel)
    setSignalData(data)
    setAnimStep(-1)
  }

  // Always runs: leaving frame-by-frame on used to make this button a no-op,
  // so it looked broken. Pressing it means "play it for me".
  const startAnimation = () => {
    setFrameByFrame(false)
    setAnimStep(0)
    setIsAnimating(true)
  }

  const stepForward = () => {
    if (signalData && animStep < signalData.noisy.length - 1) {
      setAnimStep(prev => Math.min(prev + 1, signalData.noisy.length - 1))
    }
  }

  const stepBackward = () => {
    if (animStep > 0) {
      setAnimStep(prev => Math.max(prev - 1, 0))
    }
  }

  const jumpForward = () => {
    if (signalData && animStep < signalData.noisy.length - 1) {
      setAnimStep(prev => Math.min(prev + 10, signalData.noisy.length - 1))
    }
  }

  const jumpBackward = () => {
    if (animStep > 0) {
      setAnimStep(prev => Math.max(prev - 10, 0))
    }
  }

  const resetAnimation = () => {
    setAnimStep(-1)
    setIsAnimating(false)
  }

  useEffect(() => {
    if (isAnimating && animStep >= 0 && !frameByFrame) {
      const timer = setTimeout(() => {
        if (animStep < signalData.noisy.length - 1) {
          setAnimStep(animStep + 2)
        } else {
          setIsAnimating(false)
        }
      }, animSpeed)
      return () => clearTimeout(timer)
    }
  }, [isAnimating, animStep, frameByFrame, animSpeed])

  // Draw dot product visualization
  const drawDotProduct = () => {
    const canvas = canvasDotProductRef.current
    if (!canvas || !signalData || animStep < 0) return
    
    const dpr = window.devicePixelRatio || 1
    // Dynamic width based on kernel size (min 340, scale with kernel length)
    const baseWidth = 340
    const width = Math.max(baseWidth, 120 + kernel.length * 45)
    const height = 150
    
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = width + 'px'
    canvas.style.height = height + 'px'
    
    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)
    
    // Transparent background for overlay
    ctx.clearRect(0, 0, width, height)
    
    const halfK = Math.floor(kernel.length / 2)
    const margin = 12
    const rowHeight = 24
    
    // Get the signal values at the current position
    const signalWindow = []
    for (let j = 0; j < kernel.length; j++) {
      const idx = animStep + j - halfK
      const clampedIdx = Math.max(0, Math.min(signalData.noisy.length - 1, idx))
      signalWindow.push(signalData.noisy[clampedIdx])
    }
    
    // Calculate the dot product step by step
    const products = kernel.map((k, i) => k * signalWindow[i])
    const sum = products.reduce((a, b) => a + b, 0)
    
    // Title
    ctx.fillStyle = canvasTheme().gold
    ctx.font = 'bold 13px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText(`Pas ${animStep}: Dot Product`, width / 2, margin + 3)
    
    // Column headers
    const colWidth = (width - 2 * margin) / (kernel.length + 2)
    const startX = margin + colWidth
    const startY = margin + 22
    
    ctx.font = '13px monospace'
    ctx.fillStyle = canvasTheme().textFaint
    ctx.textAlign = 'center'
    
    // Draw column indices
    for (let i = 0; i < kernel.length; i++) {
      ctx.fillText(`[${i}]`, startX + i * colWidth + colWidth / 2, startY)
    }
    
    // Row 1: Signal values (x)
    ctx.fillStyle = canvasTheme().cyan
    ctx.font = 'bold 13px system-ui'
    ctx.textAlign = 'right'
    ctx.fillText('x:', margin + colWidth - 3, startY + rowHeight)
    
    ctx.font = '13px monospace'
    ctx.textAlign = 'center'
    for (let i = 0; i < signalWindow.length; i++) {
      ctx.fillStyle = canvasTheme().cyan
      ctx.fillText(signalWindow[i].toFixed(2), startX + i * colWidth + colWidth / 2, startY + rowHeight)
    }
    
    // Row 2: Kernel values (h)
    ctx.fillStyle = canvasTheme().orange
    ctx.font = 'bold 13px system-ui'
    ctx.textAlign = 'right'
    ctx.fillText('h:', margin + colWidth - 3, startY + rowHeight * 2)
    
    ctx.font = '13px monospace'
    ctx.textAlign = 'center'
    for (let i = 0; i < kernel.length; i++) {
      ctx.fillStyle = resolveColor(kernel[i] >= 0 ? canvasTheme().green : canvasTheme().pink)
      ctx.fillText(kernel[i].toFixed(3), startX + i * colWidth + colWidth / 2, startY + rowHeight * 2)
    }
    
    // Row 3: Multiplication line
    ctx.strokeStyle = canvasTheme().border
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(startX, startY + rowHeight * 2 + 6)
    ctx.lineTo(startX + kernel.length * colWidth, startY + rowHeight * 2 + 6)
    ctx.stroke()
    
    // Row 4: Products (x * h)
    ctx.fillStyle = canvasTheme().purple
    ctx.font = 'bold 13px system-ui'
    ctx.textAlign = 'right'
    ctx.fillText('x·h:', margin + colWidth - 3, startY + rowHeight * 3)
    
    ctx.font = '13px monospace'
    ctx.textAlign = 'center'
    for (let i = 0; i < products.length; i++) {
      ctx.fillStyle = resolveColor(products[i] >= 0 ? canvasTheme().purple : canvasTheme().pink)
      ctx.fillText(products[i].toFixed(3), startX + i * colWidth + colWidth / 2, startY + rowHeight * 3)
    }
    
    // Sum line
    ctx.strokeStyle = canvasTheme().gold
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(startX, startY + rowHeight * 3 + 8)
    ctx.lineTo(startX + kernel.length * colWidth, startY + rowHeight * 3 + 8)
    ctx.stroke()
    
    // Final result
    ctx.fillStyle = canvasTheme().gold
    ctx.font = 'bold 13px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText(`Sumă = ${sum.toFixed(4)}`, width / 2, startY + rowHeight * 4 + 2)
  }

  const drawSignals = () => {
    const canvas = canvasSignalRef.current
    if (!canvas || !signalData || !filteredSignal) return
    
    // HiDPI support
    const { width, height, dpr } = canvasMetrics(canvas)
    
    if (width === 0 || height === 0) return
    
    // Set actual canvas size scaled by DPR
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = width + 'px'
    canvas.style.height = height + 'px'

    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)

    // Use CSS dimensions for drawing (not scaled canvas dimensions)
    const margin = compact ? 30 : 50
    const marginBottom = margin  // Same as top margin now that overlay is in controls area
    
    ctx.fillStyle = canvasTheme().bg
    ctx.fillRect(0, 0, width, height)
    
    const { t, clean, noisy } = signalData
    
    // Find range
    const all = [...noisy, ...filteredSignal]
    const min = Math.min(...all) - 0.2
    const max = Math.max(...all) + 0.2
    const range = max - min || 1
    
    // Grid
    ctx.strokeStyle = canvasTheme().grid
    ctx.lineWidth = 1
    for (let i = 0; i <= 4; i++) {
      const y = margin + (i * (height - margin - marginBottom)) / 4
      ctx.beginPath()
      ctx.moveTo(margin, y)
      ctx.lineTo(width - margin, y)
      ctx.stroke()
    }
    
    // Helper to get x position for a sample index
    const getX = (idx) => margin + (t[idx] / t[t.length - 1]) * (width - 2 * margin)
    const getY = (val) => height - marginBottom - ((val - min) / range) * (height - margin - marginBottom)
    
    // Helper to draw a signal
    const drawLine = (data, color, lineWidth, endIdx = data.length) => {
      ctx.strokeStyle = resolveColor(color)
      ctx.lineWidth = lineWidth
      ctx.beginPath()
      for (let i = 0; i < Math.min(endIdx, data.length); i++) {
        const x = getX(i)
        const y = getY(data[i])
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
    
    // Draw noisy signal - textFaint reads too weak at projector distance
    drawLine(noisy, canvasTheme().text, 1.5)
    
    // Draw clean reference (dotted)
    ctx.setLineDash([4, 4])
    drawLine(clean, canvasTheme().cyan, 1)
    ctx.setLineDash([])
    
    // Draw filtered signal (animated or full)
    const endIdx = animStep >= 0 ? animStep : filteredSignal.length
    drawLine(filteredSignal, canvasTheme().green, 2.5, endIdx)
    
    // Enhanced sliding window visualization during animation
    if (animStep >= 0 && animStep < filteredSignal.length) {
      const halfK = Math.floor(kernel.length / 2)
      const windowStart = Math.max(0, animStep - halfK)
      const windowEnd = Math.min(noisy.length - 1, animStep + halfK)
      
      // Draw kernel window highlight box
      const x1 = getX(windowStart)
      const x2 = getX(windowEnd)
      ctx.fillStyle = 'rgba(255, 170, 0, 0.15)'
      ctx.fillRect(x1, margin, x2 - x1, height - margin - marginBottom)
      
      // Draw vertical lines at window boundaries
      ctx.strokeStyle = 'rgba(255, 170, 0, 0.6)'
      ctx.lineWidth = 1
      ctx.setLineDash([3, 3])
      ctx.beginPath()
      ctx.moveTo(x1, margin)
      ctx.lineTo(x1, height - marginBottom)
      ctx.moveTo(x2, margin)
      ctx.lineTo(x2, height - marginBottom)
      ctx.stroke()
      ctx.setLineDash([])
      
      // Highlight the samples being convolved
      for (let i = windowStart; i <= windowEnd; i++) {
        const x = getX(i)
        const y = getY(noisy[i])
        const kIdx = i - animStep + halfK
        const kVal = kernel[kIdx] || 0
        
        // Draw point with size based on kernel weight
        const radius = 3 + Math.abs(kVal) * 8
        ctx.beginPath()
        ctx.arc(x, y, radius, 0, Math.PI * 2)
        ctx.fillStyle = resolveColor(kVal >= 0 ? 'rgba(0, 255, 136, 0.7)' : 'rgba(255, 107, 157, 0.7)')
        ctx.fill()
        ctx.strokeStyle = canvasTheme().textStrong
        ctx.lineWidth = 1
        ctx.stroke()
      }
      
      // Draw the current output point
      const outputX = getX(animStep)
      const outputY = getY(filteredSignal[animStep])
      ctx.beginPath()
      ctx.arc(outputX, outputY, 6, 0, Math.PI * 2)
      ctx.fillStyle = canvasTheme().green
      ctx.fill()
      ctx.strokeStyle = canvasTheme().textStrong
      ctx.lineWidth = 2
      ctx.stroke()
    }
    
    // Title and legend are now rendered as HTML overlays
  }

  const drawKernel = () => {
    const canvas = canvasKernelRef.current
    if (!canvas) return
    
    // HiDPI support
    const { width, height, dpr } = canvasMetrics(canvas)
    
    if (width === 0 || height === 0) return
    
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = width + 'px'
    canvas.style.height = height + 'px'

    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)

    ctx.fillStyle = canvasTheme().bg
    ctx.fillRect(0, 0, width, height)

    const barWidth = Math.min(30, (width - 40) / kernel.length)
    const startX = (width - kernel.length * barWidth) / 2
    
    // Draw bars
    const maxK = Math.max(...kernel.map(Math.abs)) || 1
    
    const midY = height / 2

    kernel.forEach((k, i) => {
      const barHeight = (k / maxK) * (height / 2 - 15)
      const x = startX + i * barWidth

      ctx.fillStyle = resolveColor(k >= 0 ? canvasTheme().green : canvasTheme().pink)
      if (k >= 0) {
        ctx.fillRect(x + 2, midY - barHeight, barWidth - 4, barHeight)
      } else {
        ctx.fillRect(x + 2, midY, barWidth - 4, -barHeight)
      }
    })

    // Value labels: a run of consecutive equal taps (e.g. the zero taps in a
    // derivative kernel) gets ONE centered label - one per bar would overlap
    // into a glued "0.00.00.00.00" when bars are this narrow.
    if (barWidth > 20) {
      ctx.fillStyle = canvasTheme().textStrong
      ctx.font = '13px monospace'
      ctx.textAlign = 'center'

      // A label is wider than its own bar, so neighbours with distinct values
      // (a Gaussian, say) collide side by side. Each one that would touch the
      // previous is lifted to a second row instead.
      const rowRightEdge = [-Infinity, -Infinity]
      let runStart = 0
      while (runStart < kernel.length) {
        let runEnd = runStart
        while (runEnd + 1 < kernel.length && kernel[runEnd + 1].toFixed(2) === kernel[runStart].toFixed(2)) {
          runEnd++
        }
        const kVal = kernel[runStart]
        const barHeight = (kVal / maxK) * (height / 2 - 15)
        const runCenterX = startX + ((runStart + runEnd + 1) / 2) * barWidth
        const label = kVal.toFixed(2)
        const halfWidth = ctx.measureText(label).width / 2

        const row = runCenterX - halfWidth < rowRightEdge[0] + 4 ? 1 : 0
        const baseY = kVal >= 0 ? midY - barHeight - 3 : midY - barHeight + 10
        const lifted = baseY + (row === 1 ? (kVal >= 0 ? -15 : 15) : 0)
        ctx.fillText(label, runCenterX, Math.min(height - 4, Math.max(12, lifted)))
        rowRightEdge[row] = runCenterX + halfWidth
        runStart = runEnd + 1
      }
    }
    
    // Center line
    ctx.strokeStyle = canvasTheme().textFaint
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(20, height / 2)
    ctx.lineTo(width - 20, height / 2)
    ctx.stroke()
    
    ctx.textAlign = 'left'
  }

  // Compact mode for tour embed
  if (compact) {
    return (
      <div className="convolution-view compact-mode">
        <div className="compact-conv-layout">
          {/* Left: Controls + Kernel + Dot Product */}
          <div className="compact-conv-sidebar">
            <div className="compact-section">
              <h4>Parametri</h4>
              <div className="compact-control">
                <label>Tip kernel:</label>
                <select value={kernelType} onChange={e => setKernelType(e.target.value)}>
                  <option value="moving-avg">Moving Average</option>
                  <option value="gaussian">Gaussian</option>
                  <option value="derivative">Derivată</option>
                  <option value="laplacian">Laplacian</option>
                  <option value="sharpen">Sharpening</option>
                </select>
              </div>
              <div className="compact-control">
                <label>Dimensiune: {kernelSize}</label>
                <input
                  type="range"
                  min={kernelConfig?.sizes[0] || 3}
                  max={kernelConfig?.sizes[kernelConfig.sizes.length - 1] || 11}
                  step="2"
                  value={kernelSize}
                  onChange={e => setKernelSize(parseInt(e.target.value))}
                />
              </div>
              <div className="compact-control">
                <label>Zgomot: {noiseLevel.toFixed(2)}</label>
                <input
                  type="range"
                  min="0"
                  max="0.8"
                  step="0.05"
                  value={noiseLevel}
                  onChange={e => setNoiseLevel(parseFloat(e.target.value))}
                />
              </div>
              <button onClick={regenerateSignal} className="compact-btn" style={{width: '100%', marginTop: '0.3rem'}}>
                Semnal Nou
              </button>
            </div>
            
            <div className="compact-section">
              <h4>{kernelName}</h4>
              <div className="compact-kernel-wrapper">
                <canvas ref={canvasKernelRef} className="compact-kernel-canvas" />
              </div>
              <div className="kernel-formula-mini">
                {kernelType === 'moving-avg' && <LaTeX math={String.raw`h[k] = \frac{1}{N}`} />}
                {kernelType === 'gaussian' && <LaTeX math={String.raw`h[k] \propto e^{-k^2/2\sigma^2}`} />}
                {kernelType === 'derivative' && <LaTeX math={String.raw`h = [-1, 0, ..., 0, 1]`} />}
                {kernelType === 'laplacian' && <LaTeX math={String.raw`h = [1, 0, ..., -2, ..., 0, 1]`} />}
                {kernelType === 'sharpen' && <LaTeX math={String.raw`h = [-\alpha, ..., 1+2\alpha, ..., -\alpha]`} />}
              </div>
            </div>
            
          </div>
          
          {/* Right: Result plot + Frame controls */}
          <div className="compact-conv-result" ref={containerRef}>
            <div className="plot-container-with-overlay">
              <canvas ref={canvasSignalRef} className="compact-result-canvas" />
              
              {/* HTML overlay for title */}
              <div className="plot-title-overlay">
                {kernelName} {animStep >= 0
                  ? `- Pas ${animStep}/${signalData?.noisy.length || 0}`
                  : (kernelEffect ? `- ${kernelEffect}` : '')}
              </div>
              {/* HTML overlay for legend */}
              <div className="plot-legend-overlay">
                <div className="legend-entry">
                  <span className="legend-line gray"></span>
                  <span>Cu zgomot</span>
                </div>
                <div className="legend-entry">
                  <span className="legend-line cyan"></span>
                  <span>Original</span>
                </div>
                <div className="legend-entry">
                  <span className="legend-line green"></span>
                  <span>Filtrat</span>
                </div>
                {animStep >= 0 && (
                  <div className="legend-entry">
                    <span className="legend-line orange"></span>
                    <span>Kernel</span>
                  </div>
                )}
              </div>
            </div>
            
            {/* Frame-by-frame controls with integrated dot product */}
            <div className="frame-controls-integrated">
              {/* Left side: playback controls */}
              <div className="frame-controls-left">
                <div className="frame-controls-row">
                  <button
                    onClick={resetAnimation}
                    className="frame-btn reset"
                    aria-label="Reset"
                    aria-label="Resetează animația"
                  >
                    <ResetIcon size={18} />
                  </button>
                  <button
                    onClick={jumpBackward}
                    className="frame-btn"
                    disabled={animStep <= 0}
                    aria-label="Înapoi 10 pași"
                    aria-label="Înapoi 10 pași"
                  >
                    <PrevIcon size={18} />
                  </button>
                  <button
                    onClick={stepBackward}
                    className="frame-btn"
                    disabled={animStep <= 0}
                    aria-label="Înapoi 1 pas"
                    aria-label="Înapoi 1 pas"
                  >
                    <StepBackIcon size={18} />
                  </button>
                  <button
                    onClick={() => {
                      if (animStep < 0) {
                        setAnimStep(0)
                        setIsAnimating(true)
                      } else if (frameByFrame) {
                        setFrameByFrame(false)
                        setIsAnimating(true)
                      } else {
                        setIsAnimating(!isAnimating)
                      }
                    }}
                    className={`frame-btn play ${isAnimating ? 'active' : ''}`}
                    title={isAnimating ? 'Pauză' : 'Play'}
                    aria-label={isAnimating ? 'Pauză' : 'Pornește animația'}
                  >
                    {isAnimating ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
                  </button>
                  <button
                    onClick={stepForward}
                    className="frame-btn"
                    disabled={!signalData || animStep >= signalData.noisy.length - 1}
                    aria-label="Înainte 1 pas"
                    aria-label="Înainte 1 pas"
                  >
                    <StepForwardIcon size={18} />
                  </button>
                  <button
                    onClick={jumpForward}
                    className="frame-btn"
                    disabled={!signalData || animStep >= signalData.noisy.length - 1}
                    aria-label="Înainte 10 pași"
                    aria-label="Înainte 10 pași"
                  >
                    <NextIcon size={18} />
                  </button>
                </div>
                
                {/* Position slider */}
                {signalData && (
                  <div className="position-slider">
                    <input
                      type="range"
                      min="0"
                      max={signalData.noisy.length - 1}
                      value={Math.max(0, animStep)}
                      onChange={(e) => {
                        setIsAnimating(false)
                        setAnimStep(parseInt(e.target.value))
                      }}
                      style={{width: '100%'}}
                    />
                  </div>
                )}
                
                <div className="frame-options">
                  <label className="frame-option">
                    <input 
                      type="checkbox" 
                      checked={frameByFrame}
                      onChange={(e) => {
                        setFrameByFrame(e.target.checked)
                        if (e.target.checked) setIsAnimating(false)
                      }}
                    />
                    <span>Pas cu pas</span>
                  </label>
                  <div className="speed-control">
                    <span>Viteză:</span>
                    <input
                    type="range"
                    min="20"
                    max="200"
                    value={200 - animSpeed}
                    onChange={(e) => setAnimSpeed(200 - parseInt(e.target.value))}
                    style={{width: '60px'}}
                    disabled={frameByFrame}
                  />
                  </div>
                </div>
              </div>
              
              {/* Right side: Dot Product Visualization */}
              {animStep >= 0 && (
                <div className="dot-product-inline">
                  <canvas ref={canvasDotProductRef} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Full mode
  return (
    <div className="convolution-view">
      <div className="panel">
        <h2>Convoluție 1D</h2>
        
        <div className="info-box">
          <p>
            <strong>Convoluția</strong> este operația fundamentală în procesarea semnalelor.
            Un <em>kernel</em> glisează peste semnal, calculând o sumă ponderată la fiecare poziție.
          </p>
        </div>

        <div className="math-block">
          <LaTeXBlock math={String.raw`(f * g)[n] = \sum_{k=-\infty}^{\infty} f[k] \cdot g[n-k]`} />
        </div>
      </div>

      <div className="panel">
        <h3>Parametri</h3>
        
        <div className="controls" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
          <div className="control-group">
            <label>Tip Kernel</label>
            <select value={kernelType} onChange={e => setKernelType(e.target.value)}>
              {Object.entries(KERNEL_TYPES).map(([id, info]) => (
                <option key={id} value={id}>{info.name}</option>
              ))}
            </select>
          </div>
          
          {KERNEL_TYPES[kernelType]?.scalable && (
            <div className="control-group">
              <label>Dimensiune: {kernelSize}</label>
              <input
                type="range"
                min="3"
                max="15"
                step="2"
                value={kernelSize}
                onChange={e => setKernelSize(parseInt(e.target.value))}
              />
            </div>
          )}
          
          <div className="control-group">
            <label>Zgomot: {noiseLevel.toFixed(2)}</label>
            <input
              type="range"
              min="0"
              max="0.8"
              step="0.05"
              value={noiseLevel}
              onChange={e => setNoiseLevel(parseFloat(e.target.value))}
            />
          </div>
          
          <button onClick={regenerateSignal}>Regenerează</button>
          
          <button onClick={startAnimation} disabled={isAnimating} className="primary">
            {isAnimating ? <ClockIcon size={16} /> : <PlayIcon size={16} />}
            {isAnimating ? ' Animație...' : ' Animație'}
          </button>
        </div>
      </div>

      <div className="panel" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '0 0 200px' }}>
          <h3>{KERNEL_TYPES[kernelType]?.name} ({kernelSize})</h3>
          <canvas ref={canvasKernelRef} style={{ display: 'block', background: 'var(--graph-background)', borderRadius: '8px', width: '100%', aspectRatio: '200 / 90' }} />
        </div>
        
        <div style={{ flex: '1', minWidth: '250px' }}>
          <div className="math-block" style={{ padding: '0.5rem' }}>
            {kernelType === 'moving-avg' && (
              <><strong>Moving Average:</strong> <LaTeX math={String.raw`h[k] = \frac{1}{N}`} /> - media vecinilor</>
            )}
            {kernelType === 'gaussian' && (
              <><strong>Gaussian:</strong> <LaTeX math={String.raw`h[k] \propto e^{-k^2/2\sigma^2}`} /> - greutăți centrate</>
            )}
            {kernelType === 'derivative' && (
              <><strong>Derivată:</strong> <LaTeX math={String.raw`h = [-1, 0, 1]`} /> - detectează schimbări</>
            )}
            {kernelType === 'laplacian' && (
              <><strong>Laplacian:</strong> <LaTeX math={String.raw`h = [1, -2, 1]`} /> - a doua derivată</>
            )}
            {kernelType === 'sharpen' && (
              <><strong>Sharpening:</strong> <LaTeX math={String.raw`h = [-\alpha, 1+2\alpha, -\alpha]`} /> - amplifică detalii</>
            )}
          </div>
        </div>
      </div>

      <div className="panel" style={{ flex: '1', minHeight: '180px' }}>
        <h3>Rezultat</h3>
        <div className="plot-container" style={{ height: '180px' }}>
          <canvas ref={canvasSignalRef} style={{ width: '100%', height: '100%' }} />
        </div>
        
        {(kernelType === 'moving-avg' || kernelType === 'gaussian') && (
          <div className="info-box success" style={{ margin: '0.5rem 0 0 0' }}>
            <strong>Observație:</strong> Semnalul filtrat (verde) este mai neted. Kernel-uri mai mari = mai multă netezire.
          </div>
        )}
        {(kernelType === 'derivative' || kernelType === 'laplacian') && (
          <div className="info-box warning" style={{ margin: '0.5rem 0 0 0' }}>
            <strong>Observație:</strong> Derivata evidențiază schimbările rapide, dar amplifică și zgomotul.
          </div>
        )}
        {kernelType === 'sharpen' && (
          <div className="info-box" style={{ margin: '0.5rem 0 0 0' }}>
            <strong>Observație:</strong> Sharpening amplifică detaliile, dar poate introduce artefacte.
          </div>
        )}
      </div>
    </div>
  )
}
