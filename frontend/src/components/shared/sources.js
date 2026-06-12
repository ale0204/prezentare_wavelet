/* Bibliographic registry for the presentation. Array order IS the [n]
   numbering shown by <Cite/> and by the Bibliografie slide: first-appearance
   order in the deck, stable regardless of navigation (mount order would
   depend on deep links and tab clicks). Insert new entries at their
   first-appearance position; everything renumbers automatically.
   url: only links checked live ship here; an empty string renders a static
   marker instead of a dead link.
   Pure data, no JSX: Vite parses .js with the js loader. */

export const SOURCES = [
  {
    key: 'dci2024',
    authors: 'Digital Cinema Initiatives',
    title: 'Digital Cinema System Specification, v1.4.4, sect. 4.2',
    venue: 'DCI, LLC',
    year: 2024,
    url: 'https://documents.dcimovies.com/DCSS/'
  },
  {
    key: 'wang2003',
    authors: 'A. L. Wang',
    title: 'An industrial-strength audio search algorithm',
    venue: 'Proc. ISMIR',
    year: 2003,
    url: 'https://www.ee.columbia.edu/~dpwe/papers/Wang03-shazam.pdf'
  },
  {
    key: 'lyons2011',
    authors: 'R. G. Lyons',
    title: 'Understanding Digital Signal Processing',
    venue: 'ed. a 3-a, Prentice Hall',
    year: 2011,
    url: ''
  },
  {
    key: 'strangnguyen1996',
    authors: 'G. Strang, T. Nguyen',
    title: 'Wavelets and Filter Banks',
    venue: 'Wellesley-Cambridge Press',
    year: 1996,
    url: ''
  },
  {
    key: 'estebangaland1977',
    authors: 'D. Esteban, C. Galand',
    title: 'Application of quadrature mirror filters to split band voice coding schemes',
    venue: 'Proc. IEEE ICASSP',
    year: 1977,
    url: 'https://doi.org/10.1109/ICASSP.1977.1170341'
  },
  {
    key: 'smithbarnwell1984',
    authors: 'M. J. T. Smith, T. P. Barnwell III',
    title: 'A procedure for designing exact reconstruction filter banks for tree-structured subband coders',
    venue: 'Proc. IEEE ICASSP',
    year: 1984,
    url: 'https://doi.org/10.1109/ICASSP.1984.1172486'
  },
  {
    key: 'shannon1949',
    authors: 'C. E. Shannon',
    title: 'Communication in the presence of noise',
    venue: 'Proc. IRE 37(1), 10-21',
    year: 1949,
    url: 'https://doi.org/10.1109/JRPROC.1949.232969'
  },
  {
    key: 'daubechies1992',
    authors: 'I. Daubechies',
    title: 'Ten Lectures on Wavelets',
    venue: 'SIAM',
    year: 1992,
    url: 'https://doi.org/10.1137/1.9781611970104'
  },
  {
    key: 'daubechies1988',
    authors: 'I. Daubechies',
    title: 'Orthonormal bases of compactly supported wavelets',
    venue: 'Comm. Pure Appl. Math. 41(7)',
    year: 1988,
    url: 'https://doi.org/10.1002/cpa.3160410705'
  },
  {
    key: 'taubmanmarcellin2002',
    authors: 'D. S. Taubman, M. W. Marcellin',
    title: 'JPEG2000: Image Compression Fundamentals, Standards and Practice',
    venue: 'Kluwer Academic',
    year: 2002,
    url: ''
  },
  {
    key: 'sweldens1998',
    authors: 'W. Sweldens',
    title: 'The lifting scheme: A construction of second generation wavelets',
    venue: 'SIAM J. Math. Anal. 29(2)',
    year: 1998,
    url: 'https://doi.org/10.1137/S0036141095289051'
  },
  {
    key: 'mallat2008',
    authors: 'S. Mallat',
    title: 'A Wavelet Tour of Signal Processing: The Sparse Way',
    venue: 'ed. a 3-a, Academic Press',
    year: 2008,
    url: 'https://www.sciencedirect.com/book/9780123743701/a-wavelet-tour-of-signal-processing'
  },
  {
    key: 'mallat1989',
    authors: 'S. Mallat',
    title: 'A theory for multiresolution signal decomposition: the wavelet representation',
    venue: 'IEEE Trans. Pattern Anal. Mach. Intell. 11(7), 674-693',
    year: 1989,
    url: 'https://doi.org/10.1109/34.192463'
  },
  {
    key: 'perez2019',
    authors: 'M. V. Perez et al. (Apple Heart Study)',
    title: 'Large-scale assessment of a smartwatch to identify atrial fibrillation',
    venue: 'N. Engl. J. Med. 381(20), 1909-1917',
    year: 2019,
    url: 'https://doi.org/10.1056/NEJMoa1901183'
  },
  {
    key: 'martinez2004',
    authors: 'J. P. Martínez, R. Almeida, S. Olmos, A. P. Rocha, P. Laguna',
    title: 'A wavelet-based ECG delineator: evaluation on standard databases',
    venue: 'IEEE Trans. Biomed. Eng. 51(4), 570-581',
    year: 2004,
    url: 'https://doi.org/10.1109/TBME.2003.821031'
  },
  {
    key: 'donohojohnstone1994',
    authors: 'D. L. Donoho, I. M. Johnstone',
    title: 'Ideal spatial adaptation by wavelet shrinkage',
    venue: 'Biometrika 81(3), 425-455',
    year: 1994,
    url: 'https://doi.org/10.1093/biomet/81.3.425'
  },
  {
    key: 'itut81',
    authors: 'ITU-T',
    title: 'Rec. T.81: Digital compression and coding of continuous-tone still images',
    venue: 'ITU-T / ISO-IEC 10918-1',
    year: 1992,
    url: 'https://www.w3.org/Graphics/JPEG/itu-t81.pdf'
  },
  {
    key: 'wangbovik2004',
    authors: 'Z. Wang, A. C. Bovik, H. R. Sheikh, E. P. Simoncelli',
    title: 'Image quality assessment: from error visibility to structural similarity',
    venue: 'IEEE Trans. Image Process. 13(4), 600-612',
    year: 2004,
    url: 'https://doi.org/10.1109/TIP.2003.819861'
  },
  {
    key: 'oppenheimschafer2010',
    authors: 'A. V. Oppenheim, R. W. Schafer',
    title: 'Discrete-Time Signal Processing',
    venue: 'ed. a 3-a, Prentice Hall',
    year: 2010,
    url: ''
  }
]

export function sourceByKey(key) {
  return SOURCES.find(s => s.key === key)
}

export function sourceNumber(key) {
  return SOURCES.findIndex(s => s.key === key) + 1
}
