#!/usr/bin/env node
/* Lint: no Unicode glyphs standing in for content or for icons.

   Two rules of this project, one scanner:
   - math is ALWAYS LaTeX, never a precomposed Greek letter, superscript or
     operator glyph, because a glyph does not scale with the reader's zoom and
     falls back to a different font on a projector;
   - no emoji and no dingbats, so transport controls, check marks and menu bars
     are inline SVG (frontend/src/components/shared/TransportIcons.jsx), never a
     media-control or geometric character.

   Scans frontend/src, prints file:line:col with context, grouped per file and
   per class. Exit 1 on any finding, 0 when clean.
   Run: npm run lint  (in scripts/) */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const SRC = join(ROOT, 'frontend', 'src')

// Greek block + superscripts/subscripts + a few math operators. Romanian
// diacritics are Latin-range and never match. x-as-dimension ("8x8", "NxN") is
// typography, not math: the multiplication sign and middle dot stay unlinted.
const MATH_GLYPH = /[Ͱ-Ͽ²³√∞≈≤≥∫∑∏⁰-₟]/g

// Media-control pictographs, dingbats, geometric shapes and arrows used as UI.
// An arrow inside a drawn diagram is the same defect: it belongs to a stroked
// path or to LaTeX, not to a text run.
const UI_GLYPH = /[←-⇿⌀-⏿■-➿⬀-⯿️]|[\u{1F300}-\u{1FAFF}]/gu

// An HTML entity is ASCII in the source and a glyph in the DOM, so the two
// scanners above cannot see it. Named entities for Greek letters, arrows and
// dingbats are the same defect one indirection later; &amp; &lt; &gt; &quot;
// &nbsp; and the numeric forms of those stay legal.
const ENTITY_GLYPH = /&(?!amp;|lt;|gt;|quot;|apos;|nbsp;|#3[89];|#6[02];)[a-zA-Z][a-zA-Z0-9]{1,9};/g

// A math accent typed as a combining mark ("x" plus U+0302) is a glyph the
// source hides in plain sight. Romanian diacritics are precomposed, so nothing
// legitimate in this codebase carries one.
const COMBINING_MARK = /\p{Mn}/gu

const CLASSES = [
  { name: 'math glyph (render it with LaTeX)', re: MATH_GLYPH },
  { name: 'UI glyph (use an SVG icon)', re: UI_GLYPH },
  { name: 'HTML entity (renders as a glyph in the DOM)', re: ENTITY_GLYPH },
  { name: 'combining mark (render the accent with LaTeX)', re: COMBINING_MARK }
]

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (/\.(jsx?|css)$/.test(name)) out.push(p)
  }
  return out
}

let findings = 0
const perFile = new Map()

for (const file of walk(SRC)) {
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    for (const { name, re } of CLASSES) {
      re.lastIndex = 0
      let m
      while ((m = re.exec(line)) !== null) {
        findings++
        const rel = relative(ROOT, file)
        if (!perFile.has(rel)) perFile.set(rel, [])
        perFile.get(rel).push(`  ${i + 1}:${m.index + 1}  ${m[0]}  [${name}]  ${line.trim().slice(0, 80)}`)
      }
    }
  })
}

if (findings === 0) {
  console.log('lint-glyphs: clean, no Unicode math or UI glyphs in frontend/src')
  process.exit(0)
}

console.log(`lint-glyphs: ${findings} glyph occurrence(s) in ${perFile.size} file(s)\n`)
for (const [file, hits] of perFile) {
  console.log(file)
  const seen = new Set()
  for (const h of hits) {
    if (seen.has(h)) continue
    seen.add(h)
    console.log(h)
  }
  console.log('')
}
process.exit(1)
