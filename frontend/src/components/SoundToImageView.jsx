import { useState, useEffect } from 'react'
import axios from 'axios'

/**
 * SoundToImageView - "De la sunet la imagine":
 * shows a grayscale image side-by-side with its 2D FFT magnitude spectrum.
 * Explains that the same Fourier logic from 1D signals applies to 2D images.
 */
export default function SoundToImageView({ api = '/api', compact = false }) {
  // Empty until the list arrives - avoids fetching a default image
  // that immediately gets replaced by the first list entry
  const [imageId, setImageId] = useState('')
  const [sampleImages, setSampleImages] = useState([])
  const [imageData, setImageData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  // Load sample image list once
  useEffect(() => {
    axios.get(`${api}/sample-images`)
      .then(res => {
        const images = res.data.images || []
        setSampleImages(images.slice(0, 6))
        if (images.length > 0) setImageId(images[0].id)
      })
      .catch(() => {
        // Backend down - use fallback list
        setSampleImages([{ id: 'peppers_512', name: 'Peppers' }])
        setImageId('peppers_512')
      })
  }, [api])

  // Load FFT data whenever imageId changes
  useEffect(() => {
    if (!imageId) return
    setLoading(true)
    setError(null)
    axios.get(`${api}/fourier/image`, { params: { image_id: imageId } })
      .then(res => {
        setImageData(res.data)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [api, imageId])

  const panelStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.4rem',
    flex: 1,
    minHeight: 0
  }

  // The image takes whatever height the row has left: on the fixed stage that
  // is most of the slide, and a spectrum nobody can see is worth nothing
  const imgStyle = {
    minHeight: 0,
    flex: 1,
    maxWidth: '100%',
    objectFit: 'contain',
    borderRadius: '6px',
    border: '1px solid var(--border)'
  }

  const labelStyle = {
    fontSize: '1rem',
    color: 'var(--text-muted)',
    textAlign: 'center',
    flexShrink: 0
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '0.6rem', padding: compact ? '0.25rem' : '0.5rem' }}>

      {/* Image selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
        <label style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>Imagine:</label>
        <select
          value={imageId}
          onChange={e => setImageId(e.target.value)}
          style={{
            background: 'var(--bg-card)',
            color: 'var(--text-light)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            padding: '0.3rem 0.5rem',
            fontSize: '0.85rem'
          }}
        >
          {sampleImages.map(img => (
            <option key={img.id} value={img.id}>{img.name}</option>
          ))}
        </select>
        {loading && (
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Se încarcă...</span>
        )}
      </div>

      {/* Side-by-side image panels */}
      {error ? (
        <div style={{ color: 'var(--error, #ff4444)', padding: '1rem' }}>
          Backend indisponibil: {error}
        </div>
      ) : imageData ? (
        <div style={{ display: 'flex', gap: '1rem', flex: 1, minHeight: 0 }}>
          <div style={panelStyle}>
            <img
              src={`data:image/png;base64,${imageData.original}`}
              alt="Imaginea originală"
              style={imgStyle}
            />
            <span style={labelStyle}>Imagine originală (nivele de gri)</span>
          </div>
          <div style={panelStyle}>
            <img
              src={`data:image/png;base64,${imageData.magnitude}`}
              alt="Spectrul de magnitudine FFT 2D"
              style={imgStyle}
            />
            <span style={labelStyle}>Spectrul de magnitudine FFT 2D (scară log)</span>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
          Așteaptă...
        </div>
      )}

      {/* Narrative explanation */}
      <p style={{
        margin: 0,
        fontSize: compact ? '1rem' : '1.05rem',
        lineHeight: 1.5,
        color: 'var(--text-light)',
        background: 'rgba(201,177,255,0.08)',
        border: '1px solid rgba(201,177,255,0.25)',
        borderRadius: '8px',
        padding: '0.6rem 0.9rem'
      }}>
        Tot ce am văzut la semnale 1D se generalizează la imagini: frecvențele joase (centrul spectrului)
        = zone uniforme - cer, pereți; frecvențele înalte (marginile) = muchii și texturi.
        Blur-ul de telefon = filtru low-pass 2D. Sharpen = high-pass.
      </p>
    </div>
  )
}
