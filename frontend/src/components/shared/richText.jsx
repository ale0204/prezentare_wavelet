import LaTeX from '../LaTeX'
import Cite from './Cite'

/* Rich data-string renderer for slide text. Expands two tokens:
   - $...$   -> inline KaTeX (hard rule: math is never Unicode glyphs)
   - [cite:key] or [cite:a,b] -> <Cite/> markers
   Plain strings pass through unchanged, so it can wrap any data-driven
   render site at zero cost. Never use tokens inside a `math` field:
   katex.render() owns that string wholesale. */

const TOKEN = /\$([^$]+)\$|\[cite:([a-z0-9]+(?:\s*,\s*[a-z0-9]+)*)\]/g

export function renderRich(text) {
  if (typeof text !== 'string') return text
  if (!text.includes('$') && !text.includes('[cite:')) return text
  const parts = []
  let last = 0
  let m
  TOKEN.lastIndex = 0
  while ((m = TOKEN.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    if (m[1] !== undefined) parts.push(<LaTeX key={m.index} math={m[1]} />)
    else parts.push(<Cite key={m.index} id={m[2]} />)
    last = TOKEN.lastIndex
  }
  if (last < text.length) parts.push(text.slice(last))
  // Single wrapper: inside a flex parent (e.g. .slide-points li) an array
  // would split into separate flex items and push markers to the far edge.
  return <span className="rich-text">{parts}</span>
}
