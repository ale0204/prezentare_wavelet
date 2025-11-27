import { useEffect, useRef } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'

/**
 * LaTeX component for rendering mathematical expressions using KaTeX.
 * KaTeX is bundled (npm), so rendering works offline and synchronously.
 * @param {string} math - The LaTeX expression to render
 * @param {boolean} block - If true, renders as display math (centered, larger)
 * @param {string} className - Additional CSS classes
 */
export default function LaTeX({ math, block = false, className = '' }) {
  const containerRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current) return
    try {
      katex.render(math, containerRef.current, {
        throwOnError: false,
        displayMode: block,
        trust: true,
        strict: false
      })
    } catch (e) {
      console.error('KaTeX error:', e)
      containerRef.current.textContent = math
    }
  }, [math, block])

  return (
    <span
      ref={containerRef}
      className={`latex ${block ? 'latex-block' : 'latex-inline'} ${className}`}
    >
      {math}
    </span>
  )
}

/**
 * Shorthand for block-level LaTeX
 */
export function LaTeXBlock({ math, className = '' }) {
  return <LaTeX math={math} block={true} className={className} />
}
