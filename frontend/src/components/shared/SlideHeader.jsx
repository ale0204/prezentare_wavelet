/**
 * SlideHeader - Reusable slide header/title component
 * 
 * Provides consistent header styling for slides with icon, title, and optional subtitle.
 * Supports different variants: default, compact, and centered.
 * 
 * Usage:
 * <SlideHeader
 *   icon=""
 *   title="Transformata Fourier"
 *   subtitle="Analiza frecvențelor"
 *   color="#00d9ff"
 *   variant="default" // "default" | "compact" | "centered" | "title-slide"
 * />
 */

import React from 'react'
import './SlideHeader.css'

export default function SlideHeader({
  icon,
  title,
  subtitle,
  color,
  variant = 'default',
  className = '',
  children, // Optional extra content in header
}) {
  const style = color ? { '--slide-color': color } : {}
  
  // Title slide variant - large centered layout for title slides
  if (variant === 'title-slide') {
    return (
      <div className={`slide-header-component title-slide ${className}`} style={style}>
        {icon && <div className="header-icon-large">{icon}</div>}
        <h1 className="header-title-large">{title}</h1>
        {subtitle && <h2 className="header-subtitle">{subtitle}</h2>}
        {children}
      </div>
    )
  }
  
  // Centered variant - used for theory slides
  if (variant === 'centered') {
    return (
      <div className={`slide-header-component centered ${className}`} style={style}>
        <div className="header-row">
          {icon && <span className="header-icon">{icon}</span>}
          <h1 className="header-title">{title}</h1>
        </div>
        {subtitle && <p className="header-subtitle-inline">{subtitle}</p>}
        {children}
      </div>
    )
  }
  
  // Compact variant - smaller for space-constrained areas
  if (variant === 'compact') {
    return (
      <div className={`slide-header-component compact ${className}`} style={style}>
        {icon && <span className="header-icon-sm">{icon}</span>}
        <h1 className="header-title-sm">{title}</h1>
        {subtitle && <span className="header-subtitle-sm">{subtitle}</span>}
        {children}
      </div>
    )
  }
  
  // Default variant - horizontal layout with icon and title
  return (
    <div className={`slide-header-component default ${className}`} style={style}>
      {icon && <span className="header-icon">{icon}</span>}
      <div className="header-text">
        <h1 className="header-title">{title}</h1>
        {subtitle && <p className="header-subtitle-inline">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

/**
 * SectionTitle - For section dividers within a slide
 * 
 * Usage:
 * <SectionTitle>Rezultate</SectionTitle>
 */
export function SectionTitle({ 
  children, 
  icon,
  color,
  className = '' 
}) {
  const style = color ? { '--section-color': color } : {}
  
  return (
    <h3 className={`section-title-component ${className}`} style={style}>
      {icon && <span className="section-icon">{icon}</span>}
      {children}
    </h3>
  )
}

/**
 * PanelTitle - For titled panels within a slide
 * 
 * Usage:
 * <PanelTitle icon="">Parametri</PanelTitle>
 */
export function PanelTitle({ 
  children, 
  icon,
  className = '' 
}) {
  return (
    <h3 className={`panel-title-component ${className}`}>
      {icon && <span className="panel-icon">{icon}</span>}
      {children}
    </h3>
  )
}

/**
 * SlideNumber - Shows slide number indicator
 * 
 * Usage:
 * <SlideNumber current={5} total={30} />
 */
export function SlideNumber({ 
  current, 
  total,
  className = '' 
}) {
  return (
    <span className={`slide-number-component ${className}`}>
      {current} / {total}
    </span>
  )
}
