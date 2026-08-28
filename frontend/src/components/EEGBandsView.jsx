import { useState, useEffect } from 'react'
import axios from 'axios'
import Graph from './shared/Graph'

// EEG frequency bands with the everyday framing used in the talk
const EEG_BANDS = [
  { id: 'delta', name: 'Delta', range: [0.5, 4], color: 'var(--series-purple)', desc: 'Somn profund: unde lente, de amplitudine mare. Polisomnografia determină fazele somnului din aceste benzi; ceasurile doar aproximează, din mișcare și puls.' },
  { id: 'theta', name: 'Theta', range: [4, 8], color: 'var(--primary)', desc: 'Relaxare adâncă, meditație, visare cu ochii deschiși.' },
  { id: 'alpha', name: 'Alpha', range: [8, 13], color: 'var(--series-green)', desc: 'Ochii închiși, întins în pat: semnul clasic al unui creier treaz, dar calm.' },
  { id: 'beta', name: 'Beta', range: [13, 30], color: 'var(--series-amber)', desc: 'Concentrare, rezolvare de probleme, anxietate: la examen, creierul tău e plin de beta.' },
  { id: 'gamma', name: 'Gamma', range: [30, 80], color: 'var(--series-pink)', desc: 'Procesare cognitivă complexă, momentele în care "îți pică fisa". Studiate în brain-computer interfaces.' }
]

// Synthetic "EEG": one component in each band, mixed together
const EEG_EXPRESSION = '1.2*sin(2*pi*2*t) + 0.9*sin(2*pi*6*t) + 0.8*sin(2*pi*10*t) + 0.6*sin(2*pi*20*t) + 0.4*sin(2*pi*45*t)'

/**
 * EEGBandsView - pick a brain-wave band, the backend band-pass filter
 * (the same one from the filters chapter) isolates it from the mixed EEG.
 */
export default function EEGBandsView({ api = '/api', compact = false }) {
  const [bandId, setBandId] = useState('alpha')
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  const band = EEG_BANDS.find(b => b.id === bandId)

  useEffect(() => {
    axios.get(`${api}/filters/apply-signal`, {
      params: {
        expression: EEG_EXPRESSION,
        filter_type: 'bandpass',
        low_cutoff_hz: band.range[0],
        high_cutoff_hz: band.range[1],
        samples: 512
      }
    })
      .then(res => { setData(res.data); setError(null) })
      .catch(err => setError(err.message))
  }, [api, bandId])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '0.6rem', padding: compact ? '0.25rem' : '0.5rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {EEG_BANDS.map(b => (
          <button
            key={b.id}
            onClick={() => setBandId(b.id)}
            style={{
              flex: 1,
              minWidth: '90px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.15rem',
              padding: '0.45rem 0.6rem',
              borderRadius: '8px',
              border: `2px solid ${bandId === b.id ? b.color : 'transparent'}`,
              background: bandId === b.id ? `${b.color}22` : 'rgba(255,255,255,0.05)',
              color: bandId === b.id ? b.color : 'var(--text-muted)',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            {b.name}
            <div style={{ fontSize: '0.95rem', fontWeight: 400 }}>{b.range[0]}-{b.range[1]} Hz</div>
          </button>
        ))}
      </div>

      <div style={{
        background: `${band.color}14`,
        border: `1px solid ${band.color}55`,
        borderRadius: '8px',
        padding: '0.55rem 0.9rem',
        fontSize: '0.95rem',
        lineHeight: 1.4,
        color: 'var(--text-light)'
      }}>
        <strong style={{ color: band.color }}>{band.name} ({band.range[0]}-{band.range[1]} Hz):</strong> {band.desc}
      </div>

      <div style={{ flex: 1, minHeight: 200 }}>
        {error ? (
          <div style={{ color: 'var(--error)', padding: '1rem' }}>Backend indisponibil: {error}</div>
        ) : data && (
          <Graph
            series={[
              { data: data.time.original, xData: data.time.t, color: 'var(--text-muted)', lineWidth: 1.5, opacity: 0.6 },
              { data: data.time.filtered, xData: data.time.t, color: band.color, lineWidth: 2.5 }
            ]}
            xAxis={{ label: 'Timp (s)' }}
            yAxis={{ label: 'Amplitudine' }}
            compact={compact}
          />
        )}
      </div>

      <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-muted)' }}>
        Gri = EEG-ul complet (toate benzile suprapuse). Colorat = doar banda selectată,
        extrasă cu un filtru band-pass: exact instrumentul din capitolul de filtre,
        aplicat pe creierul uman. De ce nu wavelet, ca în restul prezentării? Nivelurile
        DWT dublează frecvența la fiecare pas (o octavă), dar benzile clinice nu sunt
        octave curate: delta-theta e aproape x2, însă delta-alfa e deja x3,25 - niciun
        set de niveluri DWT nu s-ar alinia cu toate granițele de mai sus deodată.
      </p>
    </div>
  )
}
