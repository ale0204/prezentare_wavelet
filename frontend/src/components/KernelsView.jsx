import { useState, useEffect, useCallback, useRef } from 'react'
import axios from 'axios'
import { LaTeXBlock } from './LaTeX'

// Helper to display fractions nicely
function formatKernelValue(val, size = 3) {
  if (Math.abs(val) < 0.005) return '0'
  if (Math.abs(val - 1) < 0.0001) return '1'
  if (Math.abs(val + 1) < 0.0001) return '-1'
  
  // Check if it's a whole number
  if (Math.abs(val - Math.round(val)) < 0.0001) {
    return Math.round(val).toString()
  }
  
  // Only check "nice" denominators for fractions
  // These are common kernel denominators: powers of 2, squares, etc.
  const niceDenominators = [2, 3, 4, 5, 6, 8, 9, 10, 12, 15, 16, 20, 25, 32, 36, 49, 64, 81, 100]
  
  for (const den of niceDenominators) {
    for (let num = 1; num < den; num++) {
      if (Math.abs(val - num / den) < 0.0001) {
        return `${num}/${den}`
      }
      if (Math.abs(val + num / den) < 0.0001) {
        return `-${num}/${den}`
      }
    }
  }
  
  // For decimals, show appropriate precision
  if (Math.abs(val) < 0.01) {
    return val.toFixed(3)
  }
  return val.toFixed(2)
}

// Extract scaling factor and integer matrix from kernel
// For blur kernels (all positive), returns sum as scale factor
function extractKernelScale(matrix) {
  if (!matrix || !matrix.length) return { scale: 1, intMatrix: matrix }
  
  const flat = matrix.flat()
  const allIntegers = flat.every(v => Math.abs(v - Math.round(v)) < 0.0001)
  const intMatrix = matrix.map(row => row.map(v => Math.round(v)))
  
  // For integer matrices, check if sum > 1 (blur kernels)
  // These should display as 1/sum * matrix
  if (allIntegers) {
    const sum = intMatrix.flat().reduce((a, b) => a + b, 0)
    // If sum > 1 and all values are positive or zero -> it's a blur kernel
    const allNonNegative = intMatrix.flat().every(v => v >= 0)
    if (sum > 1 && allNonNegative) {
      return { scale: sum, intMatrix }
    }
    return { scale: 1, intMatrix }
  }
  
  // For non-integer matrices, try to find a scale factor
  const tryScales = [2, 3, 4, 5, 6, 8, 9, 10, 12, 15, 16, 20, 25, 32, 36, 49, 64, 81, 100, 256]
  
  for (const s of tryScales) {
    const scaled = matrix.map(row => row.map(v => v * s))
    const allInt = scaled.flat().every(v => Math.abs(v - Math.round(v)) < 0.01)
    if (allInt) {
      return { 
        scale: s, 
        intMatrix: scaled.map(row => row.map(v => Math.round(v)))
      }
    }
  }
  
  return { scale: 1, intMatrix }
}

// Resize a 3x3 kernel to NxN (matches backend logic)
// Uses STANDARD kernel matrices from image processing literature
function resizeKernel(matrix, kernelId, targetSize) {
  if (!matrix) return matrix
  
  const n = targetSize
  
  // Box blur: uniform NxN - all 1s, scale will be 1/n^2
  if (kernelId === 'blur_box') {
    return Array(n).fill(null).map(() => Array(n).fill(1))
  }
  
  // Gaussian blur: STANDARD kernels from image processing
  if (kernelId === 'blur_gaussian') {
    if (n === 3) {
      // Standard 3x3 Gaussian (sum = 16)
      return [
        [1, 2, 1],
        [2, 4, 2],
        [1, 2, 1]
      ]
    } else if (n === 4) {
      // 4x4 Gaussian approximation (sum = 64)
      return [
        [1,  3,  3, 1],
        [3,  9,  9, 3],
        [3,  9,  9, 3],
        [1,  3,  3, 1]
      ]
    } else if (n === 5) {
      // Standard 5x5 Gaussian (sum = 256)
      return [
        [1,  4,  6,  4, 1],
        [4, 16, 24, 16, 4],
        [6, 24, 36, 24, 6],
        [4, 16, 24, 16, 4],
        [1,  4,  6,  4, 1]
      ]
    }
  }
  
  // Edge detection kernels: Laplacian
  if (kernelId === 'edge_laplacian') {
    if (n === 3) {
      return [
        [ 0, -1,  0],
        [-1,  4, -1],
        [ 0, -1,  0]
      ]
    } else if (n === 5) {
      return [
        [ 0,  0, -1,  0,  0],
        [ 0, -1, -2, -1,  0],
        [-1, -2, 16, -2, -1],
        [ 0, -1, -2, -1,  0],
        [ 0,  0, -1,  0,  0]
      ]
    }
    // 4x4 Laplacian
    const kernel = Array(n).fill(null).map(() => Array(n).fill(-1))
    const center = Math.floor(n / 2)
    kernel[center][center] = n * n - 1
    return kernel
  }
  
  // Laplacian with diagonals
  if (kernelId === 'edge_laplacian_diag') {
    if (n === 3) {
      return [
        [-1, -1, -1],
        [-1,  8, -1],
        [-1, -1, -1]
      ]
    }
    const kernel = Array(n).fill(null).map(() => Array(n).fill(-1))
    const center = Math.floor(n / 2)
    kernel[center][center] = n * n - 1
    return kernel
  }
  
  // Sharpen
  if (kernelId === 'sharpen') {
    if (n === 3) {
      return [
        [ 0, -1,  0],
        [-1,  5, -1],
        [ 0, -1,  0]
      ]
    } else if (n === 5) {
      return [
        [ 0,  0, -1,  0,  0],
        [ 0, -1, -2, -1,  0],
        [-1, -2, 17, -2, -1],
        [ 0, -1, -2, -1,  0],
        [ 0,  0, -1,  0,  0]
      ]
    }
    const kernel = Array(n).fill(null).map(() => Array(n).fill(0))
    const center = Math.floor(n / 2)
    // Set cross pattern
    for (let i = 0; i < n; i++) {
      kernel[center][i] = -1
      kernel[i][center] = -1
    }
    kernel[center][center] = n * 2 - 1
    return kernel
  }
  
  // Strong sharpen
  if (kernelId === 'sharpen_strong') {
    if (n === 3) {
      return [
        [-1, -1, -1],
        [-1,  9, -1],
        [-1, -1, -1]
      ]
    }
    const kernel = Array(n).fill(null).map(() => Array(n).fill(-1))
    const center = Math.floor(n / 2)
    kernel[center][center] = n * n
    return kernel
  }
  
  // Sobel X
  if (kernelId === 'edge_sobel_x') {
    if (n === 3) {
      return [
        [-1, 0, 1],
        [-2, 0, 2],
        [-1, 0, 1]
      ]
    } else if (n === 5) {
      return [
        [-1, -2, 0, 2, 1],
        [-4, -8, 0, 8, 4],
        [-6,-12, 0,12, 6],
        [-4, -8, 0, 8, 4],
        [-1, -2, 0, 2, 1]
      ]
    }
  }
  
  // Sobel Y
  if (kernelId === 'edge_sobel_y') {
    if (n === 3) {
      return [
        [-1, -2, -1],
        [ 0,  0,  0],
        [ 1,  2,  1]
      ]
    } else if (n === 5) {
      return [
        [-1, -4, -6, -4, -1],
        [-2, -8,-12, -8, -2],
        [ 0,  0,  0,  0,  0],
        [ 2,  8, 12,  8,  2],
        [ 1,  4,  6,  4,  1]
      ]
    }
  }
  
  // Prewitt X
  if (kernelId === 'edge_prewitt_x') {
    if (n === 3) {
      return [
        [-1, 0, 1],
        [-1, 0, 1],
        [-1, 0, 1]
      ]
    }
    const kernel = Array(n).fill(null).map(() => Array(n).fill(0))
    for (let i = 0; i < n; i++) {
      kernel[i][0] = -1
      kernel[i][n-1] = 1
    }
    return kernel
  }
  
  // Prewitt Y
  if (kernelId === 'edge_prewitt_y') {
    if (n === 3) {
      return [
        [-1, -1, -1],
        [ 0,  0,  0],
        [ 1,  1,  1]
      ]
    }
    const kernel = Array(n).fill(null).map(() => Array(n).fill(0))
    for (let j = 0; j < n; j++) {
      kernel[0][j] = -1
      kernel[n-1][j] = 1
    }
    return kernel
  }
  
  // Identity: all zeros except center
  if (kernelId === 'identity') {
    const kernel = Array(n).fill(null).map(() => Array(n).fill(0))
    const center = Math.floor(n / 2)
    kernel[center][center] = 1
    return kernel
  }
  
  // Emboss - keep original 3x3
  if (kernelId === 'emboss' || kernelId === 'emboss_strong') {
    return matrix
  }
  
  // Default: return original
  return matrix
}

// Real-world use captions keyed by kernel id prefix.
// Lookup: find the first prefix that matches the start of the id.
const KERNEL_CAPTIONS = {
  'blur_gaussian':  'Netezire prin medie ponderată a vecinilor - cărămida din spatele blur-ului de fundal (Portrait Mode adaugă peste ea o hartă de adâncime)',
  'blur_box':       'Netezire prin medie uniformă a vecinilor - blur-ul de bază din editoarele foto',
  'sharpen_strong': 'Accentuarea detaliilor în editoarele foto',
  'sharpen':        'Accentuarea detaliilor în editoarele foto',
  // Direcția corectă: Sobel X detectează muchii VERTICALE printr-un gradient
  // ORIZONTAL, Sobel Y detectează muchii ORIZONTALE printr-un gradient VERTICAL.
  'edge_sobel_x':   'Detectează muchii verticale (gradient orizontal) - benzile de circulație la mașinile autonome',
  'edge_sobel_y':   'Detectează muchii orizontale (gradient vertical) - benzile de circulație la mașinile autonome',
  'edge_prewitt':   'Detectarea benzilor de circulație la mașinile autonome',
  'edge_laplacian': 'Detectarea contururilor în toate direcțiile',
  'emboss':         'Efect de relief în editoarele grafice'
}

// Return the caption for a kernel id (prefix match, longest wins), or null.
function getKernelCaption(id) {
  if (!id) return null
  let best = null
  let bestLen = 0
  for (const prefix of Object.keys(KERNEL_CAPTIONS)) {
    if (id.startsWith(prefix) && prefix.length > bestLen) {
      best = KERNEL_CAPTIONS[prefix]
      bestLen = prefix.length
    }
  }
  return best
}

// Kernel categories for better organization
const KERNEL_CATEGORIES = {
  blur: {
    name: 'Blur / Smoothing',
    icon: '',
    kernels: ['blur_box', 'blur_gaussian']
  },
  sharpen: {
    name: 'Sharpen',
    icon: '',
    kernels: ['sharpen', 'sharpen_strong']
  },
  edge: {
    name: 'Edge Detection',
    icon: '',
    kernels: ['edge_laplacian', 'edge_laplacian_diag', 'edge_sobel_x', 'edge_sobel_y', 'edge_prewitt_x', 'edge_prewitt_y']
  },
  artistic: {
    name: 'Artistic Effects',
    icon: '',
    // 'outline' dropped: its matrix ([-1,-1,-1; -1,8,-1; -1,-1,-1], see backend
    // KERNELS) is byte-for-byte identical to edge_laplacian_diag - the two
    // names were the same operator shown twice under different categories.
    kernels: ['emboss', 'emboss_strong']
  },
  other: {
    name: 'Other',
    icon: '',
    kernels: ['identity']
  }
}

// Global cache for kernels data (persists across component remounts)
let kernelsCache = null
let kernelDetailsCache = {}

export default function KernelsView({ api, imageId: propImageId, sampleImages: propSampleImages = [], onImageChange, compact = false }) {
  const [kernels, setKernels] = useState(kernelsCache || [])
  const [selectedKernel, setSelectedKernel] = useState('blur_gaussian')
  const [kernelDetails, setKernelDetails] = useState(kernelDetailsCache['blur_gaussian'] || null)
  const [kernelSize, setKernelSize] = useState(3) // kernel dimension 3, 4, or 5
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showComparison, setShowComparison] = useState(true)
  const [localImageId, setLocalImageId] = useState(propImageId || 'peppers_512')
  const [localSampleImages, setLocalSampleImages] = useState([])
  
  // Use prop imageId if provided, otherwise use local state
  const imageId = propImageId || localImageId
  const sampleImages = propSampleImages.length > 0 ? propSampleImages : localSampleImages
  
  const handleImageChange = (newId) => {
    setLocalImageId(newId)
    if (onImageChange) onImageChange(newId)
  }
  
  // Load sample images if not provided
  useEffect(() => {
    if (propSampleImages.length === 0) {
      axios.get(`${api}/sample-images`)
        .then(res => setLocalSampleImages(res.data.images || []))
        .catch(err => console.error('Failed to load images:', err))
    }
  }, [api, propSampleImages.length])
  
  // Custom kernel mode
  const [customMode, setCustomMode] = useState(false)
  const [customKernel, setCustomKernel] = useState([
    [0, 0, 0],
    [0, 1, 0],
    [0, 0, 0]
  ])

  // Load available kernels (with cache)
  useEffect(() => {
    if (kernelsCache) {
      setKernels(kernelsCache)
      return
    }
    axios.get(`${api}/kernels`)
      .then(res => {
        kernelsCache = res.data.kernels
        setKernels(res.data.kernels)
        // Pre-fetch all kernel details
        res.data.kernels.forEach(k => {
          if (!kernelDetailsCache[k.id]) {
            axios.get(`${api}/kernels/${k.id}`)
              .then(r => { kernelDetailsCache[k.id] = r.data })
              .catch(() => {})
          }
        })
      })
      .catch(err => console.error('Failed to load kernels:', err))
  }, [api])

  // Load kernel details when selection changes (use cache)
  useEffect(() => {
    if (selectedKernel && !customMode) {
      if (kernelDetailsCache[selectedKernel]) {
        setKernelDetails(kernelDetailsCache[selectedKernel])
      } else {
        axios.get(`${api}/kernels/${selectedKernel}`)
          .then(res => {
            kernelDetailsCache[selectedKernel] = res.data
            setKernelDetails(res.data)
          })
          .catch(err => console.error('Failed to load kernel details:', err))
      }
    }
  }, [api, selectedKernel, customMode])

  // Guards against out-of-order responses: a slower request for an older
  // selection can resolve after a newer one already landed, which would
  // silently overwrite the current result with stale kernel output.
  const latestRequestRef = useRef(0)

  // Apply kernel to image
  const applyKernel = useCallback(async () => {
    if (!imageId) return

    const requestId = ++latestRequestRef.current
    setLoading(true)
    setError(null)
    // Don't clear result - keep showing old image while loading

    try {
      let response
      if (customMode) {
        // Apply custom kernel
        const params = new URLSearchParams()
        for (let i = 0; i < 3; i++) {
          for (let j = 0; j < 3; j++) {
            params.append(`k${i}${j}`, customKernel[i][j])
          }
        }
        response = await axios.get(`${api}/kernels/apply-custom/${imageId}?${params.toString()}`)
      } else {
        // Apply predefined kernel with kernel_size and grayscale=false for COLOR
        response = await axios.get(`${api}/kernels/apply/${imageId}`, {
          params: {
            kernel_id: selectedKernel,
            kernel_size: kernelSize,
            grayscale: false  // Keep color!
          }
        })
      }
      if (requestId === latestRequestRef.current) {
        setResult(response.data)
      }
    } catch (err) {
      if (requestId === latestRequestRef.current) {
        setError(err.response?.data?.detail || err.message)
      }
    } finally {
      if (requestId === latestRequestRef.current) {
        setLoading(false)
      }
    }
  }, [api, imageId, selectedKernel, kernelSize, customMode, customKernel])

  // Auto-apply when parameters change (debounced for smoother UX)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      applyKernel()
    }, 150) // Small delay to batch rapid changes
    return () => clearTimeout(timeoutId)
  }, [selectedKernel, kernelSize, imageId, customKernel, customMode])

  // Update custom kernel cell
  const updateCustomCell = (row, col, value) => {
    const newKernel = customKernel.map((r, i) =>
      r.map((c, j) => (i === row && j === col ? parseFloat(value) || 0 : c))
    )
    setCustomKernel(newKernel)
  }

  // Find kernel info by id
  const getKernelInfo = (id) => kernels.find(k => k.id === id)

  // ==========================================
  // COMPACT MODE - Images side by side with bottom toolbar
  // ==========================================
  if (compact) {
    return (
      <div className="kernels-view compact-mode">
        {/* Main content: Images side by side */}
        <div className="kernels-images-row">
          {result && (
            <>
              <div className="kernel-image-card">
                <div className="image-label">Original</div>
                <img 
                  src={`data:image/png;base64,${result.original}`} 
                  alt="Original" 
                />
              </div>
              <div className="kernel-image-card">
                <div className="image-label">{customMode ? 'Custom Kernel' : result.kernel_name}</div>
                <img 
                  src={`data:image/png;base64,${result.result}`} 
                  alt="Result" 
                />
              </div>
            </>
          )}
        </div>
        
        {/* Real-world use caption strip */}
        {!customMode && getKernelCaption(selectedKernel) && (
          <div className="kernel-caption-strip">
            <span className="kernel-caption-text">{getKernelCaption(selectedKernel)}</span>
          </div>
        )}

        {/* Short bridge back to the wavelet filters covered elsewhere in the tour */}
        {!customMode && (
          <p className="kernel-wavelet-note">
            <strong>Legătura cu wavelets:</strong> filtrele wavelet sunt tot kernel-uri 1D -
            low-pass extrage aproximarea (LL), high-pass extrage detaliile (LH/HL/HH).
          </p>
        )}

        {/* Bottom toolbar - wide and compact */}
        <div className="kernels-bottom-toolbar">
          <div className="toolbar-row">
            <div className="toolbar-item">
              <label>Kernel:</label>
              <select
                value={selectedKernel}
                onChange={e => setSelectedKernel(e.target.value)}
                disabled={customMode}
              >
                {Object.entries(KERNEL_CATEGORIES).map(([catId, category]) => (
                  <optgroup key={catId} label={`${category.name}`}>
                    {category.kernels.map(kId => {
                      const info = getKernelInfo(kId)
                      return info ? (
                        <option key={kId} value={kId}>{info.name}</option>
                      ) : null
                    })}
                  </optgroup>
                ))}
              </select>
            </div>
            
            <div className="toolbar-item size-control">
              <label>Dimensiune: <strong>{kernelSize}×{kernelSize}</strong></label>
              <input
                type="range"
                min="3"
                max="5"
                step="1"
                value={kernelSize}
                onChange={e => setKernelSize(parseInt(e.target.value))}
              />
            </div>
            
            <div className="toolbar-item">
              <label>Imagine:</label>
              <select
                value={imageId}
                onChange={e => handleImageChange(e.target.value)}
              >
                {sampleImages.map(img => (
                  <option key={img.id} value={img.id}>{img.name}</option>
                ))}
              </select>
            </div>

            {kernelDetails && (
              <div className="toolbar-matrix">
                {(() => {
                  const displayMatrix = resizeKernel(kernelDetails.matrix, selectedKernel, kernelSize)
                  const { scale, intMatrix } = extractKernelScale(displayMatrix)
                  return (
                    <>
                      {scale > 1 && <span className="scale-text">1/{scale} ×</span>}
                      <table className="kernel-table-mini">
                        <tbody>
                          {intMatrix.map((row, i) => (
                            <tr key={i}>
                              {row.map((val, j) => (
                                <td key={j} className={val > 0 ? 'positive' : val < 0 ? 'negative' : 'zero'}>
                                  {val}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  )
                })()}
              </div>
            )}
          </div>
        </div>
        
        {error && <div className="error compact">{error}</div>}
      </div>
    )
  }

  // ==========================================
  // NORMAL MODE - Full layout
  // ==========================================
  return (
    <div className="kernels-view">
      <div className="panel">
        <h2>Kernels / Convolutie pe Imagini</h2>
        
        <div className="info-box">
          <p>
            <strong>Convoluția 2D</strong> aplică o matrice (kernel) peste fiecare pixel al imaginii.
            Fiecare pixel rezultat este suma ponderată a vecinilor săi, folosind valorile din kernel.
          </p>
        </div>

        <div className="math-block">
          <LaTeXBlock math={String.raw`(I * K)[i,j] = \sum_{m} \sum_{n} I[i+m, j+n] \cdot K[m, n]`} />
          <span className="math-label">Convoluție 2D: Imagine * Kernel</span>
        </div>
      </div>

      <div className="panel">
        <h3>Selecteaza Kernel</h3>

        <div className="mode-toggle">
          <button
            className={!customMode ? 'active' : ''}
            onClick={() => setCustomMode(false)}
          >
            Preseturi
          </button>
          <button
            className={customMode ? 'active' : ''}
            onClick={() => setCustomMode(true)}
          >
            Custom
          </button>
        </div>

        {!customMode ? (
          <>
            <div className="kernel-categories">
              {Object.entries(KERNEL_CATEGORIES).map(([catId, category]) => (
                <div key={catId} className="kernel-category">
                  <h4>{category.name}</h4>
                  <div className="kernel-buttons">
                    {category.kernels.map(kId => {
                      const info = getKernelInfo(kId)
                      if (!info) return null
                      return (
                        <button
                          key={kId}
                          className={`kernel-btn ${selectedKernel === kId ? 'active' : ''}`}
                          onClick={() => setSelectedKernel(kId)}
                          title={info.description}
                        >
                          {info.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Real-world use caption strip */}
            {!customMode && getKernelCaption(selectedKernel) && (
              <div className="kernel-caption-strip">
                <span className="kernel-caption-text">{getKernelCaption(selectedKernel)}</span>
              </div>
            )}

            {kernelDetails && (
              <div className="kernel-details">
                <p className="kernel-description">{kernelDetails.description}</p>

                <div className="kernel-matrix-display">
                  <h4>Matricea Kernel ({kernelSize}×{kernelSize}):</h4>
                  {(() => {
                    const displayMatrix = resizeKernel(kernelDetails.matrix, selectedKernel, kernelSize)
                    const { scale, intMatrix } = extractKernelScale(displayMatrix)
                    
                    return (
                      <div className="kernel-with-scale">
                        {scale > 1 && (
                          <div className="kernel-scale">
                            <span className="scale-fraction">1/{scale}</span>
                            <span className="scale-times">×</span>
                          </div>
                        )}
                        <div className="kernel-matrix" style={{ fontSize: kernelSize > 3 ? '0.7rem' : undefined }}>
                          {intMatrix.map((row, i) => (
                            <div key={i} className="kernel-row">
                              {row.map((val, j) => (
                                <span 
                                  key={j} 
                                  className={`kernel-cell ${val > 0 ? 'positive' : val < 0 ? 'negative' : 'zero'}`}
                                  style={{ 
                                    width: kernelSize > 3 ? '40px' : undefined,
                                    height: kernelSize > 3 ? '30px' : undefined,
                                    fontSize: kernelSize > 3 ? '0.75rem' : undefined
                                  }}
                                >
                                  {val}
                                </span>
                              ))}
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })()}
                </div>
              </div>
            )}

            <div className="control-group">
              <label>Dimensiune Kernel:</label>
              <div className="kernel-size-selector">
                {[3, 4, 5].map(size => (
                  <button
                    key={size}
                    className={`size-btn ${kernelSize === size ? 'active' : ''}`}
                    onClick={() => setKernelSize(size)}
                  >
                    {size}×{size}
                  </button>
                ))}
              </div>
              <span className="hint">Kerneluri mai mari = efect mai pronunțat</span>
            </div>
          </>
        ) : (
          <div className="custom-kernel-editor">
            <p>Editează matricea 3×3 kernel:</p>
            
            <div className="kernel-matrix editable">
              {customKernel.map((row, i) => (
                <div key={i} className="kernel-row">
                  {row.map((val, j) => (
                    <input
                      key={j}
                      type="number"
                      step="0.1"
                      value={val}
                      onChange={e => updateCustomCell(i, j, e.target.value)}
                      className="kernel-cell-input"
                    />
                  ))}
                </div>
              ))}
            </div>

            <div className="quick-presets">
              <span>Quick load:</span>
              <button onClick={() => setCustomKernel([[0,0,0],[0,1,0],[0,0,0]])}>Identity</button>
              <button onClick={() => setCustomKernel([[1/9,1/9,1/9],[1/9,1/9,1/9],[1/9,1/9,1/9]])}>Box Blur</button>
              <button onClick={() => setCustomKernel([[0,-1,0],[-1,5,-1],[0,-1,0]])}>Sharpen</button>
              <button onClick={() => setCustomKernel([[0,-1,0],[-1,4,-1],[0,-1,0]])}>Laplacian</button>
            </div>
          </div>
        )}

        <div className="image-selector-inline">
          <label>Imagine:</label>
          <select
            value={imageId}
            onChange={e => handleImageChange(e.target.value)}
          >
            {sampleImages.map(img => (
              <option key={img.id} value={img.id}>{img.name}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {loading && (
        <div className="loading">
          <div className="spinner"></div>
          Aplicare kernel...
        </div>
      )}

      {result && (
        <div className="panel">
          <h3>Rezultat</h3>

          <div className="comparison-toggle">
            <label>
              <input
                type="checkbox"
                checked={showComparison}
                onChange={e => setShowComparison(e.target.checked)}
              />
              Arată comparația alăturată
            </label>
          </div>

          <div className={`image-comparison ${showComparison ? 'side-by-side' : 'single'}`}>
            {showComparison && (
              <div className="image-card">
                <h4>Original</h4>
                <img
                  src={`data:image/png;base64,${result.original}`}
                  alt="Original"
                />
              </div>
            )}

            <div className="image-card">
              <h4>{customMode ? 'Custom Kernel' : result.kernel_name}</h4>
              <img
                src={`data:image/png;base64,${result.result}`}
                alt="Result"
              />
            </div>
          </div>
        </div>
      )}

      <div className="panel">
        <h3>Explicatii Kernel-uri</h3>

        <div className="explanation-cards">
          <div className="explanation-card blur">
            <h4>Blur (Low-pass)</h4>
            <p>
              Kernelurile de blur mediază pixelii vecini, reducând frecvențele înalte (detalii, zgomot).
              Box blur folosește ponderi egale, Gaussian dă mai multă importanță centrului.
            </p>
            <div className="mini-kernel">
              <span>1/9</span><span>1/9</span><span>1/9</span>
              <span>1/9</span><span>1/9</span><span>1/9</span>
              <span>1/9</span><span>1/9</span><span>1/9</span>
            </div>
          </div>

          <div className="explanation-card edge">
            <h4>Edge Detection (High-pass)</h4>
            <p>
              Detectează schimbări rapide de intensitate (muchii). Sobel detectează muchii direcționale,
              Laplacian detectează muchii în toate direcțiile folosind derivata a doua.
            </p>
            <div className="mini-kernel">
              <span>0</span><span>-1</span><span>0</span>
              <span>-1</span><span>4</span><span>-1</span>
              <span>0</span><span>-1</span><span>0</span>
            </div>
          </div>

          <div className="explanation-card sharpen">
            <h4>Sharpen</h4>
            <p>
              Amplifica diferentele locale: centrul pozitiv mare, vecini negativi.
              Efectul este opusul blur-ului - accentueaza detaliile.
            </p>
            <div className="mini-kernel">
              <span>0</span><span>-1</span><span>0</span>
              <span>-1</span><span>5</span><span>-1</span>
              <span>0</span><span>-1</span><span>0</span>
            </div>
          </div>

          <div className="explanation-card emboss">
            <h4>Emboss</h4>
            <p>
              Creeaza un efect 3D de relief. Kernel-ul asimetric evidentiaza tranzitiile
              într-o direcție specifică, simulând lumina dintr-un unghi.
            </p>
            <div className="mini-kernel">
              <span>-2</span><span>-1</span><span>0</span>
              <span>-1</span><span>1</span><span>1</span>
              <span>0</span><span>1</span><span>2</span>
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <h3>Legatura cu Wavelets</h3>
        <div className="info-box success">
          <p>
            Filtrele wavelet sunt tot kerneluri 1D, aplicate pe rânduri și pe coloane.
            <strong> Low-pass</strong> (ca blur) extrage aproximarea (LL),
            <strong> High-pass</strong> (ca edge detection) extrage detaliile (LH, HL, HH).
          </p>
          <p style={{ marginTop: '0.5rem' }}>
            Diferența: wavelets folosesc <strong>subeșantionare</strong> și aplicare
            <strong> recursivă</strong> pentru descompunere multi-rezoluție.
          </p>
        </div>
      </div>
    </div>
  )
}
