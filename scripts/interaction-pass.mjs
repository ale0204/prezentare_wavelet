#!/usr/bin/env node
/* interaction-pass - drive every control on every slide, record everything.
   For each slide: baseline screenshot; click every button, switch selects,
   sweep sliders, toggle checkboxes; screenshot each state; measure layout
   shift (bounding boxes before/after); deterministic containment check
   (img/canvas/svg fully inside their parent box and the slide frame);
   hover elements with a title attr and canvas hotspots; collect console
   errors. One continuous .webm video of the whole pass + timeline.json to
   seek by slide. Outputs under scripts/_build/interaction-pass/.

   Run:  npm run interaction -- [--base URL] [--slides a,b]
         [--no-video] [--headed]
   Default base: http://localhost:3000/   (dev server + backend on 8000) */

import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('.', import.meta.url))

const args = process.argv.slice(2)
const argVal = (name, dflt) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt
}
const BASE = argVal('--base', 'http://localhost:3000/')
const ONLY = argVal('--slides', '').split(',').map(s => s.trim()).filter(Boolean)
const VIDEO = !args.includes('--no-video')
const HEADED = args.includes('--headed')

const OUT = join(HERE, '_build', 'interaction-pass')
const SHOTS = join(OUT, 'shots')
const VIDEOS = join(OUT, 'videos')
rmSync(OUT, { recursive: true, force: true })
mkdirSync(SHOTS, { recursive: true })
if (VIDEO) mkdirSync(VIDEOS, { recursive: true })

const FIRST_SLIDE = 'intro-title'
const MAX_SLIDES = 80
const SETTLE = 700
const AFTER_ACTION = 450
const MAX_BUTTONS = 12
const MAX_HOVER_TITLES = 6

// ---------------------------------------------------------------- in-page fns
/* Snapshot visible-element boxes keyed by a structural path, for shift diffs. */
const fnBoxes = () => {
  const root = document.querySelector('.tour-slide')
  if (!root) return {}
  const out = {}
  const walk = (el, path) => {
    const r = el.getBoundingClientRect()
    if (r.width > 4 && r.height > 4) out[path] = [r.x, r.y, r.width, r.height]
    let i = 0
    for (const c of el.children) walk(c, path + '/' + c.tagName.toLowerCase() + i++)
  }
  walk(root, 'slide')
  return out
}

/* img/canvas/svg fully inside parent box and slide frame (2px tolerance). */
const fnContainment = () => {
  const root = document.querySelector('.tour-slide')
  if (!root) return []
  const frame = root.getBoundingClientRect()
  const bad = []
  const TOL = 2
  for (const el of root.querySelectorAll('img, canvas, svg, video')) {
    const r = el.getBoundingClientRect()
    if (r.width < 8 || r.height < 8) continue
    const p = el.parentElement ? el.parentElement.getBoundingClientRect() : frame
    const overParent =
      r.left < p.left - TOL || r.top < p.top - TOL ||
      r.right > p.right + TOL || r.bottom > p.bottom + TOL
    const overFrame =
      r.left < frame.left - TOL || r.top < frame.top - TOL ||
      r.right > frame.right + TOL || r.bottom > frame.bottom + TOL
    if (overParent || overFrame) {
      const id = el.tagName.toLowerCase() +
        (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '')
      bad.push({
        el: id, overParent, overFrame,
        rect: [r.x, r.y, r.width, r.height].map(Math.round),
        parent: [p.x, p.y, p.width, p.height].map(Math.round)
      })
    }
  }
  return bad
}

const diffBoxes = (a, b) => {
  let moved = 0, maxDelta = 0, appeared = 0, gone = 0
  const offenders = []
  for (const k of Object.keys(b)) {
    if (!(k in a)) { appeared++; continue }
    const d = Math.max(Math.abs(a[k][0] - b[k][0]), Math.abs(a[k][1] - b[k][1]))
    if (d > 3) {
      moved++
      if (d > maxDelta) maxDelta = d
      if (offenders.length < 3) offenders.push({ path: k, delta: Math.round(d) })
    }
  }
  for (const k of Object.keys(a)) if (!(k in b)) gone++
  return { moved, maxDelta: Math.round(maxDelta), appeared, gone, offenders }
}

// ---------------------------------------------------------------------- main
/* Same launch strategy as overflow-gate: playwright-core has no bundled
   browser, so drive the system Chrome or Edge via channel. */
async function launch() {
  for (const channel of ['chrome', 'msedge']) {
    try { return await chromium.launch({ channel, headless: !HEADED }) } catch { /* next */ }
  }
  throw new Error('Neither Chrome nor Edge is available for playwright-core.')
}

const t0 = Date.now()
const browser = await launch()
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  ...(VIDEO ? { recordVideo: { dir: VIDEOS, size: { width: 1920, height: 1080 } } } : {})
})
const page = await context.newPage()

const consoleErrors = []
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()) })
page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message))

await page.goto(BASE + '#' + FIRST_SLIDE)
await page.waitForTimeout(1500)

const report = []
const timeline = []
let idx = 0
let prevHash = ''

for (let step = 0; step < MAX_SLIDES; step++) {
  const hash = await page.evaluate(() => window.location.hash.slice(1))
  if (hash === prevHash) break
  prevHash = hash
  idx++
  const nn = String(idx).padStart(2, '0')
  const skip = ONLY.length > 0 && !ONLY.includes(hash)
  const entry = { n: idx, id: hash, actions: [], containment: [], errors: [], skipped: skip }
  timeline.push({ n: idx, id: hash, tMs: Date.now() - t0 })

  if (!skip) {
    try {
    await page.waitForTimeout(SETTLE)
    const errBase = consoleErrors.length
    await page.screenshot({ path: join(SHOTS, `${nn}-${hash}-00-initial.png`) })

    // Deterministic containment on the initial state
    entry.containment = await page.evaluate(fnContainment)

    // Interactive controls inside the slide only (nav/sidebar excluded)
    const controls = await page.evaluate(() => {
      const root = document.querySelector('.tour-slide')
      if (!root) return []
      const list = []
      let i = 0
      for (const el of root.querySelectorAll('button, select, input[type=range], input[type=checkbox]')) {
        const r = el.getBoundingClientRect()
        const visible = r.width > 2 && r.height > 2
        const isExit = el.className && String(el.className).includes('btn-explore')
        if (!visible || isExit) { i++; continue }
        const label = (el.tagName === 'SELECT'
          ? 'select'
          : (el.textContent || el.getAttribute('title') || el.type || 'ctl')).trim().slice(0, 30)
        list.push({ i, tag: el.tagName, type: el.type || '', label })
        i++
      }
      return list
    })

    let actIdx = 0
    let buttons = 0
    for (const ctl of controls) {
      if (ctl.tag === 'BUTTON' && ++buttons > MAX_BUTTONS) continue
      actIdx++
      try {
      const kk = String(actIdx).padStart(2, '0')
      const before = await page.evaluate(fnBoxes)
      const acted = await page.evaluate(({ i, tag, type }) => {
        const root = document.querySelector('.tour-slide')
        const el = root && root.querySelectorAll('button, select, input[type=range], input[type=checkbox]')[i]
        if (!el) return 'gone'
        const fire = (target, val, proto) => {
          const setter = Object.getOwnPropertyDescriptor(proto, 'value').set
          setter.call(target, val)
          target.dispatchEvent(new Event('input', { bubbles: true }))
          target.dispatchEvent(new Event('change', { bubbles: true }))
        }
        if (tag === 'SELECT') {
          const opts = [...el.options]
          const next = opts[(el.selectedIndex + 1) % opts.length]
          fire(el, next.value, HTMLSelectElement.prototype)
          return 'select->' + String(next.textContent).slice(0, 20)
        }
        if (type === 'range') {
          const max = parseFloat(el.max || 100)
          const min = parseFloat(el.min || 0)
          fire(el, String(min + (max - min) * 0.8), HTMLInputElement.prototype)
          return 'range->80%'
        }
        if (type === 'checkbox') { el.click(); return 'toggle' }
        el.click()
        return 'click'
      }, ctl)
      await page.waitForTimeout(AFTER_ACTION)
      const after = await page.evaluate(fnBoxes)
      const shift = diffBoxes(before, after)
      const slug = ctl.label.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20) || ctl.tag.toLowerCase()
      const shot = `${nn}-${hash}-${kk}-${slug}.png`
      await page.screenshot({ path: join(SHOTS, shot) })
      entry.actions.push({ ctl: `${ctl.tag}:${ctl.label}`, did: acted, shift, shot })
      // Containment can break only AFTER an action (async images, relayout)
      const contNow = await page.evaluate(fnContainment)
      for (const c of contNow) entry.containment.push({ ...c, after: `${ctl.tag}:${ctl.label}` })
      } catch (e) {
        entry.actions.push({ ctl: `${ctl.tag}:${ctl.label}`, did: 'CRASH: ' + String(e).slice(0, 120), shift: { moved: 0, maxDelta: 0, appeared: 0, gone: 0, offenders: [] }, shot: '' })
      }
    }

    // Hover pass: titled elements, then canvas hotspots
    const titled = await page.evaluate(() => {
      const root = document.querySelector('.tour-slide')
      if (!root) return []
      return [...root.querySelectorAll('[title]')].slice(0, 12).map((el, j) => {
        const r = el.getBoundingClientRect()
        return { j, x: r.x + r.width / 2, y: r.y + r.height / 2, title: (el.getAttribute('title') || '').slice(0, 40) }
      }).filter(t => t.x > 0 && t.y > 0)
    })
    let hovers = 0
    for (const t of titled) {
      if (++hovers > MAX_HOVER_TITLES) break
      await page.mouse.move(t.x, t.y)
      await page.waitForTimeout(350)
    }
    const canvases = await page.evaluate(() => {
      const root = document.querySelector('.tour-slide')
      if (!root) return []
      return [...root.querySelectorAll('canvas')].slice(0, 2).map(c => {
        const r = c.getBoundingClientRect()
        return { x: r.x, y: r.y, w: r.width, h: r.height }
      })
    })
    let cIdx = 0
    for (const c of canvases) {
      cIdx++
      for (const fx of [0.25, 0.55, 0.8]) {
        await page.mouse.move(c.x + c.w * fx, c.y + c.h * 0.5)
        await page.waitForTimeout(300)
        await page.screenshot({ path: join(SHOTS, `${nn}-${hash}-hover-c${cIdx}-${Math.round(fx * 100)}.png`) })
      }
    }
    await page.mouse.move(5, 540)

    // Late async results (backend images) land after the action wait
    await page.waitForTimeout(1200)
    const contLate = await page.evaluate(fnContainment)
    for (const c of contLate) entry.containment.push({ ...c, after: 'stare-finala' })

    entry.errors = consoleErrors.slice(errBase)
    } catch (e) {
      entry.crash = String(e).slice(0, 250)
    }
  }

  report.push(entry)
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(250)
}

await context.close()
await browser.close()

// ------------------------------------------------------------------- reports
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2))
writeFileSync(join(OUT, 'timeline.json'), JSON.stringify(timeline, null, 2))

const lines = ['# Interaction pass - raport', '', `Base: ${BASE}  |  Slide-uri: ${report.length}  |  Durata: ${Math.round((Date.now() - t0) / 1000)}s`, '']
lines.push('| Nr | Slide | Actiuni | Shift max (px) | Actiuni cu shift | Continere | Erori consola |')
lines.push('|---|---|---|---|---|---|---|')
for (const e of report) {
  if (e.skipped) { lines.push(`| ${e.n} | ${e.id} | - | - | - | - | - |`); continue }
  const maxShift = Math.max(0, ...e.actions.map(a => a.shift.maxDelta))
  const shifty = e.actions.filter(a => a.shift.moved > 0).length
  lines.push(`| ${e.n} | ${e.id} | ${e.actions.length} | ${maxShift} | ${shifty} | ${e.containment.length ? 'PROBLEME ' + e.containment.length : 'ok'} | ${e.errors.length || 'ok'} |`)
}
lines.push('', '## Detalii probleme', '')
for (const e of report) {
  if (e.skipped) continue
  const shifty = e.actions.filter(a => a.shift.moved > 2)
  if (!shifty.length && !e.containment.length && !e.errors.length && !e.crash) continue
  lines.push(`### ${e.n} ${e.id}`)
  if (e.crash) lines.push(`- CRASH: ${e.crash}`)
  for (const a of shifty) lines.push(`- shift la "${a.ctl}" (${a.did}): ${a.shift.moved} elemente mutate, max ${a.shift.maxDelta}px (${a.shot})`)
  const seenCont = new Set()
  for (const c of e.containment) {
    const key = c.el + '|' + (c.after || 'initial')
    if (seenCont.has(key)) continue
    seenCont.add(key)
    if (seenCont.size > 8) { lines.push(`- continere: ... si altele (vezi report.json)`); break }
    lines.push(`- continere${c.after ? ' dupa ' + c.after : ''}: ${c.el} iese din ${c.overFrame ? 'RAMA SLIDE-ULUI' : 'cutia parinte'} - rect ${c.rect.join(',')} vs parinte ${c.parent.join(',')}`)
  }
  for (const err of e.errors.slice(0, 3)) lines.push(`- consola: ${err.slice(0, 140)}`)
  lines.push('')
}
writeFileSync(join(OUT, 'report.md'), lines.join('\n'))
console.log(`interaction-pass: ${report.length} slides, out -> ${OUT}`)
