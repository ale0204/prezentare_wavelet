import { useState, useMemo } from 'react'
import useHiDPICanvas from './shared/useHiDPICanvas'

// CWT configuration (shared by computation, axis ticks and drawing)
const DURATION = 10
const SAMPLES = 400
const NUM_SCALES = 60
const SCALE_MIN = 0.1
const SCALE_FACTOR = 30
// Morlet psi(t) = exp(-t^2/2) * cos(5t) -> center frequency f_c = 5 / (2*pi)
const F_CENTER = 5 / (2 * Math.PI)
const FREQ_TICKS = [8, 4, 2, 1, 0.5]
const TIME_TICKS = [0, 2, 4, 6, 8, 10]

// Vertical position (0..1, top = high frequency) of a given frequency
function freqToY(freq) {
  const scale = F_CENTER / freq
  const idx = Math.log(scale / SCALE_MIN) / Math.log(SCALE_FACTOR) * NUM_SCALES
  return Math.min(1, Math.max(0, idx / NUM_SCALES))
}

// Horizontal position (0..1, left = t=0) of a given time. Both plots sample
// linearly over [0, DURATION], so this is a straight ratio - no log warp
// like freqToY needs for the scale axis.
function timeToX(t) {
  return t / DURATION
}

const SIGNAL_INFO = {
  chirp: {
    label: 'Chirp Simplu',
    desc: 'Frecvență crescătoare, amp. constantă',
    context: 'Frecvența crește liniar în timp: pe scalogramă apare o bandă diagonală care urcă spre frecvențe înalte. Fourier ar arăta doar un spectru lat, fără să spună când apare fiecare frecvență.'
  },
  chirp_am: {
    label: 'Chirp Modulat (AM)',
    desc: 'Variază și frecvența și amplitudinea',
    context: 'Și frecvența, și amplitudinea variază: banda diagonală se aprinde și se stinge odată cu anvelopa semnalului. Culoarea codifică magnitudinea, deci vedem simultan ce frecvență și cât de puternică este.'
  },
  bumps: {
    label: 'Bumps',
    desc: 'Pachete de frecvențe și amplitudini diferite',
    context: 'Trei evenimente izolate, la frecvențe și momente diferite: fiecare apare ca o pată separată. Exact informația pe care Fourier o pierde - când s-a întâmplat fiecare.'
  },
  step: {
    label: 'Salt Frecvență',
    desc: 'Schimbare bruscă de regim',
    context: 'La t = 5s semnalul sare brusc de la 2 Hz la 6 Hz: pe scalogramă banda inferioară se oprește și apare instantaneu una superioară. Tranziția este localizată precis în timp.'
  },
  transient: {
    label: 'Tranzient',
    desc: 'Semnal continuu cu un spike',
    context: 'Un puls foarte scurt peste o sinusoidă lentă: spike-ul apare ca o coloană verticală îngustă care traversează toate frecvențele - semnătura clasică a unui eveniment brusc (ex: o undă seismică P).'
  },
  radio: {
    label: 'Radio (2 posturi AM)',
    desc: 'Două purtătoare simultane, volum variabil',
    context: 'Antena captează simultan toate posturile. Aici sunt două purtătoare (1.5 Hz și 6 Hz), fiecare modulată în amplitudine cu propria "muzică". Scalograma le separă în două benzi orizontale a căror intensitate variază cu volumul. Conceptual, a selecta un post = a păstra doar banda lui; un receptor real face asta prin mixare la o frecvență intermediară fixă, filtrată îngust (superheterodina).'
  }
}

export default function ScalogramView({ compact = false }) {
  const [signalType, setSignalType] = useState('chirp_am')

  // Generate signal
  const { data } = useMemo(() => {
    const tArr = Array.from({length: SAMPLES}, (_, i) => i / SAMPLES * DURATION)
    let dArr = []

    switch (signalType) {
      case 'chirp':
        // Constant amplitude chirp
        dArr = tArr.map(ti => Math.sin(2 * Math.PI * (1 + 0.4 * ti) * ti))
        break
      case 'chirp_am':
        // Chirp with envelope (Amplitude Modulation)
        dArr = tArr.map(ti => Math.sin(2 * Math.PI * (1 + 0.4 * ti) * ti) * Math.sin(Math.PI * ti / DURATION))
        break
      case 'bumps':
        // Bursts of different freq and amplitude
        dArr = tArr.map(ti => {
          if (ti > 1 && ti < 3) return 0.8 * Math.sin(2 * Math.PI * 5 * ti)
          if (ti > 4 && ti < 7) return 0.4 * Math.sin(2 * Math.PI * 2 * ti)
          if (ti > 8 && ti < 9) return 1.0 * Math.sin(2 * Math.PI * 8 * ti)
          return 0
        })
        break
      case 'step':
        // Frequency and Amplitude step
        dArr = tArr.map(ti => ti < 5
          ? 0.3 * Math.sin(2 * Math.PI * 2 * ti)
          : 0.9 * Math.sin(2 * Math.PI * 6 * ti))
        break
      case 'transient':
        // Sine with a sudden spike
        dArr = tArr.map(ti => Math.sin(2 * Math.PI * 2 * ti) * 0.2 + (Math.abs(ti - 5) < 0.1 ? 2 * Math.exp(-100*(ti-5)**2) : 0))
        break
      case 'radio':
        // Two AM "stations" broadcasting simultaneously on different carriers
        dArr = tArr.map(ti =>
          0.7 * Math.sin(2 * Math.PI * 1.5 * ti) * (0.55 + 0.45 * Math.sin(2 * Math.PI * 0.15 * ti)) +
          0.7 * Math.sin(2 * Math.PI * 6 * ti) * (0.55 + 0.45 * Math.sin(2 * Math.PI * 0.3 * ti + 2))
        )
        break
      default:
        dArr = tArr.map(() => 0)
    }
    return { data: dArr }
  }, [signalType])

  // Compute CWT
  const cwt = useMemo(() => {
    const result = []
    const n = data.length
    // Scales: logarithmic
    const scales = Array.from({length: NUM_SCALES}, (_, i) => SCALE_MIN * Math.pow(SCALE_FACTOR, i/NUM_SCALES))

    const fs = SAMPLES / DURATION // samples per second
    scales.forEach(a => {
      const row = []
      // Morlet support is ~4a SECONDS on each side; convert to samples.
      // (The old 8*a treated seconds as samples and truncated the wavelet
      // to a handful of points, which made the whole scalogram wrong.)
      const windowSize = Math.ceil(4 * a * fs)

      for (let b = 0; b < n; b++) {
        let sumRe = 0
        let sumIm = 0
        // Optimization: only convolve where wavelet is non-negligible
        const start = Math.max(0, b - windowSize)
        const end = Math.min(n, b + windowSize)

        for (let i = start; i < end; i++) {
            const t_val = (i - b) / (SAMPLES/DURATION) // time difference in seconds
            const wa = t_val / a
            // Complex (analytic) Morlet: magnitude gives the smooth envelope
            // instead of phase stripes that a real-only wavelet produces
            const gauss = Math.exp(-wa*wa/2)
            sumRe += data[i] * gauss * Math.cos(5 * wa)
            sumIm += data[i] * gauss * Math.sin(5 * wa)
        }
        row.push(Math.sqrt(sumRe*sumRe + sumIm*sumIm) / Math.sqrt(a))
      }
      result.push(row)
    })
    return result
  }, [data])

  // Render CWT into an offscreen canvas at native resolution (1 px per coefficient).
  // putImageData ignores the dpr transform, so the heatmap goes through drawImage instead.
  const offscreen = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = SAMPLES
    c.height = NUM_SCALES
    const ictx = c.getContext('2d')
    const img = ictx.createImageData(SAMPLES, NUM_SCALES)
    const maxVal = Math.max(...cwt.flat()) || 1

    for (let y = 0; y < NUM_SCALES; y++) {
      const row = cwt[y] || []
      for (let x = 0; x < SAMPLES; x++) {
        const val = (row[x] || 0) / maxVal

        // Color Map: Custom "Magma"-like
        // 0.0 -> Black/Purple, 0.5 -> Red/Orange, 1.0 -> Yellow/White
        let r, g, b
        if (val < 0.5) {
            const t = val * 2
            r = 50 + 205 * t
            g = 0
            b = 50 + 50 * t
        } else {
            const t = (val - 0.5) * 2
            r = 255
            g = 255 * t
            b = 100 * t
        }

        const idx = (y * SAMPLES + x) * 4
        img.data[idx] = r
        img.data[idx+1] = g
        img.data[idx+2] = b
        img.data[idx+3] = 255
      }
    }
    ictx.putImageData(img, 0, 0)
    return c
  }, [cwt])

  // HiDPI scalogram canvas: scale the offscreen heatmap to the displayed size
  const { canvasRef, containerRef } = useHiDPICanvas((ctx, { width, height }) => {
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(offscreen, 0, 0, width, height)
  }, [offscreen])

  // SVG Path for Signal
  const signalPath = useMemo(() => {
    const maxAmp = Math.max(...data.map(Math.abs)) || 1
    // Map data to SVG coordinates: 0..100 width, -1..1 height
    return data.map((v, i) => {
        const x = (i / (SAMPLES - 1)) * 100
        const y = 50 - (v / maxAmp) * 45 // Center at 50, scale to fit
        return `${i===0?'M':'L'} ${x} ${y}`
    }).join(' ')
  }, [data])

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      gap: '0.5rem',
      padding: compact ? '0.25rem' : '0.5rem',
      background: 'var(--bg-dark)',
      color: 'var(--text-light)',
      fontFamily: 'sans-serif'
    }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', fontSize: '0.95rem' }}>
          Analiză Timp-Frecvență: ce frecvențe apar și când apar
        </p>
      </div>

      <div style={{
        flex: 1,
        display: 'flex',
        gap: '1rem',
        minHeight: 0
      }}>
        {/* Visualization Column */}
        <div style={{
          flex: 3,
          display: 'flex',
          flexDirection: 'column',
          gap: '5px',
          position: 'relative'
        }}>

          {/* Scalogram Container */}
          <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex' }}>
             {/* Y Axis Label */}
             <div style={{
                 writingMode: 'vertical-rl',
                 transform: 'rotate(180deg)',
                 textAlign: 'center',
                 fontSize: '0.95rem',
                 color: 'var(--text-muted)',
                 marginRight: '5px'
             }}>
                 Frecvență (Hz)
             </div>

             <div ref={containerRef} style={{ position: 'relative', flex: 1, border: '1px solid var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
                <canvas
                  ref={canvasRef}
                  style={{ display: 'block' }}
                />
                {/* Frequency axis tick labels (HTML so they stay crisp and themed) */}
                {FREQ_TICKS.map(f => (
                  <span
                    key={f}
                    style={{
                      position: 'absolute',
                      // clamped so the topmost and bottommost chips stay inside the plot
                      top: `clamp(12px, ${freqToY(f) * 100}%, calc(100% - 12px))`,
                      left: 4,
                      transform: 'translateY(-50%)',
                      background: 'rgba(0,0,0,0.62)',
                      color: '#fff',
                      padding: '1px 6px',
                      borderRadius: '3px',
                      fontSize: '0.95rem',
                      pointerEvents: 'none'
                    }}
                  >
                    {f} Hz
                  </span>
                ))}
                {/* Time axis tick labels along the bottom edge, mirroring FREQ_TICKS.
                    Needed so "la t=5s semnalul sare..." (preset context text) can
                    actually be located on the plot instead of just described. */}
                {TIME_TICKS.map(t => (
                  <span
                    key={t}
                    style={{
                      position: 'absolute',
                      left: `clamp(16px, ${timeToX(t) * 100}%, calc(100% - 16px))`,
                      bottom: 4,
                      transform: 'translateX(-50%)',
                      background: 'rgba(0,0,0,0.62)',
                      color: '#fff',
                      padding: '1px 6px',
                      borderRadius: '3px',
                      fontSize: '0.95rem',
                      pointerEvents: 'none'
                    }}
                  >
                    {t}s
                  </span>
                ))}
                <div style={{ position: 'absolute', top: 5, right: 5, background: 'rgba(0,0,0,0.62)', color: '#fff', padding: '2px 7px', borderRadius: '4px', fontSize: '0.95rem' }}>
                    Frecvențe înalte
                </div>
                {/* Raised above the time-tick row (bottom:4) so the two never overlap */}
                <div style={{ position: 'absolute', bottom: 26, right: 5, background: 'rgba(0,0,0,0.62)', color: '#fff', padding: '2px 7px', borderRadius: '4px', fontSize: '0.95rem' }}>
                    Frecvențe joase
                </div>
             </div>

             {/* Color Legend Bar */}
             <div style={{ width: '20px', marginLeft: '5px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                 <div style={{ fontSize: '0.95rem', marginBottom: '2px' }}>Max</div>
                 <div style={{
                     flex: 1,
                     width: '100%',
                     background: 'linear-gradient(to top, rgb(255,255,0), rgb(255,0,0), rgb(50,0,50))',
                     borderRadius: '2px',
                     border: '1px solid var(--border-light)'
                 }} />
                 <div style={{ fontSize: '0.95rem', marginTop: '2px' }}>0</div>
             </div>
          </div>

          {/* Signal Container (SVG) */}
          <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
             <div style={{ width: '20px', marginRight: '5px' }}></div> {/* Spacer for alignment */}
             <div style={{ flex: 1, border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--bg-darker)', position: 'relative' }}>
                <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
                    {/* Grid lines */}
                    <line x1="0" y1="50" x2="100" y2="50" style={{ stroke: 'var(--border)' }} strokeWidth="0.5" />
                    <path d={signalPath} stroke="#00d4ff" strokeWidth="2" fill="none" vectorEffect="non-scaling-stroke" />
                </svg>
                <div style={{ position: 'absolute', top: 5, left: 5, fontSize: '0.95rem', color: 'var(--primary)' }}>
                    Semnal Intrare x(t)
                </div>
                {/* Same time axis as the scalogram above it, so t=5s (or any
                    other preset moment) can be read directly under the signal too */}
                {TIME_TICKS.map(t => (
                  <span
                    key={t}
                    style={{
                      position: 'absolute',
                      left: `clamp(16px, ${timeToX(t) * 100}%, calc(100% - 16px))`,
                      bottom: 4,
                      transform: 'translateX(-50%)',
                      background: 'rgba(0,0,0,0.55)',
                      color: '#fff',
                      padding: '1px 6px',
                      borderRadius: '3px',
                      fontSize: '0.95rem',
                      pointerEvents: 'none'
                    }}
                  >
                    {t}s
                  </span>
                ))}
             </div>
             <div style={{ width: '20px', marginLeft: '5px' }}></div> {/* Spacer */}
          </div>

        </div>

        {/* Controls Column */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          minHeight: 0,
          overflowY: 'auto'
        }}>
          <div className="control-group">
            <h3 style={{ fontSize: '1rem', marginBottom: '0.25rem', color: 'var(--text-muted)' }}>Tip Semnal</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              {Object.entries(SIGNAL_INFO).map(([id, opt]) => (
                  <button
                    key={id}
                    onClick={() => setSignalType(id)}
                    className={signalType === id ? 'active-btn' : 'btn'}
                    style={btnStyle(signalType === id)}
                  >
                    <div style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>{opt.label}</div>
                    <div style={{ fontSize: '0.95rem', opacity: 0.8 }}>{opt.desc}</div>
                  </button>
              ))}
            </div>
          </div>

          {/* Per-signal interpretation */}
          <div style={{
            padding: '0.75rem',
            background: 'rgba(213, 0, 249, 0.08)',
            border: '1px solid rgba(213, 0, 249, 0.35)',
            borderRadius: '8px',
            fontSize: '0.95rem',
            lineHeight: '1.35'
          }}>
            <h4 style={{ margin: '0 0 0.25rem', color: 'var(--series-purple)' }}>Ce vedem aici?</h4>
            <p style={{ margin: 0, color: 'var(--text-light)' }}>
              {SIGNAL_INFO[signalType]?.context}
            </p>
          </div>

          <div style={{
            padding: '0.75rem',
            background: 'rgba(255,255,255,0.05)',
            borderRadius: '8px',
            fontSize: '0.95rem',
            lineHeight: '1.3',
            marginTop: 'auto'
          }}>
            <h4 style={{ margin: '0 0 0.25rem', color: 'var(--text-light)' }}>Legendă Culori</h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '0.5rem' }}>
                <div style={{ width: '100%', height: '10px', background: 'linear-gradient(to right, rgb(50,0,50), rgb(255,0,0), rgb(255,255,0))', borderRadius: '2px' }}></div>
            </div>
            <p style={{ margin: 0, color: 'var(--text-light)', fontSize: '0.95rem' }}>
              Culorile calde (Galben/Roșu) indică magnitudine mare (rezonanță puternică între semnal și wavelet).
              Zonele întunecate indică lipsa acelei frecvențe.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

const btnStyle = (active) => ({
  padding: '0.25rem 0.35rem',
  background: active ? 'rgba(213, 0, 249, 0.15)' : 'var(--bg-elevated)',
  border: `1px solid ${active ? '#d500f9' : 'var(--border)'}`,
  borderRadius: '6px',
  color: active ? '#d500f9' : 'var(--text-muted)',
  cursor: 'pointer',
  textAlign: 'left',
  transition: 'all 0.2s',
  display: 'flex',
  flexDirection: 'column',
  gap: '0px'
})
