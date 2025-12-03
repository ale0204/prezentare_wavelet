import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import LaTeX from './LaTeX'
import AnimationControls from './shared/AnimationControls'
import { renderRich } from './shared/richText'
import './MallatUnifiedView.css'
import { canvasMetrics, pointerPos } from './shared/stage'
import { canvasTheme, resolveColor } from './shared/canvasTheme'

/**
 * MallatUnifiedView - Unified Mallat 2D decomposition
 * Combines educational step-by-step (8x8 patch) with full image pyramid
 * Supports: synthetic patterns, Kodak images, sprites
 */

// ============================================================================
// Haar wavelet functions
// ============================================================================

const h0 = [1/Math.sqrt(2), 1/Math.sqrt(2)]   // Low-pass
const h1 = [1/Math.sqrt(2), -1/Math.sqrt(2)]  // High-pass

// 1D convolution + decimation
const convolveDecimate = (arr, filter) => {
  const result = []
  for (let i = 0; i < arr.length; i += 2) {
    let sum = 0
    for (let j = 0; j < filter.length; j++) {
      const idx = (i + j) % arr.length
      sum += arr[idx] * filter[j]
    }
    result.push(sum)
  }
  return result
}

// Filter all rows
const filterRows = (matrix, filter) => matrix.map(row => convolveDecimate(row, filter))

// Filter all columns
const filterCols = (matrix, filter) => {
  const rows = matrix.length
  const cols = matrix[0].length
  const result = []
  for (let y = 0; y < rows; y += 2) {
    const newRow = []
    for (let x = 0; x < cols; x++) {
      let sum = 0
      for (let j = 0; j < filter.length; j++) {
        const idx = (y + j) % rows
        sum += matrix[idx][x] * filter[j]
      }
      newRow.push(sum)
    }
    result.push(newRow)
  }
  return result
}

// One-level Haar decomposition
const haarDecompose = (matrix) => {
  const L = filterRows(matrix, h0)
  const H = filterRows(matrix, h1)
  return {
    LL: filterCols(L, h0),
    LH: filterCols(L, h1),
    HL: filterCols(H, h0),
    HH: filterCols(H, h1)
  }
}

// Multi-level decomposition
const multiLevelDecompose = (matrix, levels) => {
  const results = []
  let current = matrix
  for (let l = 0; l < levels; l++) {
    if (current.length < 2 || current[0].length < 2) break
    const d = haarDecompose(current)
    results.push({ level: l + 1, ...d })
    current = d.LL
  }
  return results
}

// ============================================================================
// Synthetic pattern generators
// ============================================================================

const SYNTHETIC_PATTERNS = {
  gradient: { name: 'Gradient', generate: (s) => Array.from({length: s}, (_, y) => Array.from({length: s}, (_, x) => 50 + 150 * x / s)) },
  edge_v: { name: 'Muchie V', generate: (s) => Array.from({length: s}, () => Array.from({length: s}, (_, x) => x < s/2 ? 80 : 200)) },
  edge_h: { name: 'Muchie H', generate: (s) => Array.from({length: s}, (_, y) => Array.from({length: s}, () => y < s/2 ? 200 : 80)) },
  diagonal: { name: 'Diagonal', generate: (s) => Array.from({length: s}, (_, y) => Array.from({length: s}, (_, x) => x + y < s ? 80 : 200)) },
  checker: { name: 'Șah', generate: (s) => { const b = Math.max(1, s/8); return Array.from({length: s}, (_, y) => Array.from({length: s}, (_, x) => (Math.floor(x/b) + Math.floor(y/b)) % 2 === 0 ? 200 : 80)) }},
  corner: { name: 'Colț', generate: (s) => Array.from({length: s}, (_, y) => Array.from({length: s}, (_, x) => (x < s/2 && y < s/2) ? 200 : 80)) },
  texture: { name: 'Textură', generate: (s) => Array.from({length: s}, (_, y) => Array.from({length: s}, (_, x) => 128 + 50*Math.sin(x*0.5)*Math.cos(y*0.3) + 30*Math.sin(x*0.2+y*0.2))) },
}

// Step definitions for educational mode - tree structure
const STEPS = [
  { id: 'original', label: 'Original', desc: 'Imaginea de intrare ($8 \\times 8$ pixeli)', phase: 0 },
  { id: 'rows-filter', label: 'Filtrare rânduri', desc: 'Aplicăm $h_0$ (LP) și $h_1$ (HP) pe fiecare rând', phase: 1 },
  { id: 'cols-from-l', label: 'Filtrare coloane (L)', desc: 'Din L: $h_0 \\to \\text{LL}$ (aproximare), $h_1 \\to \\text{LH}$ (detalii H)', phase: 2 },
  { id: 'cols-from-h', label: 'Filtrare coloane (H)', desc: 'Din H: $h_0 \\to \\text{HL}$ (detalii V), $h_1 \\to \\text{HH}$ (detalii D)', phase: 3 },
  { id: 'final', label: 'Rezultat final', desc: 'Descompunerea completă cu cele 4 subbenzi', phase: 4 }
]

const BAND_COLORS = {
  LL: '#00d4ff',
  LH: '#ff9f43', 
  HL: '#c9b1ff',
  HH: '#ff6b9d'
}



// ============================================================================
// Component
// ============================================================================

export default function MallatUnifiedView({ compact = false, api = '/api' }) {
  // Mode: 'edu' (8x8 step-by-step) or 'full' (multi-level pyramid). Full mode
  // with a real image is the default so the first thing a viewer sees is the
  // real recursive pyramid, not a flat synthetic 8x8 patch; edu mode is one
  // click away.
  const [mode, setMode] = useState('full')
  const [overlayLabels, setOverlayLabels] = useState([])

  // Image source. Kodak (baboon_512, the alphabetically-first sample - rich
  // texture in every direction) so the default full-mode pyramid shows real
  // energy in LH/HL/HH instead of the degenerate all-zero subbands a flat
  // synthetic edge pattern produces.
  const [imageSource, setImageSource] = useState('kodak')
  const [syntheticPattern, setSyntheticPattern] = useState('edge_v')
  const [apiImages, setApiImages] = useState([])
  const [sprites, setSprites] = useState([])
  const [selectedApiImage, setSelectedApiImage] = useState('')
  const [selectedSprite, setSelectedSprite] = useState('')
  const [imageData, setImageData] = useState(null)
  
  // Decomposition params
  const [levels, setLevels] = useState(3)
  const [highlightBand, setHighlightBand] = useState(null)
  const [useHeatmap, setUseHeatmap] = useState(false)
  
  // Educational mode
  const [currentStep, setCurrentStep] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  
  const canvasRef = useRef()
  const wrapperRef = useRef()
  const animRef = useRef()
  
  // Fetch available images on mount
  useEffect(() => {
    fetch(`${api}/sample-images`)
      .then(r => r.json())
      .then(d => {
        setApiImages(d.images || [])
        if (d.images?.length > 0) setSelectedApiImage(d.images[0].id)
      })
      .catch(() => {})
    
    fetch(`${api}/sprite-images`)
      .then(r => r.json())
      .then(d => {
        const spriteList = d.images || []
        setSprites(spriteList)
        if (spriteList.length > 0) setSelectedSprite(spriteList[0].id)
      })
      .catch(() => {})
  }, [])
  
  // Load image data based on source
  useEffect(() => {
    const size = mode === 'edu' ? 8 : 64
    
    if (imageSource === 'synthetic') {
      const pattern = SYNTHETIC_PATTERNS[syntheticPattern]
      if (pattern) {
        setImageData(pattern.generate(size))
      }
    } else if (imageSource === 'sprite' && selectedSprite) {
      fetch(`${api}/sprite-images/${selectedSprite}/grayscale?size=${size}`)
        .then(r => r.json())
        .then(d => setImageData(d.pixels))
        .catch(() => setImageData(SYNTHETIC_PATTERNS.edge_v.generate(size)))
    } else if (imageSource === 'kodak' && selectedApiImage) {
      fetch(`${api}/sample-images/${selectedApiImage}/grayscale?size=${size}`)
        .then(r => r.json())
        .then(d => setImageData(d.pixels))
        .catch(() => {
          // Fallback: generate synthetic if API fails
          setImageData(SYNTHETIC_PATTERNS.edge_v.generate(size))
        })
    }
    setCurrentStep(0)
    setIsPlaying(false)
  }, [imageSource, syntheticPattern, selectedSprite, selectedApiImage, mode])
  
  // Animation timer for edu mode
  useEffect(() => {
    if (mode === 'edu' && isPlaying) {
      animRef.current = setTimeout(() => {
        setCurrentStep(prev => {
          if (prev >= STEPS.length - 1) {
            setIsPlaying(false)
            return prev
          }
          return prev + 1
        })
      }, 1000)
    }
    return () => clearTimeout(animRef.current)
  }, [mode, isPlaying, currentStep])
  
  // Compute decomposition.
  // useMemo is load-bearing here: without it these get a fresh identity on
  // every render, the draw effect below re-fires, setOverlayLabels triggers
  // another render and the component spins in an endless redraw loop.
  const decomposition = useMemo(
    () => (imageData ? multiLevelDecompose(imageData, levels) : []),
    [imageData, levels]
  )

  // For edu mode, compute intermediate results
  const eduData = useMemo(() => (
    imageData && mode === 'edu' ? {
      patch: imageData,
      L: filterRows(imageData, h0),
      H: filterRows(imageData, h1),
      LL: decomposition[0]?.LL || [],
      LH: decomposition[0]?.LH || [],
      HL: decomposition[0]?.HL || [],
      HH: decomposition[0]?.HH || []
    } : null
  ), [imageData, mode, decomposition])

  // Calculate energy distribution
  const energies = useMemo(() => (
    decomposition.length > 0 ? {
      LL: calcEnergy(decomposition[decomposition.length - 1].LL),
      LH: decomposition.reduce((s, d) => s + calcEnergy(d.LH), 0),
      HL: decomposition.reduce((s, d) => s + calcEnergy(d.HL), 0),
      HH: decomposition.reduce((s, d) => s + calcEnergy(d.HH), 0)
    } : { LL: 1, LH: 0, HL: 0, HH: 0 }
  ), [decomposition])
  const totalEnergy = Object.values(energies).reduce((s, e) => s + e, 0) || 1

  // Draw visualization
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !imageData) return

    // HiDPI support
    const { width: W, height: H, dpr } = canvasMetrics(canvas)
    if (W === 0 || H === 0) return

    // Only resize if needed
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
    }

    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    ctx.fillStyle = canvasTheme().bg
    ctx.fillRect(0, 0, W, H)

    let newLabels = []
    if (mode === 'edu') {
      newLabels = drawEducationalMode(ctx, W, H, eduData, currentStep, useHeatmap)
    } else {
      newLabels = drawPyramidMode(ctx, W, H, imageData, decomposition, highlightBand, useHeatmap, energies, totalEnergy)
    }
    setOverlayLabels(newLabels)
  }, [imageData, mode, currentStep, decomposition, highlightBand, eduData, useHeatmap, energies, totalEnergy])

  useEffect(() => {
    draw()
    const observer = new ResizeObserver(draw)
    if (wrapperRef.current) observer.observe(wrapperRef.current)
    return () => observer.disconnect()
  }, [draw])

  // Click on a pyramid quadrant toggles its highlight (full mode)
  const handleCanvasClick = (e) => {
    if (mode !== 'full') return
    const canvas = canvasRef.current
    if (!canvas) return
    const { x, y } = pointerPos(e, canvas)
    const rect = { width: canvas.clientWidth, height: canvas.clientHeight }

    const pyramidSize = Math.min(rect.width - 50, rect.height - 80)
    const offsetX = (rect.width - pyramidSize) / 2
    const offsetY = 40
    if (x < offsetX || x > offsetX + pyramidSize || y < offsetY || y > offsetY + pyramidSize) return

    const half = pyramidSize / 2
    const right = x > offsetX + half
    const bottom = y > offsetY + half
    const band = right ? (bottom ? 'HH' : 'LH') : (bottom ? 'HL' : 'LL')
    setHighlightBand(prev => (prev === band ? null : band))
  }

  // Reset handler
  const handleReset = () => {
    setCurrentStep(0)
    setIsPlaying(false)
  }
  
  return (
    <div className={`mallat-unified ${compact ? 'compact' : ''}`}>
      <div className="mallat-main">
        {/* Mode tabs */}
        <div className="mode-tabs">
          <button
            className={`mode-tab ${mode === 'edu' ? 'active' : ''}`}
            onClick={() => setMode('edu')}
          >
            Educațional (8×8)
          </button>
          <button
            className={`mode-tab ${mode === 'full' ? 'active' : ''}`}
            onClick={() => setMode('full')}
          >
            Imagine Completă
          </button>
        </div>
        
        {/* Canvas with HTML overlay for labels */}
        <div className={`canvas-container ${mode === 'edu' ? 'edu-mode' : 'full-mode'}`}>
          <div ref={wrapperRef} className="mallat-canvas-wrapper" style={{position: 'relative'}}>
            <canvas
              ref={canvasRef}
              onClick={handleCanvasClick}
              style={{ width: '100%', height: '100%', cursor: mode === 'full' ? 'pointer' : 'default' }}
            />
            {overlayLabels.map((l, i) => (
              <div key={i} style={{
                position: 'absolute',
                left: l.x,
                top: l.y,
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
                ...l.style
              }}>
                {l.text}
              </div>
            ))}
          </div>
          
          {/* Step info overlay - positioned above the animation */}
          {mode === 'edu' && (
            <div className="step-info-overlay">
              <span className="step-number">Pas {currentStep + 1}/{STEPS.length}</span>
              <span className="step-title">{renderRich(STEPS[currentStep].label)}</span>
              <span className="step-desc">{renderRich(STEPS[currentStep].desc)}</span>
            </div>
          )}
          
          {mode === 'full' && highlightBand && (
            <div className="highlight-info-overlay" style={{ color: BAND_COLORS[highlightBand] }}>
              {highlightBand}: {highlightBand === 'LL' ? 'Aproximare' : 
                highlightBand === 'LH' ? 'Detalii orizontale' :
                highlightBand === 'HL' ? 'Detalii verticale' : 'Detalii diagonale'}
            </div>
          )}
        </div>
        
        {/* Edu mode controls - using AnimationControls component */}
        {mode === 'edu' && (
          <div className="edu-controls">
            <AnimationControls
              isPlaying={isPlaying}
              onPlayPause={() => setIsPlaying(!isPlaying)}
              onStepForward={() => setCurrentStep(prev => Math.min(STEPS.length - 1, prev + 1))}
              onStepBackward={() => setCurrentStep(prev => Math.max(0, prev - 1))}
              onReset={handleReset}
              canStepForward={currentStep < STEPS.length - 1}
              canStepBackward={currentStep > 0}
              canPlay={currentStep < STEPS.length - 1 || isPlaying}
              showJumpButtons={false}
              size="normal"
              layout="compact"
            />
            
            <div className="step-dots">
              {STEPS.map((s, i) => (
                <div 
                  key={s.id}
                  className={`dot ${i === currentStep ? 'active' : ''} ${i < currentStep ? 'done' : ''}`}
                  onClick={() => { setIsPlaying(false); setCurrentStep(i) }}
                  title={s.label}
                />
              ))}
            </div>
          </div>
        )}
        
        {/* Full mode: energy bars */}
        {mode === 'full' && (
          <div className="energy-section">
            <div className="energy-bar">
              {Object.entries(energies).map(([band, energy]) => (
                <div 
                  key={band}
                  className={`energy-segment ${highlightBand === band ? 'highlight' : ''}`}
                  style={{ 
                    width: `${(energy / totalEnergy) * 100}%`,
                    backgroundColor: BAND_COLORS[band]
                  }}
                  onClick={() => setHighlightBand(highlightBand === band ? null : band)}
                  title={`${band}: ${((energy/totalEnergy)*100).toFixed(1)}%`}
                >
                  {(energy / totalEnergy) > 0.08 && band}
                </div>
              ))}
            </div>
            <p className="energy-note">
              LL: {((energies.LL / totalEnergy) * 100).toFixed(0)}% energie -&gt; bază pentru compresie
            </p>
          </div>
        )}
      </div>
      
      {/* Sidebar */}
      <div className="mallat-sidebar">
        {/* Image source selector */}
        <div className="sidebar-section">
          <label>Sursă imagine</label>
          <div className="source-tabs">
            <button 
              className={imageSource === 'synthetic' ? 'active' : ''}
              onClick={() => setImageSource('synthetic')}
            >Sintetic</button>
            <button 
              className={imageSource === 'sprite' ? 'active' : ''}
              onClick={() => setImageSource('sprite')}
            >Sprite</button>
            <button 
              className={imageSource === 'kodak' ? 'active' : ''}
              onClick={() => setImageSource('kodak')}
            >Kodak</button>
          </div>
          
          {imageSource === 'synthetic' && (
            <select value={syntheticPattern} onChange={e => setSyntheticPattern(e.target.value)}>
              {Object.entries(SYNTHETIC_PATTERNS).map(([k, v]) => (
                <option key={k} value={k}>{v.name}</option>
              ))}
            </select>
          )}
          
          {imageSource === 'sprite' && (
            <select value={selectedSprite} onChange={e => setSelectedSprite(e.target.value)}>
              {sprites.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
          
          {imageSource === 'kodak' && (
            <select value={selectedApiImage} onChange={e => setSelectedApiImage(e.target.value)}>
              {apiImages.slice(0, 10).map(img => (
                <option key={img.id} value={img.id}>{img.name}</option>
              ))}
            </select>
          )}
        </div>
        
        {/* Levels (full mode only) */}
        {mode === 'full' && (
          <div className="sidebar-section">
            <label>Niveluri: {levels}</label>
            <input 
              type="range" min="1" max="4" value={levels}
              onChange={e => setLevels(parseInt(e.target.value))}
            />
          </div>
        )}
        
        {/* Band highlight (full mode) */}
        {mode === 'full' && (
          <div className="sidebar-section">
            <label>Evidențiază</label>
            <div className="band-buttons">
              {['LL', 'LH', 'HL', 'HH'].map(band => (
                <button
                  key={band}
                  className={highlightBand === band ? 'active' : ''}
                  style={{ borderColor: BAND_COLORS[band], color: highlightBand === band ? '#fff' : BAND_COLORS[band] }}
                  onClick={() => setHighlightBand(highlightBand === band ? null : band)}
                >
                  {band}
                </button>
              ))}
            </div>
          </div>
        )}
        
        {/* Heatmap toggle */}
        <div className="sidebar-section">
          <label className="toggle-label">
            <input 
              type="checkbox" 
              checked={useHeatmap} 
              onChange={e => setUseHeatmap(e.target.checked)}
            />
            <span>Heatmap coeficienți</span>
          </label>
          {useHeatmap && (
            <div className="heatmap-legend">
              <span className="hl-pos">+ pozitiv</span>
              <span className="hl-zero">0</span>
              <span className="hl-neg">− negativ</span>
            </div>
          )}
        </div>
        
        {/* Tree diagram - edu mode */}
        {mode === 'edu' && (
          <div className="sidebar-tree">
            <h4>Structura arborelui</h4>
            <div className="tree-diagram">
              <div className="tree-node root">Img</div>
              <div className="tree-level">
                <div className="tree-branch">
                  <span className="branch-label"><LaTeX math={String.raw`h_0`} /></span>
                  <div className="tree-node l-node">L</div>
                  <div className="tree-sublevel">
                    <div className="tree-leaf ll" style={{borderColor: BAND_COLORS.LL}}>LL</div>
                    <div className="tree-leaf lh" style={{borderColor: BAND_COLORS.LH}}>LH</div>
                  </div>
                </div>
                <div className="tree-branch">
                  <span className="branch-label"><LaTeX math={String.raw`h_1`} /></span>
                  <div className="tree-node h-node">H</div>
                  <div className="tree-sublevel">
                    <div className="tree-leaf hl" style={{borderColor: BAND_COLORS.HL}}>HL</div>
                    <div className="tree-leaf hh" style={{borderColor: BAND_COLORS.HH}}>HH</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Legend */}
        <div className="sidebar-legend">
          <h4>Subbenzi</h4>
          <div className="legend-grid">
            {Object.entries(BAND_COLORS).map(([band, color]) => (
              <div key={band} className="legend-item">
                <span className="color-dot" style={{ background: color }}></span>
                <span><strong>{band}</strong> - {
                  band === 'LL' ? 'Aproximare' :
                  band === 'LH' ? 'Orizontale' :
                  band === 'HL' ? 'Verticale' : 'Diagonale'
                }</span>
              </div>
            ))}
          </div>
        </div>
        
        {/* Filters formula */}
        <div className="sidebar-formula">
          <h4>Filtre Haar</h4>
          <div className="formula-item" style={{ whiteSpace: 'nowrap' }}>
            <LaTeX math={String.raw`h_0\ \mathrm{(LP)} = [1,\ 1]/\sqrt{2}`} />
          </div>
          <div className="formula-item" style={{ whiteSpace: 'nowrap' }}>
            <LaTeX math={String.raw`h_1\ \mathrm{(HP)} = [1,\ -1]/\sqrt{2}`} />
          </div>
          <p className="formula-note">LP = medie, HP = diferență</p>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Drawing functions
// ============================================================================

function calcEnergy(matrix) {
  if (!matrix || !matrix.length) return 0
  return matrix.reduce((s, row) => s + row.reduce((rs, v) => rs + v*v, 0), 0)
}

function drawMatrix(ctx, data, x, y, cellSize, options = {}) {
  const { label, color = '#00d4ff', highlight = false, normalize = true, heatmap = false } = options
  if (!data || !data.length) return { x, y, w: 0, h: 0 }
  
  const rows = data.length
  const cols = data[0].length
  const w = cols * cellSize
  const h = rows * cellSize
  
  // Find min/max for normalization
  let min = 0, max = 255
  if (normalize || heatmap) {
    min = Infinity; max = -Infinity
    data.forEach(row => row.forEach(v => { min = Math.min(min, v); max = Math.max(max, v) }))
  }
  const range = max - min || 1
  const absMax = Math.max(Math.abs(min), Math.abs(max)) || 1
  
  // Background
  ctx.fillStyle = resolveColor(highlight ? 'rgba(255, 215, 0, 0.1)' : 'rgba(0, 0, 0, 0.3)')
  ctx.fillRect(x, y, w, h)
  
  // Cells
  data.forEach((row, ry) => {
    row.forEach((val, cx) => {
      let fillColor
      if (heatmap) {
        // Heatmap: green for positive, red for negative, black for zero
        const intensity = Math.abs(val) / absMax
        const alpha = Math.min(1, intensity * 1.5)
        if (val > 0) {
          fillColor = `rgba(0, ${Math.round(200 * alpha)}, ${Math.round(100 * alpha)}, 1)`
        } else if (val < 0) {
          fillColor = `rgba(${Math.round(220 * alpha)}, ${Math.round(50 * alpha)}, ${Math.round(50 * alpha)}, 1)`
        } else {
          fillColor = 'rgb(20, 20, 20)'
        }
      } else {
        const norm = normalize ? (val - min) / range : val / 255
        const gray = Math.max(0, Math.min(255, Math.round(norm * 255)))
        fillColor = `rgb(${gray}, ${gray}, ${gray})`
      }
      ctx.fillStyle = resolveColor(fillColor)
      ctx.fillRect(x + cx * cellSize + 0.5, y + ry * cellSize + 0.5, cellSize - 1, cellSize - 1)
    })
  })
  
  // Border
  ctx.strokeStyle = resolveColor(highlight ? canvasTheme().gold : 'rgba(255, 255, 255, 0.3)')
  ctx.lineWidth = highlight ? 2 : 1
  ctx.strokeRect(x, y, w, h)
  
  return { x, y, w, h }
}

function drawArrow(ctx, x1, y1, x2, y2, label = '') {
  ctx.strokeStyle = canvasTheme().amber
  ctx.lineWidth = 2
  ctx.setLineDash([4, 4])
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
  ctx.setLineDash([])
  
  const angle = Math.atan2(y2 - y1, x2 - x1)
  ctx.beginPath()
  ctx.moveTo(x2, y2)
  ctx.lineTo(x2 - 8 * Math.cos(angle - Math.PI/6), y2 - 8 * Math.sin(angle - Math.PI/6))
  ctx.lineTo(x2 - 8 * Math.cos(angle + Math.PI/6), y2 - 8 * Math.sin(angle + Math.PI/6))
  ctx.closePath()
  ctx.fillStyle = canvasTheme().amber
  ctx.fill()
  
  // Draw label if provided
  if (label) {
    const midX = (x1 + x2) / 2
    const midY = (y1 + y2) / 2
    // Offset perpendicular to the line
    const perpX = -Math.sin(angle) * 12
    const perpY = Math.cos(angle) * 12
    drawText(ctx, label, midX + perpX, midY + perpY, { 
      color: 'var(--series-gold)', 
      font: 'bold 11px system-ui, -apple-system, sans-serif' 
    })
  }
}

function drawEducationalMode(ctx, W, height, data, step, heatmap = false) {
  if (!data) return []
  const labels = []
  const { patch, L, H, LL, LH, HL, HH } = data
  const cell = 18  // Smaller cells to fit everything
  const phase = STEPS[step].phase
  
  // Layout: tree structure left-to-right
  // Phase 0: Original in center
  // Phase 1: Original -> L and H
  // Phase 2: L -> LL and LH (show H dimmed)
  // Phase 3: H -> HL and HH (show L dimmed)
  // Phase 4: All 4 final subbands arranged
  
  const patchSize = patch.length  // 8
  const halfSize = patchSize / 2  // 4
  
  // Helper to draw with optional dimming
  const drawWithDim = (matrix, x, y, c, opts = {}) => {
    const { dim = false, ...rest } = opts
    if (dim) {
      ctx.globalAlpha = 0.35
    }
    const r = drawMatrix(ctx, matrix, x, y, c, rest)
    ctx.globalAlpha = 1.0
    return r
  }
  
  // Column positions - more centered
  const col1 = 160                  // Original - more to the right
  const col2 = col1 + patchSize * cell + 80  // L / H  
  const col3 = col2 + halfSize * cell + 80    // LL/LH/HL/HH
  
  // Row positions for vertical centering
  const centerY = height / 2 + 30
  
  if (phase === 0) {
    // Show only original centered
    const ox = W/2 - patchSize*cell/2
    const oy = centerY - patchSize*cell/2
    drawMatrix(ctx, patch, ox, oy, cell, { highlight: true, normalize: false })
    labels.push({
      text: '8×8',
      x: ox + patchSize*cell/2,
      y: oy + patchSize*cell + 16,
      style: { color: 'var(--primary)', fontWeight: 'bold', fontSize: '13px', textShadow: '1px 1px 2px rgba(0,0,0,0.8)' }
    })
  }
  else if (phase >= 1) {
    // Original always at col1
    const origY = centerY - patchSize*cell/2
    const origRect = drawWithDim(patch, col1, origY, cell, { normalize: false, dim: phase > 1 })
    
    // Label for original
    labels.push({
      text: `Original (${patchSize}×${patchSize})`,
      x: col1 + patchSize*cell/2,
      y: origY - 12,
      style: { 
        color: phase > 1 ? 'var(--text-muted)' : '#fff', 
        fontWeight: 'bold', 
        fontSize: '12px',
        textShadow: phase <= 1 ? '1px 1px 2px rgba(0,0,0,0.8)' : 'none'
      }
    })
    
    // L and H at col2 - proper vertical spacing
    const gapLH = 25  // More gap between L and H
    const lY = centerY - patchSize*cell - gapLH
    const hY = centerY + gapLH
    const lRect = drawWithDim(L, col2, lY, cell, { heatmap, highlight: phase === 1, dim: phase > 2 })
    const hRect = drawWithDim(H, col2, hY, cell, { heatmap, highlight: phase === 1, dim: phase > 3 })
    
    // Draw arrows from original to L and H
    if (phase >= 1) {
      drawArrow(ctx, col1 + patchSize*cell + 8, origY + patchSize*cell/2 - 15, col2 - 8, lY + patchSize*cell/2, '')
      drawArrow(ctx, col1 + patchSize*cell + 8, origY + patchSize*cell/2 + 15, col2 - 8, hY + patchSize*cell/2, '')
      // Arrow labels
      labels.push({ text: <LaTeX math={String.raw`h_0`} />, x: (col1 + patchSize*cell + col2)/2, y: (origY + patchSize*cell/2 - 15 + lY + patchSize*cell/2)/2, style: { color: 'var(--series-gold)', fontSize: '14px', fontWeight: 'bold' } })
      labels.push({ text: <LaTeX math={String.raw`h_1`} />, x: (col1 + patchSize*cell + col2)/2, y: (origY + patchSize*cell/2 + 15 + hY + patchSize*cell/2)/2, style: { color: 'var(--series-gold)', fontSize: '14px', fontWeight: 'bold' } })
    }
    
    // Labels for L and H
    labels.push({
      text: `L (${L.length}×${L[0].length})`,
      x: col2 + L[0].length*cell/2,
      y: lY - 12,
      style: { 
        color: phase > 2 ? 'var(--text-muted)' : '#00d4ff', 
        fontWeight: 'bold', 
        fontSize: '12px',
        textShadow: phase <= 2 ? '1px 1px 2px rgba(0,0,0,0.8)' : 'none'
      }
    })
    labels.push({
      text: `H (${H.length}×${H[0].length})`,
      x: col2 + H[0].length*cell/2,
      y: hY - 12,
      style: { 
        color: phase > 3 ? 'var(--text-muted)' : '#ffd700', 
        fontWeight: 'bold', 
        fontSize: '12px',
        textShadow: phase <= 3 ? '1px 1px 2px rgba(0,0,0,0.8)' : 'none'
      }
    })
    
    // Phase 2+: show LL and LH from L
    // LL at top of L, LH right below LL with small gap
    if (phase >= 2) {
      const llY = lY
      const lhY = llY + halfSize*cell + 8  // LH right below LL
      
      drawWithDim(LL, col3, llY, cell, { heatmap, highlight: phase === 2 || phase === 4, dim: false })
      drawWithDim(LH, col3, lhY, cell, { heatmap, highlight: phase === 2 || phase === 4, dim: false })
      
      // Arrows from L to LL and LH - symmetric tilt
      const arrowStartX = col2 + L[0].length*cell + 8
      const arrowEndX = col3 - 8
      const lMidY = lY + patchSize*cell/2
      drawArrow(ctx, arrowStartX, lMidY - 20, arrowEndX, llY + halfSize*cell/2, '')
      drawArrow(ctx, arrowStartX, lMidY + 20, arrowEndX, lhY + halfSize*cell/2, '')
      
      // Arrow labels
      labels.push({ text: <LaTeX math={String.raw`h_0`} />, x: (arrowStartX + arrowEndX)/2, y: (lMidY - 20 + llY + halfSize*cell/2)/2, style: { color: 'var(--series-gold)', fontSize: '14px', fontWeight: 'bold' } })
      labels.push({ text: <LaTeX math={String.raw`h_1`} />, x: (arrowStartX + arrowEndX)/2, y: (lMidY + 20 + lhY + halfSize*cell/2)/2, style: { color: 'var(--series-gold)', fontSize: '14px', fontWeight: 'bold' } })
      
      // Labels with dimensions
      labels.push({
        text: `LL (${halfSize}×${halfSize})`,
        x: col3 + halfSize*cell/2,
        y: llY - 10,
        style: { color: BAND_COLORS.LL, fontWeight: 'bold', fontSize: '12px', textShadow: '1px 1px 2px rgba(0,0,0,0.8)' }
      })
      labels.push({
        text: `LH (${halfSize}×${halfSize})`,
        x: col3 + halfSize*cell/2,
        y: lhY + halfSize*cell + 16,
        style: { color: BAND_COLORS.LH, fontWeight: 'bold', fontSize: '12px', textShadow: '1px 1px 2px rgba(0,0,0,0.8)' }
      })
    }
    
    // Phase 3+: show HL and HH from H
    // HL at top of H, HH right below HL with small gap
    if (phase >= 3) {
      const hlY = hY
      const hhY = hlY + halfSize*cell + 8  // HH right below HL
      
      drawWithDim(HL, col3, hlY, cell, { heatmap, highlight: phase === 3 || phase === 4, dim: false })
      drawWithDim(HH, col3, hhY, cell, { heatmap, highlight: phase === 3 || phase === 4, dim: false })
      
      // Arrows from H to HL and HH - symmetric tilt
      const arrowStartX = col2 + H[0].length*cell + 8
      const arrowEndX = col3 - 8
      const hMidY = hY + patchSize*cell/2
      drawArrow(ctx, arrowStartX, hMidY - 20, arrowEndX, hlY + halfSize*cell/2, '')
      drawArrow(ctx, arrowStartX, hMidY + 20, arrowEndX, hhY + halfSize*cell/2, '')
      
      // Arrow labels
      labels.push({ text: <LaTeX math={String.raw`h_0`} />, x: (arrowStartX + arrowEndX)/2, y: (hMidY - 20 + hlY + halfSize*cell/2)/2, style: { color: 'var(--series-gold)', fontSize: '14px', fontWeight: 'bold' } })
      labels.push({ text: <LaTeX math={String.raw`h_1`} />, x: (arrowStartX + arrowEndX)/2, y: (hMidY + 20 + hhY + halfSize*cell/2)/2, style: { color: 'var(--series-gold)', fontSize: '14px', fontWeight: 'bold' } })
      
      // Labels with dimensions
      labels.push({
        text: `HL (${halfSize}×${halfSize})`,
        x: col3 + halfSize*cell/2,
        y: hlY - 10,
        style: { color: BAND_COLORS.HL, fontWeight: 'bold', fontSize: '12px', textShadow: '1px 1px 2px rgba(0,0,0,0.8)' }
      })
      labels.push({
        text: `HH (${halfSize}×${halfSize})`,
        x: col3 + halfSize*cell/2,
        y: hhY + halfSize*cell + 16,
        style: { color: BAND_COLORS.HH, fontWeight: 'bold', fontSize: '12px', textShadow: '1px 1px 2px rgba(0,0,0,0.8)' }
      })
    }
  }
  return labels
}

function drawPyramidMode(ctx, W, height, imageData, decomposition, highlightBand, heatmap = false, energies = null, totalEnergy = 1) {
  if (!decomposition.length) return []
  const labels = []

  const pyramidSize = Math.min(W - 50, height - 80)
  const offsetX = (W - pyramidSize) / 2
  const offsetY = 40

  // Draw original small (never heatmap)
  const origSize = 80
  const origCell = origSize / imageData.length
  drawMatrix(ctx, imageData, 20, offsetY, origCell, { normalize: false, heatmap: false })

  labels.push({
    text: 'Original',
    x: 20 + origSize / 2,
    y: offsetY + origSize + 15,
    style: { color: 'var(--text-muted)', fontSize: '12px' }
  })

  // Arrow to pyramid
  drawArrow(ctx, 20 + origSize + 5, offsetY + origSize/2, offsetX - 10, offsetY + pyramidSize/2)

  const bandDesc = {
    LL: 'aproximare',
    LH: 'muchii orizontale',
    HL: 'muchii verticale',
    HH: 'diagonale'
  }
  const labelChip = (band) => ({
    color: '#fff',
    background: `${BAND_COLORS[band]}cc`,
    padding: '1px 7px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 'bold'
  })

  // Draw pyramid
  let currentSize = pyramidSize
  for (let l = decomposition.length - 1; l >= 0; l--) {
    const d = decomposition[l]
    const half = currentSize / 2
    const px = offsetX + pyramidSize - currentSize
    const py = offsetY

    // LL (only innermost) - no heatmap for approximation.
    // normalize: true because multi-level Haar scales LL by 2 per level,
    // so raw values exceed 255 and would clip to solid white.
    if (l === decomposition.length - 1) {
      drawMatrix(ctx, d.LL, px, py, half / d.LL.length, { normalize: true, heatmap: false })
      ctx.strokeStyle = resolveColor(highlightBand === 'LL' ? BAND_COLORS.LL : 'rgba(0, 212, 255, 0.5)')
      ctx.lineWidth = highlightBand === 'LL' ? 3 : 1
      ctx.strokeRect(px, py, half, half)

      const llPct = energies ? ` ${(energies.LL / totalEnergy * 100).toFixed(0)}%` : ''
      labels.push({
        text: `LL${llPct}`,
        x: px + half / 2,
        y: py + 12,
        style: labelChip('LL')
      })
    }

    // LH, HL, HH - use heatmap for detail subbands
    ;[
      { band: 'LH', data: d.LH, dx: half, dy: 0 },
      { band: 'HL', data: d.HL, dx: 0, dy: half },
      { band: 'HH', data: d.HH, dx: half, dy: half }
    ].forEach(({ band, data, dx, dy }) => {
      drawMatrix(ctx, data, px + dx, py + dy, half / data.length, { normalize: !heatmap, heatmap })
      ctx.strokeStyle = resolveColor(highlightBand === band ? BAND_COLORS[band] : `${BAND_COLORS[band]}88`)
      ctx.lineWidth = highlightBand === band ? 3 : 1
      ctx.strokeRect(px + dx, py + dy, half, half)

      // Name + energy share only on the outermost (largest) level; the label
      // sheds detail as the quadrant shrinks (more decomposition levels ->
      // smaller outermost quadrants), so a wide chip never bridges into the
      // neighbouring quadrant's label. The dropped percentage is not lost -
      // the energy bar below repeats it per band with a hover tooltip.
      if (l === 0) {
        const pct = energies ? ` ${(energies[band] / totalEnergy * 100).toFixed(1)}%` : ''
        const text = half >= 260 ? `${band} (${bandDesc[band]})${pct}` : half >= 90 ? `${band}${pct}` : band
        labels.push({
          text,
          x: px + dx + half / 2,
          y: py + dy + 12,
          style: labelChip(band)
        })
      }
    })

    currentSize = half
  }
  return labels
}
