import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { LaTeXBlock } from './LaTeX'
import { canvasMetrics } from './shared/stage'
import { canvasTheme, CANVAS_FONT } from './shared/canvasTheme'

// Index of the "Suma Fourier (pătrat)" entry in PRESET_FUNCTIONS
const FOURIER_SUM_IDX = 6

const PRESET_FUNCTIONS = [
  { label: 'Sinusoidă simplă', expr: 'sin(2*pi*5*t)' },
  { label: 'Două frecvențe', expr: 'sin(2*pi*5*t) + sin(2*pi*12*t)' },
  { label: 'Trei frecvențe', expr: 'sin(2*pi*3*t) + 0.5*sin(2*pi*10*t) + 0.3*sin(2*pi*25*t)' },
  { label: 'Chirp', expr: 'sin(2*pi*(5 + 20*t)*t)' },
  { label: 'Puls Gaussian', expr: 'exp(-50*(t-0.5)**2) * sin(2*pi*20*t)' },
  { label: 'Undă pătrată', expr: 'sin(2*pi*5*t) + sin(2*pi*15*t)/3 + sin(2*pi*25*t)/5' },
  { label: 'Suma Fourier (pătrat)', expr: null }  // expr computed from harmonicCount
]

// Build partial Fourier sum for a square wave with fundamental 2 Hz.
// Uses only odd harmonics k = 1, 3, 5, ..., up to K.
function buildFourierSumExpr(K) {
  const terms = []
  for (let k = 1; k <= K; k += 2) {
    const freq = 2 * k  // k-th harmonic of 2 Hz fundamental
    if (k === 1) {
      terms.push(`sin(2*pi*${freq}*t)`)
    } else {
      terms.push(`sin(2*pi*${freq}*t)/${k}`)
    }
  }
  // (4/pi) * sum of terms
  return `(4/pi)*(${terms.join(' + ')})`
}

export default function FourierView({ api, compact = false }) {
  const [activePresetIndex, setActivePresetIndex] = useState(1)  // Default: doua frecvente
  const [isCustomMode, setIsCustomMode] = useState(false)
  const [customExpression, setCustomExpression] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showPhase, setShowPhase] = useState(false)
  // Harmonic build-up state (odd harmonics count; K is the highest odd k used)
  const [harmonicCount, setHarmonicCount] = useState(1)

  const canvasTimeRef = useRef()
  const canvasFreqRef = useRef()
  const canvasPhaseRef = useRef()
  const timeContainerRef = useRef()
  const freqContainerRef = useRef()
  const phaseContainerRef = useRef()

  const isFourierSumMode = !isCustomMode && activePresetIndex === FOURIER_SUM_IDX

  // Current expression being displayed
  const currentExpression = isCustomMode
    ? customExpression
    : isFourierSumMode
      ? buildFourierSumExpr(harmonicCount)
      : PRESET_FUNCTIONS[activePresetIndex].expr

  const fetchFourier = async (expr) => {
    setLoading(true)
    setError(null)
    try {
      const res = await axios.get(`${api}/fourier/function`, {
        params: { expression: expr, samples: 512, duration: 1.0 }
      })
      setData(res.data)
    } catch (err) {
      setError(err.response?.data?.detail || err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchFourier(currentExpression)
  }, [])

  // Redraw when data changes or on resize
  useEffect(() => {
    if (data) {
      drawTimeDomain()
      drawFrequencyDomain()
      if (showPhase) drawPhaseDomain()
    }
  }, [data, showPhase])

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      if (data) {
        drawTimeDomain()
        drawFrequencyDomain()
        if (showPhase) drawPhaseDomain()
      }
    }

    const resizeObserver = new ResizeObserver(handleResize)
    if (timeContainerRef.current) resizeObserver.observe(timeContainerRef.current)
    if (freqContainerRef.current) resizeObserver.observe(freqContainerRef.current)
    if (phaseContainerRef.current) resizeObserver.observe(phaseContainerRef.current)

    return () => resizeObserver.disconnect()
  }, [data, showPhase])

  // When harmonicCount changes while in Fourier sum mode, refetch
  useEffect(() => {
    if (isFourierSumMode) {
      fetchFourier(buildFourierSumExpr(harmonicCount))
    }
  }, [harmonicCount])

  const addHarmonic = () => {
    setHarmonicCount(prev => {
      const next = prev + 2  // next odd harmonic
      return next > 15 ? prev : next
    })
  }

  const resetHarmonics = () => {
    setHarmonicCount(1)
  }

  const drawTimeDomain = () => {
    const canvas = canvasTimeRef.current
    if (!canvas || !data) return

    // HiDPI support
    const { width, height, dpr } = canvasMetrics(canvas)

    if (width === 0 || height === 0) return

    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = width + 'px'
    canvas.style.height = height + 'px'

    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)

    const { t, signal } = data.time
    const margin = compact ? 52 : 58

    // Clear
    ctx.fillStyle = canvasTheme().bg
    ctx.fillRect(0, 0, width, height)

    // Grid - horizontal lines
    ctx.strokeStyle = canvasTheme().grid
    ctx.lineWidth = 1
    for (let i = 0; i <= 4; i++) {
      const y = margin + (i * (height - 2 * margin)) / 4
      ctx.beginPath()
      ctx.moveTo(margin, y)
      ctx.lineTo(width - 15, y)
      ctx.stroke()
    }

    // Grid - vertical lines
    const maxTime = t[t.length - 1]
    const timeTicks = [0, 0.2, 0.4, 0.6, 0.8, 1.0].filter(tick => tick <= maxTime)
    for (const tick of timeTicks) {
      const x = margin + (tick / maxTime) * (width - margin - 15)
      ctx.beginPath()
      ctx.moveTo(x, margin)
      ctx.lineTo(x, height - margin)
      ctx.stroke()
    }

    // X-axis tick labels. t=0 stays unlabeled: it shares the bottom-left
    // corner with the lowest Y tick, and the two collide when the Y value
    // is wide (e.g. "-2.0"); the gridline still marks the origin.
    ctx.fillStyle = canvasTheme().text
    ctx.font = `bold ${CANVAS_FONT.tick}px Inter, sans-serif`
    ctx.textAlign = 'center'
    for (const tick of timeTicks) {
      if (tick === 0) continue
      const x = margin + (tick / maxTime) * (width - margin - 15)
      ctx.fillText(tick.toFixed(1), x, height - margin + 14)
    }

    // Signal range
    const min = Math.min(...signal)
    const max = Math.max(...signal)
    const range = max - min || 1

    // Y-axis labels
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    const ampTicks = [0, 0.25, 0.5, 0.75, 1.0]
    for (const tick of ampTicks) {
      const y = height - margin - tick * (height - 2 * margin)
      const ampValue = min + tick * (max - min)
      ctx.fillText(ampValue.toFixed(1), margin - 6, y)
    }

    // Draw signal
    ctx.strokeStyle = canvasTheme().cyan
    ctx.lineWidth = 2
    ctx.beginPath()

    for (let i = 0; i < t.length; i++) {
      const x = margin + (t[i] / maxTime) * (width - margin - 15)
      const y = height - margin - ((signal[i] - min) / range) * (height - 2 * margin)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }

  const drawFrequencyDomain = () => {
    const canvas = canvasFreqRef.current
    if (!canvas || !data) return

    // HiDPI support
    const { width, height, dpr } = canvasMetrics(canvas)

    if (width === 0 || height === 0) return

    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = width + 'px'
    canvas.style.height = height + 'px'

    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)

    const { f, magnitude } = data.frequency
    const margin = compact ? 52 : 58

    // Clear
    ctx.fillStyle = canvasTheme().bg
    ctx.fillRect(0, 0, width, height)

    // Only show up to 50 Hz
    const maxFreq = 50
    const filteredIndices = f.map((freq, i) => ({ freq, mag: magnitude[i], i }))
      .filter(x => x.freq <= maxFreq && x.freq > 0)

    const rawMaxMag = Math.max(...filteredIndices.map(x => x.mag))

    // Round up to nice number for Y-axis
    const roundUpToNice = (val) => {
      if (val <= 0) return 1
      const mag = Math.pow(10, Math.floor(Math.log10(val)))
      const normalized = val / mag
      let nice
      if (normalized <= 1) nice = 1
      else if (normalized <= 2) nice = 2
      else if (normalized <= 5) nice = 5
      else nice = 10
      return nice * mag
    }
    const maxMag = roundUpToNice(rawMaxMag)

    // Peak detection
    const absoluteThreshold = rawMaxMag * 0.03
    const windowSize = 5
    const prominenceRatio = 1.5

    const significantPeaks = []
    for (let i = 0; i < filteredIndices.length; i++) {
      const curr = filteredIndices[i]
      if (curr.mag < absoluteThreshold) continue

      let neighborSum = 0
      let neighborCount = 0
      for (let j = Math.max(0, i - windowSize); j <= Math.min(filteredIndices.length - 1, i + windowSize); j++) {
        if (j !== i) {
          neighborSum += filteredIndices[j].mag
          neighborCount++
        }
      }
      const localAvg = neighborCount > 0 ? neighborSum / neighborCount : 0

      if (curr.mag > localAvg * prominenceRatio || curr.mag > rawMaxMag * 0.15) {
        significantPeaks.push(curr)
      }
    }

    // Grid - horizontal lines
    ctx.strokeStyle = canvasTheme().grid
    ctx.lineWidth = 1
    for (let i = 0; i <= 4; i++) {
      const y = margin + (i * (height - 2 * margin)) / 4
      ctx.beginPath()
      ctx.moveTo(margin, y)
      ctx.lineTo(width - 15, y)
      ctx.stroke()
    }

    // Grid - vertical lines
    const freqTicks = [0, 10, 20, 30, 40, 50]
    for (const tick of freqTicks) {
      const x = margin + (tick / maxFreq) * (width - margin - 15)
      ctx.beginPath()
      ctx.moveTo(x, margin)
      ctx.lineTo(x, height - margin)
      ctx.stroke()
    }

    // X-axis tick labels. freq=0 stays unlabeled - same corner-collision
    // reasoning as the time-domain plot.
    ctx.fillStyle = canvasTheme().text
    ctx.font = `bold ${CANVAS_FONT.tick}px Inter, sans-serif`
    ctx.textAlign = 'center'
    for (const tick of freqTicks) {
      if (tick === 0) continue
      const x = margin + (tick / maxFreq) * (width - margin - 15)
      ctx.fillText(`${tick}`, x, height - margin + 14)
    }

    // Y-axis labels
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    const ampTicks = [0, 0.25, 0.5, 0.75, 1.0]
    for (const tick of ampTicks) {
      const y = height - margin - tick * (height - 2 * margin)
      const ampValue = tick * maxMag
      const label = maxMag >= 100 ? ampValue.toFixed(0) : maxMag >= 10 ? ampValue.toFixed(1) : ampValue.toFixed(2)
      ctx.fillText(label, margin - 6, y)
    }

    // Draw bars
    ctx.fillStyle = canvasTheme().pink
    const barWidth = Math.max(4, Math.min(8, (width - 2 * margin) / 60))

    for (const { freq, mag } of significantPeaks) {
      const x = margin + (freq / maxFreq) * (width - margin - 15)
      const barHeight = (mag / maxMag) * (height - 2 * margin)
      ctx.fillRect(x - barWidth/2, height - margin - barHeight, barWidth, barHeight)
    }

    // Frequency labels on the tallest peaks only: that number IS the
    // pedagogical point of this plot. Capped count + a minimum pixel gap
    // keep dense spectra (chirp, many harmonics) from turning into clutter.
    const maxLabels = 6
    const minLabelGapPx = 40
    const labeledPeaks = significantPeaks
      .map(p => ({ ...p, x: margin + (p.freq / maxFreq) * (width - margin - 15) }))
      .filter(p => p.x > margin + 20)  // clear of the y-axis tick column
      .sort((a, b) => b.mag - a.mag)
      .slice(0, maxLabels)
      .sort((a, b) => a.x - b.x)
      .reduce((kept, p) => {
        const prev = kept[kept.length - 1]
        if (!prev || p.x - prev.x >= minLabelGapPx) kept.push(p)
        return kept
      }, [])

    ctx.fillStyle = canvasTheme().textStrong
    ctx.font = `bold ${CANVAS_FONT.tick}px Inter, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    const labelLeftBound = margin + 2
    const labelRightBound = width - 15 - 2
    for (const { freq, mag, x } of labeledPeaks) {
      const text = `${Math.round(freq)} Hz`
      // Clamp on the label's measured width so a peak near 50 Hz never
      // draws its text past the canvas edge (center-aligned text would
      // otherwise overshoot for the rightmost peaks).
      const halfLabelWidth = ctx.measureText(text).width / 2
      const labelX = Math.min(Math.max(x, labelLeftBound + halfLabelWidth), labelRightBound - halfLabelWidth)
      const barHeight = (mag / maxMag) * (height - 2 * margin)
      const labelY = Math.max(margin + 14, height - margin - barHeight - 6)
      ctx.fillText(text, labelX, labelY)
    }
  }

  const drawPhaseDomain = () => {
    const canvas = canvasPhaseRef.current
    if (!canvas || !data) return

    // HiDPI support
    const { width, height, dpr } = canvasMetrics(canvas)

    if (width === 0 || height === 0) return

    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = width + 'px'
    canvas.style.height = height + 'px'

    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)

    const { f, phase, magnitude } = data.frequency
    const margin = compact ? 52 : 58

    // Clear
    ctx.fillStyle = canvasTheme().bg
    ctx.fillRect(0, 0, width, height)

    // Only show up to 50 Hz
    const maxFreq = 50
    const filteredIndices = f.map((freq, i) => ({ freq, phase: phase[i], mag: magnitude[i], i }))
      .filter(x => x.freq <= maxFreq && x.freq > 0)

    const rawMaxMag = Math.max(...filteredIndices.map(x => x.mag))
    const absoluteThreshold = rawMaxMag * 0.03

    // Only show phase for significant peaks
    const significantPoints = filteredIndices.filter(x => x.mag > absoluteThreshold)

    // Grid - horizontal lines at -pi, -pi/2, 0, pi/2, pi
    ctx.strokeStyle = canvasTheme().grid
    ctx.lineWidth = 1
    const phaseTicks = [-Math.PI, -Math.PI/2, 0, Math.PI/2, Math.PI]
    for (const tick of phaseTicks) {
      const y = margin + ((Math.PI - tick) / (2 * Math.PI)) * (height - 2 * margin)
      ctx.beginPath()
      ctx.moveTo(margin, y)
      ctx.lineTo(width - 15, y)
      ctx.stroke()
    }

    // Grid - vertical lines
    const freqTicks = [0, 10, 20, 30, 40, 50]
    for (const tick of freqTicks) {
      const x = margin + (tick / maxFreq) * (width - margin - 15)
      ctx.beginPath()
      ctx.moveTo(x, margin)
      ctx.lineTo(x, height - margin)
      ctx.stroke()
    }

    // X-axis tick labels. freq=0 stays unlabeled - same corner-collision
    // reasoning as the time-domain plot.
    ctx.fillStyle = canvasTheme().text
    ctx.font = `bold ${CANVAS_FONT.tick}px Inter, sans-serif`
    ctx.textAlign = 'center'
    for (const tick of freqTicks) {
      if (tick === 0) continue
      const x = margin + (tick / maxFreq) * (width - margin - 15)
      ctx.fillText(`${tick}`, x, height - margin + 14)
    }

    // Y-axis labels (phase: -pi to pi)
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    const phaseLabels = [
      { val: Math.PI, label: 'pi' },
      { val: Math.PI/2, label: 'pi/2' },
      { val: 0, label: '0' },
      { val: -Math.PI/2, label: '-pi/2' },
      { val: -Math.PI, label: '-pi' }
    ]
    for (const { val, label } of phaseLabels) {
      const y = margin + ((Math.PI - val) / (2 * Math.PI)) * (height - 2 * margin)
      ctx.fillText(label, margin - 6, y)
    }

    // Draw phase points as circles
    ctx.fillStyle = canvasTheme().purple
    for (const { freq, phase: ph } of significantPoints) {
      const x = margin + (freq / maxFreq) * (width - margin - 15)
      const y = margin + ((Math.PI - ph) / (2 * Math.PI)) * (height - 2 * margin)
      ctx.beginPath()
      ctx.arc(x, y, 5, 0, 2 * Math.PI)
      ctx.fill()
    }
  }

  // Harmonic counter label: count of odd harmonics added so far
  // harmonicCount is the highest odd k, so number of harmonics = ceil(harmonicCount/2)
  const harmonicsAdded = Math.ceil(harmonicCount / 2)
  const maxHarmonicsReached = harmonicCount >= 15

  return (
    <div className={`fourier-view ${compact ? 'fourier-compact' : ''}`}>
      {/* Header - hidden in compact mode */}
      {!compact && (
        <div className="panel panel-compact">
          <h2>Transformata Fourier</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
            Descompune un semnal în sumă de sinusoide de frecvențe diferite
          </p>
          <div className="math-block" style={{ margin: '0' }}>
            <LaTeXBlock math={String.raw`F(\omega) = \int_{-\infty}^{\infty} f(t) \cdot e^{-i\omega t} \, dt`} />
          </div>
        </div>
      )}

      {error && <div className="error">{error}</div>}

      {/* Only show loading on initial load when no data exists */}
      {loading && !data && (
        <div className="loading">
          <div className="spinner"></div>
          Calculez transformata Fourier...
        </div>
      )}

      {/* Compact mode: Side controls + plots + bottom equation */}
      {compact ? (
        <div className="fourier-compact-layout">
          {/* Main content: plots + equation */}
          <div className="fourier-main-content">
            {/* Plots */}
            {data && (
              <div className="fourier-plots">
                <div className="plot-container-with-overlay" ref={timeContainerRef}>
                  <canvas ref={canvasTimeRef} />
                  <div className="plot-title-overlay cyan">Domeniul Timp</div>
                  <div className="plot-axis-label y-label">f(t)</div>
                  <div className="plot-axis-label x-label">t (s)</div>
                </div>

                {showPhase ? (
                  <div className="plot-container-with-overlay" ref={phaseContainerRef}>
                    <canvas ref={canvasPhaseRef} />
                    <div className="plot-title-overlay purple">Spectru Faza</div>
                    <div className="plot-axis-label y-label">F(f)</div>
                    <div className="plot-axis-label x-label">f (Hz)</div>
                  </div>
                ) : (
                  <div className="plot-container-with-overlay" ref={freqContainerRef}>
                    <canvas ref={canvasFreqRef} />
                    <div className="plot-title-overlay pink">Spectru Magnitudine</div>
                    <div className="plot-axis-label y-label">|F(f)|</div>
                    <div className="plot-axis-label x-label">f (Hz)</div>
                  </div>
                )}
              </div>
            )}

            {/* Fourier sum mode: harmonic controls + caption */}
            {isFourierSumMode && (
              <div className="fourier-harmonic-bar">
                <div className="harmonic-controls">
                  <span className="harmonic-label">
                    Armonici: <strong>{harmonicsAdded}</strong> (k=1..{harmonicCount})
                  </span>
                  <button
                    className="harmonic-btn"
                    onClick={addHarmonic}
                    disabled={maxHarmonicsReached}
                    aria-label="Adaugă următoarea armonică impară"
                  >
                    Adaugă armonică
                  </button>
                  <button
                    className="harmonic-btn harmonic-reset"
                    onClick={resetHarmonics}
                    aria-label="Resetează la o singură armonică"
                  >
                    Reset
                  </button>
                  <input
                    type="range"
                    min="1"
                    max="15"
                    step="2"
                    value={harmonicCount}
                    onChange={e => setHarmonicCount(parseInt(e.target.value))}
                    className="harmonic-slider"
                    aria-label="Numar armonici"
                  />
                </div>
                <p className="fourier-caption">
                  Fiecare armonică adăugată apropie suma de unda pătrată: orice semnal = sumă de
                  sinusoide. La discontinuități rămâne supraoscilația Gibbs (~9%): nu dispare cu
                  mai multe armonici, doar se îngustează.
                </p>
              </div>
            )}

            {/* Bottom equation display */}
            <div className="fourier-equation-bar">
              {isCustomMode ? (
                <div className="custom-input-row">
                  <span>f(t) =</span>
                  <input
                    type="text"
                    value={customExpression}
                    onChange={e => setCustomExpression(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && customExpression.trim()) {
                        fetchFourier(customExpression)
                      }
                    }}
                    placeholder="introduceți funcția..."
                  />
                  <button
                    onClick={() => customExpression.trim() && fetchFourier(customExpression)}
                    disabled={loading || !customExpression.trim()}
                  >
                    {loading ? '...' : '>'}
                  </button>
                </div>
              ) : (
                <code>f(t) = {currentExpression}</code>
              )}
            </div>
          </div>

          {/* Side controls - RIGHT */}
          <div className="fourier-side-controls">
            {/* Spectrum toggle */}
            <div className="spectrum-toggle">
              <button
                className={!showPhase ? 'active' : ''}
                onClick={() => setShowPhase(false)}
                aria-label="Spectru Magnitudine"
              >
                |F|
              </button>
              <button
                className={showPhase ? 'active' : ''}
                onClick={() => setShowPhase(true)}
                aria-label="Spectru Faza"
              >
                F
              </button>
            </div>

            <h4>Funcții preset</h4>
            <div className="preset-buttons-vertical">
              {PRESET_FUNCTIONS.map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    if (!isCustomMode && activePresetIndex === idx) return
                    setActivePresetIndex(idx)
                    setIsCustomMode(false)
                    if (idx !== FOURIER_SUM_IDX) {
                      fetchFourier(p.expr)
                    } else {
                      fetchFourier(buildFourierSumExpr(harmonicCount))
                    }
                  }}
                  className={!isCustomMode && activePresetIndex === idx ? 'active' : ''}
                >
                  {p.label}
                </button>
              ))}
              <button
                onClick={() => {
                  if (isCustomMode) return
                  setIsCustomMode(true)
                  const exprToUse = customExpression.trim() || currentExpression
                  setCustomExpression(exprToUse)
                  fetchFourier(exprToUse)
                }}
                className={isCustomMode ? 'active' : ''}
              >
                Personalizat
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Full mode layout */
        <>
          {/* Visualization */}
          {data && (
            <div className="fourier-plots">
              <div className="plot-container-with-overlay" ref={timeContainerRef}>
                <canvas ref={canvasTimeRef} />
                <div className="plot-title-overlay cyan">Domeniul Timp</div>
                <div className="plot-axis-label y-label">f(t)</div>
                <div className="plot-axis-label x-label">t (s)</div>
              </div>

              <div className="plot-container-with-overlay" ref={freqContainerRef}>
                <canvas ref={canvasFreqRef} />
                <div className="plot-title-overlay pink">Spectru de frecvență</div>
                <div className="plot-axis-label y-label">|F(f)|</div>
                <div className="plot-axis-label x-label">f (Hz)</div>
              </div>
            </div>
          )}

          {/* Fourier sum mode controls - full mode */}
          {isFourierSumMode && (
            <div className="panel fourier-harmonic-panel">
              <div className="harmonic-controls-full">
                <span className="harmonic-label">
                  Armonici: <strong>{harmonicsAdded}</strong> (k impare pana la {harmonicCount})
                </span>
                <button
                  onClick={addHarmonic}
                  disabled={maxHarmonicsReached}
                >
                  Adaugă armonică
                </button>
                <button onClick={resetHarmonics}>Reset</button>
                <input
                  type="range"
                  min="1"
                  max="15"
                  step="2"
                  value={harmonicCount}
                  onChange={e => setHarmonicCount(parseInt(e.target.value))}
                  style={{ width: '150px' }}
                />
              </div>
              <p className="fourier-caption">
                Fiecare armonică adăugată apropie suma de unda pătrată: orice semnal = sumă de sinusoide.
              </p>
            </div>
          )}

          {/* Controls - full mode */}
          <div className="panel controls-panel">
            <div style={{
              textAlign: 'center',
              padding: '0.5rem 1rem',
              background: isCustomMode ? 'rgba(255, 107, 157, 0.1)' : 'rgba(0, 217, 255, 0.1)',
              borderRadius: '6px',
              marginBottom: '0.75rem',
              border: `1px solid ${isCustomMode ? 'rgba(255, 107, 157, 0.3)' : 'rgba(0, 217, 255, 0.3)'}`
            }}>
              {isCustomMode ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                  <span style={{ color: 'var(--series-pink)', fontFamily: 'monospace' }}>f(t) =</span>
                  <input
                    type="text"
                    value={customExpression}
                    onChange={e => setCustomExpression(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && customExpression.trim()) {
                        fetchFourier(customExpression)
                      }
                    }}
                    placeholder="introduceți funcția..."
                    style={{
                      flex: 1,
                      maxWidth: '400px',
                      padding: '0.25rem 0.5rem',
                      fontFamily: 'monospace',
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid rgba(255, 107, 157, 0.5)',
                      borderRadius: '4px',
                      color: 'var(--series-pink)'
                    }}
                    autoFocus
                  />
                  <button
                    onClick={() => customExpression.trim() && fetchFourier(customExpression)}
                    disabled={loading || !customExpression.trim()}
                  >
                    {loading ? '...' : '>'}
                  </button>
                </div>
              ) : (
                <code style={{ color: 'var(--primary)', fontFamily: 'monospace' }}>
                  f(t) = {currentExpression}
                </code>
              )}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center', justifyContent: 'center' }}>
              {PRESET_FUNCTIONS.map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    if (!isCustomMode && activePresetIndex === idx) return
                    setActivePresetIndex(idx)
                    setIsCustomMode(false)
                    if (idx !== FOURIER_SUM_IDX) {
                      fetchFourier(p.expr)
                    } else {
                      fetchFourier(buildFourierSumExpr(harmonicCount))
                    }
                  }}
                  className={!isCustomMode && activePresetIndex === idx ? 'active' : ''}
                >
                  {p.label}
                </button>
              ))}
              <button
                onClick={() => {
                  if (isCustomMode) return
                  setIsCustomMode(true)
                  const exprToUse = customExpression.trim() || currentExpression
                  setCustomExpression(exprToUse)
                  fetchFourier(exprToUse)
                }}
                className={isCustomMode ? 'active' : ''}
              >
                Personalizată
              </button>
            </div>
          </div>
        </>
      )}

      {/* Details section - hidden in compact mode */}
      {!compact && (
        <div className="panel details-panel">
          <h3>Interpretare</h3>

          <div className="image-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
            <div className="info-box">
              <h4>Spike-uri in Spectru</h4>
              <p>
                Fiecare "spike" (varf) in spectru corespunde unei componente sinusoidale
                din semnal. Inaltimea spike-ului = amplitudinea componentei.
              </p>
            </div>

            <div className="info-box">
              <h4>Frecvență vs timp</h4>
              <p>
                Un semnal cu frecvență constantă - vârf ascuțit.<br/>
                Un chirp (frecvență variabilă) - spectru împrăștiat.
              </p>
            </div>
          </div>

          <div className="info-box warning" style={{ marginTop: '1rem' }}>
            <strong>Limitarea Fourier:</strong> spectrul ne arată frecvențele prezente,
            dar nu <em>cand</em> apar in semnal. Pentru semnale non-stationare (ex: chirp),
            această informație se pierde.
          </div>
        </div>
      )}
    </div>
  )
}
