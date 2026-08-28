import { useState, useEffect, useRef } from 'react'
import LaTeX from './LaTeX'
import AnimationControls from './shared/AnimationControls'
import { CheckIcon } from './shared/TransportIcons'
import Cite from './shared/Cite'
import { renderRich } from './shared/richText'
import '../styles/views/filter-bank.css'

/**
 * FilterBankView - Analysis and Synthesis Filter Bank Diagram
 * Shows the complete Mallat decomposition/reconstruction structure
 * with animated signal flow
 * 
 * Uses HTML overlays for all text to ensure crisp rendering at any scale
 */

// Haar filter coefficients
const HAAR = {
  h0: [1/Math.sqrt(2), 1/Math.sqrt(2)],   // Low-pass (analysis)
  h1: [1/Math.sqrt(2), -1/Math.sqrt(2)],  // High-pass (analysis)
  g0: [1/Math.sqrt(2), 1/Math.sqrt(2)],   // Low-pass (synthesis)
  g1: [-1/Math.sqrt(2), 1/Math.sqrt(2)]   // High-pass (synthesis)
}

// db2 filter coefficients (4 taps, 2 vanishing moments; pywt name db2)
const DB2 = {
  h0: [0.4830, 0.8365, 0.2241, -0.1294],
  h1: [-0.1294, -0.2241, 0.8365, -0.4830],
  g0: [-0.1294, 0.2241, 0.8365, 0.4830],
  g1: [-0.4830, 0.8365, -0.2241, -0.1294]
}

const WAVELETS = {
  haar: { name: 'Haar', filters: HAAR, color: 'var(--primary)' },
  db2: { name: 'Daubechies db2', filters: DB2, color: 'var(--series-orange)' }
}

// One takeaway per view, shown under the diagram
const KEY_INSIGHT = {
  analysis: 'Decimarea ($\\downarrow 2$) reduce dimensiunea la jumătate, dar $h_0$ + $h_1$ păstrează toată informația.',
  synthesis: 'Upsampling ($\\uparrow 2$) urmat de filtrare reconstruiește semnalul original fără pierderi.',
  complete: 'Banca completă demonstrează că DWT este o transformată reversibilă.'
}

// Decimator/upsampler symbol (arrow + factor 2), drawn as real SVG shapes
// instead of the Unicode glyphs "down-arrow 2" / "up-arrow 2" so it renders
// identically on every system. Sits inside the existing gold circle.
function SamplingGlyph({ cx, cy, r, direction, fontSize }) {
  const dir = direction === 'up' ? -1 : 1
  const armX = cx - r * 0.34
  const half = r * 0.4
  const headW = r * 0.26
  const tipY = cy + dir * half
  const tailY = cy - dir * half
  return (
    <g>
      <line x1={armX} y1={tailY} x2={armX} y2={tipY} stroke="#000" strokeWidth={Math.max(1.4, r * 0.09)} />
      <path
        d={`M ${armX - headW} ${tipY - dir * headW} L ${armX} ${tipY} L ${armX + headW} ${tipY - dir * headW} Z`}
        fill="#000"
      />
      <text x={cx + r * 0.28} y={cy} fill="#000" fontSize={fontSize} fontWeight="bold"
        fontFamily="monospace" textAnchor="middle" dominantBaseline="middle">2</text>
    </g>
  )
}

export default function FilterBankView({ compact = false }) {
  // Default view is synthesis: analysis (filter+decimate) is already shown on
  // slides 28/29 under other notations, while g0/g1 + the CQF condition here
  // are unique to this slide - "Bancă Completă" stays the natural next click.
  const [activeView, setActiveView] = useState('synthesis') // 'analysis' | 'synthesis' | 'complete'
  const [wavelet, setWavelet] = useState('haar')
  const [animating, setAnimating] = useState(false)
  const [animStep, setAnimStep] = useState(0)
  const animRef = useRef()

  const currentWavelet = WAVELETS[wavelet]
  const { h0, h1, g0, g1 } = currentWavelet.filters

  // Animation steps for analysis bank
  const ANALYSIS_STEPS = [
    { id: 'input', label: 'Semnal de intrare $x[n]$', highlight: 'input' },
    { id: 'split', label: 'Semnal duplicat pentru ambele filtre', highlight: 'split' },
    { id: 'lowpass', label: 'Filtrare low-pass cu $h_0$ (medie)', highlight: 'lowpass' },
    { id: 'highpass', label: 'Filtrare high-pass cu $h_1$ (diferență)', highlight: 'highpass' },
    { id: 'decimate', label: 'Decimare $\\downarrow 2$ (păstrăm doar indicii pari)', highlight: 'decimate' },
    { id: 'output', label: 'Ieșire: cA (aproximare) + cD (detaliu)', highlight: 'output' }
  ]

  const SYNTHESIS_STEPS = [
    { id: 'input', label: 'Coeficienți cA + cD', highlight: 'input' },
    { id: 'upsample', label: 'Upsampling $\\uparrow 2$ (inserăm zerouri)', highlight: 'upsample' },
    { id: 'lowsynth', label: 'Filtrare cu $g_0$ (synthesis low-pass)', highlight: 'lowsynth' },
    { id: 'highsynth', label: 'Filtrare cu $g_1$ (synthesis high-pass)', highlight: 'highsynth' },
    { id: 'add', label: 'Adunare: $g_0 \\cdot cA\\uparrow + g_1 \\cdot cD\\uparrow$', highlight: 'add' },
    { id: 'output', label: 'Semnal reconstruit $\\hat{x}[n] = x[n]$', highlight: 'output' }
  ]

  const currentSteps = activeView === 'synthesis' ? SYNTHESIS_STEPS : ANALYSIS_STEPS
  const LAST_STEP = currentSteps.length - 1

  // The diagram opens complete: at step 0 the panel was two lonely boxes over a
  // field of white, which reads as a broken screen on a projector. Redare still
  // replays the build-up from the first block.
  useEffect(() => {
    setAnimStep(LAST_STEP)
    setAnimating(false)
  }, [activeView, LAST_STEP])

  // Animation control
  useEffect(() => {
    if (animating) {
      animRef.current = setTimeout(() => {
        setAnimStep(prev => {
          if (prev >= currentSteps.length - 1) {
            setAnimating(false)
            return prev
          }
          return prev + 1
        })
      }, 1200)
    }
    return () => clearTimeout(animRef.current)
  }, [animating, animStep, currentSteps.length])

  const handleReset = () => {
    setAnimating(false)
    setAnimStep(0)
  }

  // SVG-based Filter Bank Diagram Component
  const FilterBankDiagram = ({ view, step }) => {
    const isAnalysis = view === 'analysis'
    const isSynthesis = view === 'synthesis'
    const isComplete = view === 'complete'
    
    // Applied through style={}, never as SVG presentation attributes: an
    // attribute cannot resolve var().
    const boxStyle = (active, color) => ({
      fill: active ? color : 'var(--bg-elevated)',
      stroke: active ? color : 'var(--border)',
      strokeWidth: 2
    })

    const textStyle = (active) => ({
      fill: active ? '#000' : 'var(--text-muted)',
      fontSize: '14px',
      fontWeight: 'bold',
      fontFamily: 'monospace',
      textAnchor: 'middle',
      dominantBaseline: 'middle'
    })

    if (isAnalysis) {
      return (
        <svg viewBox="0 0 700 350" style={{ width: '100%', height: 'auto' }}>
          {/* Background */}
          <rect width="700" height="350" style={{ fill: 'var(--graph-background)' }} />
          
          {/* Title */}
          <text x="350" y="25" style={{ fill: 'var(--series-gold)' }} fontSize="16" fontWeight="bold" fontFamily="sans-serif" textAnchor="middle">
            BANCA DE ANALIZĂ (Descompunere)
          </text>
          
          {/* Input signal box */}
          <rect x="50" y="155" width="100" height="40" rx="4"
            style={boxStyle(step >= 0, '#00d4ff')}
            strokeWidth="2"
          />
          <text x="100" y="175" style={textStyle(step >= 0)}>x[n]</text>
          <text x="100" y="210" style={{ fill: 'var(--graph-text)' }} fontSize="11" fontFamily="sans-serif" textAnchor="middle">
            {step >= 5 ? 'N valori' : ''}
          </text>
          
          {/* Split lines */}
          {step >= 1 && (
            <g stroke="#ffd700" strokeWidth="3">
              <line x1="150" y1="175" x2="190" y2="175" />
              <line x1="190" y1="175" x2="240" y2="95" />
              <line x1="190" y1="175" x2="240" y2="255" />
            </g>
          )}
          
          {/* Low-pass filter (top) */}
          <rect x="250" y="75" width="100" height="40" rx="4"
            style={boxStyle(step >= 2, '#00ff88')}
            strokeWidth="2"
          />
          <text x="300" y="95" style={textStyle(step >= 2)}>h<tspan dy="3" fontSize="0.75em">0</tspan><tspan dy="-3"> (LP)</tspan></text>

          {/* High-pass filter (bottom) */}
          <rect x="250" y="235" width="100" height="40" rx="4"
            style={boxStyle(step >= 3, '#ff6b9d')}
            strokeWidth="2"
          />
          <text x="300" y="255" style={textStyle(step >= 3)}>h<tspan dy="3" fontSize="0.75em">1</tspan><tspan dy="-3"> (HP)</tspan></text>

          {/* Connections to decimators */}
          {step >= 4 && (
            <g strokeWidth="3">
              <line x1="350" y1="95" x2="390" y2="95" stroke="#00ff88" />
              <line x1="350" y1="255" x2="390" y2="255" stroke="#ff6b9d" />
            </g>
          )}

          {/* Decimation circles */}
          {step >= 4 && (
            <>
              <circle cx="415" cy="95" r="25" fill="#ffd700" />
              <SamplingGlyph cx={415} cy={95} r={25} direction="down" fontSize="16" />
              <circle cx="415" cy="255" r="25" fill="#ffd700" />
              <SamplingGlyph cx={415} cy={255} r={25} direction="down" fontSize="16" />
            </>
          )}
          
          {/* Connections to outputs */}
          {step >= 5 && (
            <g strokeWidth="3">
              <line x1="440" y1="95" x2="485" y2="95" stroke="#00ff88" />
              <line x1="440" y1="255" x2="485" y2="255" stroke="#ff6b9d" />
            </g>
          )}
          
          {/* Output boxes */}
          {step >= 5 && (
            <>
              <rect x="485" y="75" width="100" height="40" rx="4" fill="#00ff88" stroke="#00ff88" strokeWidth="2" />
              <text x="535" y="95" fill="#000" fontSize="14" fontWeight="bold" fontFamily="monospace" textAnchor="middle" dominantBaseline="middle">cA</text>
              <text x="535" y="130" style={{ fill: 'var(--graph-text)' }} fontSize="11" fontFamily="sans-serif" textAnchor="middle">N/2</text>
              
              <rect x="485" y="235" width="100" height="40" rx="4" fill="#ff6b9d" stroke="#ff6b9d" strokeWidth="2" />
              <text x="535" y="255" fill="#000" fontSize="14" fontWeight="bold" fontFamily="monospace" textAnchor="middle" dominantBaseline="middle">cD</text>
              <text x="535" y="290" style={{ fill: 'var(--graph-text)' }} fontSize="11" fontFamily="sans-serif" textAnchor="middle">N/2</text>
              
              {/* Labels - split into 2 lines to prevent overflow */}
              <text x="595" y="88" style={{ fill: 'var(--graph-text)' }} fontSize="12" fontFamily="sans-serif">Low-pass:</text>
              <text x="595" y="104" style={{ fill: 'var(--graph-text)' }} fontSize="12" fontFamily="sans-serif">Aproximare</text>

              <text x="595" y="248" style={{ fill: 'var(--graph-text)' }} fontSize="12" fontFamily="sans-serif">High-pass:</text>
              <text x="595" y="264" style={{ fill: 'var(--graph-text)' }} fontSize="12" fontFamily="sans-serif">Detalii</text>
            </>
          )}
        </svg>
      )
    }
    
    if (isSynthesis) {
      return (
        <svg viewBox="0 0 700 350" style={{ width: '100%', height: 'auto' }}>
          <rect width="700" height="350" style={{ fill: 'var(--graph-background)' }} />
          
          <text x="350" y="25" style={{ fill: 'var(--series-gold)' }} fontSize="16" fontWeight="bold" fontFamily="sans-serif" textAnchor="middle">
            BANCA DE SINTEZĂ (Reconstrucție)
          </text>
          
          {/* Input boxes */}
          <rect x="50" y="75" width="100" height="40" rx="4"
            style={boxStyle(step >= 0, '#00ff88')}
            strokeWidth="2"
          />
          <text x="100" y="95" style={textStyle(step >= 0)}>cA</text>
          
          <rect x="50" y="235" width="100" height="40" rx="4"
            style={boxStyle(step >= 0, '#ff6b9d')}
            strokeWidth="2"
          />
          <text x="100" y="255" style={textStyle(step >= 0)}>cD</text>
          
          {/* Upsampling */}
          {step >= 1 && (
            <>
              <line x1="150" y1="95" x2="175" y2="95" stroke="#00ff88" strokeWidth="3" />
              <line x1="150" y1="255" x2="175" y2="255" stroke="#ff6b9d" strokeWidth="3" />
              <circle cx="200" cy="95" r="20" fill="#ffd700" />
              <SamplingGlyph cx={200} cy={95} r={20} direction="up" fontSize="14" />
              <circle cx="200" cy="255" r="20" fill="#ffd700" />
              <SamplingGlyph cx={200} cy={255} r={20} direction="up" fontSize="14" />
            </>
          )}

          {/* g0, g1 filters */}
          {step >= 2 && (
            <>
              <line x1="220" y1="95" x2="260" y2="95" style={{ stroke: 'var(--graph-text)' }} strokeWidth="3" />
              <rect x="260" y="75" width="100" height="40" rx="4" fill="#00ff88" stroke="#00ff88" strokeWidth="2" />
              <text x="310" y="95" fill="#000" fontSize="14" fontWeight="bold" fontFamily="monospace" textAnchor="middle" dominantBaseline="middle">g<tspan dy="3" fontSize="0.75em">0</tspan></text>
            </>
          )}
          {step >= 3 && (
            <>
              <line x1="220" y1="255" x2="260" y2="255" style={{ stroke: 'var(--graph-text)' }} strokeWidth="3" />
              <rect x="260" y="235" width="100" height="40" rx="4" fill="#ff6b9d" stroke="#ff6b9d" strokeWidth="2" />
              <text x="310" y="255" fill="#000" fontSize="14" fontWeight="bold" fontFamily="monospace" textAnchor="middle" dominantBaseline="middle">g<tspan dy="3" fontSize="0.75em">1</tspan></text>
            </>
          )}
          
          {/* Addition */}
          {step >= 4 && (
            <>
              <line x1="360" y1="95" x2="440" y2="175" style={{ stroke: 'var(--graph-text)' }} strokeWidth="3" />
              <line x1="360" y1="255" x2="440" y2="175" style={{ stroke: 'var(--graph-text)' }} strokeWidth="3" />
              <circle cx="455" cy="175" r="20" fill="#ffd700" />
              <text x="455" y="175" fill="#000" fontSize="20" fontWeight="bold" fontFamily="sans-serif" textAnchor="middle" dominantBaseline="middle">+</text>
            </>
          )}
          
          {/* Output */}
          {step >= 5 && (
            <>
              <line x1="475" y1="175" x2="520" y2="175" style={{ stroke: 'var(--graph-text)' }} strokeWidth="3" />
              <rect x="520" y="155" width="100" height="40" rx="4" fill="#00d4ff" stroke="#00d4ff" strokeWidth="2" />
              <text x="570" y="175" fill="#000" fontSize="14" fontWeight="bold" fontFamily="monospace" textAnchor="middle" dominantBaseline="middle">x_rec[n]</text>
              <g style={{ color: 'var(--series-green)' }} transform="translate(342, 306)">
                <CheckIcon size={16} />
              </g>
              <text x="350" y="330" style={{ fill: 'var(--series-green)' }} fontSize="13" fontWeight="bold" fontFamily="sans-serif" textAnchor="middle">
                Reconstrucție Perfectă: semnalul reconstruit este identic cu originalul
              </text>
            </>
          )}
        </svg>
      )
    }
    
    // Complete bank view
    return (
      <svg viewBox="0 0 900 350" style={{ width: '100%', height: 'auto' }}>
        <rect width="900" height="350" style={{ fill: 'var(--graph-background)' }} />
        
        {/* Divider */}
        <line x1="450" y1="40" x2="450" y2="310" style={{ stroke: 'var(--canvas-border)' }} strokeWidth="1" strokeDasharray="4,4" />
        
        {/* Analysis title */}
        <text x="225" y="25" style={{ fill: 'var(--series-gold)' }} fontSize="14" fontWeight="bold" fontFamily="sans-serif" textAnchor="middle">ANALIZĂ</text>
        {/* Synthesis title */}
        <text x="675" y="25" style={{ fill: 'var(--series-gold)' }} fontSize="14" fontWeight="bold" fontFamily="sans-serif" textAnchor="middle">SINTEZĂ</text>
        
        {/* === ANALYSIS SIDE (left) === */}
        {/* Input */}
        <rect x="20" y="155" width="70" height="35" rx="3" fill="#00d4ff" stroke="#00d4ff" strokeWidth="2" />
        <text x="55" y="172" fill="#000" fontSize="12" fontWeight="bold" fontFamily="monospace" textAnchor="middle" dominantBaseline="middle">x[n]</text>
        
        {/* Split */}
        <line x1="90" y1="172" x2="115" y2="172" stroke="#ffd700" strokeWidth="2" />
        <line x1="115" y1="172" x2="140" y2="95" stroke="#ffd700" strokeWidth="2" />
        <line x1="115" y1="172" x2="140" y2="250" stroke="#ffd700" strokeWidth="2" />
        
        {/* h0, h1 */}
        <rect x="145" y="78" width="70" height="35" rx="3" fill="#00ff88" stroke="#00ff88" strokeWidth="2" />
        <text x="180" y="95" fill="#000" fontSize="11" fontWeight="bold" fontFamily="monospace" textAnchor="middle" dominantBaseline="middle">h<tspan dy="3" fontSize="0.75em">0</tspan><tspan dy="-3"> (LP)</tspan></text>
        <rect x="145" y="232" width="70" height="35" rx="3" fill="#ff6b9d" stroke="#ff6b9d" strokeWidth="2" />
        <text x="180" y="250" fill="#000" fontSize="11" fontWeight="bold" fontFamily="monospace" textAnchor="middle" dominantBaseline="middle">h<tspan dy="3" fontSize="0.75em">1</tspan><tspan dy="-3"> (HP)</tspan></text>

        {/* Connections */}
        <line x1="215" y1="95" x2="240" y2="95" stroke="#00ff88" strokeWidth="2" />
        <line x1="215" y1="250" x2="240" y2="250" stroke="#ff6b9d" strokeWidth="2" />

        {/* Decimators */}
        <circle cx="260" cy="95" r="18" fill="#ffd700" />
        <SamplingGlyph cx={260} cy={95} r={18} direction="down" fontSize="12" />
        <circle cx="260" cy="250" r="18" fill="#ffd700" />
        <SamplingGlyph cx={260} cy={250} r={18} direction="down" fontSize="12" />
        
        {/* Connections */}
        <line x1="278" y1="95" x2="310" y2="95" stroke="#00ff88" strokeWidth="2" />
        <line x1="278" y1="250" x2="310" y2="250" stroke="#ff6b9d" strokeWidth="2" />
        
        {/* cA, cD */}
        <rect x="310" y="78" width="70" height="35" rx="3" fill="#00ff88" stroke="#00ff88" strokeWidth="2" />
        <text x="345" y="95" fill="#000" fontSize="12" fontWeight="bold" fontFamily="monospace" textAnchor="middle" dominantBaseline="middle">cA</text>
        <rect x="310" y="232" width="70" height="35" rx="3" fill="#ff6b9d" stroke="#ff6b9d" strokeWidth="2" />
        <text x="345" y="250" fill="#000" fontSize="12" fontWeight="bold" fontFamily="monospace" textAnchor="middle" dominantBaseline="middle">cD</text>
        
        {/* === SYNTHESIS SIDE (right) === */}
        {/* Connections from analysis */}
        <line x1="380" y1="95" x2="465" y2="95" style={{ stroke: 'var(--canvas-border)' }} strokeWidth="2" strokeDasharray="4,4" />
        <line x1="380" y1="250" x2="465" y2="250" style={{ stroke: 'var(--canvas-border)' }} strokeWidth="2" strokeDasharray="4,4" />
        
        {/* Upsamplers */}
        <circle cx="485" cy="95" r="15" fill="#ffd700" />
        <SamplingGlyph cx={485} cy={95} r={15} direction="up" fontSize="10" />
        <circle cx="485" cy="250" r="15" fill="#ffd700" />
        <SamplingGlyph cx={485} cy={250} r={15} direction="up" fontSize="10" />

        {/* Connections */}
        <line x1="500" y1="95" x2="525" y2="95" style={{ stroke: 'var(--graph-text)' }} strokeWidth="2" />
        <line x1="500" y1="250" x2="525" y2="250" style={{ stroke: 'var(--graph-text)' }} strokeWidth="2" />

        {/* g0, g1 */}
        <rect x="525" y="78" width="70" height="35" rx="3" fill="#00ff88" stroke="#00ff88" strokeWidth="2" />
        <text x="560" y="95" fill="#000" fontSize="11" fontWeight="bold" fontFamily="monospace" textAnchor="middle" dominantBaseline="middle">g<tspan dy="3" fontSize="0.75em">0</tspan></text>
        <rect x="525" y="232" width="70" height="35" rx="3" fill="#ff6b9d" stroke="#ff6b9d" strokeWidth="2" />
        <text x="560" y="250" fill="#000" fontSize="11" fontWeight="bold" fontFamily="monospace" textAnchor="middle" dominantBaseline="middle">g<tspan dy="3" fontSize="0.75em">1</tspan></text>
        
        {/* Connections to adder */}
        <line x1="595" y1="95" x2="650" y2="172" style={{ stroke: 'var(--graph-text)' }} strokeWidth="2" />
        <line x1="595" y1="250" x2="650" y2="172" style={{ stroke: 'var(--graph-text)' }} strokeWidth="2" />
        
        {/* Adder */}
        <circle cx="665" cy="172" r="15" fill="#ffd700" />
        <text x="665" y="172" fill="#000" fontSize="14" fontWeight="bold" fontFamily="sans-serif" textAnchor="middle" dominantBaseline="middle">+</text>
        
        {/* Output connection */}
        <line x1="680" y1="172" x2="720" y2="172" style={{ stroke: 'var(--graph-text)' }} strokeWidth="2" />
        
        {/* Output */}
        <rect x="720" y="155" width="70" height="35" rx="3" fill="#00d4ff" stroke="#00d4ff" strokeWidth="2" />
        <text x="755" y="172" fill="#000" fontSize="11" fontWeight="bold" fontFamily="monospace" textAnchor="middle" dominantBaseline="middle">x_rec[n]</text>
        
        {/* Perfect reconstruction note */}
        <g style={{ color: 'var(--series-green)' }} transform="translate(442, 306)">
          <CheckIcon size={16} />
        </g>
        <text x="450" y="330" style={{ fill: 'var(--series-green)' }} fontSize="12" fontWeight="bold" fontFamily="sans-serif" textAnchor="middle">
          Reconstrucție Perfectă: semnalul reconstruit este identic cu originalul
        </text>
      </svg>
    )
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      gap: '0.8rem',
      padding: compact ? '0.5rem' : '1rem',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center', flexShrink: 0 }}>
        <p style={{ margin: '0.3rem 0 0', fontSize: '0.95rem', color: 'var(--text-muted)' }}>
          Structura fundamentală a transformatei wavelet discrete (DWT)
        </p>
      </div>

      {/* View selector tabs */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        gap: '0.5rem',
        flexShrink: 0
      }}>
        {[
          { id: 'analysis', label: 'Analiză (Descompunere)' },
          { id: 'synthesis', label: 'Sinteză (Reconstrucție)' },
          { id: 'complete', label: 'Bancă Completă' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => { setActiveView(tab.id); setAnimStep(LAST_STEP); setAnimating(false) }}
            style={{
              padding: '0.5rem 1rem',
              border: activeView === tab.id ? '2px solid var(--warning)' : '2px solid transparent',
              borderRadius: '8px',
              background: activeView === tab.id ? 'rgba(255,215,0,0.15)' : 'var(--primary-alpha)',
              color: activeView === tab.id ? 'var(--warning)' : 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: '0.95rem',
              fontWeight: activeView === tab.id ? '600' : '400',
              transition: 'all 0.2s'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main content area */}
      <div style={{
        flex: 1,
        display: 'flex',
        gap: '1rem',
        minHeight: 0
      }}>
        {/* Canvas diagram */}
        <div style={{
          flex: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem'
        }}>
          <div style={{
            borderRadius: '10px',
            border: '1px solid var(--border)',
            overflow: 'hidden',
            background: 'var(--graph-background)'
          }}>
            <FilterBankDiagram view={activeView} step={animStep} />
          </div>

          {/* Step indicator, with the key insight on its second line: the
              sidebar has no room for it and it belongs next to the diagram */}
          <div style={{
            padding: '0.6rem 1rem',
            background: 'rgba(255,215,0,0.1)',
            borderRadius: '8px',
            borderLeft: '4px solid var(--warning)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.3rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span style={{ color: 'var(--warning)', fontWeight: 'bold', fontSize: '1.1rem' }}>
                Pas {animStep + 1}/{currentSteps.length}:
              </span>
              <span style={{ color: 'inherit', fontSize: '1rem' }}>
                {renderRich(currentSteps[animStep]?.label)}
              </span>
            </div>
            <span style={{ fontSize: '0.95rem', color: 'var(--text-muted)' }}>
              {renderRich(KEY_INSIGHT[activeView])}
            </span>
          </div>

          {/* Animation controls - shared component, consistent with the
              Mallat demos on the neighbouring slides */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <AnimationControls
              isPlaying={animating}
              onPlayPause={() => setAnimating(prev => !prev)}
              onStepForward={() => setAnimStep(prev => Math.min(currentSteps.length - 1, prev + 1))}
              onStepBackward={() => setAnimStep(prev => Math.max(0, prev - 1))}
              onReset={handleReset}
              canStepForward={animStep < currentSteps.length - 1}
              canStepBackward={animStep > 0}
              canPlay={animStep < currentSteps.length - 1 || animating}
              showJumpButtons={false}
              size="normal"
              layout="horizontal"
            />
          </div>
        </div>

        {/* Right sidebar - formulas and explanation */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          overflow: 'hidden'
        }}>
          {/* Wavelet selector */}
          <div style={{
            padding: '0.55rem 0.7rem',
            background: 'rgba(255,255,255,0.03)',
            borderRadius: '8px'
          }}>
            <label style={{ color: 'var(--text-muted)', fontSize: '0.85rem', display: 'block', marginBottom: '0.4rem' }}>
              Wavelet:
            </label>
            <select
              value={wavelet}
              onChange={(e) => setWavelet(e.target.value)}
              style={{
                width: '100%',
                padding: '0.4rem',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                color: 'inherit',
                fontSize: '0.9rem'
              }}
            >
              {Object.entries(WAVELETS).map(([key, w]) => (
                <option key={key} value={key}>{w.name}</option>
              ))}
            </select>
          </div>

          {/* Filter coefficients */}
          <div style={{
            padding: '0.55rem 0.7rem',
            background: 'rgba(0,212,255,0.05)',
            borderRadius: '8px',
            borderLeft: '3px solid var(--primary)'
          }}>
            <h4 style={{ margin: '0 0 0.5rem', color: 'var(--primary)', fontSize: '0.95rem' }}>
              Coeficienți Filtru ({currentWavelet.name})
            </h4>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              <p style={{ margin: '0.3rem 0' }}>
                <span style={{ color: 'var(--success)' }}><LaTeX math={String.raw`h_0`} /> (LP):</span>{' '}
                [{h0.map(v => v.toFixed(3)).join(', ')}]
              </p>
              <p style={{ margin: '0.3rem 0' }}>
                <span style={{ color: 'var(--secondary)' }}><LaTeX math={String.raw`h_1`} /> (HP):</span>{' '}
                [{h1.map(v => v.toFixed(3)).join(', ')}]
              </p>
            </div>
          </div>

          {/* Key formulas */}
          <div style={{
            padding: '0.55rem 0.7rem',
            background: 'rgba(255,215,0,0.05)',
            borderRadius: '8px',
            borderLeft: '3px solid var(--warning)'
          }}>
            <h4 style={{ margin: '0 0 0.5rem', color: 'var(--warning)', fontSize: '0.95rem' }}>
              Formulele Cheie
            </h4>
            {activeView === 'analysis' ? (
              <div style={{ fontSize: '1rem', textAlign: 'center' }}>
                <div style={{ marginBottom: '0.5rem' }}>
                  <LaTeX math={String.raw`cA[k] = \sum_n x[n] \cdot h_0[n-2k]`} />
                </div>
                <div>
                  <LaTeX math={String.raw`cD[k] = \sum_n x[n] \cdot h_1[n-2k]`} />
                </div>
              </div>
            ) : activeView === 'synthesis' ? (
              <div style={{ fontSize: '1rem', textAlign: 'center' }}>
                <LaTeX math={String.raw`x[n] = \sum_k cA[k] \cdot g_0[n-2k] + \sum_k cD[k] \cdot g_1[n-2k]`} />
              </div>
            ) : (
              <div style={{ fontSize: '1rem', textAlign: 'center' }}>
                <LaTeX math={String.raw`\text{Analiză} \rightarrow \{cA, cD\} \rightarrow \text{Sinteză} = x`} />
              </div>
            )}
          </div>

          {/* Conjugate quadrature (alternating flip) relationship */}
          <div style={{
            padding: '0.55rem 0.7rem',
            background: 'rgba(255,107,157,0.05)',
            borderRadius: '8px',
            borderLeft: '3px solid var(--secondary)'
          }}>
            <h4 style={{ margin: '0 0 0.5rem', color: 'var(--secondary)', fontSize: '0.95rem' }}>
              Relația CQF (alternating flip) <Cite id="estebangaland1977,smithbarnwell1984" />
            </h4>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              High-pass-ul e low-pass-ul inversat în timp, cu semnul alternat:
            </p>
            <div style={{ fontSize: '0.95rem', textAlign: 'center', marginTop: '0.4rem' }}>
              <LaTeX math={String.raw`h_1[n] = (-1)^n \cdot h_0[N-1-n]`} />
            </div>
            <p style={{ margin: '0.3rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Anulează aliasul; reconstrucția perfectă cere în plus putere-simetria lui h<sub>0</sub>:
            </p>
            <div style={{ fontSize: '0.9rem', textAlign: 'center', marginTop: '0.3rem' }}>
              <LaTeX math={String.raw`|H_0(\omega)|^2 + |H_0(\omega + \pi)|^2 = 2`} />
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
