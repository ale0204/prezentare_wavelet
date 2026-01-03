import LaTeX, { LaTeXBlock } from './LaTeX'
import Cite from './shared/Cite'
import '../styles/views/denoise.css'

// Static Laplacian-like histogram data for the coefficient distribution panel.
// 40 bars symmetrically placed; heights are exp(-|x|/b).
const HIST_BARS = (() => {
  const count = 40
  const b = 0.35  // scale parameter
  const bars = []
  for (let i = 0; i < count; i++) {
    // x from -1 to +1 (normalized)
    const x = -1 + (2 * i) / (count - 1)
    bars.push({ x, height: Math.exp(-Math.abs(x) / b) })
  }
  return bars
})()

// SVG dimensions for the histogram
const SVG_W = 300
const SVG_H = 110
const MARGIN = { top: 8, right: 10, bottom: 22, left: 10 }
const PLOT_W = SVG_W - MARGIN.left - MARGIN.right
const PLOT_H = SVG_H - MARGIN.top - MARGIN.bottom

// lambda threshold (normalized, in the same [-1, 1] x range)
const LAMBDA = 0.3

function CoefficientHistogram() {
  const barWidth = PLOT_W / HIST_BARS.length

  return (
    <svg
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      className="threshold-graph coef-histogram"
      style={{ width: '100%', maxWidth: '320px' }}
    >
      {/* Bars */}
      {HIST_BARS.map((bar, i) => {
        const bx = MARGIN.left + i * barWidth
        const bh = bar.height * PLOT_H
        const by = MARGIN.top + PLOT_H - bh
        const isNoise = Math.abs(bar.x) < LAMBDA
        return (
          <rect
            key={i}
            x={bx}
            y={by}
            width={barWidth - 0.5}
            height={bh}
            fill={isNoise ? 'rgba(220,60,60,0.72)' : 'rgba(0,170,95,0.75)'}
          />
        )
      })}

      {/* Dashed threshold lines - the paragraph below names them "lambda",
          so no on-chart label is needed (and SVG text can't render KaTeX) */}
      {[-LAMBDA, LAMBDA].map((lx, li) => {
        const px = MARGIN.left + ((lx + 1) / 2) * PLOT_W
        return (
          <line
            key={li}
            x1={px} y1={MARGIN.top}
            x2={px} y2={MARGIN.top + PLOT_H}
            style={{ stroke: 'var(--series-gold)' }}
            strokeWidth="1.5"
            strokeDasharray="3,3"
          />
        )
      })}

      {/* X axis line */}
      <line
        x1={MARGIN.left} y1={MARGIN.top + PLOT_H}
        x2={MARGIN.left + PLOT_W} y2={MARGIN.top + PLOT_H}
        style={{ stroke: 'var(--canvas-border)' }} strokeWidth="1"
      />

      {/* Legend labels - only the noise band and the right tail are named;
          the left tail is the same "kept" colour, and a third label there
          would overlap "eliminat (zgomot)" (both tails read as symmetric) */}
      <text
        x={MARGIN.left + PLOT_W * 0.25}
        y={SVG_H - 4}
        fill="rgba(200,40,40,0.95)"
        fontSize="12"
        textAnchor="middle"
      >
        eliminat (zgomot)
      </text>
      <text
        x={MARGIN.left + PLOT_W * 0.75}
        y={SVG_H - 4}
        fill="rgba(0,140,80,0.95)"
        fontSize="12"
        textAnchor="middle"
      >
        păstrat (semnal)
      </text>
    </svg>
  )
}

export default function DenoiseTheoryView({ compact = false }) {
  return (
    <div className={`denoise-theory-view ${compact ? 'compact' : ''}`}>
      <div className="denoise-theory-content">
        {/* Main theory section */}
        <div className="theory-section main-theory">

          {/* Night Mode real-world anchor sentence */}
          <div className="info-box" style={{ marginBottom: '0.3rem', borderColor: 'rgba(157,78,221,0.4)', background: 'rgba(157,78,221,0.08)' }}>
            <p style={{ margin: 0, fontSize: '0.92rem', color: 'var(--purple)' }}>
              <strong>Night Mode</strong> scapă de zgomot aliniind și mediind o rafală de cadre;
              denoisingul wavelet atacă altfel: zgomotul stă în coeficienții mici, semnalul în
              cei mari, iar pragul <LaTeX math={String.raw`\lambda`} /> îi desparte.
            </p>
          </div>

          <div className="info-box">
            <p>
              <strong>Denoising prin thresholding:</strong> Zgomotul produce coeficienți
              wavelet mici, în timp ce semnalul util produce coeficienți mari.
              Prin eliminarea sau atenuarea coeficienților sub un prag, păstrăm semnalul.
            </p>
          </div>

          <div className="math-formulas">
            <div className="formula-row">
              <span className="formula-label">Soft thresholding:</span>
              <div className="formula-math">
                <LaTeX math={String.raw`\eta_s(x, \lambda) = \text{sign}(x) \cdot \max(|x| - \lambda, 0)`} />
              </div>
            </div>
            <div className="formula-row">
              <span className="formula-label">Hard thresholding:</span>
              <div className="formula-math">
                <LaTeX math={String.raw`\eta_h(x, \lambda) = x \cdot \mathbb{1}(|x| > \lambda)`} />
              </div>
            </div>
            <div className="formula-row">
              <span className="formula-label">Prag universal (Donoho-Johnstone):</span>
              <div className="formula-math">
                <LaTeX math={String.raw`\lambda = \sigma \sqrt{2 \ln N}`} />
              </div>
            </div>
          </div>
          <p className="formula-note">
            <LaTeX math={String.raw`N`} /> = numărul de coeficienți; <LaTeX math={String.raw`\sigma = \text{mediana}(|d|)/0.6745`} />,
            din subbanda de detaliu cea mai fină. Demo-ul folosește <LaTeX math={String.raw`2\sigma`} />,
            mai blând decât pragul universal (care supranetezește). <Cite id="donohojohnstone1994" />
          </p>
        </div>

        {/* Comparison section - each card below already carries its own title,
            so a section heading here would only repeat "Soft"/"Hard" once more */}
        <div className="theory-section comparison-section">
          <div className="threshold-comparison">
            <div className="threshold-card soft">
              <div className="card-header">
                <h3>Soft Thresholding</h3>
                <div className="threshold-visual">
                  <svg viewBox="0 0 120 96" className="threshold-graph">
                    {/* Axes */}
                    <line x1="10" y1="40" x2="110" y2="40" style={{ stroke: 'var(--canvas-border)' }} strokeWidth="1"/>
                    <line x1="60" y1="10" x2="60" y2="70" style={{ stroke: 'var(--canvas-border)' }} strokeWidth="1"/>
                    {/* Input line (gray dashed) */}
                    <line x1="10" y1="70" x2="110" y2="10" style={{ stroke: 'var(--canvas-border)' }} strokeWidth="1" strokeDasharray="3,3"/>
                    {/* Soft threshold curve - correct shape */}
                    <path d="M 10 55 L 35 40 L 85 40 L 110 25"
                          fill="none" style={{ stroke: 'var(--series-green)' }} strokeWidth="2.5"/>
                    {/* Lambda markers */}
                    <text x="35" y="88" textAnchor="middle" style={{ fill: 'var(--graph-text)' }} fontSize="13">-prag</text>
                    <text x="85" y="88" textAnchor="middle" style={{ fill: 'var(--graph-text)' }} fontSize="13">+prag</text>
                  </svg>
                </div>
              </div>
              <p>
                Reduce continuu coeficienții spre zero. Rezultate netede,
                fără discontinuități. <strong>Preferat în practică.</strong>
              </p>
            </div>

            <div className="threshold-card hard">
              <div className="card-header">
                <h3>Hard Thresholding</h3>
                <div className="threshold-visual">
                  <svg viewBox="0 0 120 96" className="threshold-graph">
                    {/* Axes */}
                    <line x1="10" y1="40" x2="110" y2="40" style={{ stroke: 'var(--canvas-border)' }} strokeWidth="1"/>
                    <line x1="60" y1="10" x2="60" y2="70" style={{ stroke: 'var(--canvas-border)' }} strokeWidth="1"/>
                    {/* Input line (gray dashed) */}
                    <line x1="10" y1="70" x2="110" y2="10" style={{ stroke: 'var(--canvas-border)' }} strokeWidth="1" strokeDasharray="3,3"/>
                    {/* Hard threshold curve - correct shape with jumps */}
                    <path d="M 10 55 L 35 55" fill="none" style={{ stroke: 'var(--series-amber)' }} strokeWidth="2.5"/>
                    <line x1="35" y1="55" x2="35" y2="40" style={{ stroke: 'var(--series-amber)' }} strokeWidth="2.5" strokeDasharray="2,2"/>
                    <path d="M 35 40 L 85 40" fill="none" style={{ stroke: 'var(--series-amber)' }} strokeWidth="2.5"/>
                    <line x1="85" y1="40" x2="85" y2="25" style={{ stroke: 'var(--series-amber)' }} strokeWidth="2.5" strokeDasharray="2,2"/>
                    <path d="M 85 25 L 110 25" fill="none" style={{ stroke: 'var(--series-amber)' }} strokeWidth="2.5"/>
                    {/* Lambda markers */}
                    <text x="35" y="88" textAnchor="middle" style={{ fill: 'var(--graph-text)' }} fontSize="13">-prag</text>
                    <text x="85" y="88" textAnchor="middle" style={{ fill: 'var(--graph-text)' }} fontSize="13">+prag</text>
                  </svg>
                </div>
              </div>
              <p>
                Elimină complet coeficienții sub prag și îi păstrează exact pe ceilalți.
                Poate produce artefacte, dar păstrează muchiile.
              </p>
            </div>

            {/* Third panel: coefficient histogram */}
            <div className="threshold-card coef-dist">
              <div className="card-header">
                <h3>Distribuția coeficienților (tipică)</h3>
                <div className="threshold-visual">
                  <CoefficientHistogram />
                </div>
              </div>
              <p>
                Formă tipică (Laplace idealizată), nu coeficienți măsurați dintr-o
                imagine anume - vezi slide-ul următor pentru cifre reale. Semnalul
                util produce coeficienți mari (cozile), zgomotul produce coeficienți
                mici (centrul). Pragul <LaTeX math={String.raw`\lambda`} /> separă cele două.
              </p>
            </div>
          </div>
        </div>

        {/* Process steps */}
        <div className="theory-section process-section">
          <h3>Procesul de Denoising</h3>
          <div className="process-steps">
            <div className="step">
              <span className="step-num">1</span>
              <span className="step-text">DWT</span>
            </div>
            <div className="step-arrow">-&gt;</div>
            <div className="step">
              <span className="step-num">2</span>
              <span className="step-text">Threshold</span>
            </div>
            <div className="step-arrow">-&gt;</div>
            <div className="step">
              <span className="step-num">3</span>
              <span className="step-text">IDWT</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
