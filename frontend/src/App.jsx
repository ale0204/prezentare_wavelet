import { useState, useEffect } from 'react'
import axios from 'axios'

// Views
import IntroView from './components/IntroView'
import FourierView from './components/FourierView'
import FiltersView from './components/FiltersView'
import ConvolutionView from './components/ConvolutionView'
import KernelsView from './components/KernelsView'
import KernelsEducationalView from './components/KernelsEducationalView'
import WaveletPlayground from './components/WaveletPlayground'
import WaveletBasisView from './components/WaveletBasisView'
import WaveletEducationView from './components/WaveletEducationView'
import MallatUnifiedView from './components/MallatUnifiedView'
import DenoiseView from './components/DenoiseView'
import CompareView from './components/CompareView'
import GuidedTour from './components/GuidedTour'

const API_BASE = '/api'

/* Inline SVG rather than glyphs: an icon has to inherit currentColor and keep
   its weight in both themes, which a dingbat character cannot promise. */
const NAV_ICON = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' }

function MenuIcon() {
  return <svg {...NAV_ICON}><path d="M4 7h16M4 12h16M4 17h16" /></svg>
}

function CloseIcon() {
  return <svg {...NAV_ICON}><path d="M5.5 5.5l13 13M18.5 5.5l-13 13" /></svg>
}

function ArrowIcon({ direction }) {
  return (
    <svg {...NAV_ICON}>
      <path d={direction === 'left' ? 'M19 12H5M11 6l-6 6 6 6' : 'M5 12h14M13 6l6 6-6 6'} />
    </svg>
  )
}

const SECTIONS = [
  { id: 'intro', label: 'Introducere' },
  { id: 'fourier', label: 'Fourier' },
  { id: 'filters', label: 'Filtre' },
  { id: 'convolution', label: 'Convoluție' },
  { id: 'kernels', label: 'Kernels' },
  { id: 'kernels-edu', label: 'Kernels pas cu pas' },
  { id: 'playground', label: 'Playground' },
  { id: 'wavelet-theory', label: 'Teorie Wavelets' },
  { id: 'wavelet-basis', label: 'Baze Wavelet' },
  { id: 'decompose', label: 'Decompoziție' },
  { id: 'denoise', label: 'Denoising' },
  { id: 'compare', label: 'DCT vs Wavelet' }
]

export default function App() {
  const [activeSection, setActiveSection] = useState('intro')
  const [sampleImages, setSampleImages] = useState([])
  const [selectedImage, setSelectedImage] = useState('peppers_512')
  // Auto-start guided mode if URL has a hash (slide ID)
  const [guidedMode, setGuidedMode] = useState(() => window.location.hash.length > 1)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  // Light (projector) theme is the default; persisted so a refresh keeps the choice
  const [projectorMode, setProjectorMode] = useState(() => localStorage.getItem('projectorMode') !== 'false')

  // High-contrast light theme for projection / screen-share
  useEffect(() => {
    if (projectorMode) {
      document.documentElement.dataset.projector = 'true'
    } else {
      delete document.documentElement.dataset.projector
    }
    localStorage.setItem('projectorMode', String(projectorMode))
  }, [projectorMode])

  useEffect(() => {
    // Load sample images on startup
    axios.get(`${API_BASE}/sample-images`)
      .then(res => setSampleImages(res.data.images))
      .catch(console.error)
  }, [])

  const handleNext = () => {
    const currentIndex = SECTIONS.findIndex(s => s.id === activeSection)
    if (currentIndex < SECTIONS.length - 1) {
      setActiveSection(SECTIONS[currentIndex + 1].id)
    }
  }

  const handlePrev = () => {
    const currentIndex = SECTIONS.findIndex(s => s.id === activeSection)
    if (currentIndex > 0) {
      setActiveSection(SECTIONS[currentIndex - 1].id)
    }
  }

  return (
    <div className={`app ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      {/* Sidebar Navigation */}
      <nav className="sidebar">
        <div className="sidebar-header">
          <h1>Wavelet</h1>
          <p>Transform</p>
        </div>

        <div className="nav-sections">
          {SECTIONS.map((section, idx) => (
            <button
              key={section.id}
              className={`nav-item ${activeSection === section.id ? 'active' : ''}`}
              onClick={() => setActiveSection(section.id)}
            >
              <span className="nav-label">{section.label}</span>
              <span className="nav-number">{idx + 1}</span>
            </button>
          ))}
        </div>

        <div className="sidebar-footer">
          <button
            className={`guided-toggle ${guidedMode ? 'active' : ''}`}
            onClick={() => setGuidedMode(!guidedMode)}
          >
            {guidedMode ? 'Ieși din prezentare' : 'Pornește prezentarea'}
          </button>
          <button
            className={`guided-toggle ${projectorMode ? 'active' : ''}`}
            onClick={() => setProjectorMode(!projectorMode)}
            title="Temă luminoasă, contrast ridicat, pentru proiector / screen-share"
          >
            {projectorMode ? 'Mod întunecat' : 'Mod proiector'}
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="main-content">
        {/* Navigation arrows with sidebar toggle */}
        <div className="nav-arrows">
          <button 
            className="sidebar-toggle"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            title={sidebarCollapsed ? 'Arată meniul' : 'Ascunde meniul'}
          >
            {sidebarCollapsed ? <MenuIcon /> : <CloseIcon />}
          </button>
          
          <div className="nav-arrows-center">
            <button 
              className="nav-arrow prev"
              onClick={handlePrev}
              disabled={SECTIONS.findIndex(s => s.id === activeSection) === 0}
              aria-label="Secțiunea anterioară"
            >
              <ArrowIcon direction="left" />
            </button>
            <span className="section-indicator">
              {SECTIONS.findIndex(s => s.id === activeSection) + 1} / {SECTIONS.length}
            </span>
            <button 
              className="nav-arrow next"
              onClick={handleNext}
              disabled={SECTIONS.findIndex(s => s.id === activeSection) === SECTIONS.length - 1}
              aria-label="Secțiunea următoare"
            >
              <ArrowIcon direction="right" />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="content-area">
          {activeSection === 'intro' && <IntroView onStartGuide={() => setGuidedMode(true)} />}
          {activeSection === 'fourier' && <FourierView api={API_BASE} />}
          {activeSection === 'filters' && <FiltersView api={API_BASE} />}
          {activeSection === 'convolution' && <ConvolutionView />}
          {activeSection === 'kernels' && <KernelsView api={API_BASE} imageId={selectedImage} sampleImages={sampleImages} onImageChange={setSelectedImage} />}
          {activeSection === 'kernels-edu' && <KernelsEducationalView api={API_BASE} />}
          {activeSection === 'playground' && <WaveletPlayground />}
          {activeSection === 'wavelet-theory' && <WaveletEducationView api={API_BASE} />}
          {activeSection === 'wavelet-basis' && <WaveletBasisView api={API_BASE} />}
          {activeSection === 'decompose' && <MallatUnifiedView api={API_BASE} />}
          {activeSection === 'denoise' && <DenoiseView api={API_BASE} imageId={selectedImage} sampleImages={sampleImages} onImageChange={setSelectedImage} />}
          {activeSection === 'compare' && <CompareView api={API_BASE} imageId={selectedImage} sampleImages={sampleImages} onImageChange={setSelectedImage} />}
        </div>
      </main>

      {/* Guided Tour Overlay */}
      {guidedMode && (
        <GuidedTour
          onClose={() => setGuidedMode(false)}
          onNavigate={(section) => {
            setActiveSection(section)
            setGuidedMode(false)
          }}
          selectedImage={selectedImage}
          sampleImages={sampleImages}
          projectorMode={projectorMode}
          onToggleProjector={() => setProjectorMode(p => !p)}
        />
      )}
    </div>
  )
}
