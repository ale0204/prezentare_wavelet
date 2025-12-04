import { useState, useEffect, useRef } from 'react'
import LaTeX from './LaTeX'
import useHiDPICanvas from './shared/useHiDPICanvas'
import { canvasTheme } from './shared/canvasTheme'

export default function ComplexWaveletView({ compact = false }) {
  const [omega, setOmega] = useState(5)
  // Rest at an angle where the spiral already reads as 3D - at rotation 0 the
  // projection collapses to a flat curve and the point of the slide is lost
  const [rotation, setRotation] = useState(0.7)
  // Nothing auto-plays on mount: the presenter starts every animation
  const [autoRotate, setAutoRotate] = useState(false)

  const animRef = useRef(null)

  // Complex Morlet: exp(-t^2/2) * exp(i*omega*t)
  const getPoints = (w) => {
    const points = []
    const steps = 300
    const range = 4
    
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * 2 * range - range
      const envelope = Math.exp(-t*t/2)
      const re = envelope * Math.cos(w * t)
      const im = envelope * Math.sin(w * t)
      points.push({ t, re, im, envelope })
    }
    return points
  }

  useEffect(() => {
    if (autoRotate) {
      let lastTime = performance.now()
      const animate = (time) => {
        const dt = (time - lastTime) / 1000
        lastTime = time
        setRotation(r => (r + dt * 0.5) % (2 * Math.PI))
        animRef.current = requestAnimationFrame(animate)
      }
      animRef.current = requestAnimationFrame(animate)
    } else {
      cancelAnimationFrame(animRef.current)
    }
    return () => cancelAnimationFrame(animRef.current)
  }, [autoRotate])

  const { canvasRef, containerRef } = useHiDPICanvas((ctx, { width, height }) => {
    const W = width
    const H = height

    // Clear
    ctx.fillStyle = canvasTheme().bg
    ctx.fillRect(0, 0, W, H)

    const points = getPoints(omega)

    // 3D Projection
    // X axis: Time
    // Y axis: Real
    // Z axis: Imaginary

    // Camera angle
    const angle = rotation
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)

    const project = (t, re, im) => {
      // Keep t horizontal. Rotate Re/Im plane.
      const y_rot = re * cos - im * sin
      const z_rot = re * sin + im * cos

      // Perspective projection
      const x_proj = W/2 + t * (W/10) // Spread time across width
      const y_proj = H/2 - y_rot * (H/4) // Scale amplitude

      // Z-depth for occlusion/size (simple)
      const z_depth = z_rot

      return { x: x_proj, y: y_proj, z: z_depth }
    }

    // Draw axis line (Time)
    ctx.strokeStyle = canvasTheme().border
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, H/2)
    ctx.lineTo(W, H/2)
    ctx.stroke()

    // Draw Spiral
    ctx.lineWidth = 3

    // Draw shadow/projection on back wall (Real part). Dimmed via globalAlpha
    // rather than a hardcoded translucent color, so it (and its legend swatch,
    // which uses the same --series-cyan token) stay visible on the light theme too.
    ctx.save()
    ctx.globalAlpha = 0.3
    ctx.strokeStyle = canvasTheme().cyan
    ctx.beginPath()
    points.forEach((p, i) => {
      const proj = project(p.t, p.re, -2) // Push back
      if (i===0) ctx.moveTo(proj.x, proj.y)
      else ctx.lineTo(proj.x, proj.y)
    })
    ctx.stroke()
    ctx.restore()

    // Draw shadow/projection on floor (Imaginary part)
    ctx.save()
    ctx.globalAlpha = 0.3
    ctx.strokeStyle = canvasTheme().amber
    ctx.beginPath()
    points.forEach((p, i) => {
      const proj = project(p.t, -2, p.im) // Push down
      if (i===0) ctx.moveTo(proj.x, proj.y)
      else ctx.lineTo(proj.x, proj.y)
    })
    ctx.stroke()
    ctx.restore()

    // Draw Main Spiral with phase-based color
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i]
      const p2 = points[i+1]

      const proj1 = project(p1.t, p1.re, p1.im)
      const proj2 = project(p2.t, p2.re, p2.im)

      // Color based on phase (angle in complex plane)
      const phase = Math.atan2(p1.im, p1.re)
      // Map phase -PI..PI to Hue 0..360
      const hue = ((phase + Math.PI) / (2 * Math.PI)) * 360

      ctx.strokeStyle = `hsl(${hue}, 80%, 60%)`
      ctx.beginPath()
      ctx.moveTo(proj1.x, proj1.y)
      ctx.lineTo(proj2.x, proj2.y)
      ctx.stroke()
    }

    // Draw Envelope (top/bottom profile in 2D)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
    ctx.setLineDash([5, 5])
    ctx.beginPath()
    points.forEach((p, i) => {
      const y_top = H/2 - p.envelope * (H/4)
      if (i===0) ctx.moveTo(project(p.t, 0, 0).x, y_top)
      else ctx.lineTo(project(p.t, 0, 0).x, y_top)
    })
    ctx.stroke()
    ctx.beginPath()
    points.forEach((p, i) => {
      const y_bot = H/2 + p.envelope * (H/4)
      if (i===0) ctx.moveTo(project(p.t, 0, 0).x, y_bot)
      else ctx.lineTo(project(p.t, 0, 0).x, y_bot)
    })
    ctx.stroke()
    ctx.setLineDash([])
  }, [omega, rotation])

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      gap: '1rem',
      padding: compact ? '0.5rem' : '1rem',
      background: 'var(--bg-card)',
      color: 'var(--text-body)'
    }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ margin: '0.5rem 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          <LaTeX math="\psi(t) = e^{-t^2/2} \cdot e^{i\omega t} = e^{-t^2/2} (\cos(\omega t) + i\sin(\omega t))" />
        </p>
      </div>

      <div style={{
        flex: 1,
        display: 'flex',
        gap: '1rem',
        minHeight: 0
      }}>
        <div
          ref={containerRef}
          style={{
            flex: 3,
            position: 'relative',
            background: 'var(--bg-darker)',
            borderRadius: '8px',
            border: '1px solid var(--border)',
            overflow: 'hidden'
          }}
        >
          <canvas
            ref={canvasRef}
            style={{ display: 'block' }}
          />
          {/* Fixed dark chip + white text (not theme tokens): the legend must
              stay readable against the graph regardless of light/dark theme,
              same idiom as the corner labels in ScalogramView. */}
          <div style={{
            position: 'absolute', bottom: 10, left: 10,
            display: 'flex', flexDirection: 'column', gap: '0.35rem',
            color: '#fff', fontSize: '0.85rem',
            background: 'rgba(0,0,0,0.6)', padding: '0.45rem 0.65rem', borderRadius: '6px',
            maxWidth: '320px'
          }}>
            <span>Spirală 3D: Timp (X) vs Real (Y) vs Imaginar (Z)</span>
            <span style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                <span style={{ width: '14px', height: '3px', background: 'var(--series-cyan)', borderRadius: '2px', display: 'inline-block' }} />
                Real (perete)
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                <span style={{ width: '14px', height: '3px', background: 'var(--series-amber)', borderRadius: '2px', display: 'inline-block' }} />
                Imaginar (podea)
              </span>
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
              Fază:
              <span style={{
                width: '70px', height: '8px', borderRadius: '4px', display: 'inline-block',
                background: 'linear-gradient(to right, hsl(0,80%,60%), hsl(90,80%,60%), hsl(180,80%,60%), hsl(270,80%,60%), hsl(360,80%,60%))'
              }} />
              <LaTeX math="-\pi \to \pi" />
            </span>
          </div>
        </div>

        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem'
        }}>
          <div className="control-group">
            <label>Frecvență (<LaTeX math="\omega" />): {omega}</label>
            <input 
              type="range" 
              min="1" 
              max="15" 
              step="0.5" 
              value={omega} 
              onChange={e => setOmega(parseFloat(e.target.value))} 
            />
          </div>

          <div className="control-group">
            <label>Rotație 3D</label>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <input 
                type="range" 
                min="0" 
                max={Math.PI * 2} 
                step="0.1" 
                value={rotation} 
                onChange={e => {
                  setRotation(parseFloat(e.target.value))
                  setAutoRotate(false)
                }} 
                style={{ flex: 1 }}
              />
              <button 
                onClick={() => setAutoRotate(!autoRotate)}
                style={{
                  background: 'none',
                  border: '1px solid var(--border-light)',
                  color: autoRotate ? 'var(--success)' : 'var(--text-muted)',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  padding: '2px 6px'
                }}
              >
                {autoRotate ? 'Stop' : 'Auto'}
              </button>
            </div>
          </div>

          <div style={{
            padding: '1rem',
            background: 'rgba(255,255,255,0.05)',
            borderRadius: '8px',
            fontSize: '0.9rem',
            lineHeight: '1.4'
          }}>
            <h4 style={{ margin: '0 0 0.5rem', color: 'inherit' }}>De ce Complex?</h4>
            <p style={{ margin: 0, color: 'var(--text-muted)' }}>
              Wavelet-urile complexe păstrează informația de <strong>fază</strong>.
              <br/><br/>
              Sunt esențiale pentru detectarea trăsăturilor invariante la translație și pentru analiza mișcării.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
