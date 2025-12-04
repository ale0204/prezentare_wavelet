import { useState } from 'react'
import LaTeX from './LaTeX'
import Cite from './shared/Cite'
import { renderRich } from './shared/richText'
import useHiDPICanvas from './shared/useHiDPICanvas'
import { pointerPos } from './shared/stage'
import { canvasTheme, resolveColor } from './shared/canvasTheme'

const MODE_CONTEXT = {
  fourier: 'Benzi orizontale infinite: rezoluție perfectă în frecvență, dar zero informație despre timp. Fiecare bandă acoperă tot semnalul.',
  stft: 'Grilă uniformă: aceeași fereastră pentru toate frecvențele. Compromis fix, indiferent dacă analizăm bas sau tranzienți.',
  wavelet: 'Cutii adaptive: înguste în timp la frecvențe înalte (prindem tranzienții), înguste în frecvență la frecvențe joase (distingem tonurile). Aria fiecărei cutii rămâne constantă: limita Heisenberg.'
}

// Example signals: where their energy lives in the time-frequency plane.
// Coordinates are normalized to the plot area: t in 0..1 (left->right),
// f in 0..1 (bottom->top), dt/df are widths/heights in the same units.
const SIGNAL_OVERLAYS = {
  none: { label: 'Fără exemplu', regions: [] },
  seism: {
    label: 'Cutremur',
    regions: [
      { t: 0.5, f: 0.08, dt: 0.92, df: 0.12, label: 'fundal 1-5 Hz (tot semnalul)' },
      { t: 0.32, f: 0.72, dt: 0.07, df: 0.4, label: 'unda P (tranzient scurt)' }
    ]
  },
  muzica: {
    label: 'Muzică',
    regions: [
      { t: 0.28, f: 0.28, dt: 0.38, df: 0.1, label: 'notă susținută (frecvență precisă)' },
      { t: 0.72, f: 0.68, dt: 0.06, df: 0.34, label: 'atac de tobă (moment precis)' }
    ]
  }
}

export default function HeisenbergBoxesView({ compact = false }) {
  const [mode, setMode] = useState('wavelet') // 'fourier', 'stft', 'wavelet'
  const [overlay, setOverlay] = useState('none')
  const [hoverInfo, setHoverInfo] = useState(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })

  const { canvasRef, containerRef } = useHiDPICanvas((ctx, { width, height }) => {
    // Clear background
    ctx.fillStyle = canvasTheme().bg
    ctx.fillRect(0, 0, width, height)

    drawAxes(ctx, width, height)

    if (mode === 'fourier') {
      drawFourier(ctx, width, height, mousePos)
    } else if (mode === 'stft') {
      drawSTFT(ctx, width, height, mousePos)
    } else if (mode === 'wavelet') {
      drawWavelet(ctx, width, height, mousePos)
    }

    drawOverlay(ctx, width, height, overlay)
  }, [mode, mousePos, overlay])

  const handleMouseMove = (e) => {
    const canvas = canvasRef.current
    if (!canvas) return
    // Drawing happens in design pixels (the hook scales the context), so the
    // helper converts the pointer straight into the same coordinate system.
    setMousePos(pointerPos(e, canvas))
  }

  const drawAxes = (ctx, W, H) => {
    const margin = 40
    ctx.strokeStyle = canvasTheme().border
    ctx.lineWidth = 2

    // Y axis (Frequency)
    ctx.beginPath()
    ctx.moveTo(margin, H - margin)
    ctx.lineTo(margin, margin)
    ctx.stroke()

    // X axis (Time)
    ctx.beginPath()
    ctx.moveTo(margin, H - margin)
    ctx.lineTo(W - margin, H - margin)
    ctx.stroke()

    // Labels
    ctx.fillStyle = canvasTheme().text
    ctx.font = 'bold 14px Inter, Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Timp (t)', W / 2, H - 10)

    ctx.save()
    ctx.translate(15, H / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText('Frecvență (f)', 0, 0)
    ctx.restore()
  }

  const drawFourier = (ctx, W, H, mouse) => {
    const margin = 40
    const plotW = W - 2 * margin
    const plotH = H - 2 * margin

    const numFreqs = 8
    const h = plotH / numFreqs

    let hovered = false

    for (let i = 0; i < numFreqs; i++) {
      const y = margin + i * h

      const isHovered = mouse.x >= margin && mouse.x <= W - margin && mouse.y >= y && mouse.y < y + h
      if (isHovered) {
        hovered = true
        setHoverInfo({
          title: 'Rezoluție Fourier',
          dt: '$\\infty$ (Infinit)',
          df: 'Perfectă',
          desc: 'Știm frecvența exactă, dar nu știm când apare.'
        })
      }

      ctx.fillStyle = resolveColor(isHovered ? '#4fc3f7' : `hsl(${200 + i * 10}, 70%, 20%)`)
      ctx.strokeStyle = `hsl(${200 + i * 10}, 100%, 60%)`
      ctx.lineWidth = isHovered ? 3 : 1.5

      ctx.fillRect(margin, y, plotW, h)
      ctx.strokeRect(margin, y, plotW, h)
    }
    if (!hovered && mode === 'fourier') setHoverInfo(null)
  }

  const drawSTFT = (ctx, W, H, mouse) => {
    const margin = 40
    const plotW = W - 2 * margin
    const plotH = H - 2 * margin

    const numTime = 8
    const numFreq = 8
    const w = plotW / numTime
    const h = plotH / numFreq

    let hovered = false

    for (let i = 0; i < numFreq; i++) {
      for (let j = 0; j < numTime; j++) {
        const x = margin + j * w
        const y = margin + i * h

        const isHovered = mouse.x >= x && mouse.x < x + w && mouse.y >= y && mouse.y < y + h
        if (isHovered) {
          hovered = true
          setHoverInfo({
            title: 'Rezoluție STFT',
            dt: 'Fixă (medie)',
            df: 'Fixă (medie)',
            desc: 'Compromis constant. Ferestre egale peste tot.'
          })
        }

        ctx.fillStyle = resolveColor(isHovered ? '#00e676' : `hsl(${150 + i * 10}, 70%, 20%)`)
        ctx.strokeStyle = `hsl(${150 + i * 10}, 100%, 60%)`
        ctx.lineWidth = isHovered ? 3 : 1.5

        ctx.fillRect(x, y, w, h)
        ctx.strokeRect(x, y, w, h)
      }
    }
    if (!hovered && mode === 'stft') setHoverInfo(null)
  }

  const drawWavelet = (ctx, W, H, mouse) => {
    const margin = 40
    const plotW = W - 2 * margin
    const plotH = H - 2 * margin
    const levels = 4

    // Row heights halve each level (plotH/2, plotH/4, ...) EXCEPT the last
    // row, which repeats the level above instead of halving again - same
    // box count too. That keeps boxW * boxH constant across every row (the
    // "aria ramane constanta" claim this slide makes) and the heights still
    // sum to exactly plotH: 1/2 + 1/4 + 1/8 + 1/8 = 1. The previous version
    // halved the count but not the height for the last row, doubling its
    // area versus every other row.
    let currentY = margin
    let hovered = false

    for (let l = 0; l < levels; l++) {
      const heightLevel = Math.min(l, levels - 2)
      const currentH = plotH / Math.pow(2, heightLevel + 1)
      const numBoxes = Math.pow(2, levels - heightLevel - 1) * 4
      const boxW = plotW / numBoxes

      for (let i = 0; i < numBoxes; i++) {
        const x = margin + i * boxW

        const isHovered = mouse.x >= x && mouse.x < x + boxW && mouse.y >= currentY && mouse.y < currentY + currentH

        if (isHovered) {
          hovered = true
          const isHighFreq = l === 0
          const isLowFreq = l === levels - 1

          setHoverInfo({
            title: isHighFreq ? 'Frecvențe Înalte' : isLowFreq ? 'Frecvențe Joase' : 'Frecvențe Medii',
            dt: isHighFreq ? 'Foarte bună (mică)' : isLowFreq ? 'Slabă (mare)' : 'Medie',
            df: isHighFreq ? 'Slabă (mare)' : isLowFreq ? 'Foarte bună (mică)' : 'Medie',
            desc: isHighFreq
              ? 'Ex: 500-510Hz. Vedem tranzienți scurți, dar nu distingem frecvențele apropiate.'
              : isLowFreq
              ? 'Ex: 1-5Hz. Distingem frecvențele bine, dar nu știm exact când apar.'
              : 'Compromis echilibrat pentru zona de mijloc.'
          })
        }

        ctx.fillStyle = resolveColor(isHovered ? '#d500f9' : `hsl(${280 - l * 40}, 70%, 20%)`)
        ctx.strokeStyle = `hsl(${280 - l * 40}, 100%, 60%)`
        ctx.lineWidth = isHovered ? 3 : 1.5

        ctx.fillRect(x, currentY, boxW, currentH)
        ctx.strokeRect(x, currentY, boxW, currentH)
      }

      currentY += currentH
    }
    if (!hovered && mode === 'wavelet') setHoverInfo(null)
  }

  // Dashed outlines showing where an example signal's energy lives,
  // so the audience can judge which tiling captures it.
  const drawOverlay = (ctx, W, H, overlayId) => {
    const regions = SIGNAL_OVERLAYS[overlayId]?.regions || []
    if (regions.length === 0) return

    const margin = 40
    const plotW = W - 2 * margin
    const plotH = H - 2 * margin

    ctx.save()
    ctx.setLineDash([6, 4])
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)'
    ctx.lineWidth = 2.5
    ctx.font = 'bold 13px Inter, Arial, sans-serif'
    ctx.textAlign = 'center'

    regions.forEach(r => {
      const cx = margin + r.t * plotW
      const cy = margin + (1 - r.f) * plotH
      const w = r.dt * plotW
      const h = r.df * plotH

      ctx.beginPath()
      ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2)
      ctx.stroke()

      // Label on a backing chip painted in the canvas background, so the chip
      // and its text flip together with the theme
      const labelY = cy - h / 2 - 8
      const textW = ctx.measureText(r.label).width
      ctx.globalAlpha = 0.85
      ctx.fillStyle = canvasTheme().bg
      ctx.fillRect(cx - textW / 2 - 4, labelY - 12, textW + 8, 16)
      ctx.globalAlpha = 1
      ctx.fillStyle = canvasTheme().textStrong
      ctx.fillText(r.label, cx, labelY)
    })
    ctx.restore()
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      gap: '1rem',
      padding: compact ? '0.5rem' : '1rem',
      background: 'var(--bg-dark)',
      color: 'var(--text-light)'
    }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ margin: '0.5rem 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Principiul de incertitudine Heisenberg: <LaTeX math="\Delta t \cdot \Delta f \ge 1/(4\pi)" /> <Cite id="mallat2008" />
        </p>
        <p style={{ margin: '0.35rem auto 0', color: 'var(--text-light)', fontSize: '0.9rem', maxWidth: '720px' }}>
          {MODE_CONTEXT[mode]}
        </p>
      </div>

      <div style={{
        flex: 1,
        display: 'flex',
        gap: '1rem',
        minHeight: 0
      }}>
        {/* Visualization, with its readout docked underneath. The readout used
            to float inside the plot and covered tiles even with nothing
            hovered; a fixed min-height keeps the plot from resizing when the
            mouse enters and leaves. */}
        <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 }}>
        <div ref={containerRef} style={{
          flex: 1,
          minHeight: 0,
          background: 'var(--graph-background)',
          borderRadius: '8px',
          border: '1px solid var(--border)',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <canvas
            ref={canvasRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoverInfo(null)}
            style={{ display: 'block', cursor: 'crosshair' }}
          />
        </div>

          <div style={{ background: 'var(--bg-elevated)', padding: '10px 12px', borderRadius: '6px', fontSize: '0.95rem', border: '1px solid var(--border)', minHeight: '76px' }}>
            {hoverInfo ? (
              <>
                <div style={{ fontWeight: 'bold', color: 'var(--text-body)', marginBottom: '5px' }}>{hoverInfo.title}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '5px 10px', marginBottom: '8px' }}>
                  <span style={{ color: 'var(--text-muted)' }}><LaTeX math={String.raw`\Delta t`} /> (Timp):</span>
                  <span style={{ color: 'var(--text-body)' }}>{renderRich(hoverInfo.dt)}</span>
                  <span style={{ color: 'var(--text-muted)' }}><LaTeX math={String.raw`\Delta f`} /> (Frecv):</span>
                  <span style={{ color: 'var(--text-body)' }}>{renderRich(hoverInfo.df)}</span>
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontStyle: 'italic' }}>
                  {hoverInfo.desc}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 'bold', color: 'var(--text-body)', marginBottom: '5px' }}>Info</div>
                <div style={{ color: 'var(--text-muted)' }}>Mișcă mouse-ul peste grafic pentru detalii.</div>
              </>
            )}
          </div>
        </div>

        {/* Controls */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          minHeight: 0,
          overflow: 'hidden'
        }}>
          <div className="control-group">
            <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Alege Vizualizarea</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <button
                onClick={() => setMode('fourier')}
                style={{
                  padding: '1rem',
                  background: mode === 'fourier' ? 'rgba(79, 195, 247, 0.15)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${mode === 'fourier' ? '#4fc3f7' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: '8px',
                  color: mode === 'fourier' ? '#4fc3f7' : 'var(--text-muted)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  transition: 'all 0.2s ease'
                }}
              >
                <strong style={{ fontSize: '1.05rem' }}>Transformata Fourier</strong>
                <div style={{ fontSize: '0.85rem', opacity: 0.9, lineHeight: '1.4', fontWeight: 'normal' }}>
                  Știm exact CE frecvențe, dar nu CÂND.
                </div>
              </button>

              <button
                onClick={() => setMode('stft')}
                style={{
                  padding: '1rem',
                  background: mode === 'stft' ? 'rgba(0, 230, 118, 0.15)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${mode === 'stft' ? '#00e676' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: '8px',
                  color: mode === 'stft' ? '#00e676' : 'var(--text-muted)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  transition: 'all 0.2s ease'
                }}
              >
                <strong style={{ fontSize: '1.05rem' }}>STFT (Windowed Fourier)</strong>
                <div style={{ fontSize: '0.85rem', opacity: 0.9, lineHeight: '1.4', fontWeight: 'normal' }}>
                  Compromis fix. Ferestre egale.
                </div>
              </button>

              <button
                onClick={() => setMode('wavelet')}
                style={{
                  padding: '1rem',
                  background: mode === 'wavelet' ? 'rgba(213, 0, 249, 0.15)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${mode === 'wavelet' ? '#d500f9' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: '8px',
                  color: mode === 'wavelet' ? '#d500f9' : 'var(--text-muted)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  transition: 'all 0.2s ease'
                }}
              >
                <strong style={{ fontSize: '1.05rem' }}>Transformata Wavelet</strong>
                <div style={{ fontSize: '0.85rem', opacity: 0.9, lineHeight: '1.4', fontWeight: 'normal' }}>
                  Frecvențe înalte: timp scurt.
                  Frecvențe joase: timp lung.
                </div>
              </button>
            </div>
          </div>

          <div className="control-group">
            <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Semnal Exemplu</h3>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {Object.entries(SIGNAL_OVERLAYS).map(([id, s]) => (
                <button
                  key={id}
                  onClick={() => setOverlay(id)}
                  style={{
                    flex: 1,
                    padding: '0.5rem',
                    background: overlay === id ? 'rgba(255, 170, 0, 0.15)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${overlay === id ? '#ffaa00' : 'rgba(255,255,255,0.1)'}`,
                    borderRadius: '6px',
                    color: overlay === id ? '#ffaa00' : 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '0.85rem'
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
            {overlay !== 'none' && (
              <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: 'var(--text-light)' }}>
                Conturul punctat arată unde se află energia semnalului. Comută între moduri:
                doar plăcile wavelet acoperă bine ambele regiuni.
              </p>
            )}
          </div>

          <div style={{
            padding: '1rem',
            background: 'rgba(255,255,255,0.05)',
            borderRadius: '8px',
            fontSize: '0.9rem',
            lineHeight: '1.4'
          }}>
            <h4 style={{ margin: '0 0 0.5rem', color: 'var(--text-light)' }}>De ce contează?</h4>
            <p style={{ margin: 0, color: 'var(--text-light)' }}>
              Semnalele reale (muzică, imagini, cutremure) au evenimente scurte de frecvență înaltă (tranzienți) și fundaluri lungi de frecvență joasă.
              <br/><br/>
              <strong>Wavelet</strong> se adaptează natural la această structură, oferind "zoom" unde trebuie.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
