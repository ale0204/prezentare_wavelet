import { useState, useEffect, useRef, useCallback } from 'react'
import axios from 'axios'
import { LaTeXBlock } from './LaTeX'
import { canvasMetrics } from './shared/stage'
import { canvasTheme, CANVAS_FONT, resolveColor } from './shared/canvasTheme'
import { ResetIcon } from './shared/TransportIcons'

// Signal presets with more distinct frequencies
const SIGNAL_PRESETS = [
  { id: '5+50', label: '5Hz + 50Hz', expr: 'sin(2*pi*5*t) + sin(2*pi*50*t)', freqs: [5, 50] },
  { id: '3+15+40', label: '3Hz + 15Hz + 40Hz', expr: 'sin(2*pi*3*t) + sin(2*pi*15*t) + sin(2*pi*40*t)', freqs: [3, 15, 40] },
  { id: '5+20+50', label: '5Hz + 20Hz + 50Hz', expr: 'sin(2*pi*5*t) + sin(2*pi*20*t) + sin(2*pi*50*t)', freqs: [5, 20, 50] },
  { id: 'chirp', label: 'Chirp', expr: 'sin(2*pi*(5 + 30*t)*t)', freqs: [] },
]

// Max frequency to display on graphs
const MAX_FREQ_DISPLAY = 100  // Hz

// Default values for reset
const DEFAULTS = {
  filterType: 'lowpass',
  cutoffHz: 30,
  lowCutoffHz: 20,
  highCutoffHz: 60,
  shape: 'butterworth',
  order: 4,
  selectedPreset: '5+50'
}

// Filter equations
const FILTER_EQUATIONS = {
  ideal: {
    lowpass: String.raw`H(f) = \begin{cases} 1, & |f| \leq f_c \\ 0, & |f| > f_c \end{cases}`,
    highpass: String.raw`H(f) = \begin{cases} 0, & |f| \leq f_c \\ 1, & |f| > f_c \end{cases}`,
    bandpass: String.raw`H(f) = \begin{cases} 1, & f_L \leq |f| \leq f_H \\ 0, & \text{otherwise} \end{cases}`
  },
  butterworth: {
    lowpass: String.raw`H(f) = \frac{1}{\sqrt{1 + \left(\frac{f}{f_c}\right)^{2n}}}`,
    highpass: String.raw`H(f) = \frac{1}{\sqrt{1 + \left(\frac{f_c}{f}\right)^{2n}}}`,
    bandpass: String.raw`H(f) = H_{LP}(f_H) \cdot H_{HP}(f_L)`
  },
  gaussian: {
    lowpass: String.raw`H(f) = e^{-\frac{f^2}{2f_c^2}}`,
    highpass: String.raw`H(f) = 1 - e^{-\frac{f^2}{2f_c^2}}`,
    bandpass: String.raw`H(f) = e^{-\frac{(f - f_0)^2}{2\sigma^2}}`
  }
}

// Fictional but realistic "stations": their demo frequency (Hz, on the
// 0-100 Hz axis of this page) and the FM dial label shown to the audience
const RADIO_STATIONS = [
  { f: 12, mhz: '88.1', name: 'Jazz' },
  { f: 30, mhz: '91.5', name: 'Știri' },
  { f: 50, mhz: '96.7', name: 'Rock' },
  { f: 70, mhz: '101.3', name: 'Pop' },
  { f: 88, mhz: '105.9', name: 'Sport' }
]

// The radio analogy, made visual: the antenna receives ALL stations at once;
// the band-pass window is the tuning knob - only the station inside passes.
function RadioTuner({ lowCutoffHz, highCutoffHz }) {
  return (
    <div className="radio-tuner">
      <div className="radio-tuner-header">
        <strong>Analogia radioului:</strong> antena captează simultan toate posturile
        (87.5-108 MHz), iar a asculta un post = a păstra o singură bandă. Aici chiar muți
        fereastra band-pass <span className="rt-window-label">[f<sub>L</sub>={lowCutoffHz} Hz, f<sub>H</sub>={highCutoffHz} Hz]</span> peste
        spectru; un receptor real obține același efect prin superheterodină - mixează postul
        ales la o frecvență intermediară fixă și filtrează îngust acolo.
      </div>
      <svg viewBox="0 0 100 30" className="radio-tuner-svg" role="img" aria-label="Spectru radio cu fereastra band-pass">
        {/* band-pass window */}
        {/* Tokens go through style, not presentation attributes: an SVG
            attribute does not resolve var() */}
        <rect
          x={lowCutoffHz} y="1"
          width={Math.max(1, highCutoffHz - lowCutoffHz)} height="20"
          style={{ fill: 'rgba(157, 78, 221, 0.18)', stroke: 'var(--series-purple)' }}
          strokeWidth="0.4"
          rx="0.8"
        />
        {/* baseline */}
        <line x1="0" y1="21" x2="100" y2="21" style={{ stroke: 'var(--canvas-border)' }} strokeWidth="0.3" />
        {RADIO_STATIONS.map(s => {
          const inBand = s.f >= lowCutoffHz && s.f <= highCutoffHz
          const tone = { fill: inBand ? 'var(--series-green)' : 'var(--text-muted)' }
          return (
            <g key={s.f}>
              <rect
                x={s.f - 0.9} y={inBand ? 3.5 : 9}
                width="1.8" height={inBand ? 17.5 : 12}
                rx="0.5"
                style={tone}
              />
              <text x={s.f} y="25" textAnchor="middle" fontSize="2.8" style={tone}>
                {s.mhz}
              </text>
              <text x={s.f} y="28.5" textAnchor="middle" fontSize="2.2" style={tone}>
                {s.name}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export default function FiltersView({ api, compact = false }) {
  // Filter parameters - now in Hz!
  const [filterType, setFilterType] = useState(DEFAULTS.filterType)
  const [cutoffHz, setCutoffHz] = useState(DEFAULTS.cutoffHz)  // For low/high pass
  const [lowCutoffHz, setLowCutoffHz] = useState(DEFAULTS.lowCutoffHz)  // For bandpass
  const [highCutoffHz, setHighCutoffHz] = useState(DEFAULTS.highCutoffHz)  // For bandpass
  const [shape, setShape] = useState(DEFAULTS.shape)
  const [order, setOrder] = useState(DEFAULTS.order)  // Butterworth order
  
  // Signal parameters
  const [selectedPreset, setSelectedPreset] = useState(DEFAULTS.selectedPreset)
  const [expression, setExpression] = useState(SIGNAL_PRESETS[0].expr)
  
  // Data
  const [filterData, setFilterData] = useState(null)
  const [signalData, setSignalData] = useState(null)
  const [loading, setLoading] = useState(false)
  
  // Canvas refs
  const canvasFilterRef = useRef()
  const canvasSignalRef = useRef()  // Combined original + filtered
  const canvasSpectrumRef = useRef()
  
  // Container refs for responsive sizing
  const filterContainerRef = useRef()
  const signalContainerRef = useRef()
  const spectrumContainerRef = useRef()

  // Reset to defaults
  const resetToDefaults = () => {
    setFilterType(DEFAULTS.filterType)
    setCutoffHz(DEFAULTS.cutoffHz)
    setLowCutoffHz(DEFAULTS.lowCutoffHz)
    setHighCutoffHz(DEFAULTS.highCutoffHz)
    setShape(DEFAULTS.shape)
    setOrder(DEFAULTS.order)
    setSelectedPreset(DEFAULTS.selectedPreset)
    setExpression(SIGNAL_PRESETS[0].expr)
  }

  // Fetch filter response - send Hz directly
  const fetchFilter = useCallback(async () => {
    try {
      if (filterType === 'bandpass') {
        const res = await axios.get(`${api}/filters/bandpass`, {
          params: { 
            low_cutoff_hz: lowCutoffHz, 
            high_cutoff_hz: highCutoffHz, 
            filter_type: shape, 
            order: order,
            max_freq_hz: 100 
          }
        })
        setFilterData(res.data)
      } else {
        const endpoint = filterType === 'lowpass' ? 'lowpass' : 'highpass'
        const res = await axios.get(`${api}/filters/${endpoint}`, {
          params: { cutoff_hz: cutoffHz, filter_type: shape, order: order, max_freq_hz: 100 }
        })
        setFilterData(res.data)
      }
    } catch (err) {
      console.error('Filter fetch error:', err)
    }
  }, [api, filterType, cutoffHz, lowCutoffHz, highCutoffHz, shape, order])

  // Apply filter to signal - send Hz directly
  const applyFilter = useCallback(async (expr) => {
    setLoading(true)
    try {
      const params = {
        expression: expr,
        filter_type: filterType,
        cutoff_hz: cutoffHz,
        // Shape (ideal/butterworth/gaussian) and Butterworth order: without
        // these the backend always renders an ideal brick-wall filter, so
        // switching shape/order silently applied nothing.
        shape,
        order
      }
      // Add bandpass-specific parameters
      if (filterType === 'bandpass') {
        params.low_cutoff_hz = lowCutoffHz
        params.high_cutoff_hz = highCutoffHz
      }
      const res = await axios.get(`${api}/filters/apply-signal`, { params })
      setSignalData(res.data)
    } catch (err) {
      console.error('Filter apply error:', err)
    } finally {
      setLoading(false)
    }
  }, [api, filterType, cutoffHz, lowCutoffHz, highCutoffHz, shape, order])

  // Auto-update when any parameter changes
  useEffect(() => {
    fetchFilter()
    applyFilter(expression)
  }, [filterType, cutoffHz, lowCutoffHz, highCutoffHz, shape, order, expression])

  // Draw filter response
  useEffect(() => {
    if (filterData) drawFilter()
  }, [filterData, cutoffHz, lowCutoffHz, highCutoffHz, filterType])

  // Draw signals
  useEffect(() => {
    if (signalData) {
      drawSignalComparison()
      drawSpectrum()
    }
  }, [signalData, filterType, cutoffHz, lowCutoffHz, highCutoffHz])

  // Handle resize for responsive canvases
  useEffect(() => {
    const handleResize = () => {
      if (filterData) drawFilter()
      if (signalData) {
        drawSignalComparison()
        drawSpectrum()
      }
    }

    const resizeObserver = new ResizeObserver(handleResize)
    if (filterContainerRef.current) resizeObserver.observe(filterContainerRef.current)
    if (signalContainerRef.current) resizeObserver.observe(signalContainerRef.current)
    if (spectrumContainerRef.current) resizeObserver.observe(spectrumContainerRef.current)

    return () => resizeObserver.disconnect()
  }, [filterData, signalData])

  // Handle preset selection
  const handlePresetChange = (presetId) => {
    setSelectedPreset(presetId)
    const preset = SIGNAL_PRESETS.find(p => p.id === presetId)
    if (preset) {
      setExpression(preset.expr)
    }
  }

  const drawFilter = () => {
    const canvas = canvasFilterRef.current
    const container = filterContainerRef.current
    if (!canvas || !container || !filterData) return

    // HiDPI support - measure the CONTAINER: the canvas is absolutely
    // positioned, so its own pinned inline width/height stops tracking a
    // shrinking parent (e.g. the radio panel appearing above) once set.
    const { width, height, dpr } = canvasMetrics(container)
    
    if (width === 0 || height === 0) return
    
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = width + 'px'
    canvas.style.height = height + 'px'

    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)

    const { f, response } = filterData.frequency
    const margin = compact ? 52 : 58
    const maxFreqDisplay = 100  // Show up to 100 Hz
    
    ctx.fillStyle = canvasTheme().bg
    ctx.fillRect(0, 0, width, height)
    
    // Grid - horizontal lines
    ctx.strokeStyle = canvasTheme().grid
    ctx.lineWidth = 1
    for (let i = 0; i <= 4; i++) {
      const y = margin + (i * (height - 2 * margin)) / 4
      ctx.beginPath()
      ctx.moveTo(margin, y)
      ctx.lineTo(width - margin, y)
      ctx.stroke()
    }
    
    // Grid - vertical lines with frequency ticks
    const freqTicks = [0, 25, 50, 75, 100]
    ctx.strokeStyle = canvasTheme().grid
    for (const tick of freqTicks) {
      const x = margin + (tick / maxFreqDisplay) * (width - 2 * margin)
      ctx.beginPath()
      ctx.moveTo(x, margin)
      ctx.lineTo(x, height - margin)
      ctx.stroke()
    }
    
    // Draw frequency tick labels. freq=0 stays unlabeled: it shares the
    // bottom-left corner with the H(f)=0.00 Y tick added below, and the
    // gridline already marks the origin.
    ctx.fillStyle = canvasTheme().text
    ctx.font = `bold ${CANVAS_FONT.tick}px Inter, sans-serif`
    ctx.textAlign = 'center'
    for (const tick of freqTicks) {
      if (tick === 0) continue
      const x = margin + (tick / maxFreqDisplay) * (width - 2 * margin)
      ctx.fillText(`${tick}`, x, height - margin + 12)
    }

    // Y-axis tick labels: H(f) is always normalized to 0..1, regardless of
    // shape - this is what lets you read off the -3 dB / 0.707 crossing at
    // the cutoff line for any of the three shapes.
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    const hTicks = [0, 0.25, 0.5, 0.75, 1.0]
    for (const tick of hTicks) {
      const y = height - margin - tick * (height - 2 * margin)
      ctx.fillText(tick.toFixed(2), margin - 6, y)
    }
    ctx.textBaseline = 'alphabetic'

    // Cutoff line(s) (in Hz)
    ctx.strokeStyle = canvasTheme().amber
    ctx.lineWidth = 2
    ctx.setLineDash([5, 5])
    
    if (filterType === 'bandpass') {
      // Two cutoff lines for bandpass
      const lowX = margin + (lowCutoffHz / maxFreqDisplay) * (width - 2 * margin)
      const highX = margin + (highCutoffHz / maxFreqDisplay) * (width - 2 * margin)
      ctx.beginPath()
      ctx.moveTo(lowX, margin)
      ctx.lineTo(lowX, height - margin)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(highX, margin)
      ctx.lineTo(highX, height - margin)
      ctx.stroke()
    } else {
      const cutoffX = margin + (cutoffHz / maxFreqDisplay) * (width - 2 * margin)
      ctx.beginPath()
      ctx.moveTo(cutoffX, margin)
      ctx.lineTo(cutoffX, height - margin)
      ctx.stroke()
    }
    ctx.setLineDash([])
    
    // Filter response - backend returns frequencies in Hz directly
    const filterColor = filterType === 'lowpass' ? canvasTheme().green :
                        filterType === 'highpass' ? canvasTheme().pink : canvasTheme().purple
    ctx.strokeStyle = resolveColor(filterColor)
    ctx.lineWidth = 3
    ctx.beginPath()
    
    for (let i = 0; i < f.length; i++) {
      const freqHz = f[i]  // Already in Hz from backend
      if (freqHz > maxFreqDisplay) continue
      const x = margin + (freqHz / maxFreqDisplay) * (width - 2 * margin)
      const y = height - margin - response[i] * (height - 2 * margin)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
    // Labels rendered as HTML overlays
  }

  // Combined signal comparison - original and filtered on same plot
  const drawSignalComparison = () => {
    const canvas = canvasSignalRef.current
    const container = signalContainerRef.current
    if (!canvas || !container || !signalData) return

    // HiDPI support - measure the container, see drawFilter for why.
    const { width, height, dpr } = canvasMetrics(container)
    
    if (width === 0 || height === 0) return
    
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = width + 'px'
    canvas.style.height = height + 'px'

    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)

    const margin = compact ? 52 : 58

    ctx.fillStyle = canvasTheme().bg
    ctx.fillRect(0, 0, width, height)

    const { t, original, filtered } = signalData.time
    
    // Find range for both signals
    const allVals = [...original, ...filtered]
    const min = Math.min(...allVals) - 0.2
    const max = Math.max(...allVals) + 0.2
    const range = max - min || 1
    
    // Grid - horizontal lines
    ctx.strokeStyle = canvasTheme().grid
    ctx.lineWidth = 1
    for (let i = 0; i <= 4; i++) {
      const y = margin + (i * (height - 2 * margin)) / 4
      ctx.beginPath()
      ctx.moveTo(margin, y)
      ctx.lineTo(width - margin, y)
      ctx.stroke()
    }

    // Grid - vertical lines, proportional to the signal's actual duration
    // (style matches fourier-demo's time-domain plot)
    const maxTime = t[t.length - 1] || 1
    const timeTicks = [0, 0.2, 0.4, 0.6, 0.8, 1.0].map(frac => frac * maxTime)
    for (const tick of timeTicks) {
      const x = margin + (tick / maxTime) * (width - 2 * margin)
      ctx.beginPath()
      ctx.moveTo(x, margin)
      ctx.lineTo(x, height - margin)
      ctx.stroke()
    }

    // X-axis tick labels. t=0 stays unlabeled: it shares the bottom-left
    // corner with the lowest Y tick added below (same collision this file's
    // other two plots already avoid).
    ctx.fillStyle = canvasTheme().text
    ctx.font = `bold ${CANVAS_FONT.tick}px Inter, sans-serif`
    ctx.textAlign = 'center'
    for (const tick of timeTicks) {
      if (tick === 0) continue
      const x = margin + (tick / maxTime) * (width - 2 * margin)
      ctx.fillText(tick.toFixed(1), x, height - margin + 14)
    }

    // Y-axis tick labels (amplitude)
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    const ampTicks = [0, 0.25, 0.5, 0.75, 1.0]
    for (const tick of ampTicks) {
      const y = height - margin - tick * (height - 2 * margin)
      const ampValue = min + tick * (max - min)
      ctx.fillText(ampValue.toFixed(1), margin - 6, y)
    }
    ctx.textBaseline = 'alphabetic'

    // Zero line
    const zeroY = height - margin - ((0 - min) / range) * (height - 2 * margin)
    ctx.strokeStyle = canvasTheme().border
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(margin, zeroY)
    ctx.lineTo(width - margin, zeroY)
    ctx.stroke()
    
    // Original signal - cyan (draw first, slightly transparent)
    ctx.strokeStyle = canvasTheme().cyan
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let i = 0; i < t.length; i++) {
      const x = margin + (t[i] / t[t.length - 1]) * (width - 2 * margin)
      const y = height - margin - ((original[i] - min) / range) * (height - 2 * margin)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
    
    // Filtered signal - color based on filter type
    const filteredColor = filterType === 'lowpass' ? canvasTheme().green :
                        filterType === 'highpass' ? canvasTheme().pink : canvasTheme().purple
    ctx.strokeStyle = resolveColor(filteredColor)
    ctx.lineWidth = 2.5
    ctx.beginPath()
    for (let i = 0; i < t.length; i++) {
      const x = margin + (t[i] / t[t.length - 1]) * (width - 2 * margin)
      const y = height - margin - ((filtered[i] - min) / range) * (height - 2 * margin)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
    // Labels rendered as HTML overlays
  }

  const drawSpectrum = () => {
    const canvas = canvasSpectrumRef.current
    const container = spectrumContainerRef.current
    if (!canvas || !container || !signalData) return

    // HiDPI support - measure the container, see drawFilter for why.
    const { width, height, dpr } = canvasMetrics(container)
    
    if (width === 0 || height === 0) return
    
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = width + 'px'
    canvas.style.height = height + 'px'

    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)

    const margin = compact ? 52 : 58
    const maxFreqDisplay = 100  // Show up to 100 Hz
    
    ctx.fillStyle = canvasTheme().bg
    ctx.fillRect(0, 0, width, height)
    
    // Check if frequency data exists
    if (!signalData.frequency) return
    
    const { f: freqsHz, original_magnitude, filtered_magnitude } = signalData.frequency
    
    // Backend now returns frequencies in Hz directly - no conversion needed
    
    // Find max for normalization
    const maxOrig = Math.max(...original_magnitude)
    const maxFilt = Math.max(...filtered_magnitude)
    const maxVal = Math.max(maxOrig, maxFilt, 0.1)
    
    // Grid - horizontal
    ctx.strokeStyle = canvasTheme().grid
    ctx.lineWidth = 1
    for (let i = 0; i <= 4; i++) {
      const y = margin + (i * (height - 2 * margin)) / 4
      ctx.beginPath()
      ctx.moveTo(margin, y)
      ctx.lineTo(width - margin, y)
      ctx.stroke()
    }
    
    // Grid - vertical with frequency ticks
    const freqTicks = [0, 25, 50, 75, 100]
    for (const tick of freqTicks) {
      const x = margin + (tick / maxFreqDisplay) * (width - 2 * margin)
      ctx.beginPath()
      ctx.moveTo(x, margin)
      ctx.lineTo(x, height - margin)
      ctx.stroke()
    }
    
    // Draw frequency tick labels. freq=0 stays unlabeled: it shares the
    // bottom-left corner with the magnitude=0 Y tick added below.
    ctx.fillStyle = canvasTheme().text
    ctx.font = `bold ${CANVAS_FONT.tick}px Inter, sans-serif`
    ctx.textAlign = 'center'
    for (const tick of freqTicks) {
      if (tick === 0) continue
      const x = margin + (tick / maxFreqDisplay) * (width - 2 * margin)
      ctx.fillText(`${tick}`, x, height - margin + 12)
    }

    // Y-axis tick labels (magnitude, same scale style as fourier-demo)
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    const magTicks = [0, 0.25, 0.5, 0.75, 1.0]
    for (const tick of magTicks) {
      const y = height - margin - tick * (height - 2 * margin)
      const magValue = tick * maxVal
      const label = maxVal >= 100 ? magValue.toFixed(0) : maxVal >= 10 ? magValue.toFixed(1) : magValue.toFixed(2)
      ctx.fillText(label, margin - 6, y)
    }
    ctx.textBaseline = 'alphabetic'

    // Cutoff line(s) in spectrum (in Hz)
    ctx.strokeStyle = canvasTheme().amber
    ctx.lineWidth = 2
    ctx.setLineDash([5, 5])
    
    if (filterType === 'bandpass') {
      const lowX = margin + (lowCutoffHz / maxFreqDisplay) * (width - 2 * margin)
      const highX = margin + (highCutoffHz / maxFreqDisplay) * (width - 2 * margin)
      ctx.beginPath()
      ctx.moveTo(lowX, margin)
      ctx.lineTo(lowX, height - margin)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(highX, margin)
      ctx.lineTo(highX, height - margin)
      ctx.stroke()
    } else {
      const cutoffX = margin + (cutoffHz / maxFreqDisplay) * (width - 2 * margin)
      ctx.beginPath()
      ctx.moveTo(cutoffX, margin)
      ctx.lineTo(cutoffX, height - margin)
      ctx.stroke()
    }
    ctx.setLineDash([])
    
    // Draw original spectrum as bars (in Hz)
    ctx.fillStyle = canvasTheme().cyan
    for (let i = 0; i < freqsHz.length; i++) {
      const freqHz = freqsHz[i]
      if (freqHz > maxFreqDisplay) continue
      const x = margin + (freqHz / maxFreqDisplay) * (width - 2 * margin)
      const barHeight = (original_magnitude[i] / maxVal) * (height - 2 * margin)
      const barWidth = (width - 2 * margin) / (maxFreqDisplay / 2)  // Approximate bar width
      ctx.fillRect(x - barWidth/2, height - margin - barHeight, barWidth, barHeight)
    }
    
    // Draw filtered spectrum as filled area on top
    const filteredColor = filterType === 'lowpass' ? canvasTheme().green :
                        filterType === 'highpass' ? canvasTheme().pink : canvasTheme().purple
    ctx.fillStyle = filterType === 'lowpass' ? 'rgba(0, 255, 136, 0.5)' : 
                    filterType === 'highpass' ? 'rgba(255, 107, 157, 0.5)' : 'rgba(157, 78, 221, 0.5)'
    ctx.beginPath()
    ctx.moveTo(margin, height - margin)
    for (let i = 0; i < freqsHz.length; i++) {
      const freqHz = freqsHz[i]
      if (freqHz > maxFreqDisplay) continue
      const x = margin + (freqHz / maxFreqDisplay) * (width - 2 * margin)
      const y = height - margin - (filtered_magnitude[i] / maxVal) * (height - 2 * margin)
      ctx.lineTo(x, y)
    }
    ctx.lineTo(margin + (width - 2 * margin), height - margin)
    ctx.closePath()
    ctx.fill()
    
    // Filtered spectrum outline
    ctx.strokeStyle = resolveColor(filteredColor)
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let i = 0; i < freqsHz.length; i++) {
      const freqHz = freqsHz[i]
      if (freqHz > maxFreqDisplay) continue
      const x = margin + (freqHz / maxFreqDisplay) * (width - 2 * margin)
      const y = height - margin - (filtered_magnitude[i] / maxVal) * (height - 2 * margin)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
    // Labels rendered as HTML overlays
  }

  return (
    <div className={`filters-view ${compact ? 'compact-mode' : ''}`}>
      {/* Non-compact header and intro */}
      {!compact && (
        <>
          <div className="panel">
            <h2>Filtre în Domeniul Frecvență</h2>

            <div className="info-box">
              <p>
                <strong>Filtrele</strong> modifică semnalul în funcție de frecvență, ca un
                egalizator de studio: fiecare bară a egalizatorului este un filtru band-pass
                pe banda lui. Ajustează parametrii și vezi rezultatul în timp real!
              </p>
            </div>

            <div className="math-block">
              <LaTeXBlock math={String.raw`Y(f) = H(f) \cdot X(f)`} />
            </div>
          </div>

          {/* Controls Panel */}
          <div className="panel">
            <h3>Parametri Filtru</h3>

            <div className="filter-controls-grid">
              {/* Filter Type Toggle */}
              <div className="control-section">
                <label>Tip Filtru</label>
                <div className="button-group">
                  <button
                    className={filterType === 'lowpass' ? 'active success' : ''}
                    onClick={() => setFilterType('lowpass')}
                  >
                    Low-Pass
                  </button>
                  <button
                    className={filterType === 'highpass' ? 'active danger' : ''}
                    onClick={() => setFilterType('highpass')}
                  >
                    High-Pass
                  </button>
                  <button
                    className={filterType === 'bandpass' ? 'active bandpass' : ''}
                    onClick={() => setFilterType('bandpass')}
                  >
                    Band-Pass
                  </button>
                </div>
              </div>
              
              {/* Filter Shape */}
              <div className="control-section">
                <label>Formă Filtru</label>
                <div className="button-group">
                  {['ideal', 'butterworth', 'gaussian'].map(s => (
                    <button 
                      key={s}
                      className={shape === s ? 'active' : ''}
                      onClick={() => setShape(s)}
                    >
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Cutoff Slider - now in Hz; band-pass gets two cutoffs */}
              {filterType === 'bandpass' ? (
                <div className="control-section full-width">
                  <label>
                    Fereastra Band-Pass: <strong style={{ color: 'var(--series-purple)' }}>{lowCutoffHz} - {highCutoffHz} Hz</strong>
                    <span style={{ color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                      (trec doar frecvențele dintre f_L și f_H)
                    </span>
                  </label>
                  <input
                    type="range"
                    min="5"
                    max={highCutoffHz - 5}
                    step="5"
                    value={lowCutoffHz}
                    onChange={e => setLowCutoffHz(parseInt(e.target.value))}
                    className="slider-wide"
                  />
                  <input
                    type="range"
                    min={lowCutoffHz + 5}
                    max="95"
                    step="5"
                    value={highCutoffHz}
                    onChange={e => setHighCutoffHz(parseInt(e.target.value))}
                    className="slider-wide"
                  />
                  <div className="slider-labels">
                    <span>f_L = {lowCutoffHz} Hz</span>
                    <span>f_H = {highCutoffHz} Hz</span>
                  </div>
                </div>
              ) : (
                <div className="control-section full-width">
                  <label>
                    Frecvență Cutoff: <strong style={{ color: 'var(--series-amber)' }}>{cutoffHz} Hz</strong>
                    <span style={{ color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                      (frecvențe {filterType === 'lowpass' ? '< ' : '> '}{cutoffHz} Hz trec)
                    </span>
                  </label>
                  <input
                    type="range"
                    min="5"
                    max="100"
                    step="5"
                    value={cutoffHz}
                    onChange={e => setCutoffHz(parseInt(e.target.value))}
                    className="slider-wide"
                  />
                  <div className="slider-labels">
                    <span>5 Hz (joasă)</span>
                    <span>100 Hz (înaltă)</span>
                  </div>
                </div>
              )}
              
              {/* Signal Preset */}
              <div className="control-section full-width">
                <label>Semnal de Test:</label>
                <div className="button-group preset-buttons">
                  {SIGNAL_PRESETS.map(p => (
                    <button 
                      key={p.id}
                      className={selectedPreset === p.id ? 'active' : ''}
                      onClick={() => handlePresetChange(p.id)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            
            {/* Filter Equation */}
            <div className="math-block compact">
              <LaTeXBlock math={FILTER_EQUATIONS[shape][filterType]} />
            </div>
          </div>

          {/* Radio analogy - the natural anchor for band-pass */}
          {filterType === 'bandpass' && (
            <div className="panel">
              <RadioTuner lowCutoffHz={lowCutoffHz} highCutoffHz={highCutoffHz} />
            </div>
          )}
        </>
      )}

      {/* COMPACT MODE LAYOUT */}
      {compact ? (
        <div className="filters-compact-layout">
          {/* Radio analogy strip - shown while exploring band-pass */}
          {filterType === 'bandpass' && (
            <RadioTuner lowCutoffHz={lowCutoffHz} highCutoffHz={highCutoffHz} />
          )}

          {/* Low/high-pass real-world anchor - band-pass already has the radio;
              low/high-pass had none in compact mode until now. */}
          {filterType !== 'bandpass' && (
            <div className={`filter-anchor-strip ${filterType}`}>
              <strong>Analogie:</strong>{' '}
              {filterType === 'lowpass'
                ? 'ca duruitul de bas auzit prin perete - un low-pass lasă frecvențele joase și taie tot ce-i ascuțit.'
                : 'ca un filtru anti-rumble de studio - un high-pass taie duruitul jos și lasă doar tranzițiile rapide.'}
            </div>
          )}

          {/* Top row: Filter Response + Frequency Spectrum side by side */}
          <div className="filters-top-row">
            <div className="plot-container-with-overlay" ref={filterContainerRef}>
              <canvas ref={canvasFilterRef} />
              <div className="plot-title-overlay" style={{ 
                color: filterType === 'lowpass' ? canvasTheme().green :
                        filterType === 'highpass' ? canvasTheme().pink : canvasTheme().purple 
              }}>
                {filterType === 'lowpass' ? 'Low-Pass' : 
                 filterType === 'highpass' ? 'High-Pass' : 'Band-Pass'} 
                {shape === 'butterworth' ? ` (n=${order})` : ` (${shape})`}
              </div>
              <div className="plot-axis-label y-label">H(f)</div>
              <div className="plot-axis-label x-label">f (Hz)</div>
            </div>
            
            <div className="plot-container-with-overlay" ref={spectrumContainerRef}>
              <canvas ref={canvasSpectrumRef} />
              <div className="plot-title-overlay yellow">Spectru Frecvență</div>
              <div className="plot-legend-overlay">
                <span style={{ color: 'var(--series-cyan)' }}><span className="legend-swatch" />Original</span>
                <span style={{
                  color: filterType === 'lowpass' ? canvasTheme().green :
                        filterType === 'highpass' ? canvasTheme().pink : canvasTheme().purple
                }}><span className="legend-swatch" />Filtrat</span>
              </div>
              <div className="plot-axis-label y-label">|F|</div>
              <div className="plot-axis-label x-label">f (Hz)</div>
            </div>
          </div>
          
          {/* Bottom row: Comparison plot + Controls */}
          <div className="filters-bottom-row">
            <div className="plot-container-with-overlay" ref={signalContainerRef}>
              <canvas ref={canvasSignalRef} />
              <div className="plot-title-overlay white">Comparație: Original vs Filtrat</div>
              <div className="plot-legend-overlay">
                <span style={{ color: 'var(--series-cyan)' }}>- Original</span>
                <span style={{ color: filterType === 'lowpass' ? 'var(--series-green)' : 'var(--series-pink)' }}>
                  - Filtrat ({filterType === 'lowpass' ? 'LP' : filterType === 'highpass' ? 'HP' : 'BP'} 
                    {filterType === 'bandpass' ? `${lowCutoffHz}-${highCutoffHz}` : cutoffHz}Hz)
                </span>
              </div>
              <div className="plot-axis-label y-label">Amp</div>
              <div className="plot-axis-label x-label">t (s)</div>
            </div>
            
            {/* Inline Controls Panel */}
            <div className="filters-inline-controls">
              <div className="controls-header">
                <h4>Parametri</h4>
                <button
                  className="reset-btn"
                  onClick={resetToDefaults}
                  aria-label="Reset la valori implicite"
                  aria-label="Reset la valori implicite"
                >
                  <ResetIcon size={16} />
                </button>
              </div>
              
              <div className="control-row">
                <label>Tip filtru:</label>
                <div className="button-group mini">
                  <button 
                    className={filterType === 'lowpass' ? 'active success' : ''}
                    onClick={() => setFilterType('lowpass')}
                    aria-label="Low-Pass"
                  >
                    LP
                  </button>
                  <button 
                    className={filterType === 'highpass' ? 'active danger' : ''}
                    onClick={() => setFilterType('highpass')}
                    aria-label="High-Pass"
                  >
                    HP
                  </button>
                  <button 
                    className={filterType === 'bandpass' ? 'active bandpass' : ''}
                    onClick={() => setFilterType('bandpass')}
                    aria-label="Band-Pass"
                  >
                    BP
                  </button>
                </div>
              </div>
              
              <div className="control-row">
                <label>Formă:</label>
                <select value={shape} onChange={e => setShape(e.target.value)}>
                  <option value="ideal">Ideal</option>
                  <option value="butterworth">Butterworth</option>
                  <option value="gaussian">Gaussian</option>
                </select>
              </div>
              
              {/* Butterworth order selector */}
              {shape === 'butterworth' && (
                <div className="control-row">
                  <label>Ordin n: <strong>{order}</strong></label>
                  <div className="order-buttons">
                    {[1, 2, 4, 8].map(n => (
                      <button 
                        key={n}
                        className={order === n ? 'active' : ''}
                        onClick={() => setOrder(n)}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Cutoff controls - different for bandpass */}
              {filterType === 'bandpass' ? (
                <>
                  <div className="control-row">
                    <label>f<sub>L</sub>: <strong>{lowCutoffHz} Hz</strong></label>
                    <input
                      type="range"
                      min="5"
                      max={highCutoffHz - 5}
                      step="5"
                      value={lowCutoffHz}
                      onChange={e => setLowCutoffHz(parseInt(e.target.value))}
                    />
                  </div>
                  <div className="control-row">
                    <label>f<sub>H</sub>: <strong>{highCutoffHz} Hz</strong></label>
                    <input
                      type="range"
                      min={lowCutoffHz + 5}
                      max="95"
                      step="5"
                      value={highCutoffHz}
                      onChange={e => setHighCutoffHz(parseInt(e.target.value))}
                    />
                  </div>
                </>
              ) : (
                <div className="control-row">
                  <label>Cutoff: <strong>{cutoffHz} Hz</strong></label>
                  <input
                    type="range"
                    min="5"
                    max="95"
                    step="5"
                    value={cutoffHz}
                    onChange={e => setCutoffHz(parseInt(e.target.value))}
                  />
                </div>
              )}
              
              <div className="control-row">
                <label>Semnal:</label>
                <select value={selectedPreset} onChange={e => handlePresetChange(e.target.value)}>
                  {SIGNAL_PRESETS.map(p => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* NON-COMPACT MODE - Original vertical layout */}
          {/* Visualization Panel - Filter Response */}
          <div className="panel">
            <h3>Răspunsul Filtrului H(f)</h3>
            <div className="plot-container-with-overlay" ref={filterContainerRef}>
              <canvas ref={canvasFilterRef} />
              <div className="plot-title-overlay" style={{
                color: filterType === 'lowpass' ? canvasTheme().green :
                        filterType === 'highpass' ? canvasTheme().pink : canvasTheme().purple
              }}>
                {filterType === 'lowpass' ? 'Low-Pass' :
                 filterType === 'highpass' ? 'High-Pass' : 'Band-Pass'} Filter ({shape})
              </div>
              <div className="plot-axis-label y-label">H(f)</div>
              <div className="plot-axis-label x-label">f (Hz)</div>
            </div>
          </div>

          {/* Signal Comparison - Combined plot */}
          <div className="panel">
            <h3>Comparație Semnale (domeniu timp)</h3>
            <div className="plot-container-with-overlay" ref={signalContainerRef}>
              <canvas ref={canvasSignalRef} />
              <div className="plot-title-overlay white">Comparație: Original vs Filtrat</div>
              <div className="plot-legend-overlay">
                <span style={{ color: 'var(--series-cyan)' }}>- Original</span>
                <span style={{
                  color: filterType === 'lowpass' ? canvasTheme().green :
                        filterType === 'highpass' ? canvasTheme().pink : canvasTheme().purple
                }}>
                  - Filtrat ({filterType === 'lowpass' ? 'LP' : filterType === 'highpass' ? 'HP' : 'BP'} {filterType === 'bandpass' ? `${lowCutoffHz}-${highCutoffHz}` : cutoffHz}Hz)
                </span>
              </div>
              <div className="plot-axis-label y-label">Amp</div>
              <div className="plot-axis-label x-label">t (s)</div>
            </div>
          </div>

          {/* Frequency Spectrum */}
          <div className="panel">
            <h3>Spectru Frecvență (ce frecvențe sunt tăiate)</h3>
            <div className="plot-container-with-overlay" ref={spectrumContainerRef}>
              <canvas ref={canvasSpectrumRef} />
              <div className="plot-title-overlay yellow">Spectru Frecvență (ce frecvențe rămân)</div>
              <div className="plot-legend-overlay">
                <span style={{ color: 'var(--series-cyan)' }}><span className="legend-swatch" />Original</span>
                <span style={{
                  color: filterType === 'lowpass' ? canvasTheme().green :
                        filterType === 'highpass' ? canvasTheme().pink : canvasTheme().purple
                }}><span className="legend-swatch" />Filtrat</span>
              </div>
              <div className="plot-axis-label y-label">|F|</div>
              <div className="plot-axis-label x-label">f (Hz)</div>
            </div>
            <div className={`info-box ${filterType === 'lowpass' ? 'success' : 'warning'}`}>
              <strong>Rezultat:</strong> {filterType === 'lowpass'
                ? `Low-pass păstrează frecvențele < ${cutoffHz} Hz -> semnal mai neted, fără oscilații rapide`
                : filterType === 'highpass'
                ? `High-pass păstrează frecvențele > ${cutoffHz} Hz -> rămân doar oscilațiile rapide`
                : `Band-pass păstrează doar frecvențele dintre ${lowCutoffHz} și ${highCutoffHz} Hz -> "postul de radio" selectat`}
            </div>
          </div>
        </>
      )}

      {/* Connection to Wavelets - hide in compact mode */}
      {!compact && (
        <div className="panel collapsible">
          <h2>Conexiunea cu Wavelets</h2>

          <div className="info-box">
            <p>
              <strong>Filter banks</strong> sunt fundamentul transformatei wavelet discrete!
            </p>
            <ul style={{ marginTop: '0.5rem', marginLeft: '1.5rem' }}>
              <li><strong>Filtru low-pass (h)</strong> -&gt; Coeficienți de aproximare a[n]</li>
              <li><strong>Filtru high-pass (g)</strong> -&gt; Coeficienți de detaliu d[n]</li>
            </ul>
            <p style={{ marginTop: '0.5rem' }}>
              Analogia practică: căștile noise-cancelling nu filtrează pur și simplu -
              microfonul măsoară zgomotul, iar difuzorul emite același semnal în antifază,
              care îl anulează prin interferență distructivă; filtrele digitale pregătesc
              acel semnal în timp real.
            </p>
          </div>

          <div className="math-block">
            <LaTeXBlock math={String.raw`a[n] = \sum_k h[k] \cdot x[2n - k] \quad \text{(low-pass)}`} />
            <LaTeXBlock math={String.raw`d[n] = \sum_k g[k] \cdot x[2n - k] \quad \text{(high-pass)}`} />
          </div>
        </div>
      )}
    </div>
  )
}
