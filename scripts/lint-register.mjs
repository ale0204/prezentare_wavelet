#!/usr/bin/env node
/* Lint: the punctuation habits that make prose read as machine-written.

   Measured against human-written Romanian technical prose from the same
   course (lab handouts, 10k words, written before generative models were in
   use): 0.9 semicolons and 0.4 spaced dashes per 1000 words. A dash rate an
   order of magnitude above that is the strongest single tell, followed by
   semicolons standing in for a full stop and by the "nu X, ci Y" antithesis,
   which appears once in the whole human reference.

   Mathematics is stripped before counting, otherwise every minus sign and
   every subscript separator counts as prose punctuation.

   Run: npm run register   (in scripts/) */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
// docs/scenariu is kept out of the repo, so a clone will not have it. Lint whatever
// prose is actually present rather than failing on the folder that is missing.
const TARGETS = [join(ROOT, 'docs', 'suport'), join(ROOT, 'docs', 'scenariu')]
    .filter(dir => existsSync(dir))

// Ceilings per 1000 words, from the human reference plus a tolerance.
const LIMIT = { semicolons: 1.5, dashes: 1.5, antithesis: 0 }

function stripMath(text) {
  return text
    .replace(/\\begin\{(equation|gather|align|multline)\*?\}[\s\S]*?\\end\{\1\*?\}/g, ' ')
    .replace(/\\\[[\s\S]*?\\\]/g, ' ')
    .replace(/\$[^$]*\$/g, ' ')
    .replace(/\\(includegraphics|label|ref|cite|txt|url|input)\{[^}]*\}/g, ' ')
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(tex|md)$/.test(name)) out.push(p)
  }
  return out
}

const findings = []
let words = 0
const totals = { semicolons: 0, dashes: 0, antithesis: 0 }

for (const file of TARGETS.flatMap((t) => walk(t))) {
  const raw = readFileSync(file, 'utf8')
  const prose = stripMath(raw)
  words += (prose.match(/\b[\wăâîșțĂÂÎȘȚ-]+\b/g) || []).length

  prose.split('\n').forEach((line, i) => {
    const at = (col) => `${relative(ROOT, file)}:${i + 1}:${col}`
    // A dash used as punctuation: spaced on both sides, or ending the line.
    for (const m of line.matchAll(/ [-–—](?= |$)/g)) {
      totals.dashes++
      findings.push({ kind: 'dash', where: at(m.index + 1), text: line.trim().slice(0, 90) })
    }
    for (const m of line.matchAll(/;/g)) {
      totals.semicolons++
      findings.push({ kind: 'semicolon', where: at(m.index + 1), text: line.trim().slice(0, 90) })
    }
  })

  for (const m of prose.matchAll(/\bnu\b[^.;:!?]{2,70}?,\s*ci\b/gi)) {
    totals.antithesis++
    findings.push({ kind: 'antithesis', where: relative(ROOT, file), text: m[0].slice(0, 90) })
  }
}

const perK = (n) => (n * 1000) / (words || 1)
const rates = {
  semicolons: perK(totals.semicolons),
  dashes: perK(totals.dashes),
  antithesis: totals.antithesis
}

const over = Object.keys(LIMIT).filter((k) =>
  k === 'antithesis' ? rates[k] > LIMIT[k] : rates[k] > LIMIT[k]
)

console.log(`register: ${words} cuvinte de proza`)
console.log(`  punct-si-virgula  ${totals.semicolons}  (${rates.semicolons.toFixed(2)}/1k, prag ${LIMIT.semicolons})`)
console.log(`  linii de pauza    ${totals.dashes}  (${rates.dashes.toFixed(2)}/1k, prag ${LIMIT.dashes})`)
console.log(`  "nu X, ci Y"      ${totals.antithesis}  (prag ${LIMIT.antithesis})`)

if (over.length) {
  console.log('')
  for (const f of findings.slice(0, 40)) console.log(`  ${f.kind.padEnd(10)} ${f.where}  ${f.text}`)
  if (findings.length > 40) console.log(`  ... si inca ${findings.length - 40}`)
  console.log('')
  console.log(`register: peste prag la ${over.join(', ')}`)
  process.exit(1)
}
console.log('register: curat')
