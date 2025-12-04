/**
 * AnimationControls - Reusable animation playback controls
 * 
 * A flexible animation control component with play/pause, step forward/backward,
 * jump forward/backward, reset, and optional position slider.
 * 
 * Usage:
 * <AnimationControls
 *   isPlaying={isAnimating}
 *   onPlayPause={() => setIsAnimating(!isAnimating)}
 *   onStepForward={() => setStep(s => s + 1)}
 *   onStepBackward={() => setStep(s => s - 1)}
 *   onReset={() => { setStep(0); setIsAnimating(false) }}
 *   canStepForward={step < maxStep}
 *   canStepBackward={step > 0}
 *   position={step}
 *   maxPosition={maxStep}
 *   onPositionChange={setStep}
 *   showSlider={true}
 *   showJumpButtons={true}
 *   showCompleteButton={false}
 *   onComplete={() => setStep(maxStep)}
 *   labels={{ play: 'Play', pause: 'Pauză', ... }}
 *   size="normal" // "small" | "normal" | "large"
 * />
 */

import React from 'react'
import './AnimationControls.css'
import {
  PlayIcon, PauseIcon, PrevIcon, NextIcon, ResetIcon,
  StopIcon, StepBackIcon, StepForwardIcon, SkipEndIcon
} from './TransportIcons'

const DEFAULT_LABELS = {
  play: 'Redare',
  pause: 'Pauză',
  stepForward: 'Pas înainte',
  stepBackward: 'Pas înapoi',
  jumpForward: 'Înainte rapid',
  jumpBackward: 'Înapoi rapid',
  reset: 'Resetare',
  complete: 'Completează'
}

export default function AnimationControls({
  // Core state
  isPlaying = false,
  
  // Action handlers
  onPlayPause,
  onStepForward,
  onStepBackward,
  onJumpForward,
  onJumpBackward,
  onReset,
  onComplete,
  
  // Enable/disable states
  canStepForward = true,
  canStepBackward = true,
  canPlay = true,
  
  // Slider props
  position,
  maxPosition,
  onPositionChange,
  showSlider = false,
  
  // Optional features
  showJumpButtons = true,
  showCompleteButton = false,
  showResetButton = true,
  jumpStep = 10,
  
  // Styling
  size = 'normal',
  className = '',
  labels = {},
  
  // Layout
  layout = 'horizontal', // 'horizontal' | 'vertical' | 'compact'
}) {
  const mergedLabels = { ...DEFAULT_LABELS, ...labels }
  
  // Default jump handlers if not provided
  const handleJumpForward = onJumpForward || (onStepForward ? () => {
    for (let i = 0; i < jumpStep && canStepForward; i++) {
      onStepForward()
    }
  } : null)
  
  const handleJumpBackward = onJumpBackward || (onStepBackward ? () => {
    for (let i = 0; i < jumpStep && canStepBackward; i++) {
      onStepBackward()
    }
  } : null)
  
  // Handle slider change
  const handleSliderChange = (e) => {
    if (onPositionChange) {
      onPositionChange(parseInt(e.target.value))
    }
  }

  return (
    <div className={`animation-controls size-${size} layout-${layout} ${className}`}>
      {/* Main button row */}
      <div className="animation-controls-buttons">
        {/* Reset button */}
        {showResetButton && onReset && (
          <button
            className="anim-btn reset"
            onClick={onReset}
            title={mergedLabels.reset}
            aria-label={mergedLabels.reset}
          >
            <StopIcon />
          </button>
        )}
        
        {/* Jump backward */}
        {showJumpButtons && handleJumpBackward && (
          <button
            className="anim-btn jump-back"
            onClick={handleJumpBackward}
            disabled={!canStepBackward}
            title={mergedLabels.jumpBackward}
            aria-label={mergedLabels.jumpBackward}
          >
            <PrevIcon />
          </button>
        )}
        
        {/* Step backward */}
        {onStepBackward && (
          <button
            className="anim-btn step-back"
            onClick={onStepBackward}
            disabled={!canStepBackward}
            title={mergedLabels.stepBackward}
            aria-label={mergedLabels.stepBackward}
          >
            <StepBackIcon />
          </button>
        )}
        
        {/* Play/Pause */}
        {onPlayPause && (
          <button
            className={`anim-btn play-pause ${isPlaying ? 'playing' : ''}`}
            onClick={onPlayPause}
            disabled={!canPlay}
            title={isPlaying ? mergedLabels.pause : mergedLabels.play}
            aria-label={isPlaying ? mergedLabels.pause : mergedLabels.play}
          >
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>
        )}
        
        {/* Step forward */}
        {onStepForward && (
          <button
            className="anim-btn step-forward"
            onClick={onStepForward}
            disabled={!canStepForward}
            title={mergedLabels.stepForward}
            aria-label={mergedLabels.stepForward}
          >
            <StepForwardIcon />
          </button>
        )}
        
        {/* Jump forward */}
        {showJumpButtons && handleJumpForward && (
          <button
            className="anim-btn jump-forward"
            onClick={handleJumpForward}
            disabled={!canStepForward}
            title={mergedLabels.jumpForward}
            aria-label={mergedLabels.jumpForward}
          >
            <NextIcon />
          </button>
        )}
        
        {/* Complete button - goes to end */}
        {showCompleteButton && onComplete && (
          <button
            className="anim-btn complete"
            onClick={onComplete}
            disabled={!canStepForward}
            title={mergedLabels.complete}
            aria-label={mergedLabels.complete}
          >
            <SkipEndIcon />
          </button>
        )}
      </div>
      
      {/* Optional position slider */}
      {showSlider && position !== undefined && maxPosition !== undefined && (
        <div className="animation-controls-slider">
          <input
            type="range"
            min="0"
            max={maxPosition}
            value={position}
            onChange={handleSliderChange}
            className="position-slider"
          />
          <span className="position-label">
            {position} / {maxPosition}
          </span>
        </div>
      )}
    </div>
  )
}

/**
 * SpeedControl - Animation speed slider
 * 
 * Usage:
 * <SpeedControl
 *   speed={animationSpeed}
 *   onSpeedChange={setAnimationSpeed}
 *   minSpeed={50}
 *   maxSpeed={500}
 *   label="Viteză"
 * />
 */
export function SpeedControl({
  speed = 100,
  onSpeedChange,
  minSpeed = 50,
  maxSpeed = 500,
  label = 'Viteză',
  inverted = false, // If true, higher slider value = slower speed
  className = '',
}) {
  const handleChange = (e) => {
    const value = parseInt(e.target.value)
    if (onSpeedChange) {
      onSpeedChange(inverted ? (maxSpeed - value + minSpeed) : value)
    }
  }
  
  const displayValue = inverted ? (maxSpeed - speed + minSpeed) : speed

  return (
    <div className={`speed-control ${className}`}>
      <label>{label}</label>
      <input
        type="range"
        min={minSpeed}
        max={maxSpeed}
        value={displayValue}
        onChange={handleChange}
      />
    </div>
  )
}

/**
 * FrameByFrameToggle - Toggle for frame-by-frame mode
 * 
 * Usage:
 * <FrameByFrameToggle
 *   enabled={frameByFrame}
 *   onToggle={(enabled) => {
 *     setFrameByFrame(enabled)
 *     if (enabled) setIsAnimating(false)
 *   }}
 *   label="Cadru cu cadru"
 * />
 */
export function FrameByFrameToggle({
  enabled = false,
  onToggle,
  label = 'Cadru cu cadru',
  className = '',
}) {
  return (
    <label className={`frame-by-frame-toggle ${className}`}>
      <input
        type="checkbox"
        checked={enabled}
        onChange={(e) => onToggle && onToggle(e.target.checked)}
      />
      {label}
    </label>
  )
}

/**
 * AnimationControlsCompact - A more compact variant for space-constrained areas
 * 
 * Just play/pause, step forward/back, and reset
 */
export function AnimationControlsCompact({
  isPlaying = false,
  onPlayPause,
  onStepForward,
  onStepBackward,
  onReset,
  canStepForward = true,
  canStepBackward = true,
  className = '',
}) {
  return (
    <div className={`animation-controls-compact ${className}`}>
      {onReset && (
        <button onClick={onReset} aria-label="Reset"><ResetIcon /></button>
      )}
      {onStepBackward && (
        <button onClick={onStepBackward} disabled={!canStepBackward} aria-label="Înapoi">
          <PrevIcon />
        </button>
      )}
      {onPlayPause && (
        <button
          onClick={onPlayPause}
          className={isPlaying ? 'playing' : ''}
          title={isPlaying ? 'Pauză' : 'Play'}
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>
      )}
      {onStepForward && (
        <button onClick={onStepForward} disabled={!canStepForward} aria-label="Înainte">
          <NextIcon />
        </button>
      )}
    </div>
  )
}
