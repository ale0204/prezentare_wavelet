import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { LaTeXBlock } from './LaTeX'
import Cite from './shared/Cite'
import Graph from './shared/Graph'
import { canvasMetrics, pointerPos } from './shared/stage'
import { canvasTheme, resolveColor } from './shared/canvasTheme'
import { CrossIcon } from './shared/TransportIcons'

// Quality levels sampled for the PSNR curve
const CURVE_QUALITIES = [10, 20, 30, 50, 70, 90]

// Known-weak default sample: 200x200 and very smooth, so wavelet and DCT
// score almost the same on it and the comparison shows nothing. Swapped for a
// sharper standard test image the first time the list of samples is available.
const WEAK_DEFAULT_IMAGE = 'peppers_512'
const BETTER_DEFAULT_IMAGE = 'kodim01'

// Fraction of the image width/height shown in the zoomed crop (both axes, so
// the crop keeps the source's aspect ratio instead of stretching it).
const ZOOM_FRACTION = 0.22

function clamp01(v) {
  return Math.min(1, Math.max(0, v))
}

/** Fraction (0..1) of an <img> pointer event, accounting for object-fit:
 * contain letterboxing so a click on a non-square photo still lands on the
 * right pixel. Uses the project's own pointerPos so it stays correct at any
 * stage scale. */
function imageClickFraction(e, imgEl) {
  const { x, y } = pointerPos(e, imgEl)
  const boxW = imgEl.clientWidth
  const boxH = imgEl.clientHeight
  const naturalW = imgEl.naturalWidth || boxW || 1
  const naturalH = imgEl.naturalHeight || boxH || 1
  const boxAspect = boxW / boxH
  const imgAspect = naturalW / naturalH
  let drawW = boxW, drawH = boxH, offX = 0, offY = 0
  if (imgAspect > boxAspect) {
    drawH = boxW / imgAspect
    offY = (boxH - drawH) / 2
  } else {
    drawW = boxH * imgAspect
    offX = (boxW - drawW) / 2
  }
  return { x: clamp01((x - offX) / drawW), y: clamp01((y - offY) / drawH) }
}

/** One magnified crop panel, same region on every codec's result so
 * artefacts (blocking, ringing) show at the size they actually appear at.
 * Click anywhere on a crop to re-centre all three panels there. */
function ZoomCrop({ src, center, label, accent, onPick }) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const imgRef = useRef(null)
  const [loadTick, setLoadTick] = useState(0)

  useEffect(() => {
    if (!src) return
    const img = new Image()
    img.onload = () => { imgRef.current = img; setLoadTick(n => n + 1) }
    img.src = `data:image/png;base64,${src}`
  }, [src])

  // Redraw on centre/image changes, and once more whenever the panel resizes
  // (stage scale changes, window resize).
  useEffect(() => {
    draw()
    const observer = new ResizeObserver(() => draw())
    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center, loadTick])

  function draw() {
    const canvas = canvasRef.current
    const container = containerRef.current
    const img = imgRef.current
    if (!canvas || !container || !img) return
    const { width, height, dpr } = canvasMetrics(container)
    if (width === 0 || height === 0) return
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    const nw = img.naturalWidth, nh = img.naturalHeight
    const cropW = ZOOM_FRACTION * nw
    const cropH = ZOOM_FRACTION * nh
    const sx = Math.min(Math.max(center.x * nw - cropW / 2, 0), Math.max(0, nw - cropW))
    const sy = Math.min(Math.max(center.y * nh - cropH / 2, 0), Math.max(0, nh - cropH))

    ctx.fillStyle = canvasTheme().bg
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(img, sx, sy, cropW, cropH, 0, 0, width, height)
  }

  function handleClick(e) {
    const canvas = canvasRef.current
    if (!canvas || !onPick) return
    const { x, y } = pointerPos(e, canvas)
    const fx = clamp01(x / canvas.clientWidth)
    const fy = clamp01(y / canvas.clientHeight)
    onPick({
      x: clamp01(center.x - ZOOM_FRACTION / 2 + fx * ZOOM_FRACTION),
      y: clamp01(center.y - ZOOM_FRACTION / 2 + fy * ZOOM_FRACTION)
    })
  }

  return (
    <div className="comparison-card zoom-crop" ref={containerRef}>
      <div className="card-header" style={{ color: accent }}>{label}</div>
      <canvas ref={canvasRef} onClick={handleClick} style={{ cursor: onPick ? 'crosshair' : 'default' }} />
    </div>
  )
}

/** SSIM / bpp / MSE line under an image card. Renders only the fields the
 * backend actually sent, so an older backend response never crashes this. */
function MetricsRow({ m }) {
  if (!m) return null
  const items = []
  if (typeof m.ssim === 'number') items.push(`SSIM ${m.ssim.toFixed(3)}`)
  if (typeof m.bpp === 'number') items.push(`${m.bpp.toFixed(2)} bpp`)
  if (typeof m.mse === 'number') items.push(`MSE ${m.mse.toFixed(1)}`)
  if (items.length === 0) return null
  return <div className="metrics-row">{items.join('  |  ')}</div>
}

export default function CompareView({ api, imageId, sampleImages = [], onImageChange }) {
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // 20-30% is where the caption below promises visible differences - the
  // slider default has to actually land there.
  const [quality, setQuality] = useState(25)
  const [wavelet, setWavelet] = useState('bior4.4')
  const [levels, setLevels] = useState(4)

  // PSNR curve state - open by default (see fetchCurve effect below for why
  // this is safe to do without risking a clipped layout).
  const [curveOpen, setCurveOpen] = useState(false)
  const [curveLoading, setCurveLoading] = useState(false)
  const [curveError, setCurveError] = useState(null)
  const [curveData, setCurveData] = useState(null)  // { dct: number[], wavelet: number[] }
  // Cache keyed by image+wavelet+levels so changing any of them invalidates.
  const curveCache = useRef({})

  // Zoom-on-artefact state
  const [zoomOn, setZoomOn] = useState(false)
  const [zoomCenter, setZoomCenter] = useState({ x: 0.5, y: 0.5 })
  const originalImgRef = useRef(null)

  // One-shot: swap the known-weak default image for a sharper one, the first
  // time the sample list is available. No-op once the user has picked
  // anything themselves, since imageId will no longer equal the weak default.
  const defaultSwitched = useRef(false)
  useEffect(() => {
    if (defaultSwitched.current || !sampleImages.length) return
    defaultSwitched.current = true
    if (imageId === WEAK_DEFAULT_IMAGE && sampleImages.some(img => img.id === BETTER_DEFAULT_IMAGE)) {
      onImageChange?.(BETTER_DEFAULT_IMAGE)
    }
  }, [sampleImages, imageId, onImageChange])

  const wavelets = [
    { id: 'bior4.4', name: 'Biorthogonal 9/7' },
    { id: 'bior2.2', name: 'Biorthogonal 5/3' },
    { id: 'db4', name: 'Daubechies 4' },
    { id: 'haar', name: 'Haar' }
  ]

  const handleCompare = async () => {
    if (!imageId) return

    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        quality: quality.toString(),
        wavelet,
        levels: levels.toString()
      })

      const response = await axios.get(
        `${api}/compare-sample/${imageId}?${params}`
      )

      setResult(response.data)
    } catch (err) {
      setError(err.response?.data?.detail || err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (imageId) handleCompare()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageId])

  const curveKey = (id, w, l) => `${id}|${w}|${l}`

  // Fetch PSNR curve for current imageId/wavelet/levels across all quality levels
  const fetchCurve = async (id, w, l) => {
    if (!id) return
    const key = curveKey(id, w, l)
    if (curveCache.current[key]) {
      setCurveData(curveCache.current[key])
      setCurveError(null)
      return
    }

    setCurveLoading(true)
    setCurveError(null)
    try {
      const requests = CURVE_QUALITIES.map(q =>
        axios.get(`${api}/compare-sample/${id}`, { params: { quality: q, wavelet: w, levels: l } })
      )
      const responses = await Promise.all(requests)
      const dctPsnr = responses.map(r => r.data.metrics.dct.psnr)
      const waveletPsnr = responses.map(r => r.data.metrics.wavelet.psnr)
      const entry = { dct: dctPsnr, wavelet: waveletPsnr }
      curveCache.current[key] = entry
      setCurveData(entry)
    } catch (err) {
      console.error('Curve fetch failed:', err)
      setCurveError('Curba nu a putut fi calculată.')
    } finally {
      setCurveLoading(false)
    }
  }

  // Auto-load the curve in the background as soon as the slide has an image
  // (and again if wavelet/levels change) - see report for why this replaced
  // the old two-click "open, then calculate" flow.
  useEffect(() => {
    if (!imageId) return
    const key = curveKey(imageId, wavelet, levels)
    setCurveData(curveCache.current[key] || null)
    fetchCurve(imageId, wavelet, levels)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageId, wavelet, levels])

  function handleOriginalClick(e) {
    if (!originalImgRef.current) return
    setZoomCenter(imageClickFraction(e, originalImgRef.current))
    setZoomOn(true)
  }

  // Graph series for the PSNR curve
  const curveSeries = curveData ? [
    {
      data: curveData.dct,
      xData: CURVE_QUALITIES,
      color: 'var(--series-orange)',
      lineWidth: 2.5,
      label: 'DCT/JPEG',
      showPoints: true,
      pointRadius: 4
    },
    {
      data: curveData.wavelet,
      xData: CURVE_QUALITIES,
      color: 'var(--primary)',
      lineWidth: 2.5,
      label: 'Wavelet/JPEG2000',
      showPoints: true,
      pointRadius: 4
    }
  ] : []

  const lowQDiff = curveData ? curveData.wavelet[0] - curveData.dct[0] : null
  const highQDiff = curveData ? curveData.wavelet[curveData.wavelet.length - 1] - curveData.dct[curveData.dct.length - 1] : null

  // Verdict banner: never collapse PSNR + SSIM into one fabricated "winner"
  // when they disagree - show both, with the bitrate they were measured at.
  const dctM = result?.metrics?.dct
  const wavM = result?.metrics?.wavelet
  const hasSsim = typeof dctM?.ssim === 'number' && typeof wavM?.ssim === 'number'
  let verdict = null
  if (dctM && wavM) {
    const psnrDiff = wavM.psnr - dctM.psnr
    const ssimDiff = hasSsim ? wavM.ssim - dctM.ssim : null
    const psnrWinner = psnrDiff >= 0 ? 'wavelet' : 'dct'
    const ssimWinner = hasSsim ? (ssimDiff >= 0 ? 'wavelet' : 'dct') : null
    const agree = !hasSsim || psnrWinner === ssimWinner
    const bppLabel = typeof result.target_bpp === 'number'
      ? `~${result.target_bpp.toFixed(2)} bpp (est.)`
      : `calitate ${result.quality}%`
    verdict = { psnrDiff, ssimDiff, psnrWinner, ssimWinner, agree, bppLabel }
  }

  return (
    <div className="compare-view-compact">
      {/* Header with title */}
      <div className="compare-header">
        {result?.rate_matched && (
          <span
            className="rate-match-badge"
            title="bpp estimat prin entropia de ordin 0 a coeficientilor cuantizati, acelasi estimator pentru ambele codecuri - nu dimensiunea unui fisier JPEG/JPEG2000 real"
          >
            la același bpp{typeof result.target_bpp === 'number' ? ` (~${result.target_bpp.toFixed(2)} est.)` : ''}
          </span>
        )}
      </div>

      {/* Info and Tips Row */}
      <div className="info-tips-row">
        <div className="info-section">
          <div className="info-col">
            <strong style={{color: 'var(--warning)'}}>DCT/JPEG:</strong> Blocuri 8x8 - artefacte de blocare
          </div>
          <div className="info-col">
            <strong style={{color: 'var(--primary)'}}>Wavelet/JPEG2000:</strong> Global multi-rezoluție - fără blocuri
          </div>
          <div className="info-col">
            <LaTeXBlock math={String.raw`\text{PSNR} = 10 \log_{10}\frac{\text{MAX}^2}{\text{MSE}}`} /> <Cite id="taubmanmarcellin2002" />
            <div className="metric-note">
              SSIM compară structura locală, nu eroarea punct cu punct <Cite id="wangbovik2004" />
            </div>
          </div>
        </div>
        <div className="tips-section">
          <span>DCT: Artefacte de bloc la margini</span>
          <span>Wavelet: gradienți fini, fără blocuri</span>
          <span>Calitate 20-30 - diferențe vizibile!</span>
        </div>
      </div>

      {error && <div className="error-message compact">{error}</div>}

      {/* Main Image Comparison Area */}
      <div className="comparison-main">
        {result && (
          <div className={`comparison-images ${loading ? 'loading' : ''}`}>
            {!zoomOn ? (
              <>
                <div className="comparison-card">
                  <div className="card-header">Original</div>
                  <img
                    ref={originalImgRef}
                    src={`data:image/png;base64,${result.original}`}
                    alt="Original"
                    onClick={handleOriginalClick}
                    style={{ cursor: 'zoom-in' }}
                    title="Click pentru a mări o zonă cu artefacte"
                  />
                </div>

                <div className="comparison-card dct">
                  <div className="card-header">
                    DCT (JPEG)
                    <span className="metric-inline">{result.metrics.dct.psnr.toFixed(1)} dB</span>
                  </div>
                  <img
                    src={`data:image/png;base64,${result.dct_result}`}
                    alt="DCT"
                  />
                  <MetricsRow m={result.metrics.dct} />
                </div>

                <div className="comparison-card wavelet">
                  <div className="card-header">
                    Wavelet ({wavelet})
                    <span className="metric-inline">{result.metrics.wavelet.psnr.toFixed(1)} dB</span>
                  </div>
                  <img
                    src={`data:image/png;base64,${result.wavelet_result}`}
                    alt="Wavelet"
                  />
                  <MetricsRow m={result.metrics.wavelet} />
                </div>
              </>
            ) : (
              <>
                <ZoomCrop src={result.original} center={zoomCenter} label="Original - click pentru a muta zona" accent="var(--text-muted)" onPick={setZoomCenter} />
                <ZoomCrop src={result.dct_result} center={zoomCenter} label="DCT (mărit)" accent="var(--series-orange)" onPick={setZoomCenter} />
                <ZoomCrop src={result.wavelet_result} center={zoomCenter} label="Wavelet (mărit)" accent="var(--primary)" onPick={setZoomCenter} />
              </>
            )}
          </div>
        )}
      </div>

      {verdict && (
        <div className={`verdict-bar row ${verdict.agree ? (verdict.psnrWinner === 'wavelet' ? 'wavelet-wins' : 'dct-wins') : 'mixed'}`}>
          <span className="verdict-line">
            PSNR: {verdict.psnrWinner === 'wavelet' ? 'Wavelet' : 'DCT'} +{Math.abs(verdict.psnrDiff).toFixed(2)} dB
          </span>
          {hasSsim && (
            <span className="verdict-line">
              SSIM: {verdict.ssimWinner === 'wavelet' ? 'Wavelet' : 'DCT'} +{Math.abs(verdict.ssimDiff).toFixed(3)}
            </span>
          )}
          <span className="verdict-context">la {verdict.bppLabel}</span>
          {!verdict.agree && (
            <span className="verdict-mixed-note">
              PSNR și SSIM nu sunt de acord: Anexa K din JPEG e ponderată perceptual, cuantizarea wavelet de aici optimizează MSE.
            </span>
          )}
        </div>
      )}

      {/* PSNR vs Quality section - open and auto-computed by default so the
          one place the thesis is actually demonstrated is visible with zero
          clicks; still collapsible for anyone who wants the image area back. */}
      <div className="psnr-curve-section">
        <div className="psnr-curve-header" onClick={() => setCurveOpen(o => !o)}>
          <span className="psnr-curve-toggle">{curveOpen ? 'v' : '>'}</span>
          <strong>PSNR vs Calitate</strong>
          {!curveOpen && (
            <span className="psnr-curve-hint">
              {curveLoading ? '- se calculează...' : lowQDiff != null
                ? `- la ${CURVE_QUALITIES[0]}%: ${lowQDiff >= 0 ? 'wavelet' : 'DCT'} +${Math.abs(lowQDiff).toFixed(2)} dB`
                : ''}
            </span>
          )}
        </div>

        {curveOpen && (
          <div className="psnr-curve-body">
            {curveLoading && !curveData && (
              <div className="psnr-curve-loading">
                <div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
                Se calculează pentru 6 niveluri de calitate...
              </div>
            )}

            {curveError && !curveData && !curveLoading && (
              <div className="psnr-curve-error">
                {curveError}
                <button className="psnr-curve-calc-btn" onClick={() => fetchCurve(imageId, wavelet, levels)}>
                  Reîncearcă
                </button>
              </div>
            )}

            {curveData && (
              <>
                {/* Legend */}
                <div className="psnr-curve-legend">
                  <span style={{ color: 'var(--warning)', fontWeight: 600 }}>DCT/JPEG</span>
                  <span style={{ color: 'var(--primary)', fontWeight: 600 }}>Wavelet/JPEG2000</span>
                </div>

                {/* Graph */}
                <div style={{ height: '180px', marginBottom: '0.5rem' }}>
                  <Graph
                    series={curveSeries}
                    xAxis={{
                      label: 'Calitate (%)',
                      min: 5,
                      max: 95,
                      ticks: CURVE_QUALITIES
                    }}
                    yAxis={{
                      label: 'PSNR (dB)',
                      ticks: [20, 25, 30, 35, 40, 45, 50]
                    }}
                    compact={true}
                  />
                </div>

                {/* Conclusion caption - read from the actual data, never a fixed claim */}
                <p className="psnr-curve-caption">
                  {lowQDiff != null && highQDiff != null && (
                    lowQDiff >= 0
                      ? `La calitate ${CURVE_QUALITIES[0]}%: wavelet +${lowQDiff.toFixed(2)} dB; la ${CURVE_QUALITIES[CURVE_QUALITIES.length - 1]}%: +${highQDiff.toFixed(2)} dB. Diferența crește cu bitrate-ul.`
                      : `La calitate ${CURVE_QUALITIES[0]}%: DCT +${Math.abs(lowQDiff).toFixed(2)} dB pe acest exemplu - PSNR singur nu spune tot, vezi și SSIM mai sus.`
                  )}
                </p>

                <button
                  className="psnr-curve-calc-btn"
                  onClick={() => {
                    delete curveCache.current[curveKey(imageId, wavelet, levels)]
                    setCurveData(null)
                    fetchCurve(imageId, wavelet, levels)
                  }}
                  style={{ marginTop: '0.25rem', fontSize: '0.85rem' }}
                >
                  Recalculează
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Bottom Controls Bar */}
      <div className="controls-bar">
        <button
          className="zoom-toggle-btn"
          onClick={() => setZoomOn(z => !z)}
          title={zoomOn ? 'Revino la imaginea completă' : 'Mărește o zonă cu artefacte'}
          aria-label={zoomOn ? 'Revino la imaginea completă' : 'Mărește o zonă cu artefacte'}
        >
          {zoomOn && <CrossIcon size={13} />}
          {zoomOn ? 'Imagine completă' : 'Zoom pe muchie'}
        </button>

        <div className="control-item">
          <label>Imagine:</label>
          <select
            value={imageId}
            onChange={e => onImageChange?.(e.target.value)}
          >
            {sampleImages.map(img => (
              <option key={img.id} value={img.id}>{img.name}</option>
            ))}
          </select>
        </div>

        <div className="control-item">
          <label>Calitate: <span style={{ display: 'inline-block', width: '3.5ch' }}>{quality}%</span></label>
          <input
            type="range"
            min="5"
            max="95"
            value={quality}
            onChange={e => setQuality(parseInt(e.target.value))}
          />
        </div>

        <div className="control-item">
          <label>Wavelet:</label>
          <select value={wavelet} onChange={e => setWavelet(e.target.value)}>
            {wavelets.map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>

        <div className="control-item">
          <label>Nivele: {levels}</label>
          <input
            type="range"
            min="2"
            max="6"
            value={levels}
            onChange={e => setLevels(parseInt(e.target.value))}
          />
        </div>

        <button
          className={`run-btn ${loading ? 'loading' : ''}`}
          onClick={handleCompare}
          disabled={!imageId || loading}
        >
          Run
        </button>

      </div>
    </div>
  )
}
