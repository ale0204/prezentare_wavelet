import { useState, useEffect, useCallback, useRef } from 'react'
import LaTeX, { LaTeXBlock } from './LaTeX'
import { useStageScale } from './shared/stage'
import Cite from './shared/Cite'
import { renderRich } from './shared/richText'
import { SOURCES } from './shared/sources'

// Import the actual view components for full embedding
import FourierView from './FourierView'
import FiltersView from './FiltersView'
import ConvolutionView from './ConvolutionView'
import KernelsView from './KernelsView'
import KernelsEducationalView from './KernelsEducationalView'
import WaveletPlayground from './WaveletPlayground'
import WaveletScanDemo from './WaveletScanDemo'
import WaveletEducationView from './WaveletEducationView'
import HeisenbergBoxesView from './HeisenbergBoxesView'
import ScalogramView from './ScalogramView'
import ComplexWaveletView from './ComplexWaveletView'
import DenoiseView from './DenoiseView'
import DenoiseTheoryView from './DenoiseTheoryView'
import CompareView from './CompareView'
import Mallat1DEduView from './Mallat1DEduView'
import MallatUnifiedView from './MallatUnifiedView'
import FilterBankView from './FilterBankView'
import PyramidDecompView from './PyramidDecompView'
import ReconstructionView from './ReconstructionView'
import JPEGPipelineView from './JPEGPipelineView'
import DCTvsWaveletView from './DCTvsWaveletView'
import ECGDemoView from './ECGDemoView'
import EEGBandsView from './EEGBandsView'
import SoundToImageView from './SoundToImageView'
import ShazamDemoView from './ShazamDemoView'

import '../styles/tour.css'

const API_BASE = '/api'

/* Academic context printed under the title slide. Fill these in for a graded
   delivery; an empty field renders nothing. */
const PRESENTATION_META = {
  professor: 'prof. univ. dr. habil. Paul Irofti',
  presenter: 'Neamțu Alexandra',
  course: 'Prelucrarea Semnalelor - CTI, anul III, semestrul 1',
  date: ''
}

// =====================================================
// SLIDE DEFINITIONS - Theory slides + Full embedded views
// =====================================================

const SLIDES = [
  // ===== INTRO =====
  {
    id: 'intro-title',
    section: 'intro',
    type: 'title',
    title: 'Wavelets în Procesarea Imaginilor',
    subtitle: 'De la Fourier la JPEG2000',
    hook: 'Filmul pe care îl vezi într-un cinema digital ajunge pe ecran comprimat cu wavelets: specificația DCI cere JPEG2000, nu JPEG. [cite:dci2024]',
    color: 'var(--primary)'
  },
  {
    id: 'intro-toc',
    section: 'intro',
    type: 'toc',
    title: 'Cuprins',
    subtitle: 'Ce vom învăța astăzi',
    chapters: [
      { title: 'Transformata Fourier', desc: 'Analiza spectrală a semnalelor', sectionId: 'fourier' },
      { title: 'Filtre Digitale', desc: 'Separarea frecvențelor', sectionId: 'filters' },
      { title: 'Convoluția', desc: 'Operația fundamentală', sectionId: 'convolution' },
      { title: 'Kernel-uri 2D', desc: 'Blur, sharpen, detectare de muchii', sectionId: 'kernels' },
      { title: 'Transformata Wavelet', desc: 'Teorie, familii și demo-uri', sectionId: 'wavelets' },
      { title: 'Algoritmul Mallat', desc: 'Din 1D în 2D și apoi multi-nivel, pas cu pas', sectionId: 'decompose' },
      { title: 'Aplicații Wavelets', desc: 'ECG, EEG și altele', sectionId: 'applications' },
      { title: 'Denoising', desc: 'Eliminarea zgomotului', sectionId: 'denoise' },
      { title: 'DCT vs Wavelet', desc: 'JPEG vs JPEG2000', sectionId: 'compare' }
    ],
    color: 'var(--primary)'
  },

  // ===== FOURIER =====
  {
    id: 'fourier-title',
    section: 'fourier',
    type: 'title',
    title: 'Transformata Fourier',
    subtitle: 'Analiza spectrală a semnalelor',
    color: 'var(--series-gold)'
  },
  {
    id: 'fourier-theory',
    section: 'fourier',
    type: 'fourier-theory-enhanced',
    title: 'Descompunere în Frecvențe',
    content: 'Shazam recunoaște o melodie din 10 secunde pentru că amprenta frecvențelor ei este unică [cite:wang2003] - exact amprenta pe care o calculează transformata Fourier. Dar Fourier ne spune CE frecvențe există, nu CÂND apar: Shazam rulează de fapt transformata pe ferestre scurte (STFT), nu pe toată piesa deodată - exact motivul pentru care avem nevoie și de wavelets.',
    points: [
      'Orice semnal = sumă (pentru semnale continue, integrală) de sinusoide [cite:lyons2011]',
      'Perfect pentru semnale staționare',
      'Limita: un mashup din două piese are același spectru - nu vedem unde se schimbă melodia'
    ],
    color: 'var(--series-gold)'
  },
  {
    id: 'fourier-demo',
    section: 'fourier',
    type: 'fourier-interactive',
    title: 'Demo Interactiv: Fourier',
    color: 'var(--series-gold)'
  },

  // ===== FILTERS =====
  {
    id: 'filters-title',
    section: 'filters',
    type: 'title',
    title: 'Filtre Digitale',
    subtitle: 'Separarea frecvențelor',
    color: 'var(--series-red)'
  },
  {
    id: 'filters-theory',
    section: 'filters',
    type: 'filters-theory-detailed',
    title: 'Filtre în Domeniul Frecvență',
    color: 'var(--series-red)'
  },
  {
    id: 'filters-demo',
    section: 'filters',
    type: 'filters-interactive',
    title: 'Demo Interactiv: Filtre',
    color: 'var(--series-red)'
  },
  {
    id: 'filters-wavelets',
    section: 'filters',
    type: 'filters-wavelet-connection',
    title: 'Conexiunea cu Wavelets',
    color: 'var(--series-red)'
  },

  // ===== CONVOLUTION =====
  {
    id: 'conv-title',
    section: 'convolution',
    type: 'theory',
    title: 'Convoluția',
    content: 'Kernel-ul alunecă peste semnal, calculând suma ponderată.',
    math: String.raw`(f * g)[n] = \sum_{k} f[k] \cdot g[n-k]`,
    mathLabel: 'Definiția convoluției 1D',
    points: [
      'Baza filtrelor și transformărilor: filtrul văzut ca spectru pe slide-ul anterior este, în timp, exact acest kernel care alunecă',
      'Folosită în rețele neuronale (CNN)',
      'Teorema convoluției: $f * g \\;\\longleftrightarrow\\; F \\cdot G$ - convoluția în timp este înmulțire în frecvență [cite:lyons2011]',
      'De aceea complexitatea scade de la $O(n^2)$ la $O(n \\log n)$ cu FFT: transformi, înmulțești punct cu punct, transformi înapoi'
    ],
    color: 'var(--series-purple)'
  },
  {
    id: 'conv-demo',
    section: 'convolution',
    type: 'embed',
    embedType: 'convolution',
    title: 'Demo: Convoluție 1D',
    color: 'var(--series-purple)'
  },
  {
    id: 'conv-2d',
    section: 'convolution',
    type: 'theory-visual',
    title: 'Convoluția în Imagini (2D)',
    content: 'Convoluția 2D extinde principiul 1D la imagini: kernelul alunecă peste imagine, iar fiecare pixel de ieșire este suma ponderată a vecinilor săi.',
    math: String.raw`(I * K)[x,y] = \sum_{i,j} I[x-i,\, y-j] \cdot K[i,j]`,
    mathLabel: 'Convoluție 2D: semnele minus rotesc kernelul cu 180 de grade',
    note: 'Bibliotecile de procesare de imagini - și demo-urile care urmează - calculează de fapt corelația, cu I[x+i, y+j], adică fără rotația kernelului. Pentru kernelurile simetrice (blur, Gaussian, Laplacian) rezultatul este identic; diferența apare la kernelurile asimetrice, de exemplu Sobel, unde se inversează semnul gradientului.',
    kernels: [
      {
        name: 'Blur Gaussian',
        matrix: String.raw`\frac{1}{16}\begin{bmatrix} 1 & 2 & 1 \\ 2 & 4 & 2 \\ 1 & 2 & 1 \end{bmatrix}`,
        desc: 'Medierea vecinilor, cu pondere mai mare pe centru: netezire'
      },
      {
        name: 'Sharpen',
        matrix: String.raw`\begin{bmatrix} 0 & -1 & 0 \\ -1 & 5 & -1 \\ 0 & -1 & 0 \end{bmatrix}`,
        desc: 'Amplifică diferența față de vecini: contur mai clar'
      },
      {
        name: 'Sobel X (asimetric)',
        matrix: String.raw`\begin{bmatrix} -1 & 0 & 1 \\ -2 & 0 & 2 \\ -1 & 0 & 1 \end{bmatrix}`,
        desc: 'Gradient pe orizontală: detectează muchiile verticale'
      }
    ],
    color: 'var(--series-purple)'
  },
  {
    id: 'sound-to-image',
    section: 'convolution',
    type: 'embed',
    embedType: 'sound-to-image',
    title: 'Fourier 2D: de la semnal 1D la imagine',
    color: 'var(--series-purple)'
  },

  // ===== KERNELS =====
  {
    id: 'kernels-title',
    section: 'kernels',
    type: 'title',
    title: 'Kernel-uri 2D',
    subtitle: 'De la formulă la pixel: blur, sharpen, detectare de muchii',
    color: 'var(--series-orange)'
  },
  {
    id: 'kernels-edu',
    section: 'kernels',
    type: 'embed',
    embedType: 'kernels-edu',
    title: 'Demo Educațional: Kernel pas cu pas',
    color: 'var(--series-orange)'
  },
  {
    id: 'kernels-demo',
    section: 'kernels',
    type: 'embed',
    embedType: 'kernels',
    title: 'Demo: Kernel-uri pe Imagini Reale',
    color: 'var(--series-orange)'
  },

  // ===== WAVELETS PLAYGROUND =====
  {
    id: 'wavelet-title',
    section: 'wavelets',
    type: 'title',
    title: 'Transformata Wavelet',
    subtitle: 'Localizare timp-frecvență',
    color: 'var(--primary)'
  },
  {
    id: 'wavelet-theory',
    section: 'wavelets',
    type: 'theory',
    title: 'De ce Wavelets?',
    content: 'Wavelets oferă ceea ce Fourier nu poate: localizare simultană. b = momentul de timp, a = scala, invers proporțională cu frecvența (a mare = wavelet întins = frecvențe joase).',
    math: String.raw`\psi_{a,b}(t) = \frac{1}{\sqrt{|a|}} \psi\left(\frac{t-b}{a}\right)`,
    mathLabel: 'Wavelet cu scalare a, translație b',
    points: [
      'Știm CE frecvențe și CÂND apar',
      'Seismologie: unda P sosește la t=12s, unda S la t=38s - Fourier nu poate spune asta',
      'Ideale pentru semnale nestaționare (muzică, ECG, cutremure)',
      'Analiza multi-rezoluție',
      'Forma wavelet-ului contează, nu doar existența lui: numărul de oscilații îi dă momentele nule, adică pe ce fel de porțiuni de semnal răspunde cu zero - reluăm la familii și la compresie'
    ],
    color: 'var(--primary)'
  },
  {
    id: 'wavelet-families',
    section: 'wavelets',
    type: 'embed',
    embedType: 'wavelet-theory',
    title: 'Familii Wavelet',
    subtitle: 'CWT + DWT + Teorie',
    color: 'var(--primary)'
  },
  {
    id: 'wavelet-demo',
    section: 'wavelets',
    type: 'embed',
    embedType: 'playground',
    title: 'Demo: Wavelet Playground',
    color: 'var(--primary)'
  },
  {
    id: 'wavelet-scan',
    section: 'wavelets',
    type: 'embed',
    embedType: 'wavelet-scan',
    title: 'Demo: Scanarea Semnalului',
    color: 'var(--primary)'
  },
  {
    id: 'heisenberg-boxes',
    section: 'wavelets',
    type: 'embed',
    embedType: 'heisenberg',
    title: 'Compromisul Timp-Frecvență',
    subtitle: 'Vizualizare Heisenberg',
    color: 'var(--primary)'
  },
  {
    id: 'scalogram',
    section: 'wavelets',
    type: 'embed',
    embedType: 'scalogram',
    title: 'Scalograma (CWT)',
    subtitle: 'Vizualizare Timp-Scală',
    color: 'var(--primary)'
  },
  {
    id: 'complex-wavelet',
    section: 'wavelets',
    type: 'embed',
    embedType: 'complex-wavelet',
    title: 'Wavelet Complex',
    subtitle: 'Morlet: magnitudine și fază',
    color: 'var(--primary)'
  },

  // ===== DECOMPOSITION - ALGORITMUL MALLAT =====
  {
    id: 'decomp-title',
    section: 'decompose',
    type: 'title',
    title: 'Algoritmul Mallat',
    subtitle: 'Motorul din spatele JPEG2000 și al denoising-ului care urmează',
    color: 'var(--series-gold)'
  },
  {
    id: 'decomp-intro',
    section: 'decompose',
    type: 'theory',
    title: 'Coeficienții și Funcțiile de Bază',
    content: 'Semnalul se proiectează pe funcțiile de scalare $\\phi$ și wavelet $\\psi$. [cite:mallat1989,mallat2008]',
    math: String.raw`\begin{aligned} c_{j_0,k} &= \int x(t) \, \phi_{j_0,k}(t) \, dt \quad &\text{(coef. aproximare)} \\[0.5em] d_{j,k} &= \int x(t) \, \psi_{j,k}(t) \, dt \quad &\text{(coef. detaliu)} \\[0.9em] \phi_{j,k}(t) &= 2^{-j/2} \, \phi(2^{-j} t - k) \quad &\text{(funcția de scalare)} \\[0.5em] \psi_{j,k}(t) &= 2^{-j/2} \, \psi(2^{-j} t - k) \quad &\text{(wavelet)} \end{aligned}`,
    mathLabel: 'j = nivelul de descompunere, k = translația. j crește, scara devine mai grosieră, iar factorul $2^{-j/2}$ păstrează energia',
    mathExtra: String.raw`c_{j+1,k} = \sum_n h_0[n-2k] \, c_{j,n} \qquad d_{j+1,k} = \sum_n h_1[n-2k] \, c_{j,n}`,
    mathExtraLabel: 'Algoritmul lui Mallat: recursia care înlocuiește integralele',
    note: 'Integralele de mai sus nu se calculează niciodată: din coeficienții unui nivel, o filtrare cu $h_0$ și $h_1$ plus păstrarea unui eșantion din doi dă exact nivelul următor. [cite:mallat1989]',
    color: 'var(--series-gold)'
  },
  {
    id: 'decomp-theory',
    section: 'decompose',
    type: 'theory-visual',
    title: 'Cele 4 Sub-benzi',
    content: 'Ca în Google Maps: la zoom mic vezi structura globală (LL - continente, orașe), la zoom mare apar detaliile fine (LH/HL/HH - străzi, clădiri). Pasul se aplică recursiv pe LL.',
    math: String.raw`\begin{bmatrix} LL & HL \\ LH & HH \end{bmatrix}`,
    mathLabel: 'Subbenzile rezultate după un nivel de descompunere',
    note: '$L_x, H_x, L_y, H_y$ sunt exact filtrele $h_0$ și $h_1$ de pe slide-ul anterior, aplicate o dată pe rânduri și o dată pe coloane. High-pass pe coloane dă detalii ORIZONTALE fiindcă răspunde la variația pe verticală, iar o muchie orizontală e exact locul unde intensitatea variază când cobori. Convenția LH/HL diferă între surse.',
    dwt2d: {
      title: 'DWT 2D - Descompunere pe Rânduri și Coloane',
      description: 'Aplică filtre low-pass (L) și high-pass (H) în ambele direcții:',
      coefficients: [
        { name: 'LL', formula: String.raw`LL = (L_x * L_y)[I]`, desc: 'Aproximare' },
        { name: 'LH', formula: String.raw`LH = (L_x * H_y)[I]`, desc: 'Detalii orizontale' },
        { name: 'HL', formula: String.raw`HL = (H_x * L_y)[I]`, desc: 'Detalii verticale' },
        { name: 'HH', formula: String.raw`HH = (H_x * H_y)[I]`, desc: 'Detalii diagonale' }
      ],
      subsampling: String.raw`\text{Decimare (}\downarrow 2\text{): păstrăm un eșantion din doi} \Rightarrow \text{fiecare subbandă are } \frac{N}{2} \times \frac{N}{2}`
    },
    color: 'var(--series-gold)'
  },
  {
    id: 'mallat-1d-edu',
    section: 'decompose',
    type: 'embed',
    embedType: 'mallat-1d',
    title: 'Demo: Mallat 1D (linie)',
    gloss: 'Notație: $c = cA = L = A$ (aproximare), $d = cD = H = D$ (detaliu) - aceeași împărțire sub nume diferite.',
    color: 'var(--series-gold)'
  },
  {
    id: 'decomp-demo',
    section: 'decompose',
    type: 'embed',
    embedType: 'mallat-unified',
    title: 'Demo: Descompunere Mallat 2D',
    gloss: 'Notație: $c = cA = L = A$ (aproximare), $d = cD = H = D$ (detaliu) - aceeași împărțire sub nume diferite.',
    color: 'var(--series-gold)'
  },
  {
    id: 'filter-bank',
    section: 'decompose',
    type: 'embed',
    embedType: 'filter-bank',
    title: 'Banca de Filtre Wavelet',
    gloss: 'Notație: $c = cA = L = A$ (aproximare), $d = cD = H = D$ (detaliu) - aceeași împărțire sub nume diferite.',
    color: 'var(--series-gold)'
  },
  {
    id: 'pyramid-decomp',
    section: 'decompose',
    type: 'embed',
    embedType: 'pyramid-decomp',
    title: 'Descompunere Piramidală',
    subtitle: 'Multi-nivel, recursiv pe aproximare',
    gloss: 'Notație: $c = cA = L = A$ (aproximare), $d = cD = H = D$ (detaliu) - aceeași împărțire sub nume diferite.',
    color: 'var(--series-gold)'
  },
  {
    id: 'reconstruction',
    section: 'decompose',
    type: 'embed',
    embedType: 'reconstruction',
    title: 'Reconstrucție Perfectă',
    gloss: 'Notație: $c = cA = L = A$ (aproximare), $d = cD = H = D$ (detaliu) - aceeași împărțire sub nume diferite.',
    color: 'var(--series-gold)'
  },

  // ===== WAVELET APPLICATIONS =====
  {
    id: 'applications-title',
    section: 'applications',
    type: 'title',
    title: 'Aplicații Wavelets',
    subtitle: 'Semnale biomedicale și nu numai',
    color: 'var(--series-pink)'
  },
  {
    id: 'applications-ecg',
    section: 'applications',
    type: 'theory',
    title: 'ECG - Electrocardiograme',
    content: 'Ceasul care anunță fibrilația atrială se uită de fapt la neregularitatea intervalelor dintre bătăi, măsurate optic (PPG), și poate înregistra un ECG cu o singură derivație. [cite:perez2019] Ca să citești un asemenea semnal îți trebuie uneltele de aici: filtrare de zgomot și detecția bătăilor. Denoising-ul din secțiunea următoare este exact primul dintre acești doi pași, făcut pe wavelets.',
    points: [
      'Detectare: complexul QRS, aritmii, fibrilații',
      'Eliminare: zgomot muscular, interferență electrică (filtrele de bandă)',
      'Monitorizare Holter: sute de mii de bătăi procesate automat în 24-48h',
      'Wavelet Morlet/Daubechies pentru detecția QRS [cite:martinez2004]'
    ],
    color: 'var(--series-pink)'
  },
  {
    id: 'applications-ecg-demo',
    section: 'applications',
    type: 'embed',
    embedType: 'ecg-demo',
    title: 'Demo: ECG cu zgomot muscular, denoising wavelet, detectarea bătăilor',
    color: 'var(--series-pink)'
  },
  {
    id: 'applications-eeg',
    section: 'applications',
    type: 'theory',
    title: 'EEG - Activitate Cerebrală',
    content: 'Separarea benzilor de frecvență ale creierului, așa cum o face polisomnografia, cu electrozi pe scalp. Ceasurile aproximează somnul din mișcare și puls (PPG) - EEG-ul adevărat rămâne în laborator.',
    math: String.raw`\delta < \theta < \alpha < \beta < \gamma`,
    mathLabel: 'Benzile EEG (0.5-80 Hz)',
    points: [
      'Delta (0.5-4 Hz): somn profund',
      'Theta (4-8 Hz): relaxare adâncă, meditație',
      'Alpha (8-13 Hz): relaxare, ochii închiși',
      'Beta (13-30 Hz): concentrare activă (examen!)',
      'Gamma (30-80 Hz): procesare cognitivă complexă',
      'Aplicații: epilepsie, brain-computer interface, medicina somnului'
    ],
    color: 'var(--series-pink)'
  },
  {
    id: 'applications-eeg-demo',
    section: 'applications',
    type: 'embed',
    embedType: 'eeg-bands',
    title: 'Demo: extragerea benzilor EEG cu filtre band-pass',
    color: 'var(--series-pink)'
  },
  {
    id: 'applications-other',
    section: 'applications',
    type: 'domain-cards',
    title: 'Alte Aplicații',
    content: 'Wavelets sunt omniprezente în procesarea semnalelor.',
    domains: [
      { icon: 'audio', name: 'Audio', desc: 'Compresie, anularea zgomotului în căști, amprentarea spectrală din Shazam' },
      { icon: 'image', name: 'Imagini', desc: 'JPEG2000, restaurare, super-rezoluție' },
      { icon: 'lock', name: 'Cybersecurity', desc: 'Steganografie și watermarking: mesaje ascunse în coeficienții HH, invizibile ochiului' },
      { icon: 'finance', name: 'Finanțe', desc: 'Analiza volatilității pe scări de timp, detectarea trendurilor' },
      { icon: 'seismic', name: 'Seismologie', desc: 'Detectarea undelor P și S ale cutremurelor' },
      { icon: 'telescope', name: 'Astronomie', desc: 'Analiza semnalelor cosmice' }
    ],
    color: 'var(--series-pink)'
  },
  {
    id: 'applications-shazam',
    section: 'applications',
    type: 'embed',
    embedType: 'shazam-demo',
    title: 'Demo: Shazam - amprenta spectrală a unei melodii',
    color: 'var(--series-pink)'
  },

  // ===== DENOISING =====
  {
    id: 'denoise-title',
    section: 'denoise',
    type: 'title',
    title: 'Denoising cu Wavelets',
    subtitle: 'Eliminarea zgomotului fără să tocim detaliile',
    color: 'var(--primary)'
  },
  {
    id: 'denoise-theory',
    section: 'denoise',
    type: 'embed',
    embedType: 'denoise-theory',
    title: 'Teorie: Thresholding',
    color: 'var(--primary)'
  },
  {
    id: 'denoise-demo',
    section: 'denoise',
    type: 'embed',
    embedType: 'denoise',
    title: 'Demo: Denoising Practic',
    color: 'var(--primary)'
  },

  // ===== COMPARISON =====
  {
    id: 'compare-title',
    section: 'compare',
    type: 'title',
    title: 'DCT vs Wavelet',
    subtitle: 'JPEG vs JPEG2000',
    color: 'var(--series-gold)'
  },
  {
    id: 'jpeg-pipeline',
    section: 'compare',
    type: 'embed',
    embedType: 'jpeg-pipeline',
    title: 'Pipeline-ul JPEG (DCT)',
    color: 'var(--series-orange)'
  },
  {
    id: 'dct-vs-wavelet',
    section: 'compare',
    type: 'embed',
    embedType: 'dct-vs-wavelet',
    title: 'DCT vs Wavelet: Comparație',
    color: 'var(--primary)'
  },
  {
    id: 'compare-theory',
    section: 'compare',
    type: 'comparison',
    title: 'Comparație Directă',
    dct: [
      'Blocuri 8×8 transformate independent',
      'Artefacte de bloc: grila devine vizibilă la compresie mare',
      'Progresiv doar dacă fișierul e codat explicit în modul progresiv din T.81; baseline-ul se decodează secvențial [cite:itut81]',
      'Mai rapid, mai simplu, decodabil peste tot'
    ],
    wavelet: [
      'Transformare globală, pe toată imaginea',
      'Fără grilă de blocuri; artefactul tipic e ringing în jurul muchiilor [cite:taubmanmarcellin2002]',
      'Scalabilitate progresivă prin construcție: rezoluție și calitate din același flux [cite:taubmanmarcellin2002]',
      'La același număr de biți pe pixel păstrează mai multă fidelitate - demo-ul următor compară exact așa, la bitrate egal, nu la aceeași etichetă de "calitate"'
    ],
    color: 'var(--series-gold)'
  },
  {
    id: 'compare-demo',
    section: 'compare',
    type: 'embed',
    embedType: 'compare',
    title: 'DCT (JPEG) vs Wavelet (JPEG2000)',
    subtitle: 'Comparate la același bitrate',
    color: 'var(--series-gold)'
  },

  // ===== FINAL =====
  {
    id: 'synthesis',
    section: 'final',
    type: 'synthesis',
    title: 'Un singur mecanism, cinci aplicații',
    content: 'Tot ce am văzut astăzi este același gest, repetat: descompune semnalul pe scări, taie ce nu contează, reconstruiește. Se schimbă doar ce înseamnă "nu contează".',
    threads: [
      { step: 'Descompune', desc: 'aceeași bancă de filtre, aplicată recursiv pe aproximare (algoritmul lui Mallat)' },
      { step: 'Taie', desc: 'sub un prag: zgomot la denoising, biți la compresie, benzi la analiză' },
      { step: 'Reconstruiește', desc: 'filtrele de sinteză readuc semnalul, exact sau controlat de aproape' }
    ],
    applications: [
      { name: 'ECG', desc: 'tai zgomotul muscular, păstrezi complexul QRS' },
      { name: 'EEG', desc: 'separi benzile pe scări de frecvență' },
      { name: 'Shazam', desc: 'păstrezi doar vârfurile spectrale, restul e redundanță' },
      { name: 'Denoising', desc: 'tai coeficienții mici, semnalul rămâne în cei mari' },
      { name: 'JPEG2000', desc: 'tai biții pe care ochiul nu-i vede, la același bitrate' }
    ],
    closing: 'De aceea localizarea simultană în timp și frecvență nu e o curiozitate matematică: e chiar motivul pentru care toate cele cinci funcționează.',
    color: 'var(--primary)'
  },
  {
    id: 'bibliography',
    section: 'final',
    type: 'references',
    title: 'Bibliografie',
    color: 'var(--primary)'
  },
  {
    id: 'final',
    section: 'final',
    type: 'final',
    title: 'Mulțumesc!',
    subtitle: 'Întrebări?',
    color: 'var(--primary)'
  }
]

/* Short Romanian name per section, for the navigation rail. The rail used to
   show the bare index and expose the internal English id on hover, which is
   the first thing on screen for the whole talk. */
const SECTION_NAMES = {
  intro: 'Introducere',
  fourier: 'Transformata Fourier',
  filters: 'Filtre digitale',
  convolution: 'Convoluția',
  kernels: 'Kernel-uri 2D',
  wavelets: 'Transformata wavelet',
  decompose: 'Algoritmul lui Mallat',
  applications: 'Aplicații',
  denoise: 'Denoising',
  compare: 'DCT față de wavelet',
  final: 'Sinteză și bibliografie'
}

// Get unique sections for progress bar
const SECTIONS = (() => {
  const seen = new Set()
  return SLIDES.filter(s => {
    if (seen.has(s.section)) return false
    seen.add(s.section)
    return true
  }).map(s => ({
    id: s.section,
    icon: s.icon,
    color: s.color,
    startIdx: SLIDES.findIndex(sl => sl.section === s.section),
    count: SLIDES.filter(sl => sl.section === s.section).length
  }))
})()

// =====================================================
// EMBEDDED VIEW RENDERER - Full views like individual pages
// =====================================================

function EmbeddedView({ embedType, api, imageId, sampleImages, onImageChange }) {
  const viewProps = { 
    api, 
    imageId, 
    sampleImages, 
    onImageChange 
  }

  switch (embedType) {
    case 'fourier':
      return <FourierView api={api} compact={true} />
    case 'filters':
      return <FiltersView api={api} compact={true} />
    case 'convolution':
      return <ConvolutionView compact={true} />
    case 'kernels':
      return <KernelsView {...viewProps} compact={true} />
    case 'kernels-edu':
      return <KernelsEducationalView api={api} compact={true} />
    case 'playground':
      return <WaveletPlayground compact={true} />
    case 'wavelet-scan':
      return <WaveletScanDemo compact={true} />
    case 'heisenberg':
      return <HeisenbergBoxesView compact={true} />
    case 'scalogram':
      return <ScalogramView compact={true} />
    case 'complex-wavelet':
      return <ComplexWaveletView compact={true} />
    case 'wavelet-theory':
      return <WaveletEducationView api={api} compact={true} />
    case 'mallat-1d':
      return <Mallat1DEduView compact={true} />
    case 'mallat-unified':
      return <MallatUnifiedView compact={true} api={api} />
    case 'filter-bank':
      return <FilterBankView compact={true} />
    case 'pyramid-decomp':
      return <PyramidDecompView compact={true} />
    case 'reconstruction':
      return <ReconstructionView compact={true} />
    case 'denoise-theory':
      return <DenoiseTheoryView compact={true} />
    case 'denoise':
      return <DenoiseView {...viewProps} compact={true} />
    case 'compare':
      return <CompareView {...viewProps} compact={true} />
    case 'ecg-demo':
      return <ECGDemoView compact={true} api={api} />
    case 'eeg-bands':
      return <EEGBandsView compact={true} api={api} />
    case 'sound-to-image':
      return <SoundToImageView compact={true} api={api} />
    case 'shazam-demo':
      return <ShazamDemoView compact={true} api={api} />
    case 'jpeg-pipeline':
      return <JPEGPipelineView compact={true} api={api} />
    case 'dct-vs-wavelet':
      return <DCTvsWaveletView compact={true} />
    default:
      return <div className="demo-placeholder">View: {embedType}</div>
  }
}

// =====================================================
// MAIN TOUR COMPONENT
// =====================================================

/* Sidebar tool icons. Inline SVG rather than glyphs: they inherit currentColor,
   so they stay legible in both themes and scale with the stage. */
const ICON = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }

function SunIcon() {
  return (
    <svg {...ICON} aria-hidden="true">
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2v2.6M12 19.4V22M4.2 4.2l1.9 1.9M17.9 17.9l1.9 1.9M2 12h2.6M19.4 12H22M4.2 19.8l1.9-1.9M17.9 6.1l1.9-1.9" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg {...ICON} aria-hidden="true">
      <path d="M20.5 14.3A8.6 8.6 0 0 1 9.7 3.5a8.6 8.6 0 1 0 10.8 10.8z" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg {...ICON} aria-hidden="true">
      <path d="M5.5 5.5l13 13M18.5 5.5l-13 13" />
    </svg>
  )
}

/* One pictogram per application domain, so six equal rows of text read as six
   different fields at a glance. Same stroke style as the sidebar icons. */
const DOMAIN_ICON = {
  audio: 'M3 12h2.5l2-6 3 13 3-9 2 4H21',
  image: 'M4 5h16v14H4zM4 15l4.5-4.5 3.5 3.5 3-3L20 15M9 9.2h.01',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M5.5 11h13v9h-13zM12 14.5v3',
  finance: 'M4 19h16M5 15l4.5-5 3.5 3.5L19 6M15 6h4v4',
  seismic: 'M3 12h3l1.5-5 2.5 10 2-7 1.5 4 1.5-2H21M3 19h18M3 5h18',
  telescope: 'M4 15.5 15 4l4 2.5-9.5 11zM8.5 12.5 12 14.5M11 19.5 8 15M11 19.5l4-3.5M11 19.5v.5'
}

function DomainIcon({ name }) {
  return (
    <svg {...ICON} width={30} height={30} aria-hidden="true">
      <path d={DOMAIN_ICON[name] || DOMAIN_ICON.image} />
    </svg>
  )
}

/* Navigation chevrons. SVG rather than arrow glyphs: they inherit currentColor
   and keep their weight at any stage scale. */
function ChevronIcon({ direction }) {
  return (
    <svg {...ICON} width={18} height={18} aria-hidden="true">
      <path d={direction === 'left' ? 'M14.5 5.5 8 12l6.5 6.5' : 'M9.5 5.5 16 12l-6.5 6.5'} />
    </svg>
  )
}

export default function GuidedTour({ onClose, onNavigate, selectedImage = 'peppers_512', sampleImages = [], projectorMode = false, onToggleProjector }) {
  // Initialize from URL hash if present
  const getInitialSlide = () => {
    const hash = window.location.hash.slice(1) // Remove '#'
    if (hash) {
      const idx = SLIDES.findIndex(s => s.id === hash)
      if (idx >= 0) return idx
    }
    return 0
  }
  
  const [currentIdx, setCurrentIdx] = useState(getInitialSlide)
  const [localImage, setLocalImage] = useState(selectedImage)
  const containerRef = useRef(null)
  const stageScale = useStageScale()

  const slide = SLIDES[currentIdx]
  const isFirst = currentIdx === 0
  const isLast = currentIdx === SLIDES.length - 1

  // Find current section index
  const sectionIdx = SECTIONS.findIndex(s => s.id === slide.section)

  // Update URL hash when slide changes
  useEffect(() => {
    window.location.hash = slide.id
  }, [slide.id])

  // Listen for hash changes (browser back/forward)
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1)
      const idx = SLIDES.findIndex(s => s.id === hash)
      if (idx >= 0 && idx !== currentIdx) {
        setCurrentIdx(idx)
      }
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [currentIdx])

  const handleNext = useCallback(() => {
    if (!isLast) setCurrentIdx(currentIdx + 1)
  }, [currentIdx, isLast])

  const handlePrev = useCallback(() => {
    if (!isFirst) setCurrentIdx(currentIdx - 1)
  }, [currentIdx, isFirst])

  const handleSectionClick = (sectionId) => {
    const idx = SLIDES.findIndex(s => s.section === sectionId)
    if (idx >= 0) setCurrentIdx(idx)
  }

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e) => {
      // Don't capture keys if user is typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'A') {
        return
      }
      
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault()
        handleNext()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        handlePrev()
      } else if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handleNext, handlePrev, onClose])

  // Auto-focus for keyboard
  useEffect(() => {
    containerRef.current?.focus()
  }, [])

  return (
    <div className="tour-fullscreen" ref={containerRef} tabIndex={0}>
      {/* Fixed 16:9 design surface, scaled to fill the window (see stage.js) */}
      <div className="tour-stage" style={{ '--stage-scale': stageScale }}>
      {/* Progress bar - sections (vertical left sidebar), theme + close at its foot */}
      <div className="tour-progress">
        {SECTIONS.map((sec, idx) => (
          <button
            key={sec.id}
            className={`tour-section-btn ${idx === sectionIdx ? 'active' : ''} ${idx < sectionIdx ? 'completed' : ''}`}
            onClick={() => handleSectionClick(sec.id)}
            title={SECTION_NAMES[sec.id] || sec.id}
            aria-label={SECTION_NAMES[sec.id] || sec.id}
            style={{ '--sec-color': sec.color }}
          >
            <span className="sec-icon">{idx + 1}</span>
            {idx === sectionIdx && (
              <div className="sec-dots">
                {Array(sec.count).fill(0).map((_, i) => (
                  <span 
                    key={i} 
                    className={`sec-dot ${currentIdx === sec.startIdx + i ? 'active' : ''}`}
                  />
                ))}
              </div>
            )}
          </button>
        ))}

        <div className="tour-tools">
          {onToggleProjector && (
            <button
              className="tour-projector-btn"
              onClick={onToggleProjector}
              title={projectorMode ? 'Temă întunecată' : 'Temă luminoasă, contrast ridicat, pentru proiector'}
            >
              {projectorMode ? <MoonIcon /> : <SunIcon />}
            </button>
          )}
          <button className="tour-close-btn" onClick={onClose} aria-label="Închide prezentarea">
            <CloseIcon />
          </button>
        </div>
      </div>

      {/* Main content area (slide + nav) */}
      <div className="tour-main">
        {/* Main slide content */}
        <div className="tour-slide" style={{ '--slide-color': slide.color }}>
        
        {/* TITLE SLIDE */}
        {slide.type === 'title' && (
          <div className="slide-title">
            <h1>{slide.title}</h1>
            <h2>{slide.subtitle}</h2>
            {slide.hook && <p className="slide-hook">{renderRich(slide.hook)}</p>}
            {slide.id === 'intro-title' && (
              <p className="slide-meta">
                {PRESENTATION_META.professor && (
                  <>Titular de curs: {PRESENTATION_META.professor}<br /></>
                )}
                {PRESENTATION_META.presenter && (
                  <>Prezintă: {PRESENTATION_META.presenter}<br /></>
                )}
                {[PRESENTATION_META.course, PRESENTATION_META.date].filter(Boolean).join(' - ')}
              </p>
            )}
          </div>
        )}

        {/* TABLE OF CONTENTS SLIDE */}
        {slide.type === 'toc' && (
          <div className="slide-toc">
            <div className="toc-header">
              <h1>{slide.title}</h1>
              <h2>{slide.subtitle}</h2>
            </div>
            <div className="toc-grid">
              {slide.chapters.map((ch, i) => (
                <div 
                  key={i} 
                  className="toc-item clickable"
                  onClick={() => ch.sectionId && handleSectionClick(ch.sectionId)}
                >
                  {/* Numbered from SECTIONS, so a card and the sidebar marker it
                      jumps to always carry the same number. */}
                  <span className="toc-item-icon">
                    {SECTIONS.findIndex(s => s.id === ch.sectionId) + 1}
                  </span>
                  <div className="toc-item-text">
                    <span className="toc-item-title">{ch.title}</span>
                    <span className="toc-item-desc">{ch.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* THEORY SLIDE */}
        {slide.type === 'theory' && (
          <div className="slide-theory">
            <div className="slide-header">
              <h1>{slide.title}</h1>
            </div>
            {slide.content && <p className="slide-content">{renderRich(slide.content)}</p>}
            {slide.math && (
              <div className="slide-math">
                <div className="math-formula"><LaTeXBlock math={slide.math} /></div>
                <span className="math-label">{renderRich(slide.mathLabel)}</span>
              </div>
            )}
            {slide.mathExtra && (
              <div className="slide-math highlight">
                <div className="math-formula"><LaTeXBlock math={slide.mathExtra} /></div>
                {slide.mathExtraLabel && <span className="math-label">{slide.mathExtraLabel}</span>}
              </div>
            )}
            {slide.note && <p className="slide-note">{renderRich(slide.note)}</p>}
            {slide.points && (
              <ul className="slide-points">
                {slide.points.map((p, i) => <li key={i}>{renderRich(p)}</li>)}
              </ul>
            )}
          </div>
        )}

        {/* FOURIER THEORY ENHANCED SLIDE - Multiple formulas */}
        {slide.type === 'fourier-theory-enhanced' && (
          <div className="slide-fourier-theory-enhanced">
            <div className="slide-header">
              <h1>{slide.title}</h1>
            </div>
            {slide.content && <p className="slide-content">{renderRich(slide.content)}</p>}
            
            {/* Main Fourier formulas grid */}
            <div className="fourier-formulas-grid">
              <div className="formula-card">
                <h4>Transformata Fourier</h4>
                <div className="math-formula">
                  <LaTeXBlock math={String.raw`F(\omega) = \int_{-\infty}^{\infty} f(t) \cdot e^{-i\omega t} \, dt`} />
                </div>
                <p className="formula-desc">
                  Descompune semnalul în componente de frecvență.
                  Pulsația și frecvența sunt aceeași mărime în două unități:{' '}
                  <LaTeX math={String.raw`\omega = 2\pi f`} /> (rad/s față de Hz).
                </p>
              </div>
              
              <div className="formula-card">
                <h4>Transformata Inversă</h4>
                <div className="math-formula">
                  <LaTeXBlock math={String.raw`f(t) = \frac{1}{2\pi} \int_{-\infty}^{\infty} F(\omega) \cdot e^{i\omega t} \, d\omega`} />
                </div>
                <p className="formula-desc">Reconstituie semnalul din spectrul său</p>
              </div>
              
              <div className="formula-card euler">
                <h4>Formula lui Euler</h4>
                <div className="math-formula">
                  <LaTeXBlock math={String.raw`e^{i\theta} = \cos\theta + i\sin\theta`} />
                </div>
                <p className="formula-desc">Conectează exponențiala complexă cu sinusoide</p>
              </div>
              
              <div className="formula-card parseval">
                <h4>Teorema lui Parseval</h4>
                <div className="math-formula">
                  <LaTeXBlock math={String.raw`\int_{-\infty}^{\infty} |f(t)|^2 dt = \frac{1}{2\pi} \int_{-\infty}^{\infty} |F(\omega)|^2 d\omega`} />
                </div>
                <p className="formula-desc">
                  Energia se conservă între domenii - o refolosim la descompunerea
                  wavelet, ca să arătăm că nici DWT nu pierde energie.
                </p>
              </div>
            </div>
            
            {slide.points && (
              <ul className="slide-points compact">
                {slide.points.map((p, i) => <li key={i}>{renderRich(p)}</li>)}
              </ul>
            )}
          </div>
        )}

        {/* THEORY-VISUAL SLIDE (e.g. 2D convolution with kernel matrices) */}
        {slide.type === 'theory-visual' && (
          <div className="slide-theory-visual">
            <div className="slide-header compact">
              <h1>{slide.title}</h1>
            </div>
            {slide.content && <p className="slide-content compact">{renderRich(slide.content)}</p>}
            {slide.math && (
              <div className="slide-math compact">
                <div className="math-formula"><LaTeXBlock math={slide.math} /></div>
                {slide.mathLabel && <span className="math-label">{slide.mathLabel}</span>}
              </div>
            )}
            {slide.note && <p className="slide-note">{renderRich(slide.note)}</p>}
            {slide.kernels && (
              <div className="kernel-matrix-grid">
                {slide.kernels.map((k, i) => (
                  <div key={i} className="kernel-card">
                    <h4>{k.name}</h4>
                    <div className="kernel-matrix">
                      <LaTeXBlock math={k.matrix} />
                    </div>
                    <p>{k.desc}</p>
                  </div>
                ))}
              </div>
            )}
            {slide.dwt2d && (
              <div className="dwt2d-section">
                <h3>{slide.dwt2d.title}</h3>
                <p className="dwt2d-desc">{slide.dwt2d.description}</p>
                <div className="dwt2d-coefficients">
                  {slide.dwt2d.coefficients.map((c, i) => (
                    <div key={i} className="dwt2d-coeff">
                      <span className="coeff-name">{c.name}</span>
                      <div className="coeff-formula"><LaTeXBlock math={c.formula} /></div>
                      <span className="coeff-desc">{c.desc}</span>
                    </div>
                  ))}
                </div>
                {slide.dwt2d.subsampling && (
                  <div className="dwt2d-subsampling">
                    <LaTeXBlock math={slide.dwt2d.subsampling} />
                  </div>
                )}
              </div>
            )}
            {slide.waveletConnection && (
              <div className="wavelet-connection-box">
                <h4>Legătura cu Wavelets</h4>
                <p>{slide.waveletConnection.text}</p>
                <div className="math-formula small">
                  <LaTeXBlock math={slide.waveletConnection.math} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* DOMAIN CARDS SLIDE - one pictogram per application field */}
        {slide.type === 'domain-cards' && (
          <div className="slide-domains">
            <div className="slide-header">
              <h1>{slide.title}</h1>
            </div>
            {slide.content && <p className="slide-content">{renderRich(slide.content)}</p>}
            <div className="domain-grid">
              {slide.domains.map((d, i) => (
                <div key={i} className="domain-card">
                  <span className="domain-icon"><DomainIcon name={d.icon} /></span>
                  <div className="domain-text">
                    <span className="domain-name">{d.name}</span>
                    <span className="domain-desc">{renderRich(d.desc)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* COMPARISON SLIDE */}
        {slide.type === 'comparison' && (
          <div className="slide-comparison">
            <div className="slide-header">
              <h1>{slide.title}</h1>
            </div>
            <div className="comparison-grid">
              <div className="comp-col dct">
                <h3>DCT (JPEG)</h3>
                <ul>{slide.dct.map((item, i) => <li key={i}>{renderRich(item)}</li>)}</ul>
              </div>
              <div className="comp-vs">VS</div>
              <div className="comp-col wavelet">
                <h3>Wavelet (JPEG2000)</h3>
                <ul>{slide.wavelet.map((item, i) => <li key={i}>{renderRich(item)}</li>)}</ul>
              </div>
            </div>
          </div>
        )}

        {/* EMBEDDED FULL VIEW SLIDE */}
        {slide.type === 'embed' && (
          <div className="slide-embed">
            {/* The embedded views carry no title of their own, so the one from
                the slide metadata is the only one the audience ever sees. */}
            <div className="embed-header">
              <h1>{slide.title}</h1>
              {slide.subtitle && <span className="embed-subtitle">{slide.subtitle}</span>}
              {slide.gloss && <span className="embed-gloss">{renderRich(slide.gloss)}</span>}
            </div>
            <div className="embed-wrapper">
              <EmbeddedView
                embedType={slide.embedType}
                api={API_BASE}
                imageId={localImage}
                sampleImages={sampleImages}
                onImageChange={setLocalImage}
              />
            </div>
          </div>
        )}

        {/* FILTERS THEORY SLIDE - Mathematical formulas */}
        {slide.type === 'filters-theory-detailed' && (
          <div className="slide-filters-theory">
            <div className="slide-header">
              <h1>{slide.title}</h1>
            </div>
            <p className="slide-content">
              Filtrele digitale separă componentele de frecvență din semnal.
              <strong> Low-pass</strong> păstrează frecvențele joase, <strong>High-pass</strong> păstrează frecvențele înalte,
              <strong> Band-pass</strong> păstrează doar un interval de frecvențe.
            </p>
            <div className="filters-formulas-grid">
              <div className="formula-card">
                <h3>Filtrul Ideal</h3>
                <div className="math-formula">
                  <LaTeXBlock math={String.raw`H_{LP}(f) = \begin{cases} 1 & |f| \leq f_c \\ 0 & |f| > f_c \end{cases}`} />
                </div>
                <p className="formula-desc">
                  Tăietură bruscă la <LaTeX math="f_c" />. Teoretic perfect, dar imposibil
                  de realizat: răspunsul lui în timp este un <LaTeX math={String.raw`\mathrm{sinc}`} />{' '}
                  infinit, deci necauzal - iar trunchierea lui lasă exact oscilația Gibbs
                  văzută la Fourier.
                </p>
              </div>
              <div className="formula-card butterworth">
                <h3>Filtrul Butterworth</h3>
                <div className="math-formula">
                  <LaTeXBlock math={String.raw`|H(f)|^2 = \frac{1}{1 + \left(\frac{f}{f_c}\right)^{2n}}`} />
                </div>
                <p className="formula-desc">
                  Ordinul <strong>n</strong> controlează abruptitatea: n=1 lent, n=8 aproape ideal.
                </p>
              </div>
              <div className="formula-card">
                <h3>Filtrul Gaussian</h3>
                <div className="math-formula">
                  <LaTeXBlock math={String.raw`H(f) = e^{-\frac{f^2}{2\sigma^2}}`} />
                </div>
                <p className="formula-desc">Tranziție netedă, fără oscilații. <LaTeX math={String.raw`\sigma \approx`} /> lățimea benzii.</p>
              </div>
            </div>
          </div>
        )}

        {/* FOURIER INTERACTIVE SLIDE - Demo with plots */}
        {slide.type === 'fourier-interactive' && (
          <div className="slide-fourier-interactive">
            <div className="slide-header compact">
              <h1>{slide.title}</h1>
            </div>
            <div className="fourier-demo-wrapper">
              <FourierView api={API_BASE} compact={true} />
            </div>
          </div>
        )}

        {/* FILTERS INTERACTIVE SLIDE - Demo with plots */}
        {slide.type === 'filters-interactive' && (
          <div className="slide-filters-interactive">
            <div className="slide-header compact">
              <h1>{slide.title}</h1>
            </div>
            <div className="filters-demo-wrapper">
              <FiltersView api={API_BASE} compact={true} />
            </div>
          </div>
        )}

        {/* FILTERS-WAVELET CONNECTION SLIDE */}
        {slide.type === 'filters-wavelet-connection' && (
          <div className="slide-theory wavelet-connection">
            <div className="slide-header">
              <h1>{slide.title}</h1>
            </div>
            <p className="slide-content">
              <strong>Băncile de filtre</strong> sunt fundamentul transformatei wavelet discrete.
              Fiecare nivel de descompunere folosește o pereche de filtre complementare.
            </p>
            <ul className="slide-points">
              <li><strong>Filtru low-pass (h):</strong> coeficienți de aproximare - ce rămâne la frecvențe joase</li>
              <li><strong>Filtru high-pass (g):</strong> coeficienți de detaliu - muchii, texturi, zgomot</li>
              <li><strong>Aplicare recursivă:</strong> analiză multi-rezoluție (MRA) pe mai multe niveluri <Cite id="strangnguyen1996" /></li>
              <li>
                <strong>Reconstrucție perfectă:</strong> (h, g) formează o pereche de filtre
                în oglindă conjugate (CQF), <LaTeX math={String.raw`g[k] = (-1)^k \, h[N-1-k]`} />{' '}
                <Cite id="estebangaland1977,smithbarnwell1984" />
              </li>
              <li>
                <strong>De ce decimarea nu pierde nimic:</strong> fiecare filtru înjumătățește
                banda, iar teorema de eșantionare cere doar <LaTeX math="2B" /> eșantioane pe
                secundă pentru o bandă de <LaTeX math="B" /> Hz - deci un eșantion din doi,
                fără aliasing. <Cite id="shannon1949" />
              </li>
            </ul>
            <div className="slide-math">
              <div className="math-formula small">
                <LaTeXBlock math={String.raw`a[n] = \sum_k h[k] \cdot x[2n - k] \quad d[n] = \sum_k g[k] \cdot x[2n - k]`} />
              </div>
            </div>
          </div>
        )}

        {/* SYNTHESIS SLIDE - closes the arc opened by the applications section */}
        {slide.type === 'synthesis' && (
          <div className="slide-synthesis">
            <div className="slide-header">
              <h1>{slide.title}</h1>
            </div>
            <p className="slide-content">{renderRich(slide.content)}</p>
            <div className="synthesis-threads">
              {slide.threads.map((t, i) => (
                <div key={i} className="synthesis-thread">
                  <span className="thread-step">{t.step}</span>
                  <span className="thread-desc">{t.desc}</span>
                </div>
              ))}
            </div>
            <div className="synthesis-apps">
              {slide.applications.map((a, i) => (
                <div key={i} className="synthesis-app">
                  <span className="app-name">{a.name}</span>
                  <span className="app-desc">{a.desc}</span>
                </div>
              ))}
            </div>
            <p className="synthesis-closing">{renderRich(slide.closing)}</p>
          </div>
        )}

        {/* REFERENCES SLIDE - maps directly over SOURCES, so the list and the
            inline [n] markers can never drift apart */}
        {slide.type === 'references' && (
          <div className="slide-references">
            <div className="slide-header">
              <h1>{slide.title}</h1>
            </div>
            <ul className="references-list">
              {SOURCES.map((src, i) => {
                const entry = (
                  <>
                    <span className="ref-num">[{i + 1}]</span>
                    {src.authors}, <span className="ref-title">{src.title}</span>,{' '}
                    <span className="ref-venue">{src.venue}, {src.year}</span>
                  </>
                )
                return (
                  <li key={src.key} className="reference-entry">
                    {src.url ? (
                      <a
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                      >
                        {entry}
                      </a>
                    ) : entry}
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {/* FINAL SLIDE */}
        {slide.type === 'final' && (
          <div className="slide-final">
            <h1>{slide.title}</h1>
            <h2>{slide.subtitle}</h2>
            <button className="btn-explore" onClick={onClose}>
              <ChevronIcon direction="left" />
              Înapoi la pagina principală
            </button>
          </div>
        )}
      </div>

      {/* Navigation footer */}
      <div className="tour-nav">
        <button
          className="nav-btn prev"
          onClick={handlePrev}
          disabled={isFirst}
          aria-label="Slide-ul anterior"
        >
          <ChevronIcon direction="left" />
          Anterior
        </button>

        <div className="nav-center">
          <span className="slide-counter">{currentIdx + 1} / {SLIDES.length}</span>
        </div>

        <button
          className="nav-btn next"
          onClick={handleNext}
          disabled={isLast}
          aria-label={isLast ? 'Ultimul slide' : 'Slide-ul următor'}
        >
          {isLast ? 'Final' : 'Următor'}
          {!isLast && <ChevronIcon direction="right" />}
        </button>
      </div>
      </div>
      </div>
    </div>
  )
}
