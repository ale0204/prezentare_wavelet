import { useState, useEffect, useRef, useMemo } from 'react'
import LaTeX from './LaTeX'
import AnimationControls from './shared/AnimationControls'
import '../styles/views/pyramid-decomp.css'
import useHiDPICanvas from './shared/useHiDPICanvas'
import { canvasTheme, resolveColor, isLight } from './shared/canvasTheme'

/**
 * PyramidDecompView - Multi-level wavelet pyramid visualization
 * Shows how recursive LL decomposition creates a pyramid structure
 * with energy concentration and practical applications
 */

// Generate sample data for visualization
const generateSampleSignal = (size) => {
  const signal = []
  for (let i = 0; i < size; i++) {
    const t = i / size
    // Mix of frequencies
    signal.push(
      100 + 
      50 * Math.sin(2 * Math.PI * 2 * t) +
      30 * Math.sin(2 * Math.PI * 8 * t) +
      15 * Math.sin(2 * Math.PI * 32 * t)
    )
  }
  return signal
}

// Haar decomposition
const haarDecompose1D = (signal) => {
  const n = signal.length
  const approx = []
  const detail = []
  for (let i = 0; i < n; i += 2) {
    const a = signal[i]
    // Explicit bounds test, not a falsy check: a sample of exactly 0 is data,
    // and || would silently replace it with its neighbour.
    const b = i + 1 < n ? signal[i + 1] : signal[i]
    approx.push((a + b) / Math.sqrt(2))
    detail.push((a - b) / Math.sqrt(2))
  }
  return { approx, detail }
}

// Multi-level 1D decomposition
const multiLevelDecompose = (signal, levels) => {
  const results = []
  let current = signal
  for (let l = 0; l < levels; l++) {
    if (current.length < 2) break
    const { approx, detail } = haarDecompose1D(current)
    results.push({
      level: l + 1,
      approx,
      detail,
      originalLength: current.length,
      approxLength: approx.length
    })
    current = approx
  }
  return results
}

// Calculate energy
const calcEnergy = (arr) => arr.reduce((sum, v) => sum + v * v, 0)

export default function PyramidDecompView({ compact = false }) {
  const [signalSize, setSignalSize] = useState(64)
  const [numLevels, setNumLevels] = useState(4)
  const [highlightLevel, setHighlightLevel] = useState(null)
  const [animating, setAnimating] = useState(false)
  // Levels currently drawn - always drives the canvas (not just while
  // animating), so pausing mid-animation, stepping, or dragging the level
  // slider can never desync the picture from the displayed level count.
  const [animLevel, setAnimLevel] = useState(4)
  const animRef = useRef()

  // Memoized: these feed the draw hook's deps AND the draw callback calls
  // setState - fresh identities every render would loop the redraw forever
  const signal = useMemo(() => generateSampleSignal(signalSize), [signalSize])
  const decomposition = useMemo(() => multiLevelDecompose(signal, numLevels), [signal, numLevels])

  // Calculate energy distribution
  const energies = decomposition.map((d, i) => ({
    level: d.level,
    detailEnergy: calcEnergy(d.detail),
    approxEnergy: i === decomposition.length - 1 ? calcEnergy(d.approx) : 0
  }))
  const totalEnergy = calcEnergy(signal)
  const detailTotal = energies.reduce((s, e) => s + e.detailEnergy, 0)
  const approxTotal = energies[energies.length - 1]?.approxEnergy || 0

  // Animation
  useEffect(() => {
    if (animating) {
      animRef.current = setTimeout(() => {
        setAnimLevel(prev => {
          if (prev >= numLevels) {
            setAnimating(false)
            return prev
          }
          return prev + 1
        })
      }, 1000)
    }
    return () => clearTimeout(animRef.current)
  }, [animating, animLevel, numLevels])

  // Draw pyramid
  const [overlayLabels, setOverlayLabels] = useState([])
  const [canvasDims, setCanvasDims] = useState({ width: 650, height: 380 })

  const { canvasRef, containerRef } = useHiDPICanvas((ctx, { width, height }) => {
    ctx.fillStyle = canvasTheme().bg
    ctx.fillRect(0, 0, width, height)

    const { labels } = drawPyramid(ctx, width, height, signal, decomposition, animLevel, highlightLevel)
    setOverlayLabels(labels)
    setCanvasDims(prev => (prev.width === width && prev.height === height) ? prev : { width, height })
  }, [signal, decomposition, highlightLevel, animLevel])

  // A fresh click (idle or already finished) restarts the reveal from level
  // 0; clicking again mid-reveal pauses/resumes in place.
  const handlePlayPause = () => {
    if (!animating) {
      if (animLevel >= numLevels) setAnimLevel(0)
      setAnimating(true)
    } else {
      setAnimating(false)
    }
  }
  const handleStepForward = () => { setAnimating(false); setAnimLevel(prev => Math.min(numLevels, prev + 1)) }
  const handleStepBackward = () => { setAnimating(false); setAnimLevel(prev => Math.max(0, prev - 1)) }
  const handleReset = () => { setAnimating(false); setAnimLevel(0) }
  const handleComplete = () => { setAnimating(false); setAnimLevel(numLevels) }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      gap: '0.8rem',
      padding: compact ? '0.5rem' : '1rem',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center', flexShrink: 0 }}>
        <p style={{ margin: '0.3rem 0 0', fontSize: '0.95rem', color: 'var(--text-muted)' }}>
          Recursiv: A -&gt; {'{'}A, D{'}'} -&gt; aplicăm din nou pe aproximarea A
        </p>
      </div>

      {/* Main content */}
      <div style={{
        flex: 1,
        display: 'flex',
        gap: '1rem',
        minHeight: 0
      }}>
        {/* Left - pyramid visualization */}
        <div style={{
          flex: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem'
        }}>
          <div
            ref={containerRef}
            style={{ position: 'relative', width: '100%', minHeight: 380 }}
          >
            <canvas
              ref={canvasRef}
              style={{ display: 'block', borderRadius: '10px', border: '1px solid var(--border)' }}
            />

            {/* HTML Overlays for Text */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none'
            }}>
              {overlayLabels.map((label, i) => (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    left: `${(label.x / canvasDims.width) * 100}%`,
                    top: `${(label.y / canvasDims.height) * 100}%`,
                    transform: label.transform || 'translate(-50%, -50%)',
                    color: label.color,
                    fontSize: label.fontSize || '12px',
                    fontWeight: label.fontWeight || 'bold',
                    whiteSpace: 'nowrap',
                    textAlign: label.textAlign || 'center',
                    textShadow: '0 2px 4px rgba(0,0,0,0.8)'
                  }}
                >
                  {label.text}
                </div>
              ))}
            </div>
          </div>

          {/* Controls */}
          <div style={{
            display: 'flex',
            gap: '1rem',
            alignItems: 'center',
            justifyContent: 'center',
            flexWrap: 'wrap'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <label style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>Niveluri:</label>
              <input
                type="range"
                min="1"
                max="6"
                value={numLevels}
                disabled={animating}
                title={animating ? 'Oprește redarea pentru a schimba numărul de niveluri' : undefined}
                onChange={(e) => {
                  const n = parseInt(e.target.value)
                  setNumLevels(n)
                  setAnimLevel(n)
                }}
                style={{ width: '80px' }}
              />
              <span style={{ color: 'var(--text-body)', fontWeight: 'bold' }}>{numLevels}</span>
            </div>
            <AnimationControls
              isPlaying={animating}
              onPlayPause={handlePlayPause}
              onStepForward={handleStepForward}
              onStepBackward={handleStepBackward}
              onReset={handleReset}
              onComplete={handleComplete}
              canStepForward={animLevel < numLevels}
              canStepBackward={animLevel > 0}
              showJumpButtons={false}
              showCompleteButton={true}
              labels={{ complete: 'Salt la final' }}
              size="normal"
              layout="horizontal"
            />
          </div>

          {/* Energy distribution bar */}
          <div style={{
            padding: '0.6rem',
            background: 'rgba(255,255,255,0.03)',
            borderRadius: '8px'
          }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginBottom: '0.4rem' }}>
              Distribuția Energiei:
            </div>
            <div style={{
              display: 'flex',
              height: '25px',
              borderRadius: '4px',
              overflow: 'hidden'
            }}>
              <div
                style={{
                  width: `${(approxTotal / totalEnergy) * 100}%`,
                  background: '#00ff88',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#000',
                  fontSize: '0.95rem',
                  fontWeight: 'bold',
                  cursor: 'default'
                }}
                onMouseEnter={() => setHighlightLevel(numLevels)}
                onMouseLeave={() => setHighlightLevel(null)}
              >
                {(approxTotal / totalEnergy * 100) > 10 && `A${numLevels}: ${(approxTotal / totalEnergy * 100).toFixed(0)}%`}
              </div>
              {energies.slice().reverse().map((e, i) => (
                <div
                  key={e.level}
                  style={{
                    width: `${(e.detailEnergy / totalEnergy) * 100}%`,
                    background: `hsl(${320 - (e.level - 1) * 25}, 70%, ${isLight() ? 40 : 58}%)`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontSize: '0.95rem',
                    fontWeight: 'bold'
                  }}
                  onMouseEnter={() => setHighlightLevel(e.level)}
                  onMouseLeave={() => setHighlightLevel(null)}
                >
                  {(e.detailEnergy / totalEnergy * 100) > 5 && `D${e.level}`}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right - explanations */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          overflow: 'hidden'
        }}>
          {/* Key formula */}
          <div style={{
            padding: '0.3rem 0.7rem',
            background: 'rgba(255,215,0,0.08)',
            borderRadius: '8px',
            borderLeft: '4px solid var(--series-gold)'
          }}>
            <h4 style={{ margin: '0 0 0.2rem', color: 'var(--series-gold)', fontSize: '1rem' }}>
              Schema Recursivă
            </h4>
            <div style={{ fontSize: '1rem', textAlign: 'center' }}>
              <LaTeX math={String.raw`x \xrightarrow{\text{DWT}} \{A_1, D_1\} \xrightarrow{\text{DWT pe } A_1} \{A_2, D_2, D_1\}`} />
            </div>
            <p style={{ margin: '0.4rem 0 0', fontSize: '0.95rem', color: 'var(--text-muted)' }}>
              La fiecare nivel descompunem doar aproximarea A (în 2D, subbanda LL).
            </p>
          </div>

          {/* Why pyramid? */}
          <div style={{
            padding: '0.55rem 0.7rem',
            background: 'rgba(0,255,136,0.05)',
            borderRadius: '8px',
            borderLeft: '4px solid #00ff88'
          }}>
            <h4 style={{ margin: '0 0 0.4rem', color: 'var(--series-green)', fontSize: '1rem' }}>
              De ce piramidă?
            </h4>
            <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.95rem', color: 'var(--text-muted)' }}>
              <li>Dimensiunea scade exponențial: N -&gt; N/2 -&gt; N/4 -&gt; ...</li>
              <li>Energia se concentrează în aproximare</li>
              <li>Detaliile fine -&gt; niveluri mici, structura -&gt; niveluri mari</li>
            </ul>
          </div>

          {/* Compression insight */}
          <div style={{
            padding: '0.55rem 0.7rem',
            background: 'rgba(0,212,255,0.05)',
            borderRadius: '8px',
            borderLeft: '4px solid #00d4ff'
          }}>
            <h4 style={{ margin: '0 0 0.4rem', color: 'var(--primary)', fontSize: '1rem' }}>
              Compresie (JPEG2000)
            </h4>
            <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-muted)' }}>
              Majoritatea energiei este în <strong style={{color:'#00ff88'}}>A{numLevels}</strong> (<LaTeX math={String.raw`\approx`} />{(approxTotal/totalEnergy*100).toFixed(0)}%).
              Coeficienții mici din D pot fi eliminați cu pierdere minimă de calitate!
            </p>
          </div>

          {/* Levels breakdown */}
          <div style={{
            padding: '0.55rem 0.7rem',
            background: 'rgba(255,107,157,0.05)',
            borderRadius: '8px',
            borderLeft: '4px solid #ff6b9d'
          }}>
            <h4 style={{ margin: '0 0 0.4rem', color: 'var(--series-pink)', fontSize: '1rem' }}>
              Niveluri și Frecvențe
            </h4>
            <div style={{ fontSize: '0.95rem', color: 'var(--text-muted)' }}>
              {decomposition.map((d, i) => (
                <div 
                  key={d.level}
                  style={{
                    padding: '0.2rem 0',
                    background: highlightLevel === d.level ? 'rgba(255,255,255,0.05)' : 'transparent',
                    borderRadius: '4px'
                  }}
                  onMouseEnter={() => setHighlightLevel(d.level)}
                  onMouseLeave={() => setHighlightLevel(null)}
                >
                  <strong style={{ color: `hsl(${120 - i * 30}, 70%, ${isLight() ? 32 : 60}%)` }}>
                    Nivel {d.level}:
                  </strong>{' '}
                  {d.approxLength} coef. | Frecvențe: {Math.pow(2, numLevels - d.level)}-{Math.pow(2, numLevels - d.level + 1)} Hz (relativ)
                </div>
              ))}
            </div>
          </div>

          {/* Perfect reconstruction reminder */}
          <div style={{
            padding: '0.55rem 0.7rem',
            background: 'rgba(157,78,221,0.08)',
            borderRadius: '8px',
            borderLeft: '4px solid #9d4edd'
          }}>
            <h4 style={{ margin: '0 0 0.4rem', color: 'var(--series-purple)', fontSize: '1rem' }}>
              Reconstrucție
            </h4>
            <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-muted)' }}>
              Cu <strong>toți</strong> coeficienții (A<sub>{numLevels}</sub> + D<sub>1</sub>...D<sub>{numLevels}</sub>),
              semnalul original se recuperează <strong>perfect</strong>!
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Drawing function
// ============================================================================

function drawPyramid(ctx, W, H, signal, decomposition, showLevels, highlightLevel) {
  const leftMargin = 80
  const rightMargin = 30
  const topMargin = 25
  const bottomMargin = 35
  const labelWidth = 50  // Space for labels on right side
  
  const numLevelsToShow = Math.min(showLevels, decomposition.length)
  const totalRows = numLevelsToShow + 1  // +1 for original signal
  const rowHeight = (H - topMargin - bottomMargin) / totalRows
  const barHeight = Math.min(rowHeight * 0.6, 35)  // Max bar height, with spacing
  const maxWidth = W - leftMargin - rightMargin - labelWidth

  const labels = []

  // Draw original signal at top
  const signalY = topMargin + rowHeight / 2
  drawSignalBar(ctx, leftMargin, signalY - barHeight / 2, maxWidth, barHeight, signal, '#00d4ff', false)
  
  // Label for original
  labels.push({
    text: 'Original x[n]',
    x: leftMargin + maxWidth / 2,
    y: signalY - barHeight / 2 - 15,
    color: 'var(--primary)',
    fontSize: '16px'
  })

  // Draw each decomposition level
  for (let i = 0; i < numLevelsToShow; i++) {
    const d = decomposition[i]
    const rowY = topMargin + (i + 1.5) * rowHeight
    const y = rowY - barHeight / 2
    const isHighlighted = highlightLevel === d.level
    
    // Calculate widths proportional to coefficient count
    // Approximation takes proportionally more space
    const totalCoefs = d.approx.length + d.detail.length
    const approxRatio = d.approx.length / totalCoefs
    const gap = 15  // Gap between approx and detail bars
    
    const approxWidth = (maxWidth - gap) * approxRatio
    const detailWidth = maxWidth - gap - approxWidth

    // Draw approximation (green, left side)
    const approxX = leftMargin
    drawSignalBar(ctx, approxX, y, approxWidth, barHeight, d.approx, '#00ff88', isHighlighted)
    
    // Label for approximation (only on last visible level)
    if (i === numLevelsToShow - 1) {
      labels.push({
        text: `A${d.level}`,
        x: approxX + approxWidth / 2,
        y: y + barHeight + 14,
        color: 'var(--series-green)',
        fontSize: '16px'
      })
    }

    // Draw detail (pink/magenta, right side)
    const detailX = approxX + approxWidth + gap
    const detailColor = `hsl(${320 - i * 25}, 70%, ${isLight() ? 40 : 58}%)`
    drawSignalBar(ctx, detailX, y, detailWidth, barHeight, d.detail, detailColor, isHighlighted)
    
    // Label for detail (always show, right side of bar)
    labels.push({
      text: `D${d.level}`,
      x: detailX + detailWidth + 8,
      y: y + barHeight / 2,
      color: detailColor,
      fontSize: '16px',
      textAlign: 'left',
      transform: 'translate(0, -50%)'
    })

    // Draw flow arrows from previous level
    ctx.strokeStyle = canvasTheme().border
    ctx.lineWidth = 1
    ctx.setLineDash([3, 3])
    
    const prevY = rowY - rowHeight
    const prevBarBottom = prevY + barHeight / 2
    const currBarTop = y
    
    // Arrow from previous approx to current approx
    ctx.beginPath()
    ctx.moveTo(approxX + approxWidth / 2, prevBarBottom)
    ctx.lineTo(approxX + approxWidth / 2, currBarTop)
    ctx.stroke()
    
    // Arrow from previous approx to current detail
    ctx.beginPath()
    ctx.moveTo(approxX + approxWidth / 2, prevBarBottom)
    ctx.lineTo(detailX + detailWidth / 2, currBarTop)
    ctx.stroke()
    
    ctx.setLineDash([])

    // Level label on the left
    labels.push({
      text: `Nivel ${d.level}`,
      x: leftMargin - 12,
      y: rowY,
      color: 'var(--text-muted)',
      fontSize: '16px',
      textAlign: 'right',
      transform: 'translate(-100%, -50%)'
    })
  }

  // Structure description at bottom
  const sizesStr = [signal.length, ...decomposition.slice(0, numLevelsToShow).map(d => d.approxLength)].join(' -> ')
  labels.push({
    text: `Structură piramidală: ${sizesStr} (coeficienți aproximare)`,
    x: W / 2,
    y: H - 10,
    color: 'var(--text-muted)',
    fontSize: '16px'
  })

  return { labels }
}

function drawSignalBar(ctx, x, y, width, height, data, color, highlight) {
  // Background
  ctx.fillStyle = resolveColor(highlight ? 'rgba(255,255,255,0.1)' : canvasTheme().panel)
  ctx.fillRect(x, y, width, height)

  if (!data || data.length === 0) return

  // Draw mini signal visualization as bars
  const barWidth = Math.max(1, (width - 2) / data.length)
  const maxVal = Math.max(...data.map(Math.abs), 1)
  const innerPadding = 2
  
  ctx.fillStyle = resolveColor(color)
  data.forEach((val, i) => {
    const barX = x + innerPadding + i * barWidth
    const normalizedVal = Math.abs(val) / maxVal
    const barH = normalizedVal * (height - 4)
    const barY = y + height / 2 - barH / 2
    ctx.fillRect(barX, barY, Math.max(barWidth - 0.5, 1), Math.max(barH, 1))
  })

  // Border if highlighted
  if (highlight) {
    ctx.strokeStyle = resolveColor(color)
    ctx.lineWidth = 2
    ctx.strokeRect(x, y, width, height)
  }
}
