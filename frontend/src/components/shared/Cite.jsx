import { sourceByKey, sourceNumber } from './sources'
import './Cite.css'

/* Inline citation marker: [n], numbered from the SOURCES registry.
   id takes one key or a comma list ("a,b" renders [2][3]). With a url the
   marker links to the source in a new tab; without one it stays static.
   Never put a [cite:...] token inside a `math` string: katex.render()
   replaces the container's innerHTML wholesale and destroys the marker. */
export default function Cite({ id }) {
  return id.split(',').map(k => k.trim()).filter(Boolean)
    // Markers read ascending whatever order the keys were written in.
    .sort((a, b) => sourceNumber(a) - sourceNumber(b))
    .map(key => {
    const src = sourceByKey(key)
    if (!src) {
      console.error(`Cite: unknown source key "${key}"`)
      return null
    }
    const tip = `${src.authors} - ${src.title}, ${src.venue}, ${src.year}`
    const label = `[${sourceNumber(key)}]`
    return src.url ? (
      <a
        key={key}
        className="cite-marker"
        href={src.url}
        target="_blank"
        rel="noopener noreferrer"
        title={tip}
        onClick={e => e.stopPropagation()}
      >
        {label}
      </a>
    ) : (
      <span key={key} className="cite-marker cite-marker-static" title={tip}>
        {label}
      </span>
    )
  })
}

