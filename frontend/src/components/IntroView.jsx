import { LaTeXBlock } from './LaTeX'

export default function IntroView({ onStartGuide }) {
  return (
    <div className="intro-view">
      <div className="intro-hero">
        <h1>Transformata Wavelet</h1>
        <p className="subtitle">
          Analiza timp-frecvență, de la Fourier la wavelets,
          și aplicații în compresia imaginilor
        </p>
        <button className="primary intro-start" onClick={onStartGuide}>
          Începe prezentarea
        </button>
        <p className="intro-credits">
          Neamțu Alexandra &middot; CTI, anul III, semestrul 2<br />
          Prelucrarea Semnalelor &middot; titular de curs prof. Paul Irofti<br />
          Facultatea de Matematică și Informatică, Universitatea din București
        </p>
      </div>

      <div className="feature-grid">
        <div className="feature-card">
          <h3>Transformata Fourier</h3>
          <p>Descompunerea în frecvențe globale - fundația analizei spectrale</p>
        </div>
        
        <div className="feature-card">
          <h3>Filtre Low/High Pass</h3>
          <p>Separarea componentelor de frecvență joasă și înaltă</p>
        </div>
        
        <div className="feature-card">
          <h3>Wavelets</h3>
          <p>Localizare timp-frecvență - "microscop matematic"</p>
        </div>
        
        <div className="feature-card">
          <h3>Descompunere Mallat</h3>
          <p>Algoritm piramidal pentru analiza multi-rezoluție</p>
        </div>
        
        <div className="feature-card">
          <h3>Denoising</h3>
          <p>Eliminarea zgomotului prin thresholding wavelet</p>
        </div>
        
        <div className="feature-card">
          <h3>JPEG vs JPEG2000</h3>
          <p>Comparație DCT vs Wavelet în compresie</p>
        </div>
      </div>

      <div className="panel">
        <h2>Obiectivele Prezentării</h2>
        
        <div className="info-box">
          <h3>1. Înțelegerea Fundamentelor</h3>
          <p>
            Transformata Fourier ne spune <strong>ce frecvențe</strong> sunt prezente într-un semnal,
            dar nu <strong>când</strong> apar. Wavelets rezolvă această limitare.
          </p>
        </div>
        
        <div className="info-box">
          <h3>2. Analiza Multi-Rezoluție</h3>
          <p>
            Descompunerea piramidală Mallat permite analiza semnalului la diferite scale,
            similar cu zoom-ul progresiv pe o imagine.
          </p>
        </div>
        
        <div className="info-box">
          <h3>3. Aplicații Practice</h3>
          <p>
            De la denoising la compresie (JPEG2000), wavelets oferă avantaje semnificative
            față de metodele bazate pe DCT în multe scenarii.
          </p>
        </div>
      </div>

      <div className="panel">
        <h2>Matematica de Bază</h2>
        
        <div className="math-block">
          <strong>Transformata Fourier:</strong><br/>
          <LaTeXBlock math={String.raw`F(\omega) = \int_{-\infty}^{\infty} f(t) \cdot e^{-i\omega t} \, dt`} />
        </div>
        
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', margin: '1rem 0' }}>
          Problema: pierderea informației temporale
        </p>
        
        <div className="math-block">
          <strong>Transformata Wavelet Continuă:</strong><br/>
          <LaTeXBlock math={String.raw`W(a,b) = \frac{1}{\sqrt{a}} \int_{-\infty}^{\infty} f(t) \cdot \psi^*\left(\frac{t-b}{a}\right) dt`} />
        </div>
        
        <div className="info-box success">
          <strong>Avantaj:</strong> Parametrul <em>a</em> (scalare) și <em>b</em> (translație)
          permit localizarea în timp și frecvență simultan!
        </div>
      </div>
    </div>
  )
}
