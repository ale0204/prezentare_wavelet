import { useState, useEffect } from 'react'
import axios from 'axios'
import LaTeX, { LaTeXBlock } from './LaTeX'
import { renderRich } from './shared/richText'
import useHiDPICanvas from './shared/useHiDPICanvas'
import { canvasTheme } from './shared/canvasTheme'

// ========== CONTINUOUS WAVELETS (for CWT analysis) ==========
const CONTINUOUS_WAVELETS = {
  morlet: {
    name: 'Morlet',
    fullName: 'Jean Morlet (1982), formalizat cu Alex Grossmann (1984)',
    category: 'Continuu',
    color: 'var(--series-pink)',
    description: 'Sinusoidă modulată de Gaussian. Standard în analiza timp-frecvență.',
    math: String.raw`\psi(t) = \pi^{-1/4} \cdot e^{i\omega_0 t} \cdot e^{-t^2/2}`,
    keyPoints: ['Complex (Re + Im)', 'Suport infinit', 'Localizare optimă timp-frecvență'],
    bestFor: 'Semnale seismice, EEG/ECG'
  },

  mexican_hat: {
    name: 'Mexican Hat',
    fullName: 'Ricker / Marr Wavelet',
    category: 'Continuu',
    color: 'var(--series-amber)',
    description: 'Derivata a 2-a a Gaussienei. Formă de pălărie mexicană.',
    math: String.raw`\psi(t) = (1 - t^2) \cdot e^{-t^2/2}`,
    keyPoints: ['Simetric', 'LoG în 2D', 'Zero crossings clare'],
    bestFor: 'Detectare blob, scale-space'
  },

  gaussian: {
    name: 'Gaussian',
    fullName: 'Derivate Gaussiene',
    category: 'Continuu',
    color: 'var(--series-green)',
    description: 'Familie de wavelets din derivatele succesive ale Gaussienei.',
    math: String.raw`\psi_n(t) = C_n \cdot \frac{d^n}{dt^n}\left[e^{-t^2/2}\right]`,
    keyPoints: ['Ordinul n determină forma', 'Infinit neted ($C^\\infty$)', 'n=2 este Mexican Hat'],
    bestFor: 'Detectare muchii, computer vision'
  },

  shannon: {
    name: 'Shannon',
    fullName: 'Sinc Wavelet',
    category: 'Continuu',
    color: 'var(--series-purple)',
    description: 'Wavelet ideal în frecvență - separare perfectă a benzilor.',
    math: String.raw`\psi(t) = \text{sinc}(t/2) \cdot \cos(3\pi t/2)`,
    keyPoints: ['Brick-wall în frecvență', 'Decădere lentă în timp', 'Artefacte Gibbs'],
    bestFor: 'Analiză teoretică, referință'
  }
}

// ========== DISCRETE WAVELETS (for DWT / Mallat algorithm) ==========
const DISCRETE_WAVELETS = {
  haar: {
    name: 'Haar',
    fullName: 'Alfred Haar (1910)',
    category: 'Ortogonal',
    color: 'var(--primary)',
    description: 'Cel mai simplu wavelet - funcție pas. Primul wavelet descoperit, baza pentru înțelegerea DWT.',
    math: String.raw`\psi(t) = \begin{cases} 1 & 0 \le t < \frac{1}{2} \\ -1 & \frac{1}{2} \le t < 1 \\ 0 & \text{altfel} \end{cases}`,
    filterMath: String.raw`h = \left[\frac{1}{\sqrt{2}}, \frac{1}{\sqrt{2}}\right], \quad g = \left[\frac{1}{\sqrt{2}}, -\frac{1}{\sqrt{2}}\right]`,
    keyPoints: ['Suport compact [0,1]', 'Discontinuu', 'Ortogonal', 'Cel mai rapid O(n)', '2 coeficienți'],
    bestFor: 'Tranziții bruște, muchii, pedagogic',
    vanishingMoments: 1,
    filterLength: 2
  },
  
  daubechies: {
    name: 'Daubechies',
    fullName: 'Ingrid Daubechies (1988)',
    category: 'Ortogonal',
    color: 'var(--series-red)',
    description: 'Familie de wavelets ortogonale cu suport compact. dbN are 2N coeficienți și N momente nule; db4 (8 coeficienți) este o alegere populară în analiza semnalelor. [cite:daubechies1988]',
    math: String.raw`\phi(t) = \sqrt{2} \sum_{k=0}^{2N-1} h_k \phi(2t - k)`,
    filterMath: String.raw`\text{db2: } h = [0.483,\ 0.836,\ 0.224,\ -0.129]`,
    keyPoints: ['Suport compact', 'dbN = N momente nule', '2N coeficienți', 'Asimetric'],
    bestFor: 'Compresie audio/video, analiză generală',
    vanishingMoments: 'N (pentru dbN)',
    filterLength: '2N (db4 = 8 coeficienți)'
  },

  symlets: {
    name: 'Symlets',
    fullName: 'Daubechies Simetrizate',
    category: 'Aproape simetric',
    color: 'var(--series-green)',
    description: 'Modificare a Daubechies pentru a obține simetrie aproape perfectă. Reduce artefactele de fază.',
    math: String.raw`\text{sym}N: \text{Fază liniară aproape perfectă}`,
    filterMath: String.raw`\text{sym4: } h \approx [-0.076, -0.030, 0.498, 0.804, 0.298, -0.099, -0.013, 0.032]`,
    keyPoints: ['Aproape simetric', 'Fază aproape liniară', 'Artefacte reduse', 'symN = dbN optimizat'],
    bestFor: 'Imagini, unde simetria contează',
    vanishingMoments: 'N',
    filterLength: '2N'
  },

  biorthogonal: {
    name: 'Biortogonal',
    fullName: 'Cohen-Daubechies-Feauveau',
    category: 'Biortogonal',
    color: 'var(--series-gold)',
    description: 'Filtre diferite pentru analiză și sinteză. Permite simetrie exactă. Folosit în JPEG2000! [cite:taubmanmarcellin2002,sweldens1998]',
    math: String.raw`\langle \tilde{\psi}_{j,k}, \psi_{j',k'} \rangle = \delta_{j,j'} \delta_{k,k'}`,
    filterMath: String.raw`\text{bior4.4: Folosit în JPEG2000}`,
    keyPoints: ['Simetrie exactă', 'Reconstrucție perfectă', 'Filtre separate analiză/sinteză', 'Standard JPEG2000'],
    bestFor: 'JPEG2000, compresie imagini',
    vanishingMoments: 'N.M (ex: 4.4)',
    filterLength: 'Variabil (analiză ≠ sinteză)'
  },

  coiflets: {
    name: 'Coiflets',
    fullName: 'Coifman Wavelets',
    category: 'Aproape simetric',
    color: 'var(--series-purple)',
    description: 'Wavelets cu momente nule atât pentru $\\psi$ cât și pentru $\\phi$. Aproximare mai bună a funcțiilor smooth.',
    math: String.raw`\int t^k \phi(t) \, dt = 0, \quad k = 1, ..., 2N-1`,
    filterMath: String.raw`\text{coif2: } \phi \text{ are } 2N-1 \text{ momente nule}`,
    keyPoints: ['$\\phi$ și $\\psi$ cu momente nule', 'Foarte neted', '6N coeficienți', 'Aproximare superioară'],
    bestFor: 'Aproximare funcții, analiză numerică',
    vanishingMoments: '2N',
    filterLength: '6N'
  }
}

// Representative pywt member of each family for the basis-curve preview -
// matches the specific filter example already quoted in that card's filterMath.
const DISCRETE_API_ID = {
  haar: 'haar',
  daubechies: 'db4',
  symlets: 'sym4',
  biorthogonal: 'bior4.4',
  coiflets: 'coif2'
}

// Plots one phi/psi curve (from /api/wavelet-basis) into a horizontal slot
// of a shared canvas, normalized to fill its own height.
function drawBasisCurve(ctx, x, y, startX, w, h, color) {
  if (!x || !y || x.length < 2) return
  const margin = 4
  const min = Math.min(...y)
  const max = Math.max(...y)
  const range = max - min || 1
  const span = x[x.length - 1] - x[0] || 1

  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  ctx.beginPath()
  for (let i = 0; i < x.length; i++) {
    const px = startX + margin + ((x[i] - x[0]) / span) * (w - 2 * margin)
    const py = h - margin - ((y[i] - min) / range) * (h - 2 * margin)
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.stroke()
}

// Admissibility condition and key theory
const WAVELET_THEORY = {
  admissibility: {
    title: 'Media nulă (condiție necesară)',
    math: String.raw`C_\psi = \int_0^{\infty} \frac{|\hat{\psi}(\omega)|^2}{\omega} \, d\omega < \infty \;\Rightarrow\; \int_{-\infty}^{\infty} \psi(t) \, dt = 0`,
    description: 'Condiția de admisibilitate cere integrala C_psi finită; pentru un psi integrabil ea forțează media nulă, deci wavelet-ul oscilează în jurul lui zero. [cite:daubechies1992]'
  },
  scalingEquation: {
    title: 'Ecuația de Scalare (Dilatație)',
    math: String.raw`\phi(t) = \sqrt{2} \sum_{k} h_k \, \phi(2t - k)`,
    description: 'Funcția de scalare $\\phi$ se exprimă recursiv prin coeficienții h'
  },
  waveletEquation: {
    title: 'Ecuația Wavelet',
    math: String.raw`\psi(t) = \sqrt{2} \sum_{k} g_k \, \phi(2t - k)`,
    description: 'Wavelet-ul $\\psi$ se derivă din $\\phi$ folosind coeficienții g'
  },
  qmf: {
    title: 'Filtre în oglindă conjugate (CQF)',
    math: String.raw`g_k = (-1)^k h_{N-1-k}`,
    description: 'High-pass-ul g se obține din low-pass-ul h prin inversare în timp și alternarea semnului (alternating flip). Numele istoric QMF descrie o altă pereche, care cu filtre FIR dă reconstrucție perfectă doar pentru Haar. [cite:estebangaland1977,smithbarnwell1984]'
  },
  dyadicSampling: {
    title: 'De ce DWT nu e redundant',
    math: String.raw`a = 2^j, \quad b = k \cdot 2^j, \quad j,k \in \mathbb{Z}`,
    description: 'CWT evaluează $(a,b)$ continuu, deci informația se repetă. DWT eșantionează doar diadic (scală putere a lui 2, translație multiplu de scală): exact atâția coeficienți cât produc o bază ortonormală, fără redundanță. [cite:mallat2008]'
  }
}

export default function WaveletEducationView({ api, compact = false }) {
  const [activeTab, setActiveTab] = useState('theory') // 'continuous' | 'discrete' | 'theory'
  const [selectedContinuous, setSelectedContinuous] = useState('morlet')
  const [selectedDiscrete, setSelectedDiscrete] = useState('haar')
  const [basisData, setBasisData] = useState(null)

  const contInfo = CONTINUOUS_WAVELETS[selectedContinuous]
  const discInfo = DISCRETE_WAVELETS[selectedDiscrete]

  // Real phi/psi curves for the selected discrete family - the catalogue used
  // to be text and coefficients only, with no picture of the actual function.
  useEffect(() => {
    if (!api || activeTab !== 'discrete') return
    let cancelled = false
    axios.get(`${api}/wavelet-basis`, { params: { wavelet: DISCRETE_API_ID[selectedDiscrete], samples: 128 } })
      .then(res => { if (!cancelled) setBasisData(res.data) })
      .catch(() => { if (!cancelled) setBasisData(null) })
    return () => { cancelled = true }
  }, [api, activeTab, selectedDiscrete])

  const { canvasRef: basisCanvasRef, containerRef: basisContainerRef, redraw: redrawBasis } = useHiDPICanvas((ctx, { width, height }) => {
    ctx.fillStyle = canvasTheme().bg
    ctx.fillRect(0, 0, width, height)
    if (!basisData) return
    const { x, scaling_function, wavelet_function } = basisData
    const half = width / 2
    drawBasisCurve(ctx, x, scaling_function, 0, half, height, canvasTheme().green)
    drawBasisCurve(ctx, x, wavelet_function, half, half, height, canvasTheme().pink)
  }, [basisData])

  // The preview canvas only exists in the DOM while the discrete tab is
  // active, so its container remounts (a fresh node) every time the tab is
  // revisited - force a repaint then, since the hook's own resize-driven
  // redraw is tied to the now-stale previous node.
  useEffect(() => {
    if (activeTab === 'discrete') redrawBasis()
  }, [activeTab, redrawBasis])

  const renderWaveletCard = (info, isDiscrete = false) => (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: '1rem',
      minHeight: 0,
      overflow: 'auto',
      justifyContent: 'center'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1.5rem',
        padding: '1rem 1.5rem',
        background: `${info.color}15`,
        borderRadius: '12px',
        borderLeft: `5px solid ${info.color}`
      }}>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: 0, color: info.color, fontSize: '1.4rem' }}>{info.name}</h3>
          <p style={{ margin: '0.2rem 0 0', fontSize: '0.95rem', color: 'var(--text-muted)' }}>{info.fullName}</p>
        </div>
        <span style={{
          padding: '0.4rem 0.8rem',
          background: info.color,
          borderRadius: '12px',
          fontSize: '0.85rem',
          color: '#000',
          fontWeight: '600'
        }}>
          {info.category}
        </span>
      </div>

      {/* Description */}
      <p style={{ margin: 0, fontSize: '1.05rem', color: 'var(--text-light)', textAlign: 'center', padding: '0 1rem' }}>
        {renderRich(info.description)}
      </p>

      {/* Math Formula */}
      <div style={{
        padding: '1rem 1.5rem',
        background: 'rgba(0,0,0,0.3)',
        borderRadius: '10px',
        textAlign: 'center',
        fontSize: '1.2rem'
      }}>
        <LaTeXBlock math={info.math} />
      </div>

      {/* phi/psi preview - a real curve from pywt, not just text and
          coefficients, for the specific family member named in filterMath */}
      {isDiscrete && (
        <div style={{ padding: '0.6rem 1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '10px' }}>
          <p style={{ margin: '0 0 0.4rem', fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center' }}>
            <LaTeX math="\phi(t)" /> / <LaTeX math="\psi(t)" /> pentru {DISCRETE_API_ID[selectedDiscrete]}
          </p>
          <div ref={basisContainerRef} style={{ height: '90px' }}>
            <canvas ref={basisCanvasRef} style={{ display: 'block' }} />
          </div>
          <p style={{ margin: '0.35rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginRight: '0.8rem' }}>
              <span style={{ width: '10px', height: '10px', background: 'var(--series-green)', borderRadius: '2px', display: 'inline-block' }} />
              <LaTeX math="\phi(t)" /> scalare
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '10px', height: '10px', background: 'var(--series-pink)', borderRadius: '2px', display: 'inline-block' }} />
              <LaTeX math="\psi(t)" /> wavelet
            </span>
          </p>
        </div>
      )}

      {/* Filter Coefficients for DWT */}
      {isDiscrete && info.filterMath && (
        <div style={{
          padding: '0.8rem 1.2rem',
          background: 'rgba(255,215,0,0.1)',
          border: '1px solid rgba(255,215,0,0.3)',
          borderRadius: '10px',
          textAlign: 'center'
        }}>
          <p style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', color: 'var(--series-gold)' }}>
            Coeficienții Filtrului
          </p>
          <div style={{ fontSize: '1.1rem' }}>
            <LaTeX math={info.filterMath} />
          </div>
        </div>
      )}

      {/* Key Points & Best For */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.8rem'
      }}>
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.5rem',
          justifyContent: 'center'
        }}>
          {info.keyPoints.map((point, i) => (
            <span key={i} style={{
              padding: '0.4rem 0.8rem',
              background: 'rgba(255,255,255,0.08)',
              borderRadius: '6px',
              fontSize: '0.9rem',
              color: 'var(--text-muted)'
            }}>
              {renderRich(point)}
            </span>
          ))}
        </div>
        <div style={{
          padding: '0.5rem 1rem',
          background: `${info.color}20`,
          border: `1px solid ${info.color}40`,
          borderRadius: '8px',
          fontSize: '1rem',
          color: info.color,
          textAlign: 'center'
        }}>
          <strong>Recomandat pentru:</strong> {info.bestFor}
        </div>
      </div>

      {/* Additional info for discrete */}
      {isDiscrete && info.vanishingMoments && (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '2rem',
          fontSize: '0.95rem',
          color: 'var(--text-muted)'
        }}>
          <span>Momente nule: <strong style={{ color: 'var(--text-body)' }}>{info.vanishingMoments}</strong></span>
          <span>Lungime filtru: <strong style={{ color: 'var(--text-body)' }}>{info.filterLength}</strong></span>
        </div>
      )}
    </div>
  )

  const renderTheoryTab = () => {
    const theoryItems = Object.entries(WAVELET_THEORY)
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.8rem',
        minHeight: 0,
        padding: '0.5rem'
      }}>
        {/* Row 1: First two theory items */}
        <div style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          gap: '0.8rem'
        }}>
          {theoryItems.slice(0, 2).map(([key, item]) => (
            <div key={key} style={{
              flex: 1,
              minHeight: 0,
              padding: '0.6rem 1.2rem',
              background: 'rgba(255,255,255,0.03)',
              borderRadius: '12px',
              borderLeft: '5px solid #00d4ff',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              gap: '0.4rem'
            }}>
              <h4 style={{ margin: 0, color: 'var(--primary)', fontSize: '1.3rem' }}>
                {item.title}
              </h4>
              <div style={{ textAlign: 'center', fontSize: '1.3rem' }}>
                <LaTeX math={item.math} />
              </div>
              <p style={{ margin: 0, fontSize: '1.05rem', color: 'var(--text-muted)' }}>
                {renderRich(item.description)}
              </p>
            </div>
          ))}
        </div>

        {/* Row 2: Items 3 and 4 */}
        <div style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          gap: '0.8rem'
        }}>
          {theoryItems.slice(2, 4).map(([key, item]) => (
            <div key={key} style={{
              flex: 1,
              minHeight: 0,
              padding: '0.6rem 1.2rem',
              background: 'rgba(255,255,255,0.03)',
              borderRadius: '12px',
              borderLeft: '5px solid #00d4ff',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              gap: '0.4rem'
            }}>
              <h4 style={{ margin: 0, color: 'var(--primary)', fontSize: '1.3rem' }}>
                {item.title}
              </h4>
              <div style={{ textAlign: 'center', fontSize: '1.3rem' }}>
                <LaTeX math={item.math} />
              </div>
              <p style={{ margin: 0, fontSize: '1.05rem', color: 'var(--text-muted)' }}>
                {renderRich(item.description)}
              </p>
            </div>
          ))}
        </div>
        
        {/* Row 3: CWT (continuous, redundant) next to why DWT isn't - the
            direct answer to "why does this tab's CWT panel show infinite
            support for everything while DWT shows compact support?" */}
        <div style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          gap: '0.8rem'
        }}>
          <div style={{
            flex: 1,
            minHeight: 0,
            padding: '0.6rem 1.5rem',
            background: 'rgba(255,107,155,0.1)',
            borderRadius: '12px',
            borderLeft: '5px solid #ff6b9d',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.4rem'
          }}>
            <p style={{ margin: 0, fontSize: '1.15rem', color: 'var(--series-pink)', fontWeight: '600' }}>
              Transformata Wavelet Continuă (CWT)
            </p>
            <div style={{ fontSize: '1.2rem' }}>
              <LaTeX math={String.raw`W(a,b) = \int_{-\infty}^{\infty} f(t) \cdot \frac{1}{\sqrt{a}} \psi^*\left(\frac{t-b}{a}\right) dt`} />
            </div>
            <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-muted)' }}>
              {renderRich('Evaluează $(a,b)$ continuu: informația se repetă (redundant).')}
            </p>
          </div>
          <div style={{
            flex: 1,
            minHeight: 0,
            padding: '0.6rem 1.5rem',
            background: 'rgba(0,255,136,0.08)',
            borderRadius: '12px',
            borderLeft: '5px solid var(--series-green)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.4rem'
          }}>
            <p style={{ margin: 0, fontSize: '1.15rem', color: 'var(--series-green)', fontWeight: '600' }}>
              {WAVELET_THEORY.dyadicSampling.title}
            </p>
            <div style={{ fontSize: '1.2rem' }}>
              <LaTeX math={WAVELET_THEORY.dyadicSampling.math} />
            </div>
            <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-muted)' }}>
              {renderRich(WAVELET_THEORY.dyadicSampling.description)}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="wavelet-education-view" style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      gap: '1rem',
      padding: compact ? '0.6rem' : '1rem',
      overflow: 'hidden'
    }}>
      {/* Title */}
      <div style={{ textAlign: 'center', flexShrink: 0 }}>
        <p style={{ margin: '0.3rem 0 0', fontSize: '1rem', color: 'var(--text-muted)' }}>
          CWT pentru analiză timp-frecvență • DWT pentru Mallat/JPEG2000
        </p>
      </div>

      {/* Tab Selector */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        gap: '0.5rem',
        flexShrink: 0
      }}>
        {[
          { id: 'discrete', label: 'DWT (discret)', desc: 'Mallat, JPEG2000' },
          { id: 'continuous', label: 'CWT (continuu)', desc: 'Analiză' },
          { id: 'theory', label: 'Teorie', desc: 'Formule' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '0.6rem 1.2rem',
              border: activeTab === tab.id ? '2px solid #00d4ff' : '2px solid transparent',
              borderRadius: '10px',
              background: activeTab === tab.id ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.05)',
              color: activeTab === tab.id ? '#00d4ff' : 'var(--text-muted)',
              cursor: 'pointer',
              transition: 'all 0.2s',
              fontSize: '1rem',
              fontWeight: activeTab === tab.id ? '600' : '400'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content based on active tab */}
      {activeTab === 'discrete' && (
        <>
          {/* Discrete Wavelet Selector */}
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '0.5rem',
            flexShrink: 0
          }}>
            {Object.entries(DISCRETE_WAVELETS).map(([key, w]) => (
              <button
                key={key}
                onClick={() => setSelectedDiscrete(key)}
                style={{
                  padding: '0.5rem 1rem',
                  border: selectedDiscrete === key ? `2px solid ${w.color}` : '2px solid transparent',
                  borderRadius: '8px',
                  background: selectedDiscrete === key ? `${w.color}22` : 'rgba(255,255,255,0.05)',
                  color: selectedDiscrete === key ? w.color : 'var(--text-muted)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  fontSize: '0.95rem',
                  fontWeight: selectedDiscrete === key ? '600' : '400'
                }}
              >
                {w.name}
              </button>
            ))}
          </div>
          {renderWaveletCard(discInfo, true)}
        </>
      )}

      {activeTab === 'continuous' && (
        <>
          {/* Continuous Wavelet Selector */}
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '0.5rem',
            flexShrink: 0
          }}>
            {Object.entries(CONTINUOUS_WAVELETS).map(([key, w]) => (
              <button
                key={key}
                onClick={() => setSelectedContinuous(key)}
                style={{
                  padding: '0.5rem 1rem',
                  border: selectedContinuous === key ? `2px solid ${w.color}` : '2px solid transparent',
                  borderRadius: '8px',
                  background: selectedContinuous === key ? `${w.color}22` : 'rgba(255,255,255,0.05)',
                  color: selectedContinuous === key ? w.color : 'var(--text-muted)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  fontSize: '0.95rem',
                  fontWeight: selectedContinuous === key ? '600' : '400'
                }}
              >
                {w.name}
              </button>
            ))}
          </div>
          {renderWaveletCard(contInfo, false)}
        </>
      )}

      {activeTab === 'theory' && renderTheoryTab()}
    </div>
  )
}
