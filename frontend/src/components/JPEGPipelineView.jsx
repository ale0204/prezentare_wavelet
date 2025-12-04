import { useState, useEffect, useRef, useMemo } from 'react'
import LaTeX, { LaTeXBlock } from './LaTeX'
import '../styles/views/jpeg.css'
import { pointerPos } from './shared/stage'
import { canvasTheme, resolveColor } from './shared/canvasTheme'
import { PlayIcon, PauseIcon, SkipStartIcon, SkipEndIcon } from './shared/TransportIcons'

// ============================================
// JPEG PIPELINE VISUALIZATION
// Complete JPEG encoding/decoding demonstration
// ============================================

// Standard JPEG Quantization Matrix (luminance)
const JPEG_QUANT_MATRIX = [
  [16, 11, 10, 16, 24, 40, 51, 61],
  [12, 12, 14, 19, 26, 58, 60, 55],
  [14, 13, 16, 24, 40, 57, 69, 56],
  [14, 17, 22, 29, 51, 87, 80, 62],
  [18, 22, 37, 56, 68, 109, 103, 77],
  [24, 35, 55, 64, 81, 104, 113, 92],
  [49, 64, 78, 87, 103, 121, 120, 101],
  [72, 92, 95, 98, 112, 100, 103, 99]
]

// Zigzag scan order for 8x8 block
const ZIGZAG_ORDER = [
  [0,0], [0,1], [1,0], [2,0], [1,1], [0,2], [0,3], [1,2],
  [2,1], [3,0], [4,0], [3,1], [2,2], [1,3], [0,4], [0,5],
  [1,4], [2,3], [3,2], [4,1], [5,0], [6,0], [5,1], [4,2],
  [3,3], [2,4], [1,5], [0,6], [0,7], [1,6], [2,5], [3,4],
  [4,3], [5,2], [6,1], [7,0], [7,1], [6,2], [5,3], [4,4],
  [3,5], [2,6], [1,7], [2,7], [3,6], [4,5], [5,4], [6,3],
  [7,2], [7,3], [6,4], [5,5], [4,6], [3,7], [4,7], [5,6],
  [6,5], [7,4], [7,5], [6,6], [5,7], [6,7], [7,6], [7,7]
]

// Generate DCT basis function for position (u, v)
function generateDCTBasis(u, v, size = 8) {
  const basis = []
  for (let x = 0; x < size; x++) {
    const row = []
    for (let y = 0; y < size; y++) {
      const val = Math.cos((2 * x + 1) * u * Math.PI / 16) *
                  Math.cos((2 * y + 1) * v * Math.PI / 16)
      row.push(val)
    }
    basis.push(row)
  }
  return basis
}

// Apply 2D DCT to a block
function applyDCT(block) {
  const N = 8
  const result = []
  
  for (let u = 0; u < N; u++) {
    const row = []
    for (let v = 0; v < N; v++) {
      let sum = 0
      const cu = u === 0 ? 1 / Math.sqrt(2) : 1
      const cv = v === 0 ? 1 / Math.sqrt(2) : 1
      
      for (let x = 0; x < N; x++) {
        for (let y = 0; y < N; y++) {
          sum += block[x][y] *
                 Math.cos((2 * x + 1) * u * Math.PI / 16) *
                 Math.cos((2 * y + 1) * v * Math.PI / 16)
        }
      }
      row.push(0.25 * cu * cv * sum)
    }
    result.push(row)
  }
  return result
}

// Apply inverse DCT
function applyIDCT(coeffs) {
  const N = 8
  const result = []
  
  for (let x = 0; x < N; x++) {
    const row = []
    for (let y = 0; y < N; y++) {
      let sum = 0
      for (let u = 0; u < N; u++) {
        for (let v = 0; v < N; v++) {
          const cu = u === 0 ? 1 / Math.sqrt(2) : 1
          const cv = v === 0 ? 1 / Math.sqrt(2) : 1
          sum += cu * cv * coeffs[u][v] *
                 Math.cos((2 * x + 1) * u * Math.PI / 16) *
                 Math.cos((2 * y + 1) * v * Math.PI / 16)
        }
      }
      row.push(0.25 * sum)
    }
    result.push(row)
  }
  return result
}

// Effective quantization matrix at a given quality (standard IJG scaling).
// This is the matrix actually used for the division, so displays must show
// THIS one, not the base 50%-quality JPEG_QUANT_MATRIX.
function scaledQuantMatrix(quality = 50) {
  const scale = quality < 50 ? (5000 / quality) : (200 - 2 * quality)
  return JPEG_QUANT_MATRIX.map(row => row.map(q =>
    Math.max(1, Math.min(255, Math.floor((q * scale + 50) / 100)))
  ))
}

// Quantize DCT coefficients
function quantize(dctBlock, quality = 50) {
  const qMatrix = scaledQuantMatrix(quality)
  return dctBlock.map((row, i) => row.map((v, j) => Math.round(v / qMatrix[i][j])))
}

// Dequantize
function dequantize(quantBlock, quality = 50) {
  const qMatrix = scaledQuantMatrix(quality)
  return quantBlock.map((row, i) => row.map((v, j) => v * qMatrix[i][j]))
}

// RGB to YCbCr conversion
function rgbToYCbCr(r, g, b) {
  const y = 0.299 * r + 0.587 * g + 0.114 * b
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b
  return { y, cb, cr }
}

// YCbCr to RGB conversion
function ycbcrToRgb(y, cb, cr) {
  const r = y + 1.402 * (cr - 128)
  const g = y - 0.344136 * (cb - 128) - 0.714136 * (cr - 128)
  const b = y + 1.772 * (cb - 128)
  return {
    r: Math.max(0, Math.min(255, Math.round(r))),
    g: Math.max(0, Math.min(255, Math.round(g))),
    b: Math.max(0, Math.min(255, Math.round(b)))
  }
}

// ============================================
// SUB-COMPONENTS FOR EACH PIPELINE STAGE
// ============================================

// Stage 1: Color Space Conversion
function ColorSpaceView({ compact, api = '/api' }) {
  const canvasRef = useRef()
  const [viewMode, setViewMode] = useState('rgb') // 'rgb', 'y', 'cb', 'cr', 'ycbcr'
  const [apiImages, setApiImages] = useState([])
  const [selectedImage, setSelectedImage] = useState(null)
  // Real RGBA pixels (Uint8ClampedArray) sampled from a real photo, so the
  // conversion has actual detail to separate into channels instead of a
  // synthetic gradient that has nothing to lose either way.
  const [pixelData, setPixelData] = useState(null)
  const PHOTO_SIZE = 64

  useEffect(() => {
    fetch(`${api}/sample-images`)
      .then(r => r.json())
      .then(d => {
        setApiImages(d.images || [])
        if (d.images?.length > 0) setSelectedImage(d.images[0].id)
      })
      .catch(() => {})
  }, [api])

  useEffect(() => {
    if (!selectedImage) return
    const img = new Image()
    img.onload = () => {
      try {
        const off = document.createElement('canvas')
        off.width = PHOTO_SIZE
        off.height = PHOTO_SIZE
        const octx = off.getContext('2d')
        octx.drawImage(img, 0, 0, PHOTO_SIZE, PHOTO_SIZE)
        setPixelData(octx.getImageData(0, 0, PHOTO_SIZE, PHOTO_SIZE).data)
      } catch (e) {
        // Cross-origin canvas read blocked (e.g. api served from a different
        // host with no CORS image access) - fail soft, keep the loading text.
        console.error('ColorSpaceView: could not read photo pixels', e)
        setPixelData(null)
      }
    }
    img.onerror = () => setPixelData(null)
    img.crossOrigin = 'anonymous'
    img.src = `${api}/sample-images/${selectedImage}/raw`
  }, [api, selectedImage])

  useEffect(() => {
    drawColorSpace()
  }, [viewMode, pixelData])

  const drawColorSpace = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const width = compact ? 680 : 900
    const height = compact ? 505 : 670

    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = width + 'px'
    canvas.style.height = height + 'px'
    ctx.scale(dpr, dpr)

    ctx.fillStyle = canvasTheme().bg
    ctx.fillRect(0, 0, width, height)

    if (!pixelData) {
      ctx.fillStyle = canvasTheme().textFaint
      ctx.font = '18px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText('Se încarcă fotografia...', width / 2, height / 2)
      return
    }

    const imgWidth = PHOTO_SIZE
    const imgHeight = PHOTO_SIZE

    // Same real photo, laid out as a 2x2 grid of channel views. The block size
    // has to satisfy both directions: fixed at 4/5 it made the Cb and Cr row
    // run past the bottom of the panel, where it was cut off.
    const gridGap = 40
    const offsetY = 30
    const rowLabel = 50
    const fitByWidth = (width - gridGap) / (imgWidth * 2)
    const fitByHeight = (height - offsetY - 2 * rowLabel - 40) / (imgHeight * 2)
    // Grow to whatever the panel allows. A fixed cap of 4 left the lower half
    // of the panel empty and shrank the four channels below the point where a
    // projected audience can compare them.
    const blockSize = Math.max(2, Math.min(9, Math.floor(Math.min(fitByWidth, fitByHeight))))

    const totalGridWidth = imgWidth * blockSize * 2 + gridGap
    const offsetX = (width - totalGridWidth) / 2

    // Draw original RGB and converted channels
    const channels = ['rgb', 'y', 'cb', 'cr']
    const labels = ['Original RGB', 'Y (Luminanță)', 'Cb (Blue-diff)', 'Cr (Red-diff)']
    const rowHeight = imgHeight * blockSize + rowLabel
    const positions = [
      { x: offsetX, y: offsetY },
      { x: offsetX + imgWidth * blockSize + gridGap, y: offsetY },
      { x: offsetX, y: offsetY + rowHeight },
      { x: offsetX + imgWidth * blockSize + gridGap, y: offsetY + rowHeight }
    ]

    for (let c = 0; c < channels.length; c++) {
      const pos = positions[c]
      const isHighlighted = viewMode === channels[c]

      // Draw label
      // Not '#fff': on the white theme that painted three of the four channel
      // labels invisible against the canvas background.
      ctx.fillStyle = resolveColor(isHighlighted ? canvasTheme().gold : canvasTheme().textStrong)
      ctx.font = `bold ${isHighlighted ? 15 : 13}px system-ui`
      ctx.textAlign = 'center'
      ctx.fillText(labels[c], pos.x + (imgWidth * blockSize) / 2, pos.y - 8)

      // Draw image - ALWAYS show all channels, highlight selected
      for (let y = 0; y < imgHeight; y++) {
        for (let x = 0; x < imgWidth; x++) {
          // Real pixel from the photo (RGBA, row-major)
          const idx = (y * imgWidth + x) * 4
          const r = pixelData[idx]
          const g = pixelData[idx + 1]
          const b = pixelData[idx + 2]

          const { y: yVal, cb, cr } = rgbToYCbCr(r, g, b)
          
          let color
          if (channels[c] === 'rgb') {
            color = `rgb(${r},${g},${b})`
          } else if (channels[c] === 'y') {
            const gray = Math.floor(yVal)
            color = `rgb(${gray},${gray},${gray})`
          } else if (channels[c] === 'cb') {
            color = `rgb(${128-Math.floor(cb-128)},${128-Math.floor(cb-128)},${Math.floor(cb)})`
          } else {
            color = `rgb(${Math.floor(cr)},${128-Math.floor(cr-128)},${128-Math.floor(cr-128)})`
          }
          
          ctx.fillStyle = resolveColor(color)
          ctx.fillRect(pos.x + x * blockSize, pos.y + y * blockSize, blockSize, blockSize)
        }
      }
      
      // Border - highlight selected channel
      ctx.strokeStyle = resolveColor(isHighlighted ? canvasTheme().gold : 'var(--border)')
      ctx.lineWidth = isHighlighted ? 3 : 1
      ctx.strokeRect(pos.x - 1, pos.y - 1, imgWidth * blockSize + 2, imgHeight * blockSize + 2)
    }
  }
  
  // Get formula and description based on view mode
  const getFormulaInfo = () => {
    switch (viewMode) {
      case 'y':
        return {
          formula: String.raw`Y = 0.299R + 0.587G + 0.114B`,
          note: 'Luminanța (Y) reprezintă strălucirea percepută - ochiul uman este cel mai sensibil la aceasta'
        }
      case 'cb':
        return {
          formula: String.raw`C_b = 128 - 0.169R - 0.331G + 0.500B`,
          note: 'Crominanța albastră (Cb) măsoară diferența dintre albastru și luminanță'
        }
      case 'cr':
        return {
          formula: String.raw`C_r = 128 + 0.500R - 0.419G - 0.081B`,
          note: 'Crominanța roșie (Cr) măsoară diferența dintre roșu și luminanță'
        }
      default:
        return {
          formula: String.raw`\begin{aligned} Y &= 0.299R + 0.587G + 0.114B \\ C_b &= 128 - 0.169R - 0.331G + 0.500B \\ C_r &= 128 + 0.500R - 0.419G - 0.081B \end{aligned}`,
          note: 'Conversia din RGB în YCbCr separă luminanța de crominanță'
        }
    }
  }

  const formulaInfo = getFormulaInfo()

  return (
    <div className="color-space-view">
      <div className="stage-header">
        <h4>Etapa 1: Conversia din RGB în YCbCr</h4>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="image-selector">
            <label>Imagine: </label>
            <select
              value={selectedImage || ''}
              onChange={(e) => setSelectedImage(e.target.value)}
            >
              {apiImages.map(img => (
                <option key={img.id} value={img.id}>{img.name}</option>
              ))}
            </select>
          </div>
          <div className="view-toggle">
            {['rgb', 'y', 'cb', 'cr'].map(mode => (
              <button
                key={mode}
                className={viewMode === mode ? 'active' : ''}
                onClick={() => setViewMode(mode)}
              >
                {mode.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      <canvas ref={canvasRef} />
      
      <div className="formula-box" style={{ padding: '5px 20px', background: 'rgba(255,215,0,0.08)', borderRadius: '8px', border: '1px solid rgba(255,215,0,0.2)' }}>
        <LaTeX math={formulaInfo.formula} />
        <p className="note" style={{ marginTop: '3px', color: 'var(--text-muted)', fontSize: '13px' }}>{formulaInfo.note}</p>
      </div>
    </div>
  )
}

// Stage 2: Chroma Subsampling
function ChromaSubsamplingView({ compact }) {
  const canvasRef = useRef()
  const [subsamplingMode, setSubsamplingMode] = useState('4:2:0')
  
  useEffect(() => {
    drawSubsampling()
  }, [subsamplingMode])
  
  const drawSubsampling = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const width = compact ? 1050 : 1150
    const height = compact ? 450 : 500
    
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = width + 'px'
    canvas.style.height = height + 'px'
    ctx.scale(dpr, dpr)
    
    ctx.fillStyle = canvasTheme().bg
    ctx.fillRect(0, 0, width, height)
    
    const cellSize = 38
    const gridW = 8
    const gridH = 4
    
    const modes = ['4:4:4', '4:2:2', '4:2:0']
    const reductions = ['100%', '67%', '50%']
    
    // Calculate total width needed and center
    const gridWidth = gridW * cellSize
    const gapBetweenGrids = 50
    const totalWidth = 3 * gridWidth + 2 * gapBetweenGrids
    const startX = (width - totalWidth) / 2
    
    modes.forEach((mode, modeIdx) => {
      const offsetX = startX + modeIdx * (gridWidth + gapBetweenGrids)
      const offsetY = 80
      
      const isActive = mode === subsamplingMode
      
      // Label
      ctx.fillStyle = resolveColor(isActive ? canvasTheme().gold : canvasTheme().textFaint)
      ctx.font = `bold ${isActive ? 18 : 16}px system-ui`
      ctx.textAlign = 'center'
      ctx.fillText(mode, offsetX + (gridW * cellSize) / 2, offsetY - 30)
      ctx.font = '13px system-ui'
      ctx.fillStyle = resolveColor(isActive ? canvasTheme().green : 'var(--text-muted)')
      ctx.fillText(`Date: ${reductions[modeIdx]}`, offsetX + (gridW * cellSize) / 2, offsetY - 10)
      
      // Draw grid
      for (let y = 0; y < gridH; y++) {
        for (let x = 0; x < gridW; x++) {
          const px = offsetX + x * cellSize
          const py = offsetY + y * cellSize
          
          // Y sample (always present) - green dot
          ctx.fillStyle = 'rgba(0, 200, 110, 0.16)'
          ctx.fillRect(px, py, cellSize, cellSize)
          ctx.strokeStyle = canvasTheme().border
          ctx.strokeRect(px, py, cellSize, cellSize)
          
          // Y dot
          ctx.beginPath()
          ctx.arc(px + cellSize/2, py + cellSize/2, 4, 0, Math.PI * 2)
          ctx.fillStyle = canvasTheme().green
          ctx.fill()
          
          // Cb/Cr samples based on mode
          let hasCbCr = false
          if (mode === '4:4:4') {
            hasCbCr = true
          } else if (mode === '4:2:2') {
            hasCbCr = (x % 2 === 0)
          } else if (mode === '4:2:0') {
            hasCbCr = (x % 2 === 0) && (y % 2 === 0)
          }
          
          if (hasCbCr) {
            // Cb (blue)
            ctx.beginPath()
            ctx.arc(px + cellSize/3, py + cellSize/2 - 6, 3, 0, Math.PI * 2)
            ctx.fillStyle = canvasTheme().blue
            ctx.fill()
            
            // Cr (red)
            ctx.beginPath()
            ctx.arc(px + cellSize*2/3, py + cellSize/2 + 6, 3, 0, Math.PI * 2)
            ctx.fillStyle = canvasTheme().red
            ctx.fill()
          }
        }
      }
      
      // Highlight active
      if (isActive) {
        ctx.strokeStyle = canvasTheme().gold
        ctx.lineWidth = 2
        ctx.strokeRect(offsetX - 2, offsetY - 2, gridW * cellSize + 4, gridH * cellSize + 4)
        ctx.lineWidth = 1
      }
    })
    
    // Legend - centered at bottom
    const legendY = height - 30
    const legendStartX = width / 2 - 120
    ctx.textAlign = 'left'
    ctx.font = '13px system-ui'
    
    ctx.beginPath()
    ctx.arc(legendStartX, legendY, 6, 0, Math.PI * 2)
    ctx.fillStyle = canvasTheme().green
    ctx.fill()
    ctx.fillStyle = canvasTheme().text
    ctx.fillText('Y (Luminanță)', legendStartX + 12, legendY + 4)
    
    ctx.beginPath()
    ctx.arc(legendStartX + 130, legendY, 5, 0, Math.PI * 2)
    ctx.fillStyle = canvasTheme().blue
    ctx.fill()
    ctx.fillStyle = canvasTheme().text
    ctx.fillText('Cb', legendStartX + 140, legendY + 4)
    
    ctx.beginPath()
    ctx.arc(legendStartX + 190, legendY, 5, 0, Math.PI * 2)
    ctx.fillStyle = canvasTheme().red
    ctx.fill()
    ctx.fillStyle = canvasTheme().text
    ctx.fillText('Cr', legendStartX + 200, legendY + 4)
  }
  
  return (
    <div className="chroma-subsampling-view">
      <div className="stage-header">
        <h4>Etapa 2: Subsampling Crominanță</h4>
        <div className="view-toggle">
          {['4:4:4', '4:2:2', '4:2:0'].map(mode => (
            <button 
              key={mode}
              className={subsamplingMode === mode ? 'active' : ''}
              onClick={() => setSubsamplingMode(mode)}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>
      
      <canvas ref={canvasRef} />
    </div>
  )
}

// Stage 3: DCT Basis Functions (64 patterns) - with image visualization like Mona Lisa
function DCTBasisView({ compact, api = '/api' }) {
  const canvasRef = useRef()
  const [hoveredBasis, setHoveredBasis] = useState(null)
  const [selectedBlock, setSelectedBlock] = useState({ x: 5, y: 4 })
  const [apiImages, setApiImages] = useState([])
  const [selectedImage, setSelectedImage] = useState(null)
  const [loadedImageData, setLoadedImageData] = useState(null)
  
  // Fetch available images on mount
  useEffect(() => {
    fetch(`${api}/sample-images`)
      .then(r => r.json())
      .then(d => {
        setApiImages(d.images || [])
        if (d.images?.length > 0) setSelectedImage(d.images[0].id)
      })
      .catch(() => {})
  }, [])
  
  // Load image when selection changes - use 256 for better quality
  useEffect(() => {
    if (selectedImage) {
      fetch(`${api}/sample-images/${selectedImage}/grayscale?size=256`)
        .then(r => r.json())
        .then(d => setLoadedImageData(d.pixels))
        .catch(() => setLoadedImageData(null))
    }
  }, [selectedImage])
  
  // Generate synthetic fallback if no API image - 256x256 for 32 blocks
  const syntheticData = useMemo(() => {
    const size = 256 // 32 blocks of 8x8
    const data = []
    for (let y = 0; y < size; y++) {
      const row = []
      for (let x = 0; x < size; x++) {
        const cx = size / 2, cy = size / 2.2
        const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
        const faceVal = Math.max(0, 1 - dist / 100)
        const texture = Math.sin(x * 0.15) * Math.cos(y * 0.15) * 0.1
        const bg = 0.3 + y / size * 0.3
        const val = Math.min(1, Math.max(0, faceVal * 0.6 + bg * 0.4 + texture))
        row.push(Math.floor(val * 255))
      }
      data.push(row)
    }
    return data
  }, [])
  
  // Use loaded image or fallback to synthetic
  const imageData = loadedImageData || syntheticData
  
  // Pre-compute all 64 basis functions
  const allBasis = useMemo(() => {
    const basis = []
    for (let u = 0; u < 8; u++) {
      for (let v = 0; v < 8; v++) {
        basis.push({ u, v, pattern: generateDCTBasis(u, v) })
      }
    }
    return basis
  }, [])
  
  // Image size (256 = 32 blocks of 8x8)
  const imgDataSize = imageData?.length || 256
  const numBlocks = imgDataSize / 8
  
  // Get selected 8x8 block
  const selectedBlockData = useMemo(() => {
    const block = []
    const startX = selectedBlock.x * 8
    const startY = selectedBlock.y * 8
    for (let i = 0; i < 8; i++) {
      const row = []
      for (let j = 0; j < 8; j++) {
        row.push(imageData[startY + i]?.[startX + j] || 0)
      }
      block.push(row)
    }
    return block
  }, [selectedBlock, imageData])
  
  useEffect(() => {
    drawBasis()
  }, [hoveredBasis, selectedBlock, imageData])
  
  const drawBasis = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const width = compact ? 1120 : 1800
    const height = compact ? 462 : 740
    
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = width + 'px'
    canvas.style.height = height + 'px'
    ctx.scale(dpr, dpr)
    
    // Enable image smoothing for better quality
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    
    ctx.fillStyle = canvasTheme().bg
    ctx.fillRect(0, 0, width, height)
    
    // Guard against undefined imageData
    if (!imageData || imageData.length === 0) {
      ctx.fillStyle = canvasTheme().textFaint
      ctx.font = '18px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText('Se încarcă imaginea...', width / 2, height / 2)
      return
    }
    
    // Calculate total layout width first for centering
    const imgSize = compact ? 480 : 540
    const zoomSize = compact ? 180 : 200
    const basisCellSize = compact ? 58 : 64
    const basisGap = 2
    const basisGridWidth = 8 * basisCellSize + 7 * basisGap
    const arrowGap = 40
    const gapBeforeBasis = 70  // Space before DCT grid (includes vertical label space)
    const totalLayoutWidth = imgSize + arrowGap + zoomSize + arrowGap + gapBeforeBasis + basisGridWidth
    
    // Center everything horizontally
    const startX = (width - totalLayoutWidth) / 2
    const centerY = height / 2
    
    // === LEFT: Image with 8x8 grid ===
    const imgX = startX
    const imgY = centerY - imgSize / 2
    const pixelSize = imgSize / imgDataSize
    
    // Draw the image with proper pixel rendering
    for (let y = 0; y < imgDataSize; y++) {
      for (let x = 0; x < imgDataSize; x++) {
        const val = imageData[y]?.[x] || 0
        ctx.fillStyle = `rgb(${val},${val},${val})`
        ctx.fillRect(imgX + x * pixelSize, imgY + y * pixelSize, pixelSize + 0.5, pixelSize + 0.5)
      }
    }
    
    // Draw 8x8 block grid
    ctx.strokeStyle = 'rgba(100, 100, 100, 0.4)'
    ctx.lineWidth = 0.5
    for (let i = 0; i <= numBlocks; i++) {
      ctx.beginPath()
      ctx.moveTo(imgX + i * 8 * pixelSize, imgY)
      ctx.lineTo(imgX + i * 8 * pixelSize, imgY + imgSize)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(imgX, imgY + i * 8 * pixelSize)
      ctx.lineTo(imgX + imgSize, imgY + i * 8 * pixelSize)
      ctx.stroke()
    }
    
    // Highlight selected block
    ctx.strokeStyle = canvasTheme().gold
    ctx.lineWidth = 3
    ctx.strokeRect(
      imgX + selectedBlock.x * 8 * pixelSize,
      imgY + selectedBlock.y * 8 * pixelSize,
      8 * pixelSize,
      8 * pixelSize
    )
    
    // Labels - BIGGER
    ctx.fillStyle = canvasTheme().textStrong
    ctx.font = 'bold 18px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText('Imagine cu grid 8x8', imgX + imgSize / 2, imgY - 15)
    ctx.font = '14px system-ui'
    ctx.fillStyle = canvasTheme().textFaint
    ctx.fillText('Click pentru a selecta un bloc', imgX + imgSize / 2, imgY + imgSize + 22)
    
    // === HORIZONTAL ARROW 1: Image -> Zoomed Block ===
    const arrow1StartX = imgX + imgSize + 12
    const arrow1EndX = arrow1StartX + arrowGap - 5
    
    ctx.strokeStyle = canvasTheme().gold
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(arrow1StartX, centerY)
    ctx.lineTo(arrow1EndX, centerY)
    ctx.stroke()
    // Arrow head
    ctx.beginPath()
    ctx.moveTo(arrow1EndX - 10, centerY - 7)
    ctx.lineTo(arrow1EndX, centerY)
    ctx.lineTo(arrow1EndX - 10, centerY + 7)
    ctx.stroke()
    
    // === ZOOMED BLOCK ===
    const zoomX = arrow1EndX + 12
    const zoomY = centerY - zoomSize / 2
    const zoomCellSize = zoomSize / 8
    
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const val = selectedBlockData[i][j]
        ctx.fillStyle = `rgb(${val},${val},${val})`
        ctx.fillRect(zoomX + j * zoomCellSize, zoomY + i * zoomCellSize, zoomCellSize, zoomCellSize)
        ctx.strokeStyle = canvasTheme().border
        ctx.lineWidth = 0.5
        ctx.strokeRect(zoomX + j * zoomCellSize, zoomY + i * zoomCellSize, zoomCellSize, zoomCellSize)
      }
    }
    ctx.strokeStyle = canvasTheme().gold
    ctx.lineWidth = 2
    ctx.strokeRect(zoomX, zoomY, zoomSize, zoomSize)
    
    // Label for zoomed block - BIGGER
    ctx.fillStyle = canvasTheme().cyan
    ctx.font = 'bold 16px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText(`Bloc (${selectedBlock.x}, ${selectedBlock.y})`, zoomX + zoomSize / 2, zoomY - 15)
    
    // === HORIZONTAL ARROW 2: Zoomed Block -> DCT Basis ===
    const arrow2StartX = zoomX + zoomSize + 12
    const arrow2EndX = arrow2StartX + arrowGap - 5
    
    ctx.strokeStyle = canvasTheme().cyan
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(arrow2StartX, centerY)
    ctx.lineTo(arrow2EndX, centerY)
    ctx.stroke()
    // Arrow head
    ctx.beginPath()
    ctx.moveTo(arrow2EndX - 10, centerY - 7)
    ctx.lineTo(arrow2EndX, centerY)
    ctx.lineTo(arrow2EndX - 10, centerY + 7)
    ctx.stroke()
    // DCT label on arrow - BIGGER
    ctx.fillStyle = canvasTheme().cyan
    ctx.font = 'bold 14px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText('DCT', arrow2StartX + arrowGap / 2, centerY - 15)
    
    // === RIGHT SIDE: 64 DCT Basis Functions ===
    const basisGridHeight = basisGridWidth
    const basisStartX = arrow2EndX + gapBeforeBasis - arrowGap + 15  // More space for vertical label
    const basisStartY = centerY - basisGridHeight / 2
    
    ctx.fillStyle = canvasTheme().gold
    ctx.font = 'bold 18px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText('64 Funcții Bază DCT', basisStartX + basisGridWidth / 2, basisStartY - 15)
    
    // Draw frequency labels - positioned to avoid overlap - BIGGER
    ctx.fillStyle = canvasTheme().cyan
    ctx.font = '14px system-ui'
    ctx.save()
    ctx.translate(basisStartX - 30, basisStartY + basisGridHeight / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.textAlign = 'center'
    ctx.fillText('frecvență verticală (u), crescătoare', 0, 0)
    ctx.restore()

    ctx.textAlign = 'center'
    ctx.fillText('frecvență orizontală (v), crescătoare', basisStartX + basisGridWidth / 2, basisStartY + basisGridHeight + 22)
    
    // Draw each basis pattern
    for (let u = 0; u < 8; u++) {
      for (let v = 0; v < 8; v++) {
        const pattern = allBasis[u * 8 + v].pattern
        
        const bx = basisStartX + v * (basisCellSize + basisGap)
        const by = basisStartY + u * (basisCellSize + basisGap)
        
        const basisPixelSize = basisCellSize / 8
        
        for (let i = 0; i < 8; i++) {
          for (let j = 0; j < 8; j++) {
            const val = pattern[i][j]
            // Map -1..1 to color
            const intensity = Math.floor((val + 1) * 127.5)
            ctx.fillStyle = `rgb(${intensity}, ${intensity}, ${intensity})`
            ctx.fillRect(bx + j * basisPixelSize, by + i * basisPixelSize, basisPixelSize + 0.5, basisPixelSize + 0.5)
          }
        }
        
        // Highlight on hover or DC
        const isHovered = hoveredBasis && hoveredBasis.u === u && hoveredBasis.v === v
        const isDC = u === 0 && v === 0
        ctx.strokeStyle = resolveColor(isHovered ? canvasTheme().gold : (isDC ? canvasTheme().green : 'rgba(80,80,80,0.5)'))
        ctx.lineWidth = isHovered ? 2 : (isDC ? 2 : 0.5)
        ctx.strokeRect(bx, by, basisCellSize, basisCellSize)
      }
    }
    
    // Info for hovered basis - BIGGER
    if (hoveredBasis) {
      ctx.fillStyle = canvasTheme().gold
      ctx.font = 'bold 16px system-ui'
      ctx.textAlign = 'left'
      ctx.fillText(`Bază (u=${hoveredBasis.u}, v=${hoveredBasis.v}) - Frecvență totală: ${hoveredBasis.u + hoveredBasis.v}`, basisStartX, height - 12)
    }
  }
  
  const handleMouseMove = (e) => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const { x, y } = pointerPos(e, canvas)
    
    // Calculate layout sizes (must match drawBasis)
    const width = compact ? 1120 : 1800
    const height = compact ? 462 : 740
    const imgSize = compact ? 480 : 540
    const zoomSize = compact ? 180 : 200
    const basisCellSize = compact ? 58 : 64
    const basisGap = 2
    const basisGridWidth = 8 * basisCellSize + 7 * basisGap
    const arrowGap = 40
    const gapBeforeBasis = 70
    const totalLayoutWidth = imgSize + arrowGap + zoomSize + arrowGap + gapBeforeBasis + basisGridWidth
    const startX = (width - totalLayoutWidth) / 2
    const centerY = height / 2
    
    const arrow1EndX = startX + imgSize + 12 + arrowGap - 5
    const zoomX = arrow1EndX + 12
    const arrow2EndX = zoomX + zoomSize + 12 + arrowGap - 5
    const basisStartX = arrow2EndX + gapBeforeBasis - arrowGap + 15
    const basisGridHeight = basisGridWidth
    const basisStartY = centerY - basisGridHeight / 2
    
    const v = Math.floor((x - basisStartX) / (basisCellSize + basisGap))
    const u = Math.floor((y - basisStartY) / (basisCellSize + basisGap))
    
    if (u >= 0 && u < 8 && v >= 0 && v < 8) {
      setHoveredBasis({ u, v })
    } else {
      setHoveredBasis(null)
    }
  }
  
  const handleClick = (e) => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const { x, y } = pointerPos(e, canvas)
    
    // Calculate layout sizes (must match drawBasis)
    const width = compact ? 1120 : 1800
    const height = compact ? 462 : 740
    const imgSize = compact ? 480 : 540
    const zoomSize = compact ? 180 : 200
    const basisCellSize = compact ? 58 : 64
    const basisGap = 2
    const basisGridWidth = 8 * basisCellSize + 7 * basisGap
    const arrowGap = 40
    const gapBeforeBasis = 70
    const totalLayoutWidth = imgSize + arrowGap + zoomSize + arrowGap + gapBeforeBasis + basisGridWidth
    const startX = (width - totalLayoutWidth) / 2
    const centerY = height / 2
    
    const imgX = startX
    const imgY = centerY - imgSize / 2
    const pixelSize = imgSize / imgDataSize
    
    if (x >= imgX && x < imgX + imgSize && y >= imgY && y < imgY + imgSize) {
      const blockX = Math.floor((x - imgX) / (8 * pixelSize))
      const blockY = Math.floor((y - imgY) / (8 * pixelSize))
      if (blockX >= 0 && blockX < numBlocks && blockY >= 0 && blockY < numBlocks) {
        setSelectedBlock({ x: blockX, y: blockY })
      }
    }
  }
  
  return (
    <div className="dct-basis-view">
      <div className="stage-header">
        <h4>Funcții Bază DCT - Descompunerea Blocurilor</h4>
        <div className="image-selector">
          <label>Imagine: </label>
          <select 
            value={selectedImage || ''} 
            onChange={(e) => setSelectedImage(e.target.value)}
          >
            {apiImages.map(img => (
              <option key={img.id} value={img.id}>{img.name}</option>
            ))}
          </select>
        </div>
      </div>
      
      <canvas 
        ref={canvasRef} 
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredBasis(null)}
        onClick={handleClick}
        style={{ cursor: 'pointer' }}
      />
      
      <div className="formula-box" style={{ marginTop: '10px', padding: '14px 24px', background: 'rgba(255,215,0,0.1)', borderRadius: '8px', border: '1px solid rgba(255,215,0,0.3)' }}>
        <LaTeX math={String.raw`\Large DCT(u,v) = \frac{1}{4} C_u C_v \displaystyle\sum_{x=0}^{7} \displaystyle\sum_{y=0}^{7} f(x,y) \cos\frac{(2x+1)u\pi}{16} \cos\frac{(2y+1)v\pi}{16}`} />
      </div>
    </div>
  )
}

// Stage 4: Block Division & DCT Transform
function BlockDCTView({ compact, onBlockChange }) {
  const canvasRef = useRef()
  const [selectedBlockIdx, setSelectedBlockIdx] = useState(0)
  
  // Pre-defined sample blocks that look like real image patches
  const sampleBlocks = useMemo(() => [
    // Block 1: Smooth gradient (like a face area)
    Array.from({length: 8}, (_, i) => 
      Array.from({length: 8}, (_, j) => Math.round(140 + i * 8 + j * 4 + Math.sin(i+j) * 10))
    ),
    // Block 2: Edge pattern (like hair/background edge)
    Array.from({length: 8}, (_, i) => 
      Array.from({length: 8}, (_, j) => j < 4 ? 60 + i * 5 : 180 - i * 5)
    ),
    // Block 3: Textured area
    Array.from({length: 8}, (_, i) => 
      Array.from({length: 8}, (_, j) => Math.round(100 + 40 * Math.sin(i * 0.8) * Math.cos(j * 0.8)))
    ),
    // Block 4: High contrast
    Array.from({length: 8}, (_, i) => 
      Array.from({length: 8}, (_, j) => ((i + j) % 2 === 0) ? 200 : 80)
    ),
  ], [])
  
  const sampleBlock = sampleBlocks[selectedBlockIdx]
  
  // Centered block (subtract 128)
  const centeredBlock = useMemo(() => {
    return sampleBlock.map(row => row.map(v => v - 128))
  }, [sampleBlock])
  
  // DCT of centered block
  const dctBlock = useMemo(() => {
    return applyDCT(centeredBlock)
  }, [centeredBlock])
  
  // Quantize and notify parent
  const quantizedBlock = useMemo(() => {
    return quantize(dctBlock, 50)
  }, [dctBlock])
  
  useEffect(() => {
    if (onBlockChange) {
      onBlockChange(quantizedBlock)
    }
  }, [quantizedBlock, onBlockChange])
  
  useEffect(() => {
    drawBlockDCT()
  }, [selectedBlockIdx, sampleBlock])
  
  const drawBlockDCT = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const width = compact ? 1000 : 1250
    const height = compact ? 505 : 620
    
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = width + 'px'
    canvas.style.height = height + 'px'
    ctx.scale(dpr, dpr)
    
    ctx.fillStyle = canvasTheme().bg
    ctx.fillRect(0, 0, width, height)
    
    const centerX = width / 2
    const centerY = height / 2
    
    // Bigger cell sizes for both blocks
    const leftCellSize = compact ? 58 : 64
    const rightCellSize = compact ? 48 : 54
    const arrowGap = 70
    
    // Calculate total width and center properly
    const leftBlockWidth = 8 * leftCellSize
    const rightBlockWidth = 8 * rightCellSize
    const totalWidth = leftBlockWidth + arrowGap + rightBlockWidth
    const startX = centerX - totalWidth / 2
    
    // Left: Original pixel values - BIGGER
    const leftX = startX
    const leftBlockHeight = 8 * leftCellSize
    const leftOffsetY = centerY - leftBlockHeight / 2
    
    ctx.fillStyle = canvasTheme().cyan
    ctx.font = 'bold 16px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText('Bloc Original (0-255)', leftX + leftBlockWidth / 2, leftOffsetY - 18)
    
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const val = sampleBlock[i][j]
        const gray = val
        ctx.fillStyle = `rgb(${gray}, ${gray}, ${gray})`
        ctx.fillRect(leftX + j * leftCellSize, leftOffsetY + i * leftCellSize, leftCellSize, leftCellSize)
        
        ctx.strokeStyle = canvasTheme().border
        ctx.lineWidth = 1
        ctx.strokeRect(leftX + j * leftCellSize, leftOffsetY + i * leftCellSize, leftCellSize, leftCellSize)
        
        ctx.fillStyle = resolveColor(gray > 128 ? '#000' : '#fff')
        ctx.font = 'bold 15px monospace'
        ctx.textAlign = 'center'
        ctx.fillText(val.toString(), leftX + j * leftCellSize + leftCellSize/2, leftOffsetY + i * leftCellSize + leftCellSize/2 + 5)
      }
    }
    
    // Arrow - centered vertically between blocks
    const arrowStartX = leftX + leftBlockWidth + 10
    const arrowEndX = arrowStartX + arrowGap - 20
    ctx.strokeStyle = canvasTheme().gold
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(arrowStartX, centerY)
    ctx.lineTo(arrowEndX, centerY)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(arrowEndX - 8, centerY - 8)
    ctx.lineTo(arrowEndX, centerY)
    ctx.lineTo(arrowEndX - 8, centerY + 8)
    ctx.stroke()
    
    ctx.fillStyle = canvasTheme().gold
    ctx.font = 'bold 15px system-ui'
    ctx.textAlign = 'center'
    const arrowMidX = (arrowStartX + arrowEndX) / 2
    ctx.fillText('DCT', arrowMidX, centerY - 18)
    ctx.font = '13px system-ui'
    ctx.fillText('-128', arrowMidX, centerY + 28)
    
    // Right: DCT coefficients
    const rightX = leftX + leftBlockWidth + arrowGap
    const rightBlockHeight = 8 * rightCellSize
    const rightOffsetY = centerY - rightBlockHeight / 2
    
    ctx.fillStyle = canvasTheme().orange
    ctx.font = 'bold 16px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText('Coeficienți DCT', rightX + rightBlockWidth / 2, rightOffsetY - 18)
    
    // Max |AC| for the diverging color map (DC dominates, so exclude it)
    let maxAC = 1
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        if (i !== 0 || j !== 0) maxAC = Math.max(maxAC, Math.abs(dctBlock[i][j]))
      }
    }

    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const val = dctBlock[i][j]
        const isDC = i === 0 && j === 0

        // Diverging map: blue = negative, red = positive, dark = ~0; DC gold
        if (isDC) {
          ctx.fillStyle = 'rgba(255, 215, 0, 0.35)'
        } else {
          const t = Math.min(1, Math.abs(val) / maxAC)
          ctx.fillStyle = val < 0
            ? `rgba(70, 130, 255, ${0.1 + 0.6 * t})`
            : `rgba(255, 99, 71, ${0.1 + 0.6 * t})`
        }
        ctx.fillRect(rightX + j * rightCellSize, rightOffsetY + i * rightCellSize, rightCellSize, rightCellSize)

        ctx.strokeStyle = resolveColor(isDC ? canvasTheme().gold : 'var(--border)')
        ctx.lineWidth = isDC ? 3 : 1
        ctx.strokeRect(rightX + j * rightCellSize, rightOffsetY + i * rightCellSize, rightCellSize, rightCellSize)

        // Value text (signed)
        const displayVal = Math.abs(val) < 0.5 ? '0' : val.toFixed(0)
        ctx.fillStyle = canvasTheme().textStrong
        ctx.font = 'bold 13px monospace'
        ctx.textAlign = 'center'
        ctx.fillText(displayVal, rightX + j * rightCellSize + rightCellSize/2, rightOffsetY + i * rightCellSize + rightCellSize/2 + 4)
      }
    }

    // DC coefficient highlight + color legend - below blocks
    ctx.fillStyle = canvasTheme().gold
    ctx.font = 'bold 14px system-ui'
    ctx.textAlign = 'left'
    ctx.fillText('DC (media blocului x 8)', rightX, rightOffsetY + rightBlockHeight + 25)
    ctx.fillStyle = canvasTheme().text
    ctx.font = '14px system-ui'
    ctx.textAlign = 'right'
    ctx.fillText('Frecvențe înalte tind spre 0', rightX + rightBlockWidth, rightOffsetY + rightBlockHeight + 25)
    ctx.fillStyle = canvasTheme().blue
    ctx.font = '13px system-ui'
    ctx.textAlign = 'left'
    ctx.fillText('albastru = negativ', rightX, rightOffsetY + rightBlockHeight + 45)
    ctx.fillStyle = canvasTheme().orange
    ctx.fillText('roșu = pozitiv', rightX + 140, rightOffsetY + rightBlockHeight + 45)
  }
  
  return (
    <div className="block-dct-view">
      <div className="stage-header">
        <h4>Etapa 3-4: Împărțire în blocuri 8x8 + DCT</h4>
        <div className="view-toggle">
          {['Gradient', 'Margine', 'Textură', 'Contrast'].map((name, idx) => (
            <button 
              key={idx}
              className={selectedBlockIdx === idx ? 'active' : ''}
              onClick={() => setSelectedBlockIdx(idx)}
            >
              {name}
            </button>
          ))}
        </div>
      </div>
      
      <canvas ref={canvasRef} />
      
      <div className="info-row">
        <span className="highlight">DC</span> = componenta medie. Frecvențele înalte (dreapta-jos) sunt aproape de zero.
      </div>
    </div>
  )
}

// Stage 5: Quantization
function QuantizationView({ compact, onQuantizedChange }) {
  const canvasRef = useRef()
  const [quality, setQuality] = useState(50)
  
  // Real DCT coefficients of the smooth-gradient sample block from stage 3-4
  // (centered around 0), so DCT / Q / result stay mathematically consistent
  // and signs look like real data (the old synthetic block was all-positive
  // with an impossible DC of 1024).
  const sampleDCT = useMemo(() => {
    const block = Array.from({length: 8}, (_, i) =>
      Array.from({length: 8}, (_, j) => Math.round(140 + i * 8 + j * 4 + Math.sin(i + j) * 10) - 128)
    )
    return applyDCT(block).map(row => row.map(v => Math.round(v)))
  }, [])
  
  const quantized = useMemo(() => quantize(sampleDCT, quality), [sampleDCT, quality])
  
  // Notify parent of quantized block change
  useEffect(() => {
    if (onQuantizedChange) {
      onQuantizedChange(quantized)
    }
  }, [quantized, onQuantizedChange])
  
  // Count zeros
  const zeroCount = useMemo(() => {
    let count = 0
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        if (quantized[i][j] === 0) count++
      }
    }
    return count
  }, [quantized])
  
  useEffect(() => {
    drawQuantization()
  }, [quality, quantized])
  
  const drawQuantization = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const width = compact ? 1120 : 1250
    const height = compact ? 506 : 580
    
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = width + 'px'
    canvas.style.height = height + 'px'
    ctx.scale(dpr, dpr)
    
    ctx.fillStyle = canvasTheme().bg
    ctx.fillRect(0, 0, width, height)
    
    const cellSize = compact ? 40 : 46
    const offsetY = 65
    const gap = compact ? 55 : 65
    
    // Calculate centering
    const totalMatrixWidth = 3 * (8 * cellSize) + 2 * gap
    const startOffsetX = (width - totalMatrixWidth) / 2
    
    // Three matrices: DCT, Q (the EFFECTIVE one at this quality), Quantized
    const qMatrix = scaledQuantMatrix(quality)
    const matrices = [
      { label: 'Coeficienți DCT', data: sampleDCT, color: 'var(--primary)' },
      { label: `Matrice Q (calitate ${quality}%)`, data: qMatrix, color: 'var(--series-orange)' },
      { label: 'round(DCT / Q)', data: quantized, color: 'var(--series-green)' }
    ]

    // Max |AC| for the diverging color map on the DCT matrix
    let maxAC = 1
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        if (i !== 0 || j !== 0) maxAC = Math.max(maxAC, Math.abs(sampleDCT[i][j]))
      }
    }
    
    matrices.forEach((mat, mIdx) => {
      const offsetX = startOffsetX + mIdx * (8 * cellSize + gap)
      
      // Label
      ctx.fillStyle = resolveColor(mat.color)
      ctx.font = 'bold 13px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText(mat.label, offsetX + 4 * cellSize, offsetY - 12)
      
      // Draw division / equals signs - positioned in the gap between matrices
      if (mIdx === 1) {
        ctx.fillStyle = canvasTheme().gold
        ctx.font = 'bold 36px system-ui'
        ctx.textAlign = 'center'
        ctx.fillText('/', offsetX - gap/2, offsetY + 4 * cellSize + 5)
      }
      if (mIdx === 2) {
        ctx.fillStyle = canvasTheme().gold
        ctx.font = 'bold 36px system-ui'
        ctx.textAlign = 'center'
        ctx.fillText('=', offsetX - gap/2, offsetY + 4 * cellSize + 5)
      }
      
      // Draw matrix
      for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
          const val = mat.data[i][j]

          let bgColor = canvasTheme().panel
          if (mIdx === 0) {
            // Diverging map on DCT coefficients: blue = negative, red = positive
            if (i === 0 && j === 0) {
              bgColor = 'rgba(255, 215, 0, 0.25)'
            } else {
              const t = Math.min(1, Math.abs(val) / maxAC)
              bgColor = val < 0
                ? `rgba(70, 130, 255, ${0.12 + 0.55 * t})`
                : `rgba(255, 99, 71, ${0.12 + 0.55 * t})`
            }
          }
          if (mIdx === 2) {
            // Highlight zeros in quantized
            bgColor = val === 0 ? 'rgba(255, 107, 157, 0.3)' : 'rgba(0, 255, 136, 0.15)'
          }

          ctx.fillStyle = resolveColor(bgColor)
          ctx.fillRect(offsetX + j * cellSize, offsetY + i * cellSize, cellSize, cellSize)

          ctx.strokeStyle = canvasTheme().border
          ctx.strokeRect(offsetX + j * cellSize, offsetY + i * cellSize, cellSize, cellSize)

          // Value
          const displayVal = val.toString()
          ctx.fillStyle = resolveColor(val === 0 && mIdx === 2 ? canvasTheme().pink : canvasTheme().textStrong)
          ctx.font = '13px monospace'
          ctx.textAlign = 'center'
          ctx.fillText(displayVal.substring(0, 5), offsetX + j * cellSize + cellSize/2, offsetY + i * cellSize + cellSize/2 + 4)
        }
      }
    })

    // Legend + zero count
    ctx.font = 'bold 13px system-ui'
    ctx.textAlign = 'center'
    ctx.fillStyle = canvasTheme().blue
    ctx.fillText('albastru = coeficient negativ', width / 2 - 220, height - 15)
    ctx.fillStyle = canvasTheme().orange
    ctx.fillText('roșu = pozitiv', width / 2 - 60, height - 15)
    ctx.fillStyle = canvasTheme().pink
    ctx.fillText(`${zeroCount}/64 zerouri (${Math.round(zeroCount/64*100)}%)`, width / 2 + 110, height - 15)
  }
  
  return (
    <div className="quantization-view">
      <div className="stage-header">
        <h4>Etapa 5: Cuantizare</h4>
        <div className="quality-slider">
          <span>Calitate: {quality}%</span>
          <input 
            type="range" 
            min="10" 
            max="95" 
            value={quality} 
            onChange={(e) => setQuality(parseInt(e.target.value))}
          />
        </div>
      </div>
      
      <canvas ref={canvasRef} />
      
      <div className="info-row">
        Calitate mică, cuantizare agresivă, mai multe zerouri, compresie mai mare
      </div>
    </div>
  )
}

// Stage 6: Zigzag Scan
function ZigzagView({ compact, quantizedBlock }) {
  const canvasRef = useRef()
  // Starts partway through (not 0) so the sequence/RLE panels show real
  // content immediately instead of sitting empty until Play is pressed.
  const [animStep, setAnimStep] = useState(8)
  const [isPlaying, setIsPlaying] = useState(false)
  
  useEffect(() => {
    if (isPlaying && animStep < 64) {
      const timer = setTimeout(() => setAnimStep(s => s + 1), 80)
      return () => clearTimeout(timer)
    } else if (animStep >= 64) {
      setIsPlaying(false)
    }
  }, [isPlaying, animStep])
  
  useEffect(() => {
    drawZigzag()
  }, [animStep, quantizedBlock])
  
  const drawZigzag = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const width = compact ? 1000 : 1100
    const height = compact ? 500 : 550
    
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = width + 'px'
    canvas.style.height = height + 'px'
    ctx.scale(dpr, dpr)
    
    ctx.fillStyle = canvasTheme().bg
    ctx.fillRect(0, 0, width, height)
    
    const cellSize = compact ? 40 : 48
    const offsetX = 50
    const offsetY = 60
    
    // Draw matrix with zigzag path
    ctx.fillStyle = canvasTheme().gold
    ctx.font = 'bold 13px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText('Scanare Zigzag', offsetX + 4 * cellSize, offsetY - 10)
    
    // Draw cells
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const val = quantizedBlock[i][j]
        const isVisited = ZIGZAG_ORDER.slice(0, animStep).some(([r, c]) => r === i && c === j)
        const isCurrent = animStep > 0 && ZIGZAG_ORDER[animStep - 1][0] === i && ZIGZAG_ORDER[animStep - 1][1] === j
        
        ctx.fillStyle = resolveColor(isCurrent ? canvasTheme().gold : (isVisited ? 'rgba(0, 255, 136, 0.2)' : canvasTheme().panel))
        ctx.fillRect(offsetX + j * cellSize, offsetY + i * cellSize, cellSize, cellSize)
        
        ctx.strokeStyle = resolveColor(isCurrent ? canvasTheme().gold : (isVisited ? canvasTheme().green : 'var(--bg-elevated)'))
        ctx.lineWidth = isCurrent ? 2 : 1
        ctx.strokeRect(offsetX + j * cellSize, offsetY + i * cellSize, cellSize, cellSize)
        
        ctx.fillStyle = resolveColor(val === 0 ? 'var(--text-muted)' : canvasTheme().textStrong)
        ctx.font = '13px monospace'
        ctx.textAlign = 'center'
        ctx.fillText(val.toString(), offsetX + j * cellSize + cellSize/2, offsetY + i * cellSize + cellSize/2 + 4)
      }
    }
    
    // Draw zigzag path
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.5)'
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let i = 0; i < Math.min(animStep, 64); i++) {
      const [r, c] = ZIGZAG_ORDER[i]
      const x = offsetX + c * cellSize + cellSize/2
      const y = offsetY + r * cellSize + cellSize/2
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
    
    // Output sequence
    const seqX = offsetX + 8 * cellSize + 50
    const seqWidth = width - seqX - 30
    ctx.fillStyle = canvasTheme().green
    ctx.font = 'bold 16px system-ui'
    ctx.textAlign = 'left'
    ctx.fillText('Secvență 1D:', seqX, offsetY)
    
    // Show sequence - wrap to multiple lines
    const sequence = ZIGZAG_ORDER.slice(0, animStep).map(([r, c]) => quantizedBlock[r][c])
    ctx.fillStyle = canvasTheme().textStrong
    ctx.font = 'bold 15px monospace'
    
    // Display full sequence in rows
    const itemsPerRow = 14
    for (let row = 0; row < Math.ceil(sequence.length / itemsPerRow); row++) {
      const rowSeq = sequence.slice(row * itemsPerRow, (row + 1) * itemsPerRow)
      const seqStr = rowSeq.map(v => v.toString().padStart(4, ' ')).join('')
      ctx.fillText(seqStr, seqX, offsetY + 24 + row * 22)
    }
    
    // Count consecutive zeros (for RLE)
    let rle = []
    let zeroCount = 0
    for (const val of sequence) {
      if (val === 0) {
        zeroCount++
      } else {
        if (zeroCount > 0) rle.push(`(0x${zeroCount})`)
        rle.push(val.toString())
        zeroCount = 0
      }
    }
    if (zeroCount > 0) rle.push(`(0x${zeroCount})`)
    
    // RLE section - positioned below sequence
    const rleY = offsetY + 130
    ctx.fillStyle = canvasTheme().orange
    ctx.font = 'bold 16px system-ui'
    ctx.fillText('RLE Encoding:', seqX, rleY)
    ctx.fillStyle = canvasTheme().textStrong
    ctx.font = 'bold 15px monospace'
    
    // Display RLE in wrapped rows
    let rleRow = 0
    let rleX = seqX
    const maxRleWidth = seqWidth
    for (const item of rle) {
      const itemWidth = ctx.measureText(item + ' ').width
      if (rleX + itemWidth > seqX + maxRleWidth) {
        rleRow++
        rleX = seqX
      }
      ctx.fillStyle = resolveColor(item.startsWith('(') ? canvasTheme().pink : canvasTheme().green)
      ctx.fillText(item, rleX, rleY + 26 + rleRow * 22)
      rleX += itemWidth
    }
    
    // Info
    ctx.fillStyle = canvasTheme().textFaint
    ctx.font = '13px system-ui'
    ctx.fillText('Zerourile consecutive se comprimă eficient', seqX, rleY + 80 + rleRow * 22)
  }
  
  return (
    <div className="zigzag-view">
      <div className="stage-header">
        <h4>Etapa 6: Scanare Zigzag + RLE</h4>
        <div className="anim-controls">
          <button
            onClick={() => { setAnimStep(0); setIsPlaying(false) }}
            aria-label="Reia de la început"
            aria-label="Reia de la început"
          >
            <SkipStartIcon size={16} />
          </button>
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            title={isPlaying ? 'Pauză' : 'Redă'}
            aria-label={isPlaying ? 'Pauză' : 'Redă'}
          >
            {isPlaying ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
          </button>
          <button
            onClick={() => { setIsPlaying(false); setAnimStep(64) }}
            aria-label="Sari la final"
            aria-label="Sari la final"
          >
            <SkipEndIcon size={16} />
          </button>
          <input
            type="range"
            min="0"
            max="64"
            value={animStep}
            onChange={(e) => { setIsPlaying(false); setAnimStep(parseInt(e.target.value)) }}
            className="zigzag-scrub"
            aria-label="Derulează manual prin cei 64 de coeficienți"
            aria-label="Derulează manual prin cei 64 de coeficienți"
          />
        </div>
      </div>

      <canvas ref={canvasRef} />
    </div>
  )
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function JPEGPipelineView({ compact = false, initialStage = 0, api = '/api' }) {
  const [activeStage, setActiveStage] = useState(initialStage)
  
  // Shared quantized block between Quantization and Zigzag views
  const [sharedQuantizedBlock, setSharedQuantizedBlock] = useState(null)
  
  // Create a default quantized block for zigzag if not yet set
  const defaultQuantizedBlock = useMemo(() => {
    const block = []
    for (let i = 0; i < 8; i++) {
      const row = []
      for (let j = 0; j < 8; j++) {
        if (i === 0 && j === 0) row.push(125)
        else if (i + j < 3) row.push(Math.floor(Math.random() * 15 - 5))
        else if (i + j < 5) row.push(Math.random() > 0.6 ? Math.floor(Math.random() * 3) : 0)
        else row.push(0)
      }
      block.push(row)
    }
    return block
  }, [])
  
  const stages = [
    { id: 'color', name: 'RGB->YCbCr', component: ColorSpaceView },
    { id: 'subsample', name: 'Subsampling', component: ChromaSubsamplingView },
    { id: 'block-dct', name: 'Blocuri+DCT', component: BlockDCTView },
    { id: 'basis', name: 'Bază DCT', component: DCTBasisView },
    { id: 'quantize', name: 'Cuantizare', component: QuantizationView },
    { id: 'zigzag', name: 'Zigzag+RLE', component: ZigzagView },
  ]
  
  const ActiveComponent = stages[activeStage].component
  
  // Props to pass based on component type
  const getComponentProps = () => {
    const baseProps = { compact: compact, api: api }
    if (stages[activeStage].id === 'quantize') {
      return { ...baseProps, onQuantizedChange: setSharedQuantizedBlock }
    }
    if (stages[activeStage].id === 'zigzag') {
      return { ...baseProps, quantizedBlock: sharedQuantizedBlock || defaultQuantizedBlock }
    }
    return baseProps
  }
  
  if (compact) {
    return (
      <div className="jpeg-pipeline-view compact-mode">
        <div className="stage-tabs">
          {stages.map((stage, idx) => (
            <button
              key={stage.id}
              className={`stage-tab ${activeStage === idx ? 'active' : ''}`}
              onClick={() => setActiveStage(idx)}
            >
              <span className="tab-name">{stage.name}</span>
            </button>
          ))}
        </div>
        
        <div className="stage-content">
          <ActiveComponent {...getComponentProps()} />
        </div>
      </div>
    )
  }
  
  // Full mode
  return (
    <div className="jpeg-pipeline-view">
      <div className="panel">
        <h2>Pipeline-ul JPEG</h2>
        <p className="description">
          JPEG folosește Transformata Cosinus Discretă (DCT) pentru a comprima imagini.
          Explorează fiecare etapă a procesului de compresie.
        </p>
      </div>
      
      <div className="stage-selector">
        {stages.map((stage, idx) => (
          <button
            key={stage.id}
            className={`stage-btn ${activeStage === idx ? 'active' : ''}`}
            onClick={() => setActiveStage(idx)}
          >
            <span className="stage-name">{stage.name}</span>
            <span className="stage-num">{idx + 1}</span>
          </button>
        ))}
      </div>
      
      <div className="stage-content">
        <ActiveComponent {...getComponentProps()} />
      </div>
    </div>
  )
}
