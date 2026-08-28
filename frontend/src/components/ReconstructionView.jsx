import { useState, useEffect, useMemo } from 'react'
import LaTeX from './LaTeX'
import AnimationControls from './shared/AnimationControls'
import { CheckIcon } from './shared/TransportIcons'
import Cite from './shared/Cite'
import '../styles/views/reconstruction.css'
import useHiDPICanvas from './shared/useHiDPICanvas'
import { canvasTheme, resolveColor } from './shared/canvasTheme'

/**
 * ReconstructionView - Perfect Reconstruction Demonstration
 * Shows that DWT is lossless and the original signal can be recovered exactly.
 * Closes the Mallat arc on two sources: a 1D toy signal, and a real image
 * (reusing the same read-only sample-image endpoints as the other demos in
 * this section) so the loop opened on 2D theory (slides 27/29) closes on a
 * reconstructed image, not just a signal.
 */

// Forward transform (decomposition). Haar butterfly: LP is the pair average,
// HP is the pair difference, both scaled by 1/sqrt(2) for orthonormality.
const decompose = (signal) => {
  const approx = []
  const detail = []
  for (let i = 0; i < signal.length; i += 2) {
    const a = signal[i]
    const b = i + 1 < signal.length ? signal[i + 1] : signal[i]
    approx.push((a + b) / Math.sqrt(2))
    detail.push((a - b) / Math.sqrt(2))
  }
  return { approx, detail }
}

// Inverse transform (reconstruction)
const reconstruct = (approx, detail) => {
  const result = []
  for (let i = 0; i < approx.length; i++) {
    const a = approx[i]
    const d = detail[i]
    // Inverse Haar: x[2k] = (a + d) / sqrt(2), x[2k+1] = (a - d) / sqrt(2)
    result.push((a + d) / Math.sqrt(2))
    result.push((a - d) / Math.sqrt(2))
  }
  return result
}

// Multi-level decomposition
const multiDecompose = (signal, levels) => {
  const results = []
  let current = [...signal]
  for (let l = 0; l < levels; l++) {
    if (current.length < 2) break
    const { approx, detail } = decompose(current)
    results.push({ level: l + 1, approx: [...approx], detail: [...detail] })
    current = approx
  }
  return results
}

// Multi-level reconstruction
const multiReconstruct = (decomp) => {
  if (decomp.length === 0) return []

  // Start with the deepest approximation
  let current = [...decomp[decomp.length - 1].approx]

  // Reconstruct level by level, from deepest to shallowest
  for (let i = decomp.length - 1; i >= 0; i--) {
    current = reconstruct(current, decomp[i].detail)
  }

  return current
}

// ============================================================================
// 2D extension (image mode): filter+decimate rows, then columns (transpose,
// reuse the 1D pass above, transpose back) - the same row/column split
// MallatUnifiedView uses for its forward-only pyramid, plus the inverse.
// ============================================================================

const transpose = (m) => m[0].map((_, c) => m.map(row => row[c]))

const decompose2D = (matrix) => {
  const L = matrix.map(row => decompose(row).approx)
  const H = matrix.map(row => decompose(row).detail)
  const colPass = (m) => {
    const t = transpose(m)
    return {
      approx: transpose(t.map(col => decompose(col).approx)),
      detail: transpose(t.map(col => decompose(col).detail))
    }
  }
  const { approx: LL, detail: LH } = colPass(L)
  const { approx: HL, detail: HH } = colPass(H)
  return { LL, LH, HL, HH }
}

const reconstruct2D = (LL, LH, HL, HH) => {
  const colSynth = (approx, detail) => {
    const ta = transpose(approx)
    const td = transpose(detail)
    return transpose(ta.map((col, j) => reconstruct(col, td[j])))
  }
  const L = colSynth(LL, LH)
  const H = colSynth(HL, HH)
  return L.map((row, i) => reconstruct(row, H[i]))
}

const multiDecompose2D = (matrix, levels) => {
  const results = []
  let current = matrix
  for (let l = 0; l < levels; l++) {
    if (current.length < 2 || current[0].length < 2) break
    const { LL, LH, HL, HH } = decompose2D(current)
    results.push({ level: l + 1, LL, LH, HL, HH })
    current = LL
  }
  return results
}

const multiReconstruct2D = (decomp) => {
  if (decomp.length === 0) return []
  let current = decomp[decomp.length - 1].LL
  for (let i = decomp.length - 1; i >= 0; i--) {
    current = reconstruct2D(current, decomp[i].LH, decomp[i].HL, decomp[i].HH)
  }
  return current
}

const quantizeMatrix = (m, bits) => m.map(row => row.map(v => Math.round(v * (1 << bits)) / (1 << bits)))
const quantizeDecomp2D = (decomp, bits) => decomp.map(d => ({
  ...d,
  LL: quantizeMatrix(d.LL, bits),
  LH: quantizeMatrix(d.LH, bits),
  HL: quantizeMatrix(d.HL, bits),
  HH: quantizeMatrix(d.HH, bits)
}))

// Generate test signals
const SIGNALS = {
  step: { name: 'Treaptă', generate: (n) => Array.from({length: n}, (_, i) => i < n/2 ? 50 : 200) },
  ramp: { name: 'Rampă', generate: (n) => Array.from({length: n}, (_, i) => 50 + 150 * i / n) },
  sine: { name: 'Sinusoidă', generate: (n) => Array.from({length: n}, (_, i) => 128 + 80 * Math.sin(4 * Math.PI * i / n)) },
  pulse: { name: 'Puls', generate: (n) => Array.from({length: n}, (_, i) => (i > n*0.3 && i < n*0.7) ? 200 : 80) },
  random: { name: 'Random', generate: (n) => Array.from({length: n}, () => 50 + Math.random() * 150) }
}

const STAGE_LABELS = [
  { step: 0, label: '1. Original', color: 'var(--primary)' },
  { step: 1, label: '2. Coeficienți DWT', color: 'var(--series-gold)' },
  { step: 2, label: '3. Reconstruit', color: 'var(--series-green)' }
]

export default function ReconstructionView({ compact = false, api = '/api' }) {
  const [signalType, setSignalType] = useState('step')
  const [signalSize, setSignalSize] = useState(16)
  const [numLevels, setNumLevels] = useState(2)
  const [animStep, setAnimStep] = useState(0) // 0 = original, 1 = decomposed, 2 = reconstructed
  const [isPlaying, setIsPlaying] = useState(false)
  // Lossy simulation defaults ON: it is the clearest bridge to the
  // compression chapter, easy to miss if the viewer has to opt in first.
  const [quantize, setQuantize] = useState(true)
  const [quantBits, setQuantBits] = useState(8)
  const [overlayLabels, setOverlayLabels] = useState([])
  const [canvasDims, setCanvasDims] = useState({ width: 650, height: 350 })

  // Source: the original 1D toy signal, or a real sample image - closes the
  // loop the section opened on 2D image theory (slides 27/29).
  const [sourceMode, setSourceMode] = useState('signal') // 'signal' | 'image'
  const [apiImages, setApiImages] = useState([])
  const [selectedImage, setSelectedImage] = useState('')
  const [imagePixels, setImagePixels] = useState(null)

  useEffect(() => {
    fetch(`${api}/sample-images`)
      .then(r => r.json())
      .then(d => {
        setApiImages(d.images || [])
        if (d.images?.length > 0) setSelectedImage(d.images[0].id)
      })
      .catch(() => {})
  }, [api])

  useEffect(() => {
    if (sourceMode !== 'image' || !selectedImage) return
    fetch(`${api}/sample-images/${selectedImage}/grayscale?size=64`)
      .then(r => r.json())
      .then(d => setImagePixels(d.pixels))
      .catch(() => setImagePixels(null))
  }, [sourceMode, selectedImage, api])

  // Generate signal.
  // Memoized: these feed the draw hook's deps AND the draw callback calls
  // setState - fresh identities every render would loop the redraw forever.
  const originalSignal = useMemo(() => SIGNALS[signalType].generate(signalSize), [signalType, signalSize])

  // Decompose
  const decomposition = useMemo(() => multiDecompose(originalSignal, numLevels), [originalSignal, numLevels])

  // Apply quantization if enabled (lossy compression simulation)
  const quantizedDecomp = useMemo(() => (
    quantize
      ? decomposition.map(d => ({
          ...d,
          approx: d.approx.map(v => Math.round(v * (1 << quantBits)) / (1 << quantBits)),
          detail: d.detail.map(v => Math.round(v * (1 << quantBits)) / (1 << quantBits))
        }))
      : decomposition
  ), [quantize, quantBits, decomposition])

  // Reconstruct
  const reconstructed = useMemo(() => multiReconstruct(quantizedDecomp), [quantizedDecomp])

  const error = useMemo(
    () => originalSignal.map((v, i) => Math.abs(v - (reconstructed[i] || 0))),
    [originalSignal, reconstructed]
  )

  // Same pipeline, on the real image
  const imageDecomposition = useMemo(
    () => (imagePixels ? multiDecompose2D(imagePixels, numLevels) : []),
    [imagePixels, numLevels]
  )
  const imageQuantizedDecomp = useMemo(() => (
    quantize ? quantizeDecomp2D(imageDecomposition, quantBits) : imageDecomposition
  ), [quantize, quantBits, imageDecomposition])
  const imageReconstructed = useMemo(
    () => (imageQuantizedDecomp.length ? multiReconstruct2D(imageQuantizedDecomp) : []),
    [imageQuantizedDecomp]
  )
  const imageError = useMemo(() => {
    if (!imagePixels || !imageReconstructed.length) return []
    const flatOriginal = imagePixels.flat()
    const flatRecon = imageReconstructed.flat()
    return flatOriginal.map((v, i) => Math.abs(v - (flatRecon[i] || 0)))
  }, [imagePixels, imageReconstructed])

  const hasData = sourceMode === 'signal' || imagePixels !== null
  const activeError = sourceMode === 'image' ? imageError : error
  const maxError = activeError.length ? Math.max(...activeError) : 0
  const mse = activeError.length ? activeError.reduce((s, e) => s + e * e, 0) / activeError.length : 0
  const psnr = mse > 0 ? 10 * Math.log10(255 * 255 / mse) : Infinity

  // Draw visualization
  const { canvasRef, containerRef } = useHiDPICanvas((ctx, { width, height }) => {
    ctx.fillStyle = canvasTheme().bg
    ctx.fillRect(0, 0, width, height)

    const { labels } = sourceMode === 'image'
      ? drawReconstructionImage(ctx, width, height, imagePixels, imageDecomposition, imageReconstructed, animStep)
      : drawReconstruction(ctx, width, height, originalSignal, decomposition, reconstructed, animStep, quantize, error)
    setOverlayLabels(labels)
    setCanvasDims(prev => (prev.width === width && prev.height === height) ? prev : { width, height })
  }, [sourceMode, originalSignal, decomposition, reconstructed, animStep, quantize, error, imagePixels, imageDecomposition, imageReconstructed])

  // Open on the last stage. The point of this screen is that the reconstruction
  // lands back on the original, and at stage 0 the panel showed one bar over an
  // empty half-screen. Redare replays the three stages from the start.
  useEffect(() => {
    setAnimStep(2)
    setIsPlaying(false)
  }, [sourceMode, signalType, numLevels])

  // Playback through the three stages (Original -> Coeficienți -> Reconstruit)
  useEffect(() => {
    if (!isPlaying) return
    const t = setTimeout(() => {
      setAnimStep(prev => {
        if (prev >= 2) { setIsPlaying(false); return prev }
        return prev + 1
      })
    }, 1400)
    return () => clearTimeout(t)
  }, [isPlaying, animStep])

  const jumpToStage = (step) => { setIsPlaying(false); setAnimStep(step) }

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
        <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-muted)' }}>
          DWT este o transformată fără pierderi - semnalul original se recuperează exact
        </p>
      </div>

      {/* Main content */}
      <div style={{
        flex: 1,
        display: 'flex',
        gap: '1rem',
        minHeight: 0
      }}>
        {/* Left - visualization */}
        <div style={{
          flex: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem'
        }}>
          {/* Canvas with HTML label overlays */}
          <div
            ref={containerRef}
            style={{ position: 'relative', width: '100%', minHeight: 350 }}
          >
            <canvas
              ref={canvasRef}
              style={{ display: 'block', borderRadius: '10px', border: '1px solid var(--border)' }}
            />

            {/* HTML Labels - positioned as overlays */}
            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
              {overlayLabels.map((label, i) => (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    left: `${(label.x / canvasDims.width) * 100}%`,
                    top: `${(label.y / canvasDims.height) * 100}%`,
                    color: label.color,
                    fontWeight: 'bold',
                    fontSize: '16px',
                    textShadow: '1px 1px 2px rgba(0,0,0,0.8)',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {label.text}
                </div>
              ))}
            </div>
          </div>

          {/* Playback controls - real animated playback, consistent with the
              Mallat demos on the neighbouring slides */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <AnimationControls
              isPlaying={isPlaying}
              onPlayPause={() => {
                if (!isPlaying && animStep >= 2) setAnimStep(0)
                setIsPlaying(prev => !prev)
              }}
              onStepForward={() => { setIsPlaying(false); setAnimStep(prev => Math.min(2, prev + 1)) }}
              onStepBackward={() => { setIsPlaying(false); setAnimStep(prev => Math.max(0, prev - 1)) }}
              onReset={() => { setIsPlaying(false); setAnimStep(0) }}
              canStepForward={animStep < 2}
              canStepBackward={animStep > 0}
              showJumpButtons={false}
              size="normal"
              layout="horizontal"
            />
          </div>

          {/* Direct jump to a named stage */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
            {STAGE_LABELS.map(({ step, label, color }) => (
              <button
                key={step}
                onClick={() => jumpToStage(step)}
                style={{
                  padding: '0.5rem 1rem',
                  background: animStep === step ? color : 'var(--bg-elevated)',
                  border: animStep === step ? `2px solid ${color}` : '2px solid #555',
                  borderRadius: '8px',
                  color: animStep === step ? '#000' : 'var(--text-muted)',
                  cursor: 'pointer',
                  fontWeight: animStep === step ? '600' : '400',
                  fontSize: '0.95rem',
                  transition: 'all 0.2s'
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Error display */}
          {hasData && (
            <div style={{
              padding: '0.6rem 1rem',
              background: quantize ? 'rgba(255,107,157,0.1)' : 'rgba(0,255,136,0.1)',
              borderRadius: '8px',
              borderLeft: `4px solid ${quantize ? 'var(--series-pink)' : 'var(--series-green)'}`,
              display: 'flex',
              justifyContent: 'space-around',
              alignItems: 'center'
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.95rem', color: 'var(--text-muted)' }}>Eroare Max</div>
                <div style={{
                  fontSize: '1.2rem',
                  fontWeight: 'bold',
                  color: maxError < 0.001 ? 'var(--series-green)' : maxError < 1 ? '#ffd700' : 'var(--series-pink)'
                }}>
                  {maxError < 0.001 ? <LaTeX math={String.raw`\approx 0`} /> : maxError.toFixed(4)}
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.95rem', color: 'var(--text-muted)' }}>MSE</div>
                <div style={{
                  fontSize: '1.2rem',
                  fontWeight: 'bold',
                  color: mse < 0.001 ? 'var(--series-green)' : mse < 1 ? '#ffd700' : 'var(--series-pink)'
                }}>
                  {mse < 0.001 ? <LaTeX math={String.raw`\approx 0`} /> : mse.toFixed(4)}
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.95rem', color: 'var(--text-muted)' }}>PSNR</div>
                <div style={{
                  fontSize: '1.2rem',
                  fontWeight: 'bold',
                  color: psnr > 100 ? 'var(--series-green)' : psnr > 40 ? '#ffd700' : 'var(--series-pink)'
                }}>
                  {psnr > 100 ? '> 100 dB' : `${psnr.toFixed(1)} dB`}
                </div>
                {psnr > 100 && (
                  <div style={{ fontSize: '0.95rem', color: 'var(--text-muted)' }}>precizia mașinii</div>
                )}
              </div>
              <div style={{
                padding: '0.4rem 0.8rem',
                background: quantize ? 'rgba(255,107,157,0.2)' : 'rgba(0,255,136,0.2)',
                borderRadius: '6px',
                color: quantize ? 'var(--series-pink)' : 'var(--series-green)',
                fontWeight: 'bold',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem'
              }}>
                {quantize ? 'Cu pierderi (lossy)' : <><CheckIcon size={14} /> Fără pierderi (lossless)</>}
              </div>
            </div>
          )}
        </div>

        {/* Right - controls and explanation */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          overflow: 'auto'
        }}>
          {/* Source + signal/image controls */}
          <div style={{
            padding: '0.55rem 0.8rem',
            background: 'rgba(255,255,255,0.03)',
            borderRadius: '8px'
          }}>
            <h4 style={{ margin: '0 0 0.5rem', color: 'var(--primary)', fontSize: '0.95rem' }}>
              Sursă
            </h4>
            <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.6rem' }}>
              {[{ id: 'signal', label: 'Semnal 1D' }, { id: 'image', label: 'Imagine' }].map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => { setSourceMode(id); setAnimStep(0); setIsPlaying(false) }}
                  style={{
                    flex: 1,
                    padding: '0.35rem 0.5rem',
                    background: sourceMode === id ? 'var(--primary)' : 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    color: sourceMode === id ? '#000' : 'var(--text-body)',
                    fontWeight: sourceMode === id ? '600' : '400',
                    cursor: 'pointer',
                    fontSize: '0.95rem'
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {sourceMode === 'signal' ? (
                <div>
                  <label style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>Tip semnal:</label>
                  <select
                    value={signalType}
                    onChange={(e) => setSignalType(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.3rem',
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      color: 'var(--text-body)',
                      fontSize: '0.95rem'
                    }}
                  >
                    {Object.entries(SIGNALS).map(([key, s]) => (
                      <option key={key} value={key}>{s.name}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>Imagine:</label>
                  <select
                    value={selectedImage}
                    onChange={(e) => setSelectedImage(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.3rem',
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      color: 'var(--text-body)',
                      fontSize: '0.95rem'
                    }}
                  >
                    {apiImages.slice(0, 10).map(img => (
                      <option key={img.id} value={img.id}>{img.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <label style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>Niveluri: {numLevels}</label>
                <input
                  type="range"
                  min="1"
                  max="4"
                  value={numLevels}
                  onChange={(e) => setNumLevels(parseInt(e.target.value))}
                  style={{ flex: 1 }}
                />
              </div>
            </div>
          </div>

          {/* Quantization control (lossy simulation) */}
          <div style={{
            padding: '0.55rem 0.8rem',
            background: quantize ? 'rgba(255,107,157,0.08)' : 'rgba(255,255,255,0.03)',
            borderRadius: '8px',
            borderLeft: `3px solid ${quantize ? 'var(--series-pink)' : 'var(--border)'}`
          }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              cursor: 'pointer',
              color: quantize ? 'var(--series-pink)' : 'var(--text-muted)'
            }}>
              <input
                type="checkbox"
                checked={quantize}
                onChange={(e) => setQuantize(e.target.checked)}
              />
              <span style={{ fontSize: '0.95rem', fontWeight: quantize ? '600' : '400' }}>
                Simulează Compresie Lossy
              </span>
            </label>
            {quantize && (
              <div style={{ marginTop: '0.5rem' }}>
                <label style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
                  Biți cuantizare: {quantBits}
                </label>
                <input
                  type="range"
                  min="2"
                  max="16"
                  value={quantBits}
                  onChange={(e) => setQuantBits(parseInt(e.target.value))}
                  style={{ width: '100%' }}
                />
              </div>
            )}
          </div>

          {/* Key formulas */}
          <div style={{
            padding: '0.55rem 0.8rem',
            background: 'rgba(255,215,0,0.08)',
            borderRadius: '8px',
            borderLeft: '4px solid #ffd700'
          }}>
            <h4 style={{ margin: '0 0 0.5rem', color: 'var(--series-gold)', fontSize: '0.95rem' }}>
              Formulele Reconstrucției
            </h4>
            <div style={{ fontSize: '0.95rem', textAlign: 'center' }}>
              <div style={{ marginBottom: '0.4rem' }}>
                <LaTeX math={String.raw`x[2k] = \frac{cA[k] + cD[k]}{\sqrt{2}}`} />
              </div>
              <div>
                <LaTeX math={String.raw`x[2k+1] = \frac{cA[k] - cD[k]}{\sqrt{2}}`} />
              </div>
            </div>
          </div>

          {/* Perfect reconstruction theorem */}
          <div style={{
            padding: '0.55rem 0.8rem',
            background: 'rgba(0,255,136,0.08)',
            borderRadius: '8px',
            borderLeft: '4px solid #00ff88'
          }}>
            <h4 style={{ margin: '0 0 0.4rem', color: 'var(--series-green)', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <CheckIcon size={16} /> Teorema Reconstrucției Perfecte
            </h4>
            <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-muted)' }}>
              Dacă filtrele satisfac condițiile de reconstrucție perfectă (CQF: alternating flip plus
              putere-simetrie), atunci <LaTeX math={String.raw`\hat{x}[n] = x[n]`} /> exact
              în aritmetică ideală; în virgulă mobilă, până la precizia mașinii. <Cite id="estebangaland1977,smithbarnwell1984" />
            </p>
            <p style={{ margin: '0.4rem 0 0', fontSize: '0.95rem', color: 'var(--text-muted)' }}>
              De aici vine compresia fără pierderi, iar orice pierdere rămâne controlată prin
              cuantizare - baza pentru JPEG2000 și pentru denoising.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Drawing functions
// ============================================================================

function drawReconstruction(ctx, W, H, original, decomp, reconstructed, step, quantize, error) {
  const margin = 50
  const plotHeight = 70 // Reduced height to fit gaps
  const gap = 45 // Increased gap for labels

  const labels = []

  // Draw signals based on step
  if (step >= 0) {
    // Original signal
    drawSignalPlot(ctx, margin, 30, W - 2 * margin, plotHeight, original, '#00d4ff')
    labels.push({ text: 'Original x[n]', x: margin, y: 30 - 20, color: 'var(--primary)' })
  }

  if (step >= 1) {
    // Decomposition coefficients
    const coeffY = 30 + plotHeight + gap
    const coeffWidth = (W - 2 * margin) / 2 - 10

    // Show final approximation
    if (decomp.length > 0) {
      const finalApprox = decomp[decomp.length - 1].approx
      drawSignalPlot(ctx, margin, coeffY, coeffWidth, plotHeight, finalApprox, 'var(--series-green)')
      labels.push({ text: `Aproximare A${decomp.length}`, x: margin, y: coeffY - 20, color: 'var(--series-green)' })
    }

    // Show all details combined
    const allDetails = decomp.flatMap(d => d.detail)
    drawSignalPlot(ctx, margin + coeffWidth + 20, coeffY, coeffWidth, plotHeight, allDetails, 'var(--series-pink)')
    labels.push({
      text: <LaTeX math={String.raw`\text{Detalii } D_1 \ldots D_{${decomp.length}}`} />,
      x: margin + coeffWidth + 20, y: coeffY - 20, color: 'var(--series-pink)'
    })
  }

  if (step >= 2) {
    // Reconstructed signal
    const reconY = 30 + 2 * (plotHeight + gap)
    drawSignalPlot(ctx, margin, reconY, W - 2 * margin, plotHeight, reconstructed, 'var(--series-green)')
    labels.push({ text: 'Reconstruit', x: margin, y: reconY - 20, color: 'var(--series-green)' })

    // Error visualization if there is any
    const maxErr = Math.max(...error)
    if (maxErr > 0.001) {
      const errY = reconY + plotHeight + 10
      drawErrorPlot(ctx, margin, errY, W - 2 * margin, 30, error, maxErr)
    }
  }

  return { labels }
}

function drawSignalPlot(ctx, x, y, width, height, data, color) {
  // Background
  ctx.fillStyle = canvasTheme().panel
  ctx.fillRect(x, y, width, height)

  if (!data || data.length === 0) return

  const maxVal = Math.max(...data.map(Math.abs), 1)
  const barWidth = width / data.length
  const zeroY = y + height / 2

  // Draw bars
  ctx.fillStyle = resolveColor(color)
  data.forEach((val, i) => {
    const barX = x + i * barWidth
    // Scale relative to half-height (since zero is in middle)
    const scaledHeight = (val / maxVal) * (height / 2) * 0.9

    if (val >= 0) {
      // Draw upwards from zero
      ctx.fillRect(barX, zeroY - scaledHeight, Math.max(barWidth - 1, 1), scaledHeight)
    } else {
      // Draw downwards from zero
      ctx.fillRect(barX, zeroY, Math.max(barWidth - 1, 1), Math.abs(scaledHeight))
    }
  })

  // Label is rendered as an HTML overlay, not on canvas
}

function drawErrorPlot(ctx, x, y, width, height, error, maxErr) {
  ctx.fillStyle = 'rgba(255, 92, 92, 0.16)'
  ctx.fillRect(x, y, width, height)

  const barWidth = width / error.length

  error.forEach((e, i) => {
    const barX = x + i * barWidth
    const barH = (e / maxErr) * height * 0.9
    ctx.fillStyle = resolveColor(e > maxErr * 0.5 ? canvasTheme().pink : canvasTheme().orange)
    ctx.fillRect(barX, y + height - barH, Math.max(barWidth - 1, 1), barH)
  })

  // Label is rendered as an HTML overlay
}

// Image mode: same three stages (Original / Coeficienți DWT / Reconstruit),
// drawn as actual grayscale panels instead of 1D bar plots.
function drawReconstructionImage(ctx, W, H, original, decomp, reconstructed, step) {
  const labels = []
  if (!original || !original.length) return { labels }

  const gap = 28
  const top = 34
  const bottom = 26
  const panelSize = Math.max(20, Math.min((W - gap * 2 - 40) / 3, H - top - bottom))
  const startX = (W - (panelSize * 3 + gap * 2)) / 2

  const drawStage = (idx, matrix, title, color) => {
    if (!matrix || !matrix.length) return
    const x = startX + idx * (panelSize + gap)
    drawGrayMatrix(ctx, matrix, x, top, panelSize)
    labels.push({ text: title, x: x + panelSize / 2, y: top - 14, color })
  }

  if (step >= 0) drawStage(0, original, 'Original', 'var(--primary)')

  if (step >= 1 && decomp.length > 0) {
    const composite = stitchQuadrants(
      normalizeMatrix(decomp[0].LL), normalizeMatrix(decomp[0].LH),
      normalizeMatrix(decomp[0].HL), normalizeMatrix(decomp[0].HH)
    )
    drawStage(1, composite, 'Coeficienți DWT', 'var(--series-gold)')
  }

  if (step >= 2) drawStage(2, reconstructed, 'Reconstruit', 'var(--series-green)')

  return { labels }
}

// Each subband normalized independently (LL is bright/large, LH/HL/HH are
// centered near zero) so the composite balances all four quadrants, matching
// how the backend's own wavelet composite (main.py) normalizes per-quadrant.
function normalizeMatrix(m) {
  let min = Infinity, max = -Infinity
  m.forEach(row => row.forEach(v => { if (v < min) min = v; if (v > max) max = v }))
  const range = (max - min) || 1
  return m.map(row => row.map(v => ((v - min) / range) * 255))
}

function stitchQuadrants(LL, LH, HL, HH) {
  const top = LL.map((row, i) => [...row, ...LH[i]])
  const bottom = HL.map((row, i) => [...row, ...HH[i]])
  return [...top, ...bottom]
}

function drawGrayMatrix(ctx, data, x, y, size) {
  const rows = data.length
  const cols = data[0].length
  const cellW = size / cols
  const cellH = size / rows
  data.forEach((row, ry) => {
    row.forEach((val, cx) => {
      const gray = Math.max(0, Math.min(255, Math.round(val)))
      ctx.fillStyle = `rgb(${gray},${gray},${gray})`
      ctx.fillRect(x + cx * cellW, y + ry * cellH, Math.ceil(cellW), Math.ceil(cellH))
    })
  })
  ctx.strokeStyle = resolveColor(canvasTheme().border)
  ctx.lineWidth = 1
  ctx.strokeRect(x, y, size, size)
}
