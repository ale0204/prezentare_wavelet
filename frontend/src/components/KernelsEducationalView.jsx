import { useState, useEffect, useCallback, useRef } from 'react'
import axios from 'axios'
import './KernelsEducational.css'
import { PlayIcon, PauseIcon, StepBackIcon, StepForwardIcon, NextIcon, ResetIcon, ClockIcon } from './shared/TransportIcons'

// Base 3x3 kernel definitions - will be resized dynamically
const BASE_KERNELS = {
  blur_box: {
    name: 'Box Blur',
    description: 'Media tuturor vecinilor - netezire uniformă'
  },
  blur_gaussian: {
    name: 'Gaussian Blur', 
    description: 'Pondere mai mare pentru centru - netezire naturală'
  },
  edge_sobel_x: {
    name: 'Sobel X',
    description: 'Detectează muchii verticale (gradienți orizontali)'
  },
  edge_sobel_y: {
    name: 'Sobel Y',
    description: 'Detectează muchii orizontale (gradienți verticali)'
  },
  sharpen: {
    name: 'Sharpen',
    description: 'Amplifică diferențele - imagine mai clară'
  },
  edge_laplacian: {
    name: 'Laplacian',
    description: 'Detectează toate muchiile în toate direcțiile'
  },
  identity: {
    name: 'Identity',
    description: 'Nu modifică imaginea - referință'
  }
}

// Binomial row of the given order: [C(n,0), ..., C(n,n)]. The separable
// binomial kernel IS the standard discrete Gaussian of image processing,
// so this reproduces the textbook 1-2-1 / 1-4-6-4-1 matrices used by
// KernelsView - the two demos must never show different matrices under
// the same kernel name.
function binomialRow(order) {
  const row = [1]
  for (let k = 0; k < order; k++) {
    row.push(row[k] * (order - k) / (k + 1))
  }
  return row.map(v => Math.round(v))
}

// Central-difference row: binomial(size-2) convolved with [-1, 1].
// Combined with binomial smoothing it gives the textbook Sobel operator
// ([-1,0,1] x [1,2,1] at size 3).
function differenceRow(size) {
  const smooth = binomialRow(size - 2)
  const row = Array(size).fill(0)
  for (let i = 0; i < smooth.length; i++) {
    row[i] -= smooth[i]
    row[i + 1] += smooth[i]
  }
  return row
}

// Outer product of a column vector and a row vector
function outerProduct(col, row) {
  return col.map(c => row.map(r => c * r))
}

// Generate kernel matrix for given size
function generateKernel(kernelId, size) {
  const center = Math.floor(size / 2)

  switch (kernelId) {
    case 'blur_box': {
      const matrix = Array(size).fill(null).map(() => Array(size).fill(1))
      return { matrix, scale: size * size }
    }

    case 'blur_gaussian': {
      const smooth = binomialRow(size - 1)
      const matrix = outerProduct(smooth, smooth)
      const sum = matrix.flat().reduce((a, b) => a + b, 0)
      return { matrix, scale: sum }
    }

    case 'edge_sobel_x': {
      return { matrix: outerProduct(binomialRow(size - 1), differenceRow(size)), scale: 1 }
    }

    case 'edge_sobel_y': {
      return { matrix: outerProduct(differenceRow(size), binomialRow(size - 1)), scale: 1 }
    }
    
    case 'sharpen': {
      const matrix = Array(size).fill(null).map(() => Array(size).fill(0))
      // Cross pattern negative
      for (let i = 0; i < size; i++) {
        matrix[center][i] = -1
        matrix[i][center] = -1
      }
      matrix[center][center] = size * 2 - 1
      return { matrix, scale: 1 }
    }
    
    case 'edge_laplacian': {
      const matrix = Array(size).fill(null).map(() => Array(size).fill(0))
      // Cross pattern
      for (let i = 0; i < size; i++) {
        matrix[center][i] = -1
        matrix[i][center] = -1
      }
      matrix[center][center] = (size - 1) * 2
      return { matrix, scale: 1 }
    }
    
    case 'identity':
    default: {
      const matrix = Array(size).fill(null).map(() => Array(size).fill(0))
      matrix[center][center] = 1
      return { matrix, scale: 1 }
    }
  }
}

// What the kernel reads when it hangs over the edge of the image. Zero padding
// darkens the border, replication and symmetric extension do not - the classic
// question about a convolution demo, and the reason JPEG2000 uses symmetric
// extension so a tile edge does not generate spurious detail coefficients.
const BOUNDARY_MODES = [
  { id: 'zero', label: 'Zero', desc: 'Zero padding: pixelii din afara imaginii valorează 0, deci marginea se închide la culoare.' },
  { id: 'replicate', label: 'Replicare', desc: 'Se repetă pixelul de margine (clamp), deci marginea își păstrează intensitatea.' },
  { id: 'symmetric', label: 'Simetrică', desc: 'Imaginea se oglindește peste margine. Alegerea din JPEG2000: nu inventează muchii false.' }
]

// Rectangle (in grid percent) covering the active kernel window, split into
// the part that reads real pixels ("inner", always within the 0-100 grid) and
// the part that reads padding ("outer"), capped to a small bleed so it never
// risks being clipped by the slide frame.
function kernelWindowRects(pos, halfKernel, gridSize) {
  const cellPercent = 100 / gridSize
  const span = (halfKernel * 2 + 1) * cellPercent
  const left = (pos.col - halfKernel) * cellPercent
  const top = (pos.row - halfKernel) * cellPercent
  const right = left + span
  const bottom = top + span

  // Capped at half a cell regardless of kernel size: enough to read as a
  // dashed stub poking past the edge, small enough that it never bleeds past
  // the slide's own margins (the wrapper's ancestor clips overflow).
  const bleed = cellPercent / 2
  const outer = {
    left: Math.max(left, -bleed),
    top: Math.max(top, -bleed),
    right: Math.min(right, 100 + bleed),
    bottom: Math.min(bottom, 100 + bleed)
  }
  const inner = {
    left: Math.max(left, 0),
    top: Math.max(top, 0),
    right: Math.min(right, 100),
    bottom: Math.min(bottom, 100)
  }
  const readsPadding = outer.left !== inner.left || outer.top !== inner.top ||
    outer.right !== inner.right || outer.bottom !== inner.bottom

  return { outer, inner, readsPadding }
}

// CSS percent rectangle -> inline style for an absolutely positioned overlay.
function rectToStyle(r) {
  return { left: `${r.left}%`, top: `${r.top}%`, width: `${r.right - r.left}%`, height: `${r.bottom - r.top}%` }
}

// One sample under the kernel, resolved through the chosen boundary rule.
// Returns null only for zero padding, where the sample contributes nothing.
function borderSample(pixels, i, j, size, mode) {
  const inside = i >= 0 && i < size && j >= 0 && j < size
  if (inside) return pixels[i][j]
  if (mode === 'zero') return null

  const fold = (v) => {
    if (v < 0) return mode === 'replicate' ? 0 : Math.min(size - 1, -v - 1)
    if (v >= size) return mode === 'replicate' ? size - 1 : Math.max(0, 2 * size - v - 1)
    return v
  }
  return pixels[fold(i)][fold(j)]
}

export default function KernelsEducationalView({ api, compact = false }) {
  // State
  const [sprites, setSprites] = useState([])
  const [selectedSprite, setSelectedSprite] = useState(null)
  const [pixelData, setPixelData] = useState(null)
  const [selectedKernel, setSelectedKernel] = useState('blur_gaussian')
  const [kernelSize, setKernelSize] = useState(3) // 3 to 6
  const [animationPos, setAnimationPos] = useState({ row: 0, col: 0 })
  const [isAnimating, setIsAnimating] = useState(false)
  const [animationSpeed, setAnimationSpeed] = useState(300) // ms per step
  const [outputPixels, setOutputPixels] = useState(null)
  const [hoveredPixel, setHoveredPixel] = useState(null)
  const [boundary, setBoundary] = useState('zero')
  const animationRef = useRef(null)
  
  // Track history for going back
  const [history, setHistory] = useState([])
  
  // Generate current kernel based on size
  const kernel = {
    ...BASE_KERNELS[selectedKernel],
    ...generateKernel(selectedKernel, kernelSize)
  }
  const halfKernel = Math.floor(kernelSize / 2)
  
  // Load sprite list on mount
  useEffect(() => {
    const loadSprites = async () => {
      try {
        const response = await axios.get(`${api}/sprite-images`)
        setSprites(response.data.images)
        // Default to 16x16 smiley
        const defaultSprite = response.data.images.find(s => s.id === 'smiley_16') 
          || response.data.images[0]
        if (defaultSprite) {
          setSelectedSprite(defaultSprite.id)
        }
      } catch (err) {
        console.error('Failed to load sprites:', err)
      }
    }
    loadSprites()
  }, [api])
  
  // Load pixel data when sprite changes
  useEffect(() => {
    if (!selectedSprite) return
    
    const loadPixels = async () => {
      try {
        const response = await axios.get(`${api}/sprite-images/${selectedSprite}/pixels`)
        setPixelData(response.data)
        // Start empty, not black: null marks "not computed yet" and renders as
        // an empty cell, so nobody reads the initial state as a black image
        const size = response.data.size
        setOutputPixels(Array(size).fill(null).map(() => Array(size).fill(null)))
        // Reset animation
        setAnimationPos({ row: 0, col: 0 })
      } catch (err) {
        console.error('Failed to load pixel data:', err)
      }
    }
    loadPixels()
  }, [selectedSprite, api])
  
  // Apply kernel at current position (for step-by-step)
  const applyKernelAtPosition = useCallback((pixels, row, col, kernelMatrix, scale, kernelId) => {
    if (!pixels) return [0, 0, 0]

    const imgSize = pixels.length
    const kSize = kernelMatrix.length
    const half = Math.floor(kSize / 2)
    let r = 0, g = 0, b = 0

    for (let ki = 0; ki < kSize; ki++) {
      for (let kj = 0; kj < kSize; kj++) {
        const pi = row + ki - half
        const pj = col + kj - half
        const src = borderSample(pixels, pi, pj, imgSize, boundary)

        if (src) {
          const weight = kernelMatrix[ki][kj]
          r += src[0] * weight
          g += src[1] * weight
          b += src[2] * weight
        }
      }
    }

    // Normalize and clamp
    if (scale > 1) {
      r /= scale
      g /= scale
      b /= scale
    }
    
    // For edge detection kernels that can go negative
    if (scale === 1 && (kernelId.includes('sobel') || kernelId.includes('laplacian'))) {
      // Map to 0-255 range
      r = Math.abs(r)
      g = Math.abs(g)
      b = Math.abs(b)
    }
    
    return [
      Math.max(0, Math.min(255, Math.round(r))),
      Math.max(0, Math.min(255, Math.round(g))),
      Math.max(0, Math.min(255, Math.round(b)))
    ]
  }, [boundary])
  
  // Step animation forward
  const stepAnimation = useCallback(() => {
    if (!pixelData || !outputPixels) return false
    
    const size = pixelData.size
    const { row, col } = animationPos
    
    // Check if already at the end
    if (row >= size) {
      setIsAnimating(false)
      return false
    }
    
    // Save current state to history before modifying
    setHistory(prev => [...prev, { pos: { row, col }, output: outputPixels.map(r => r.map(c => c ? [...c] : null)) }])
    
    // Apply kernel at current position
    const newOutput = outputPixels.map(r => r.map(c => c ? [...c] : null))
    const result = applyKernelAtPosition(pixelData.pixels, row, col, kernel.matrix, kernel.scale, selectedKernel)
    newOutput[row][col] = result
    setOutputPixels(newOutput)
    
    // Move to next position
    let nextCol = col + 1
    let nextRow = row
    if (nextCol >= size) {
      nextCol = 0
      nextRow = row + 1
    }
    
    if (nextRow >= size) {
      // Animation complete
      setAnimationPos({ row: size, col: 0 })
      setIsAnimating(false)
      return false
    }
    
    setAnimationPos({ row: nextRow, col: nextCol })
    return true
  }, [pixelData, animationPos, outputPixels, kernel.matrix, kernel.scale, selectedKernel, applyKernelAtPosition])
  
  // Step animation backward
  const stepBack = useCallback(() => {
    if (history.length === 0) return
    
    const lastState = history[history.length - 1]
    setHistory(prev => prev.slice(0, -1))
    setAnimationPos(lastState.pos)
    setOutputPixels(lastState.output)
    setIsAnimating(false)
  }, [history])
  
  // Auto animation loop
  useEffect(() => {
    if (!isAnimating) {
      if (animationRef.current) {
        clearInterval(animationRef.current)
        animationRef.current = null
      }
      return
    }
    
    animationRef.current = setInterval(() => {
      const shouldContinue = stepAnimation()
      if (!shouldContinue) {
        clearInterval(animationRef.current)
        animationRef.current = null
      }
    }, animationSpeed)
    
    return () => {
      if (animationRef.current) {
        clearInterval(animationRef.current)
      }
    }
  }, [isAnimating, animationSpeed, stepAnimation])
  
  // Reset animation - clears output to empty state
  const resetAnimation = useCallback(() => {
    setIsAnimating(false)
    setAnimationPos({ row: 0, col: 0 })
    setHistory([])
    if (pixelData) {
      const size = pixelData.size
      // Set to null to show empty pattern instead of black
      setOutputPixels(Array(size).fill(null).map(() => 
        Array(size).fill(null)
      ))
    }
  }, [pixelData])
  
  // Start/pause animation
  const toggleAnimation = useCallback(() => {
    if (isAnimating) {
      // If running, just pause
      setIsAnimating(false)
    } else {
      // If at end, reset first
      if (pixelData && animationPos.row >= pixelData.size) {
        resetAnimation()
        // Small delay to let reset take effect
        setTimeout(() => setIsAnimating(true), 50)
      } else {
        setIsAnimating(true)
      }
    }
  }, [isAnimating, pixelData, animationPos.row, resetAnimation])

  // Apply kernel to entire image instantly
  const applyFullKernel = useCallback(() => {
    if (!pixelData) return
    
    const size = pixelData.size
    const newOutput = []
    
    for (let i = 0; i < size; i++) {
      const row = []
      for (let j = 0; j < size; j++) {
        row.push(applyKernelAtPosition(pixelData.pixels, i, j, kernel.matrix, kernel.scale, selectedKernel))
      }
      newOutput.push(row)
    }
    
    setOutputPixels(newOutput)
    setAnimationPos({ row: size, col: 0 })
    setIsAnimating(false)
    setHistory([])
  }, [pixelData, kernel.matrix, kernel.scale, selectedKernel, applyKernelAtPosition])
  
  // Render pixel grid - responsive to fill wrapper
  const renderPixelGrid = (pixels, isInput = true, highlightPos = null) => {
    if (!pixels) return null

    const size = pixels.length
    // One overlay rectangle for the whole active window, instead of a border
    // on every cell inside it - adjacent 1px cell borders would otherwise
    // overlap and cancel each other out visually.
    const windowRects = highlightPos ? kernelWindowRects(highlightPos, halfKernel, size) : null

    return (
      <div
        className="pixel-grid"
        style={{
          gridTemplateColumns: `repeat(${size}, 1fr)`,
          gridTemplateRows: `repeat(${size}, 1fr)`,
          width: '100%',
          height: '100%'
        }}
      >
        {pixels.map((row, i) =>
          row.map((pixel, j) => {
            const isCenter = highlightPos && i === highlightPos.row && j === highlightPos.col

            // Handle null pixels (empty state)
            const isEmpty = pixel === null
            const rgb = isEmpty ? 'transparent' : `rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`
            const title = isEmpty
              ? `[${i},${j}] (empty)`
              : `[${i},${j}] RGB(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`

            return (
              <div
                key={`${i}-${j}`}
                className={`pixel-cell ${isCenter ? 'center' : ''} ${isEmpty ? 'empty' : ''}`}
                style={{ backgroundColor: rgb }}
                onMouseEnter={() => !isEmpty && setHoveredPixel({ row: i, col: j, rgb: pixel })}
                onMouseLeave={() => setHoveredPixel(null)}
                title={title}
              />
            )
          })
        )}
        {windowRects?.readsPadding && (
          <div className="kernel-window-overlay dashed" style={rectToStyle(windowRects.outer)} />
        )}
        {windowRects && (
          <div className="kernel-window-overlay solid" style={rectToStyle(windowRects.inner)} />
        )}
      </div>
    )
  }
  
  // Calculation info with region pixels
  const renderCalcInfo = () => {
    if (!pixelData || !kernel) return null
    
    const { row, col } = animationPos
    const imgSize = pixelData.size
    const kSize = kernelSize
    const half = Math.floor(kSize / 2)
    
    // Get region pixels
    const region = []
    for (let ki = 0; ki < kSize; ki++) {
      const rowData = []
      for (let kj = 0; kj < kSize; kj++) {
        const pi = row + ki - half
        const pj = col + kj - half
        rowData.push(borderSample(pixelData.pixels, pi, pj, imgSize, boundary) || [0, 0, 0])
      }
      region.push(rowData)
    }
    
    const result = applyKernelAtPosition(pixelData.pixels, row, col, kernel.matrix, kernel.scale, selectedKernel)
    const rgb = `rgb(${result[0]}, ${result[1]}, ${result[2]})`
    const gray = Math.round((result[0] + result[1] + result[2]) / 3)
    
    const sizeClass = kSize >= 6 ? 'size-6' : kSize >= 5 ? 'size-5' : ''
    
    return (
      <div className={`calc-info ${sizeClass}`}>
        <h4>Poziția [{row}, {col}]</h4>
        <div className="calc-row">
          <div className="region-mini">
            <div className="calc-label">Pixeli</div>
            <div className="mini-matrix">
              {region.map((r, i) => (
                <div key={i} className="mini-row">
                  {r.map((px, j) => {
                    const g = Math.round((px[0] + px[1] + px[2]) / 3)
                    return (
                      <div 
                        key={j} 
                        className="mini-cell" 
                        style={{ backgroundColor: `rgb(${px[0]},${px[1]},${px[2]})` }}
                      >
                        <span style={{ color: g > 128 ? '#000' : '#fff' }}>{g}</span>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
          <div className="calc-equals">=</div>
          <div className="result-pixel" style={{ backgroundColor: rgb, color: gray > 128 ? '#000' : '#fff' }}>
            {gray}
          </div>
        </div>
        {kernel.scale > 1 && (
          <div className="result-label">÷ {kernel.scale}</div>
        )}
      </div>
    )
  }
  
  const kernelSizeClass = kernelSize >= 6 ? 'size-6' : kernelSize >= 5 ? 'size-5' : ''
  
  return (
    <div className="kernels-educational">
      {/* Main area: images + right panel */}
      <div className="edu-main-area">
        {/* Left: Images stacked or side by side */}
        <div className="edu-images-area">
          <div className="grid-container">
            <h3>Input (Original)</h3>
            <div className="pixel-grid-wrapper">
              {renderPixelGrid(pixelData?.pixels, true, isAnimating || animationPos.row > 0 || animationPos.col > 0 ? animationPos : null)}
            </div>
          </div>
          
          <div className="grid-container">
            <h3>Output (Rezultat)</h3>
            <div className="pixel-grid-wrapper">
              {renderPixelGrid(outputPixels, false)}
            </div>
          </div>
        </div>
        
        {/* Right: Matrices display */}
        <div className="edu-matrices-panel">
          <div className="kernel-display">
            <h3>{kernel?.name}</h3>
            <p className="kernel-desc">{kernel?.description}</p>
            <div className={`kernel-matrix-edu ${kernelSizeClass}`}>
              {kernel?.matrix.map((row, i) => (
                <div key={i} className="kernel-row">
                  {row.map((val, j) => (
                    <div 
                      key={j} 
                      className={`kernel-cell ${val > 0 ? 'positive' : val < 0 ? 'negative' : 'zero'}`}
                    >
                      {val}
                    </div>
                  ))}
                </div>
              ))}
            </div>
            {kernel?.scale > 1 && (
              <p className="scale-note">÷ {kernel.scale}</p>
            )}
            <p className="boundary-note">
              <strong>Margine:</strong> {BOUNDARY_MODES.find(m => m.id === boundary)?.desc}
            </p>
          </div>

          {pixelData && renderCalcInfo()}
        </div>
      </div>
      
      {/* Bottom: Controls bar */}
      <div className="edu-controls-bar">
        <div className="control-group">
          <label>Sprite</label>
          <select 
            value={selectedSprite || ''} 
            onChange={e => setSelectedSprite(e.target.value)}
          >
            {sprites.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        
        <div className="control-group">
          <label>Kernel</label>
          <select 
            value={selectedKernel} 
            onChange={e => {
              setSelectedKernel(e.target.value)
              resetAnimation()
            }}
          >
            {Object.entries(BASE_KERNELS).map(([id, k]) => (
              <option key={id} value={id}>{k.name}</option>
            ))}
          </select>
        </div>
        
        <div className="control-group">
          <label>{kernelSize}×{kernelSize}</label>
          <input
            type="range"
            min="3"
            max="6"
            step="1"
            value={kernelSize}
            onChange={e => {
              setKernelSize(parseInt(e.target.value))
              resetAnimation()
            }}
          />
        </div>

        <div className="control-group">
          <label>Margine</label>
          <select
            value={boundary}
            onChange={e => {
              setBoundary(e.target.value)
              resetAnimation()
            }}
            title={BOUNDARY_MODES.find(m => m.id === boundary)?.desc}
          >
            {BOUNDARY_MODES.map(m => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </div>

        <div className="control-group">
          <label><ClockIcon size={16} /> {animationSpeed}ms</label>
          <input
            type="range"
            min="50"
            max="500"
            step="50"
            value={550 - animationSpeed}
            onChange={e => setAnimationSpeed(550 - parseInt(e.target.value))}
          />
        </div>

        <div className="edu-animation-controls">
          <button
            onClick={toggleAnimation}
            className={isAnimating ? 'stop' : 'play'}
            title={isAnimating ? 'Pauză' : 'Play'}
          >
            {isAnimating ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button
            onClick={stepBack}
            disabled={isAnimating || history.length === 0}
            aria-label="Pas înapoi"
          >
            <StepBackIcon />
          </button>
          <button
            onClick={stepAnimation}
            disabled={isAnimating || (pixelData && animationPos.row >= pixelData.size)}
            aria-label="Pas înainte"
          >
            <StepForwardIcon />
          </button>
          <button
            onClick={applyFullKernel}
            aria-label="Aplică complet"
          >
            <NextIcon />
          </button>
          <button
            onClick={resetAnimation}
            aria-label="Reset"
          >
            <ResetIcon />
          </button>
        </div>
      </div>
      
      {hoveredPixel && (
        <div className="pixel-info">
          [{hoveredPixel.row}, {hoveredPixel.col}]: RGB({hoveredPixel.rgb[0]}, {hoveredPixel.rgb[1]}, {hoveredPixel.rgb[2]})
        </div>
      )}
    </div>
  )
}
