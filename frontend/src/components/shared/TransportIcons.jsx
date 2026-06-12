/**
 * Transport icons for every animated demo.
 *
 * Inline SVG rather than emoji or geometric glyphs: emoji render differently on
 * every machine and projector (and are banned in this project), while a glyph
 * cannot inherit currentColor reliably at every size. These scale with the
 * stage and follow the button's colour in both themes.
 */
const BOX = { viewBox: '0 0 24 24', fill: 'currentColor', 'aria-hidden': 'true' }

function Icon({ size = 18, children }) {
  return <svg {...BOX} width={size} height={size}>{children}</svg>
}

export function PlayIcon({ size }) {
  return <Icon size={size}><path d="M8 5.5v13l11-6.5z" /></Icon>
}

export function PauseIcon({ size }) {
  return <Icon size={size}><path d="M7 5h4v14H7zM13 5h4v14h-4z" /></Icon>
}

export function StopIcon({ size }) {
  return <Icon size={size}><rect x="6" y="6" width="12" height="12" rx="1.5" /></Icon>
}

export function PrevIcon({ size }) {
  return <Icon size={size}><path d="M7 5h2.4v14H7zM20 5.5v13L10 12z" /></Icon>
}

export function NextIcon({ size }) {
  return <Icon size={size}><path d="M14.6 5H17v14h-2.4zM4 5.5 14 12 4 18.5z" /></Icon>
}

export function StepBackIcon({ size }) {
  return <Icon size={size}><path d="M16 5.5v13L6 12z" /></Icon>
}

export function StepForwardIcon({ size }) {
  return <Icon size={size}><path d="M8 5.5 18 12 8 18.5z" /></Icon>
}

export function ResetIcon({ size }) {
  return (
    <Icon size={size}>
      <path d="M12 5a7 7 0 1 0 6.7 9h-2.2A4.8 4.8 0 1 1 12 7.2c1.3 0 2.5.5 3.4 1.4L13 11h6V5l-2.1 2.1A6.98 6.98 0 0 0 12 5z" />
    </Icon>
  )
}

export function SkipStartIcon({ size }) {
  return <Icon size={size}><path d="M7 5h2.2v14H7zM19 5.5v13L9.8 12z" /></Icon>
}

export function SkipEndIcon({ size }) {
  return <Icon size={size}><path d="M14.8 5H17v14h-2.2zM5 5.5 14.2 12 5 18.5z" /></Icon>
}

export function CheckIcon({ size }) {
  return <Icon size={size}><path d="M9.6 16.2 5.4 12l-1.4 1.4 5.6 5.6L20.4 7.8 19 6.4z" /></Icon>
}

export function CrossIcon({ size }) {
  return (
    <Icon size={size}>
      <path d="M18.3 7.1 16.9 5.7 12 10.6 7.1 5.7 5.7 7.1l4.9 4.9-4.9 4.9 1.4 1.4 4.9-4.9 4.9 4.9 1.4-1.4-4.9-4.9z" />
    </Icon>
  )
}

export function ClockIcon({ size }) {
  return (
    <Icon size={size}>
      <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 2a7 7 0 1 1 0 14 7 7 0 0 1 0-14zm-1 2v6l5 2 .7-1.8-3.7-1.5V7z" />
    </Icon>
  )
}
