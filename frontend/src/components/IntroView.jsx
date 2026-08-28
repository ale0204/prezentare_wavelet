/* Landing screen, outside the tour. It has one job: say what the talk is and start it.
   The objectives and the two transforms used to be repeated here in full-width panels,
   which pushed the page past one screen; they live on the cuprins and theory slides. */
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
          Neamțu Alexandra &middot; CTI, anul III, semestrul 1<br />
          Prelucrarea Semnalelor &middot; titular de curs prof. univ. dr. habil. Paul Irofti<br />
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
    </div>
  )
}
