import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import '../styles/views/jpeg.css'
import { canvasTheme, resolveColor } from './shared/canvasTheme'

// ============================================
// DCT vs WAVELET COMPARISON VIEW
// Real backend compression (blocking vs ringing), not simulated pixels: a
// synthetic gradient has no edge, so it cannot show either artefact.
// ============================================

// Kodak 01 ("Stone Building") has real texture and a hard edge (the door),
// unlike the smooth test gradients - picked by scanning the sample images for
// the strongest coherent edge, which is what makes ringing visible at all.
const IMAGE_ID = 'kodim01'
const WAVELET = 'bior4.4'
const LEVELS = 4

// Native-pixel crop straddling the door handle: a bright point against a
// flat dark door is the textbook case for visible ringing, right next to the
// stone/door step edge for the blocking comparison. Fixed in native pixels
// because IMAGE_ID is fixed (not user-selectable in this view).
const CROP = { x: 205, y: 340, size: 80 }
const BLOCK = 8 // JPEG block size, for the grid overlay

const PROGRESSIVE_QUALITIES = [15, 35, 60, 90]

function loadImage(base64, onDone) {
  const img = new Image()
  img.onload = () => onDone(img)
  img.onerror = () => onDone(null)
  img.src = `data:image/png;base64,${base64}`
  return img
}

export default function DCTvsWaveletView({ compact = false, api = '/api' }) {
  const canvasRef = useRef()
  const [quality, setQuality] = useState(15)
  const [showBlockLines, setShowBlockLines] = useState(true)
  const [viewMode, setViewMode] = useState('side-by-side')

  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const imagesRef = useRef({})
  const [imgTick, setImgTick] = useState(0)

  const [progressive, setProgressive] = useState(null)
  const [progressiveLoading, setProgressiveLoading] = useState(false)
  const [progressiveError, setProgressiveError] = useState(null)
  const progressiveCache = useRef(null)

  // Debounced fetch: the quality slider fires continuously while dragging,
  // and each value is a real backend compression this time.
  useEffect(() => {
    let cancelled = false
    setError(null)
    const timer = setTimeout(() => {
      setLoading(true)
      axios.get(`${api}/compare-sample/${IMAGE_ID}`, { params: { quality, wavelet: WAVELET, levels: LEVELS } })
        .then(res => { if (!cancelled) setResult(res.data) })
        .catch(err => { if (!cancelled) setError(err.message) })
        .finally(() => { if (!cancelled) setLoading(false) })
    }, 200)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [api, quality])

  // Decode the three PNGs whenever a new comparison result arrives
  useEffect(() => {
    if (!result) return
    let remaining = 3
    const bump = () => { remaining -= 1; if (remaining <= 0) setImgTick(t => t + 1) }
    imagesRef.current.original = loadImage(result.original, img => { imagesRef.current.original = img; bump() })
    imagesRef.current.dct = loadImage(result.dct_result, img => { imagesRef.current.dct = img; bump() })
    imagesRef.current.wavelet = loadImage(result.wavelet_result, img => { imagesRef.current.wavelet = img; bump() })
  }, [result])

  useEffect(() => {
    if (viewMode === 'side-by-side') drawComparison()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgTick, viewMode, showBlockLines, quality, result, error, loading])

  // Progressive mode: real wavelet reconstructions at increasing bit budgets,
  // fetched lazily the first time that tab is opened.
  useEffect(() => {
    if (viewMode !== 'progressive' || progressive || progressiveLoading) return
    if (progressiveCache.current) { setProgressive(progressiveCache.current); return }
    setProgressiveLoading(true)
    setProgressiveError(null)
    Promise.all(PROGRESSIVE_QUALITIES.map(q =>
      axios.get(`${api}/compare-sample/${IMAGE_ID}`, { params: { quality: q, wavelet: WAVELET, levels: LEVELS } })
    )).then(responses => {
      const entry = responses.map((r, i) => ({ quality: PROGRESSIVE_QUALITIES[i], image: r.data.wavelet_result }))
      progressiveCache.current = entry
      setProgressive(entry)
    }).catch(err => setProgressiveError(err.message))
      .finally(() => setProgressiveLoading(false))
  }, [viewMode, api, progressive, progressiveLoading])

  const drawComparison = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const width = 1340
    const height = 608

    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = width + 'px'
    canvas.style.height = height + 'px'
    ctx.scale(dpr, dpr)

    ctx.fillStyle = canvasTheme().bg
    ctx.fillRect(0, 0, width, height)

    if (error) {
      ctx.fillStyle = canvasTheme().red
      ctx.font = '18px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText(`Backend indisponibil: ${error}`, width / 2, height / 2)
      return
    }
    if (!result || !imagesRef.current.original || !imagesRef.current.dct || !imagesRef.current.wavelet) {
      ctx.fillStyle = canvasTheme().textFaint
      ctx.font = '18px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText('Se încarcă compresia reală...', width / 2, height / 2)
      return
    }

    const imgSize = 400
    const gap = 140
    drawSideBySide(ctx, width, height, imgSize, gap)
  }

  const drawSideBySide = (ctx, width, height, imgSize, gap) => {
    const totalWidth = imgSize * 2 + gap
    const startX = (width - totalWidth) / 2
    const startY = 90

    // Context line: what is actually shown and at what (estimated) bitrate.
    // Placed well clear of the labels below it (34px gap) so the two text
    // rows never touch.
    const dctM = result.metrics.dct
    const wavM = result.metrics.wavelet
    const bppNote = typeof result.target_bpp === 'number'
      ? `~${result.target_bpp.toFixed(2)} bpp (est.) la ambele`
      : `calitate ${quality}%`
    ctx.font = '14px system-ui'
    ctx.fillStyle = canvasTheme().textFaint
    ctx.textAlign = 'center'
    ctx.fillText(
      `Kodak 01 (piatră + ușă), calitate ${quality}% - ${bppNote} - crop mărit ~${(imgSize / CROP.size).toFixed(1)}x`,
      width / 2, 24
    )

    // Labels above images
    ctx.textAlign = 'center'
    ctx.font = 'bold 26px system-ui'

    ctx.fillStyle = canvasTheme().orange
    ctx.fillText('JPEG (DCT)', startX + imgSize / 2, startY - 22)

    ctx.fillStyle = canvasTheme().cyan
    ctx.fillText('JPEG2000 (Wavelet)', startX + imgSize + gap + imgSize / 2, startY - 22)

    drawRealPanel(ctx, startX, startY, imgSize, imagesRef.current.dct, canvasTheme().orange, showBlockLines)
    drawRealPanel(ctx, startX + imgSize + gap, startY, imgSize, imagesRef.current.wavelet, canvasTheme().cyan, false)

    // "vs" between
    ctx.fillStyle = canvasTheme().gold
    ctx.font = 'bold 36px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText('vs', startX + imgSize + gap / 2, startY + imgSize / 2)

    // Text underneath each image - real numbers, read from the response
    const textY = startY + imgSize + 30
    ctx.font = '20px system-ui'
    ctx.textAlign = 'center'

    ctx.fillStyle = canvasTheme().orange
    ctx.fillText('Blocuri fixe 8x8', startX + imgSize / 2, textY)
    ctx.fillText('Artefacte de bloc (vezi mânerul)', startX + imgSize / 2, textY + 28)
    ctx.fillText(metricLine(dctM), startX + imgSize / 2, textY + 56)

    ctx.fillStyle = canvasTheme().cyan
    const waveletCenterX = startX + imgSize + gap + imgSize / 2
    ctx.fillText('Transformare globală', waveletCenterX, textY)
    ctx.fillText('Ringing lângă muchii (inel pe mâner)', waveletCenterX, textY + 28)
    ctx.fillText(metricLine(wavM), waveletCenterX, textY + 56)
  }

  const drawRealPanel = (ctx, x, y, size, img, accentColor, showGrid) => {
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, CROP.x, CROP.y, CROP.size, CROP.size, x, y, size, size)

    if (showGrid) {
      const scale = size / CROP.size
      const offsetX = (BLOCK - (CROP.x % BLOCK)) % BLOCK
      const offsetY = (BLOCK - (CROP.y % BLOCK)) % BLOCK
      // The grid marks JPEG's own 8x8 blocks, so it wears the JPEG panel's
      // accent rather than a colour of its own. Pure yellow used to be
      // hardcoded here and glared on every theme.
      ctx.save()
      ctx.globalAlpha = 0.6
      ctx.strokeStyle = resolveColor(accentColor)
      ctx.lineWidth = 1
      for (let lx = offsetX; lx <= CROP.size; lx += BLOCK) {
        ctx.beginPath()
        ctx.moveTo(x + lx * scale, y)
        ctx.lineTo(x + lx * scale, y + size)
        ctx.stroke()
      }
      for (let ly = offsetY; ly <= CROP.size; ly += BLOCK) {
        ctx.beginPath()
        ctx.moveTo(x, y + ly * scale)
        ctx.lineTo(x + size, y + ly * scale)
        ctx.stroke()
      }
      ctx.restore()
    }

    ctx.strokeStyle = resolveColor(accentColor)
    ctx.lineWidth = 3
    ctx.strokeRect(x, y, size, size)

    // Minimap inset: where in the full photo this crop comes from
    const original = imagesRef.current.original
    if (original) {
      const mmW = size * 0.3
      const mmH = mmW * (original.naturalHeight / original.naturalWidth)
      const mmX = x + size - mmW - 8
      const mmY = y + size - mmH - 8
      ctx.save()
      ctx.globalAlpha = 0.94
      ctx.drawImage(original, mmX, mmY, mmW, mmH)
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.65)'
      ctx.lineWidth = 1
      ctx.strokeRect(mmX, mmY, mmW, mmH)
      const sx = mmW / original.naturalWidth
      const sy = mmH / original.naturalHeight
      ctx.strokeStyle = resolveColor(canvasTheme().gold)
      ctx.lineWidth = 2
      ctx.strokeRect(mmX + CROP.x * sx, mmY + CROP.y * sy, CROP.size * sx, CROP.size * sy)
      ctx.restore()
    }
  }

  return (
    <div className="dct-wavelet-view">
      <div className="stage-header">
        <div className="view-toggle">
          <button
            className={viewMode === 'side-by-side' ? 'active' : ''}
            onClick={() => setViewMode('side-by-side')}
          >
            Comparație
          </button>
          <button
            className={viewMode === 'progressive' ? 'active' : ''}
            onClick={() => setViewMode('progressive')}
          >
            Progresiv
          </button>
        </div>
      </div>

      {viewMode === 'side-by-side' && (
        <div className="controls-row">
          <div className="control-item">
            <label>Calitate: {quality}%{loading ? ' (se calculează...)' : ''}</label>
            <input
              type="range"
              min="10"
              max="95"
              value={quality}
              onChange={(e) => setQuality(parseInt(e.target.value))}
            />
          </div>

          <label className="checkbox-item">
            <input
              type="checkbox"
              checked={showBlockLines}
              onChange={(e) => setShowBlockLines(e.target.checked)}
            />
            Arată grila de blocuri 8x8 (DCT)
          </label>
        </div>
      )}

      {viewMode === 'side-by-side' ? (
        <canvas ref={canvasRef} style={{ display: 'block', margin: '0 auto' }} />
      ) : (
        <div className="progressive-panel">
          <h4 className="progressive-title">Wavelet la buget de biți crescător</h4>
          <p className="progressive-subtitle">
            Aceeași transformare wavelet, reconstruită la un buget tot mai mare - se rafinează
            global peste toată imaginea, nu apar și dispar blocuri ca la un JPEG secvențial.
          </p>
          {progressiveLoading && !progressive && (
            <div className="progressive-status">Se calculează 4 niveluri de calitate...</div>
          )}
          {progressiveError && !progressive && (
            <div className="progressive-status error">Backend indisponibil: {progressiveError}</div>
          )}
          {progressive && (
            <div className="progressive-row">
              {progressive.map(p => (
                <div key={p.quality} className="progressive-item">
                  <img src={`data:image/png;base64,${p.image}`} alt={`Wavelet la calitate ${p.quality}%`} />
                  <span>{p.quality}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function metricLine(m) {
  if (!m) return ''
  const bpp = typeof m.bpp === 'number' ? `, ${m.bpp.toFixed(2)} bpp` : ''
  return `PSNR ${m.psnr.toFixed(1)} dB${bpp}`
}
