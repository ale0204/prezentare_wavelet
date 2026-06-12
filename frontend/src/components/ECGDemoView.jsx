import { useState, useEffect } from 'react'
import axios from 'axios'
import Graph from './shared/Graph'
import LaTeX from './LaTeX'

/**
 * ECGDemoView - the Apple Watch story, live:
 * synthetic PQRST ECG + muscle noise -> wavelet denoising (backend)
 * -> R-peak detection -> heart rate. All computation in /api/ecg-demo.
 */
export default function ECGDemoView({ api = '/api', compact = false }) {
  const [noiseSigma, setNoiseSigma] = useState(0.25)
  const [showClean, setShowClean] = useState(false)
  const [showNoisy, setShowNoisy] = useState(true)
  const [showDenoised, setShowDenoised] = useState(true)
  const [showPeaks, setShowPeaks] = useState(true)
  const [showRR, setShowRR] = useState(false)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    axios.get(`${api}/ecg-demo`, { params: { noise_sigma: noiseSigma } })
      .then(res => { setData(res.data); setError(null) })
      .catch(err => setError(err.message))
  }, [api, noiseSigma])

  const series = []
  if (data) {
    if (showNoisy) series.push({ data: data.noisy, xData: data.t, color: 'var(--text-muted)', lineWidth: 1.5, opacity: 0.75 })
    if (showClean) series.push({ data: data.clean, xData: data.t, color: 'var(--primary)', lineWidth: 2, dashed: true })
    if (showDenoised) series.push({ data: data.denoised, xData: data.t, color: 'var(--series-green)', lineWidth: 2.5 })
  }

  const highlight = data && showPeaks ? {
    points: data.r_peaks.map((p, i) => ({
      x: data.t[p],
      y: data.r_peak_values[i],
      color: 'var(--series-pink)',
      radius: 6,
      stroke: '#fff',
      strokeWidth: 1.5
    }))
  } : undefined

  // RR tachogram: the successive R-peak-to-R-peak interval, in seconds - the
  // actual signal a fibrillation detector watches for irregularity in.
  const rrIntervals = data && data.r_peaks.length > 1
    ? data.r_peaks.slice(1).map((p, i) => data.t[p] - data.t[data.r_peaks[i]])
    : []

  const checkbox = (checked, onChange, label, color) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer', color, fontSize: '0.85rem' }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      {label}
    </label>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '0.6rem', padding: compact ? '0.25rem' : '0.5rem' }}>
      <div style={{
        background: 'rgba(255, 107, 157, 0.08)',
        border: '1px solid rgba(255, 107, 157, 0.35)',
        borderRadius: '8px',
        padding: '0.6rem 0.9rem',
        fontSize: '0.92rem',
        lineHeight: 1.4,
        color: 'var(--text-light)'
      }}>
        <strong style={{ color: 'var(--series-pink)' }}>Demo pe un ECG sintetic:</strong>{' '}
        eliminăm zgomotul muscular cu un wavelet Daubechies și detectăm complexul QRS (bătaia) -
        pașii prin care trece orice ECG purtabil înainte de analiza ritmului. Mărește zgomotul
        cu sliderul: detecția rezistă.
      </div>

      <div style={{ flex: showRR ? '1.6' : '1', minHeight: 220 }}>
        {error ? (
          <div style={{ color: 'var(--error)', padding: '1rem' }}>Backend indisponibil: {error}</div>
        ) : (
          <Graph
            series={series}
            highlight={highlight}
            xAxis={{ label: 'Timp (s)' }}
            yAxis={{ label: 'mV' }}
            compact={compact}
          />
        )}
      </div>

      {showRR && !error && (
        <div style={{ flex: '0.9', minHeight: 130, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
          <Graph
            series={[{
              data: rrIntervals,
              xData: rrIntervals.map((_, i) => i + 1),
              color: 'var(--series-pink)',
              lineWidth: 1.5,
              showPoints: true,
              pointRadius: 4
            }]}
            xAxis={{ label: 'Bătaia nr.' }}
            yAxis={{ label: 'R-R (s)' }}
            compact={compact}
          />
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)', textAlign: 'center' }}>
            Tahograma R-R: fibrilația atrială s-ar vedea aici ca puncte neregulate, împrăștiate -
            nu ca vârful QRS de mai sus, care rămâne recognoscibil chiar cu ritmul dezordonat.
          </p>
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1rem' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Zgomot muscular <LaTeX math={String.raw`\sigma`} />: <strong style={{ color: 'var(--series-amber)' }}>{noiseSigma.toFixed(2)}</strong>
          <input
            type="range" min="0.05" max="0.6" step="0.05"
            value={noiseSigma}
            onChange={e => setNoiseSigma(parseFloat(e.target.value))}
          />
        </label>
        {checkbox(showNoisy, setShowNoisy, 'Semnal măsurat (zgomotos)', '#8888aa')}
        {checkbox(showDenoised, setShowDenoised, 'Semnal curățat (wavelet db4)', '#00ff88')}
        {checkbox(showClean, setShowClean, 'ECG real (referință)', '#00d4ff')}
        {checkbox(showPeaks, setShowPeaks, 'Bătăi detectate (R)', '#ff6b9d')}
        {checkbox(showRR, setShowRR, 'Tahogramă R-R', '#ff6b9d')}
      </div>

      {data && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', fontSize: '0.9rem', color: 'var(--text-light)' }}>
          <span>Puls detectat: <strong style={{ color: 'var(--series-pink)' }}>{data.bpm ? data.bpm.toFixed(0) : '-'} BPM</strong></span>
          <span>Bătăi găsite: <strong>{data.r_peaks.length}</strong></span>
          <span>SNR: <strong>{data.snr_before.toFixed(1)} dB</strong> {'->'} <strong style={{ color: 'var(--series-green)' }}>{data.snr_after.toFixed(1)} dB</strong> (+{data.snr_improvement.toFixed(1)} dB)</span>
        </div>
      )}
    </div>
  )
}
