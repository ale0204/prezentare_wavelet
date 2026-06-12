import { useState, useEffect } from 'react'
import axios from 'axios'
import Graph from './shared/Graph'
import { resolveColor, canvasTheme } from './shared/canvasTheme'

// Real note frequencies (equal temperament, A4 = 440 Hz). The FFT runs at
// SAMPLES / DURATION Hz, so Nyquist covers the whole displayed register and a
// note gets ~20 samples per period - enough for a smooth time plot.
const SAMPLES = 8192
const DURATION = 1.0
// Seconds of the mix shown in the time plot: ~10 periods of a note, altfel
// graficul devine o banda plina.
const TIME_WINDOW = 0.025
const FREQ_AXIS_MAX = 700

const PRESETS = [
  {
    id: 'do-major',
    label: 'Acord Do major',
    notes: [
      { freq: 261.6, label: 'Do (262 Hz)' },
      { freq: 329.6, label: 'Mi (330 Hz)' },
      { freq: 392.0, label: 'Sol (392 Hz)' }
    ],
    chordName: 'Acord Do major',
    color: 'var(--primary)'
  },
  {
    id: 'la-minor',
    label: 'Acord La minor',
    notes: [
      { freq: 440.0, label: 'La (440 Hz)' },
      { freq: 523.3, label: 'Do (523 Hz)' },
      { freq: 659.3, label: 'Mi (659 Hz)' }
    ],
    chordName: 'Acord La minor',
    color: 'var(--series-purple)'
  },
  {
    id: 'sol-major',
    label: 'Acord Sol major',
    notes: [
      { freq: 392.0, label: 'Sol (392 Hz)' },
      { freq: 493.9, label: 'Si (494 Hz)' },
      { freq: 587.3, label: 'Re (587 Hz)' }
    ],
    chordName: 'Acord Sol major',
    color: 'var(--series-amber)'
  }
]

// Known notes for peak matching (tolerance +/-3 Hz at 1 Hz resolution)
const ALL_NOTE_MAP = [
  { freq: 261.6, label: 'Do (262 Hz)' },
  { freq: 329.6, label: 'Mi (330 Hz)' },
  { freq: 392.0, label: 'Sol (392 Hz)' },
  { freq: 440.0, label: 'La (440 Hz)' },
  { freq: 493.9, label: 'Si (494 Hz)' },
  { freq: 523.3, label: 'Do (523 Hz)' },
  { freq: 587.3, label: 'Re (587 Hz)' },
  { freq: 659.3, label: 'Mi (659 Hz)' }
]

// Build a sum-of-sines expression for the preset (real note freqs + interference)
function buildExpression(preset) {
  const sineTerms = preset.notes
    .map(n => `sin(2*pi*${n.freq}*t)`)
    .join(' + ')
  // Mains hum at 50 Hz plus a low rumble - the interference any real mic picks up
  const noise = '0.15*sin(2*pi*50*t) + 0.12*sin(2*pi*120*t)'
  return `${sineTerms} + ${noise}`
}

// Find local maxima above 40% of max magnitude, map to known notes
function detectPeaks(freqs, magnitudes, preset) {
  if (!freqs || !magnitudes || freqs.length === 0) return null

  const maxMag = Math.max(...magnitudes)
  const threshold = 0.4 * maxMag

  const peaks = []
  for (let i = 1; i < magnitudes.length - 1; i++) {
    if (
      magnitudes[i] > threshold &&
      magnitudes[i] > magnitudes[i - 1] &&
      magnitudes[i] > magnitudes[i + 1]
    ) {
      peaks.push({ freq: freqs[i], mag: magnitudes[i] })
    }
  }

  // Match each peak to a known note within +/-3 Hz
  const TOLERANCE = 3
  const matchedLabels = []
  for (const peak of peaks) {
    const match = ALL_NOTE_MAP.find(n => Math.abs(n.freq - peak.freq) <= TOLERANCE)
    if (match && !matchedLabels.includes(match.label)) {
      matchedLabels.push(match.label)
    }
  }

  if (matchedLabels.length === 0) return null

  return { labels: matchedLabels, chordName: preset.chordName, peaks }
}

/**
 * ShazamDemoView - audio fingerprint demo:
 * pick a chord preset, see the time-domain mix (messy), click "Identifica melodia"
 * to show the frequency spectrum and the detected notes.
 */
export default function ShazamDemoView({ api = '/api', compact = false }) {
  const [presetIdx, setPresetIdx] = useState(0)
  const [timeSeries, setTimeSeries] = useState(null)
  const [freqSeries, setFreqSeries] = useState(null)
  const [identified, setIdentified] = useState(false)
  const [detected, setDetected] = useState(null)
  const [error, setError] = useState(null)

  const preset = PRESETS[presetIdx]

  // Fetch time + frequency data whenever preset changes
  useEffect(() => {
    setIdentified(false)
    setDetected(null)
    setError(null)
    setTimeSeries(null)
    setFreqSeries(null)

    const expression = buildExpression(preset)
    axios.get(`${api}/fourier/function`, {
      params: { expression, samples: SAMPLES, duration: DURATION }
    })
      .then(res => {
        const d = res.data
        // Plot only the first milliseconds: at ~400 Hz, a full second is a solid band
        const visible = d.time.t.findIndex(t => t > TIME_WINDOW)
        const cut = visible > 0 ? visible : d.time.t.length
        setTimeSeries({ t: d.time.t.slice(0, cut), signal: d.time.signal.slice(0, cut) })
        setFreqSeries({ f: d.frequency.f, magnitude: d.frequency.magnitude })
      })
      .catch(err => setError(err.message))
  }, [api, presetIdx])

  function handleIdentify() {
    if (!freqSeries) return
    const result = detectPeaks(freqSeries.f, freqSeries.magnitude, preset)
    setDetected(result)
    setIdentified(true)
  }

  // Constellation-map overlay: mark the detected peaks and draw the kind of
  // pair a real fingerprint hash comes from, directly on the spectrum that is
  // already on screen (the mechanism is explained in the caption below, but
  // was never actually shown until now).
  function drawConstellationOverlay(ctx, { getX, getY }) {
    if (!detected?.peaks?.length) return
    const top = [...detected.peaks].sort((a, b) => b.mag - a.mag).slice(0, 3)

    ctx.save()
    top.forEach(p => {
      const x = getX(p.freq)
      const y = getY(p.mag)
      ctx.beginPath()
      ctx.arc(x, y, 6, 0, Math.PI * 2)
      ctx.strokeStyle = resolveColor(canvasTheme().textStrong)
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.fillStyle = resolveColor(preset.color)
      ctx.font = 'bold 12px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText(`${Math.round(p.freq)} Hz`, x, y - 12)
    })

    if (top.length >= 2) {
      const [a, b] = [...top].sort((p, q) => p.freq - q.freq).slice(0, 2)
      const x1 = getX(a.freq), y1 = getY(a.mag)
      const x2 = getX(b.freq), y2 = getY(b.mag)
      ctx.strokeStyle = resolveColor(canvasTheme().textFaint)
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 3])
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = resolveColor(canvasTheme().textStrong)
      ctx.font = 'bold 12px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText(`hash: (${Math.round(a.freq)}, ${Math.round(b.freq)})`, (x1 + x2) / 2, Math.min(y1, y2) - 20)
    }
    ctx.restore()
  }

  const btnBase = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.15rem',
    padding: '0.45rem 0.8rem',
    borderRadius: '8px',
    border: '2px solid transparent',
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: '0.88rem'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '0.6rem', padding: compact ? '0.25rem' : '0.5rem' }}>

      {/* Preset selector buttons */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {PRESETS.map((p, i) => (
          <button
            key={p.id}
            onClick={() => setPresetIdx(i)}
            style={{
              ...btnBase,
              flex: 1,
              minWidth: '120px',
              border: `2px solid ${presetIdx === i ? p.color : 'transparent'}`,
              background: presetIdx === i ? `${p.color}22` : 'rgba(255,255,255,0.05)',
              color: presetIdx === i ? p.color : 'var(--text-muted)'
            }}
          >
            {p.label}
            <div style={{ fontSize: '0.85rem', fontWeight: 400, marginTop: '0.15rem' }}>
              {p.notes.map(n => n.label).join(', ')}
            </div>
          </button>
        ))}
      </div>

      {error && (
        <div style={{ color: 'var(--error, #ff4444)', padding: '0.5rem' }}>
          Backend indisponibil: {error}
        </div>
      )}

      {/* Time-domain graph - the messy mix */}
      {timeSeries && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.2rem', flexShrink: 0 }}>
            Semnalul mixt în timp, primele {Math.round(TIME_WINDOW * 1000)} ms (cele 3 note + interferențe)
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
          <Graph
            series={[{
              data: timeSeries.signal,
              xData: timeSeries.t,
              color: preset.color,
              lineWidth: 1.5,
              opacity: 0.85
            }]}
            xAxis={{ label: 'Timp (s)' }}
            yAxis={{ label: 'Amplitudine' }}
            compact={compact}
          />
          </div>
        </div>
      )}

      {/* Identify button */}
      <div style={{ display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
        <button
          onClick={handleIdentify}
          disabled={!timeSeries}
          style={{
            ...btnBase,
            background: preset.color,
            color: '#111',
            border: 'none',
            padding: '0.55rem 1.4rem',
            opacity: timeSeries ? 1 : 0.4
          }}
        >
          Identifică melodia
        </button>
      </div>

      {/* Frequency spectrum + result chip */}
      {identified && freqSeries && (
        <>
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.2rem', flexShrink: 0 }}>
              Spectrul de frecvență (magnitudine FFT) - vârf = notă muzicală
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
            <Graph
              series={[{
                data: freqSeries.magnitude,
                xData: freqSeries.f,
                color: preset.color,
                lineWidth: 2
              }]}
              xAxis={{ label: 'Frecvență (Hz)', max: FREQ_AXIS_MAX }}
              yAxis={{ label: 'Magnitudine' }}
              compact={compact}
              onDraw={drawConstellationOverlay}
            />
            </div>
          </div>

          {detected ? (
            <div style={{
              background: `${preset.color}18`,
              border: `1px solid ${preset.color}55`,
              borderRadius: '8px',
              padding: '0.6rem 0.9rem',
              fontSize: '0.88rem',
              color: 'var(--text-light)'
            }}>
              <strong style={{ color: preset.color }}>Note detectate:</strong>{' '}
              {detected.labels.join(', ')}
              {' -> '}
              <strong style={{ color: preset.color }}>{detected.chordName}</strong>
            </div>
          ) : (
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', padding: '0.4rem' }}>
              Nu s-au putut detecta note clare în spectru.
            </div>
          )}
        </>
      )}

      {/* Caption */}
      <p style={{
        margin: 0,
        fontSize: compact ? '0.85rem' : '0.87rem',
        lineHeight: 1.5,
        color: 'var(--text-muted)',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        paddingTop: '0.5rem'
      }}>
        {identified
          ? 'Cercurile de mai sus sunt chiar vârfurile din constelație, iar linia punctată dintre două dintre ele e o pereche candidată la hash. '
          : 'Deocamdată se vede doar semnalul în timp, în care cele trei note sunt amestecate. Apasă "Identifică melodia" ca să apară spectrul, vârfurile lui și perechea candidată la hash. '}
        Shazam face același lucru la scară mare:
        dintr-o spectrogramă întreagă (timp și frecvență, nu doar frecvență ca aici) păstrează
        vârfurile proeminente, transformă fiecare pereche apropiată în timp într-un hash
        (f1, f2, dt) și îl caută în baza de date - așa recunoaște melodia în secunde, chiar cu
        zgomot de fundal.
      </p>
    </div>
  )
}
