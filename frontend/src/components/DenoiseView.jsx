import { useState, useEffect } from 'react'
import axios from 'axios'
import LaTeX, { LaTeXBlock } from './LaTeX'

export default function DenoiseView({ api, imageId, sampleImages = [], onImageChange }) {
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const [wavelet, setWavelet] = useState('db4')
  const [levels, setLevels] = useState(3)
  const [mode, setMode] = useState('soft')
  // 15 by default: at 25 the universal threshold oversmooths and the
  // result looks like an oil painting instead of a denoised photo
  const [noiseSigma, setNoiseSigma] = useState(15)

  const wavelets = [
    { id: 'haar', name: 'Haar' },
    { id: 'db4', name: 'Daubechies 4' },
    { id: 'db8', name: 'Daubechies 8' },
    { id: 'sym4', name: 'Symlet 4' },
    { id: 'coif2', name: 'Coiflet 2' }
  ]

  const handleDenoise = async () => {
    if (!imageId) return

    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        wavelet,
        levels: levels.toString(),
        mode,
        add_noise: 'true',
        noise_sigma: noiseSigma.toString()
      })

      const response = await axios.get(
        `${api}/denoise-sample/${imageId}?${params}`
      )

      setResult(response.data)
    } catch (err) {
      setError(err.response?.data?.detail || err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (imageId) {
      handleDenoise()
    }
  }, [imageId])

  // Power factor corresponding to the SNR gain (10 dB = 10x power). SNR here
  // is a power ratio (backend/main.py: mean(signal^2)/mean(error^2)), which
  // matches "mai puternic" (power, not amplitude) in the sentence below.
  const powerFactor = result?.snr_improvement
    ? Math.pow(10, result.snr_improvement / 10)
    : null

  return (
    <div className="denoise-practical-view">
      {/* Real-life anchor */}
      <div className="denoise-analogy">
        <strong>Aceeași problemă ca la Night Mode pe telefon:</strong> o fotografie plină de
        granulație. Aici o rezolvăm pe calea wavelet: zgomotul trăiește în coeficienții mici
        (variații fine, aleatorii), algoritmul îi taie sub un prag și reconstruiește imaginea
        curată.
      </div>

      {/* Controls row */}
      <div className="denoise-controls-row">
        <div className="control-group">
          <label>Wavelet</label>
          <select value={wavelet} onChange={e => setWavelet(e.target.value)}>
            {wavelets.map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>

        <div className="control-group">
          <label>Niveluri: {levels}</label>
          <input
            type="range"
            min="1"
            max="4"
            value={levels}
            onChange={e => setLevels(parseInt(e.target.value))}
          />
        </div>

        <div className="control-group">
          <label>Prag</label>
          <select value={mode} onChange={e => setMode(e.target.value)}>
            <option value="soft">Soft (moale)</option>
            <option value="hard">Hard (dur)</option>
          </select>
        </div>

        <div className="control-group">
          <label>Zgomot <LaTeX math={String.raw`\sigma`} />: {noiseSigma}</label>
          <input
            type="range"
            min="5"
            max="50"
            value={noiseSigma}
            onChange={e => setNoiseSigma(parseInt(e.target.value))}
          />
        </div>

        <div className="control-group">
          <label>Imagine</label>
          <select
            value={imageId}
            onChange={e => onImageChange?.(e.target.value)}
          >
            {sampleImages.map(img => (
              <option key={img.id} value={img.id}>{img.name}</option>
            ))}
          </select>
        </div>

        <button className={`denoise-btn ${loading ? 'loading' : ''}`} onClick={handleDenoise} disabled={loading}>
          Aplică
        </button>
      </div>

      {error && <div className="error">Eroare: {error}</div>}

      {result && (
        <div className={`denoise-results ${loading ? 'loading' : ''}`}>
          {/* Images row */}
          <div className="denoise-images">
            <div className="denoise-image-card">
              <h4>Original</h4>
              <div className="img-wrapper">
                <img
                  src={`data:image/png;base64,${result.original}`}
                  alt="Original"
                />
              </div>
            </div>

            {result.noisy && (
              <div className="denoise-image-card">
                <h4>Cu zgomot (<LaTeX math={String.raw`\sigma`} />={noiseSigma})</h4>
                <div className="img-wrapper">
                  <img
                    src={`data:image/png;base64,${result.noisy}`}
                    alt="Noisy"
                  />
                </div>
              </div>
            )}

            <div className="denoise-image-card">
              <h4>Curățat de zgomot ({mode})</h4>
              <div className="img-wrapper">
                <img
                  src={`data:image/png;base64,${result.denoised}`}
                  alt="Denoised"
                />
              </div>
            </div>

            {result.difference && (
              <div className="denoise-image-card">
                <h4>Ce s-a eliminat (x10)</h4>
                <div className="img-wrapper">
                  <img
                    src={`data:image/png;base64,${result.difference}`}
                    alt="Diferenta amplificata"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Stats row */}
          <div className="denoise-stats">
            <div className="stat-item">
              <span className="stat-label">SNR Inițial</span>
              <span className="stat-value">{result.snr_before?.toFixed(1)} dB</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">SNR Final</span>
              <span className="stat-value">{result.snr_after?.toFixed(1)} dB</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Prag automat (<LaTeX math={String.raw`2\sigma`} />)</span>
              <span className="stat-value">{result.threshold_used.toFixed(2)}</span>
            </div>
            <div className="stat-item success">
              <span className="stat-label">Îmbunătățire</span>
              <span className="stat-value">+{result.snr_improvement?.toFixed(2) || 0} dB</span>
            </div>
          </div>

          {/* Plain-language interpretation + the formula behind the threshold */}
          <div className="denoise-interpretation">
            <div className="denoise-formula">
              <LaTeXBlock math={String.raw`\lambda = 2\hat{\sigma} = ${result.threshold_used.toFixed(1)}, \quad \hat{\sigma} = \frac{\text{median}(|HH_1|)}{0.6745} = ${result.estimated_sigma?.toFixed(1)}`} />
            </div>
            {result.snr_improvement != null && powerFactor && (
              <p>
                În cuvinte: semnalul util este acum de <strong>{powerFactor.toFixed(1)} ori</strong> mai
                puternic față de zgomot decât înainte ({result.snr_before?.toFixed(1)} dB
                {' -> '}{result.snr_after?.toFixed(1)} dB). Imaginea "Ce s-a eliminat" arată exact
                ce a tăiat pragul: zgomot granular, fără structuri ale imaginii - dovada că
                am eliminat zgomotul, nu detaliile.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
