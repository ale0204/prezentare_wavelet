/**
 * Shared Components Index
 * 
 * Export all reusable components from one place
 */

// Graph components
export { default as Graph, BarGraph } from './Graph'

// HiDPI canvas hook for bespoke canvas drawing
export { default as useHiDPICanvas } from './useHiDPICanvas'

// Theme-resolved colours and type scale for bespoke canvas drawing
export { canvasTheme, CANVAS_FONT } from './canvasTheme'

// Animation controls
export { 
  default as AnimationControls,
  AnimationControlsCompact,
  SpeedControl,
  FrameByFrameToggle 
} from './AnimationControls'

// Header components
export { 
  default as SlideHeader,
  SectionTitle,
  PanelTitle,
  SlideNumber 
} from './SlideHeader'
