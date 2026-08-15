// overflow-gate: nothing clipped, nothing outside the frame, on any slide of the tour.
//
// Walks every tour slide (ArrowRight until the hash stops changing) and reports, per slide:
//   pageScroll - the document itself scrolls (content taller/wider than the viewport)
//   outOfFrame - visible atomic elements with a bounding box outside the viewport
//   innerScroll - elements whose content is clipped or scrollable (scrollHeight > clientHeight)
//   overlaps   - pairs of visible atomic elements that intersect (no ancestor relation)
//   occludedControls - buttons/inputs whose center hit-tests to an unrelated element (z-order)
//   smallMath  - rendered KaTeX below the legibility floor (17px inline, 22px display, design px)
//   rawTokens  - $...$ or [cite:...] markup visible on screen (string skipped shared/richText)
//   duplicateTitles - an embedded view prints a heading on top of the shell's slide title
//   consoleErrors - JS console errors / page errors raised while the slide was active
//
// Usage: npm run gate -- [--base <url>] [--out <dir>] [--viewport WxH] [--headed] [--shots]
// Defaults: --base http://localhost:3000/  --out ./out/overflow-gate  --viewport 1920x1080
// Exit codes: 0 = clean, 1 = findings, 2 = runner error.
//
// --shots writes <out>/shots/NN-<id>.png, one per slide. The DOM checks below cannot see
// anything drawn inside a canvas, so those frames still have to be read by a human.
//
// Scope: DOM only. Overlaps drawn INSIDE a canvas or an SVG (axis labels etc.) are invisible
// to this gate and must be checked visually on screenshots. Canvas and svg plots are excluded
// from overlap pairs - an HTML caption laid over a plot is a legitimate pattern - but both
// still count for outOfFrame.
// KaTeX subtrees are excluded from overlap pairs (internally absolutely-positioned).

import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
function argValue(flag, fallback)
{
    const i = args.indexOf(flag);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const BASE = argValue('--base', 'http://localhost:3000/');
const OUT_DIR = resolve(argValue('--out', new URL('./out/overflow-gate', import.meta.url).pathname.replace(/^\/(\w:)/, '$1')));
const [VW, VH] = argValue('--viewport', '1920x1080').split('x').map(Number);
const HEADED = args.includes('--headed');
const SHOTS = args.includes('--shots');
const MAX_SLIDES = 80;
const FIRST_SLIDE = '#intro-title';

async function launch()
{
    for (const channel of ['chrome', 'msedge'])
    {
        try
        {
            return await chromium.launch({ channel, headless: !HEADED });
        }
        catch { /* try next channel */ }
    }
    throw new Error('Neither Chrome nor Edge is available for playwright-core.');
}

// Runs in the page. Returns the findings object for the currently shown slide.
function inspectSlide()
{
    const TOL = 2;          // px tolerance for out-of-frame
    const SCROLL_TOL = 4;   // px tolerance for clipped content
    const OVERLAP_MIN = 6;  // px minimum intersection on both axes
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const root = document.querySelector('.tour-fullscreen') || document.body;

    const describe = (el) =>
    {
        const tag = el.tagName.toLowerCase();
        const cls = el.classList.length ? '.' + [...el.classList].slice(0, 2).join('.') : '';
        const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
        return `${tag}${cls}${text ? ` "${text}"` : ''}`;
    };

    const visible = (el) =>
    {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility !== 'visible' || parseFloat(cs.opacity) < 0.05) return false;
        const r = el.getBoundingClientRect();
        return r.width > 1 && r.height > 1;
    };

    const hasDirectText = (el) =>
        [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);

    const ATOMIC_TAGS = new Set(['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'IMG', 'svg', 'LABEL', 'CANVAS']);

    const all = [...root.querySelectorAll('*')].filter((el) =>
    {
        if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') return false; // svg internals
        if (el.closest('.katex')) return false;                                    // KaTeX internals
        if (el.getAttribute('aria-hidden') === 'true') return false;
        return visible(el);
    });

    const atomic = all.filter((el) => ATOMIC_TAGS.has(el.tagName) || ATOMIC_TAGS.has(el.tagName.toLowerCase()) || hasDirectText(el));

    const outOfFrame = [];
    for (const el of atomic)
    {
        const r = el.getBoundingClientRect();
        if (r.left < -TOL || r.top < -TOL || r.right > vw + TOL || r.bottom > vh + TOL)
        {
            outOfFrame.push({ el: describe(el), rect: [r.left, r.top, r.right, r.bottom].map(Math.round) });
        }
    }

    const innerScroll = [];
    for (const el of all)
    {
        const clippedY = el.scrollHeight > el.clientHeight + SCROLL_TOL;
        const clippedX = el.scrollWidth > el.clientWidth + SCROLL_TOL;
        if ((clippedY || clippedX) && el.clientHeight > 0)
        {
            const cs = getComputedStyle(el);
            if (cs.overflowY !== 'visible' || cs.overflowX !== 'visible')
            {
                innerScroll.push({
                    el: describe(el),
                    scroll: [el.scrollWidth, el.scrollHeight],
                    client: [el.clientWidth, el.clientHeight],
                    overflow: `${cs.overflowX}/${cs.overflowY}`,
                });
            }
        }
    }

    const PLOT_TAGS = new Set(['CANVAS', 'svg']);
    const overlapCandidates = atomic.filter((el) => !PLOT_TAGS.has(el.tagName));

    // Inline-flow siblings inside the SAME block cannot visually collide: the
    // browser lays their line boxes sequentially, but a wrapped inline span's
    // bounding rect covers every line it touches, so rect intersection between
    // such siblings is a false positive (e.g. multi-line bibliography entries).
    // Different blocks keep the full check.
    const blockOf = (el) =>
    {
        let p = el.parentElement;
        while (p && getComputedStyle(p).display === 'inline') p = p.parentElement;
        return p;
    };
    const flowMeta = new Map();
    for (const el of overlapCandidates)
    {
        const inline = getComputedStyle(el).display === 'inline';
        flowMeta.set(el, { inline, block: inline ? blockOf(el) : null });
    }

    const overlaps = [];
    for (let i = 0; i < overlapCandidates.length && overlaps.length < 20; i++)
    {
        const a = overlapCandidates[i];
        const ra = a.getBoundingClientRect();
        for (let j = i + 1; j < overlapCandidates.length && overlaps.length < 20; j++)
        {
            const b = overlapCandidates[j];
            if (a.contains(b) || b.contains(a)) continue;
            const ma = flowMeta.get(a);
            const mb = flowMeta.get(b);
            if (ma.inline && mb.inline && ma.block === mb.block) continue;
            const rb = b.getBoundingClientRect();
            const ix = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
            const iy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
            if (ix >= OVERLAP_MIN && iy >= OVERLAP_MIN)
            {
                overlaps.push({ a: describe(a), b: describe(b), intersection: [Math.round(ix), Math.round(iy)] });
            }
        }
    }

    // A control whose center point hit-tests to an unrelated element is occluded (z-order),
    // which bounding-box overlap misses when the occluder is an excluded tag such as canvas.
    const CONTROL_TAGS = new Set(['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL']);
    const occludedControls = [];
    for (const el of atomic)
    {
        if (!CONTROL_TAGS.has(el.tagName)) continue;
        const r = el.getBoundingClientRect();
        const cx = Math.min(Math.max(r.left + r.width / 2, 0), vw - 1);
        // Probe near-top, middle and near-bottom: partially hidden controls fail one probe.
        for (const fy of [0.15, 0.5, 0.85])
        {
            const cy = Math.min(Math.max(r.top + r.height * fy, 0), vh - 1);
            const hit = document.elementFromPoint(cx, cy);
            if (hit && hit !== el && !el.contains(hit) && !hit.contains(el))
            {
                occludedControls.push({ el: describe(el), by: describe(hit), probeY: fy });
                break;
            }
        }
    }

    // The slide title lives in the tour metadata and the shell renders it. A view
    // that also prints its own heading puts two titles on one slide.
    const duplicateTitles = [];
    const embed = root.querySelector('.slide-embed');
    if (embed)
    {
        const shellTitle = embed.querySelector('.embed-header h1')?.textContent?.trim() || '';
        const wrapper = embed.querySelector('.embed-wrapper');
        const wrapperBox = wrapper ? wrapper.getBoundingClientRect() : null;
        for (const own of embed.querySelectorAll('.embed-wrapper h1, .embed-wrapper h2'))
        {
            if (!wrapperBox || !visible(own)) continue;
            const box = own.getBoundingClientRect();
            // A page title sits at the top AND runs across the view. A heading
            // that is near the top but only as wide as one column is a panel
            // label, which is legitimate.
            if (box.top - wrapperBox.top < 60 && box.width > wrapperBox.width * 0.35)
            {
                duplicateTitles.push({ shell: shellTitle, own: own.textContent.trim().slice(0, 50) });
            }
        }
    }

    // A $...$ or [cite:...] token that reaches the screen means the string was
    // rendered raw instead of through shared/richText, so the reader sees the
    // markup instead of the formula.
    const RAW_TOKEN = /\$[^$\n]{1,80}\$|\[cite:[a-z0-9, ]+\]/;
    const rawTokens = [];
    for (const el of all)
    {
        for (const node of el.childNodes)
        {
            if (node.nodeType === 3 && RAW_TOKEN.test(node.textContent))
            {
                rawTokens.push({ el: describe(el), text: node.textContent.trim().slice(0, 70) });
                break;
            }
        }
    }

    // Legibility floor for rendered math. Computed font-size is in design pixels (the
    // stage scales with a CSS transform, which leaves computed styles alone), so the two
    // thresholds are read directly. Display math carries the formula a reader decodes from
    // the back of the room and gets the higher floor.
    const MATH_FLOOR_INLINE = 17;
    const MATH_FLOOR_DISPLAY = 22;
    const smallMath = [];
    for (const k of root.querySelectorAll('.katex'))
    {
        if (k.closest('.katex-html') || !visible(k)) continue;
        const display = !!k.parentElement?.classList.contains('katex-display');
        const size = parseFloat(getComputedStyle(k).fontSize);
        const floor = display ? MATH_FLOOR_DISPLAY : MATH_FLOOR_INLINE;
        if (size + 0.5 < floor)
        {
            smallMath.push({ el: describe(k), size: Math.round(size * 10) / 10, floor, display });
        }
    }

    // The tour is a fixed overlay; the app body below it scrolls but is invisible (overflow:
    // hidden). Only the tour root itself (or the document when there is no tour) may not scroll.
    // With the fixed design surface the meaningful subject is the stage: its layout box is
    // 1440x810 whatever the window does, so a window shorter than 810 would otherwise make the
    // tour root look permanently overflowing.
    const stage = document.querySelector('.tour-stage');
    const scroller = stage || (root === document.body ? document.scrollingElement : root);
    const pageScroll = scroller.scrollHeight > scroller.clientHeight + SCROLL_TOL
        || scroller.scrollWidth > scroller.clientWidth + SCROLL_TOL;

    return { pageScroll, outOfFrame, innerScroll, overlaps, occludedControls, smallMath, rawTokens, duplicateTitles };
}

async function settle(page)
{
    await page.waitForTimeout(500);
    try { await page.waitForLoadState('networkidle', { timeout: 3000 }); } catch { /* keep going */ }
    await page.waitForTimeout(700);
}

async function main()
{
    mkdirSync(OUT_DIR, { recursive: true });
    const shotsDir = resolve(OUT_DIR, 'shots');
    if (SHOTS) mkdirSync(shotsDir, { recursive: true });
    const browser = await launch();
    const page = await browser.newPage({ viewport: { width: VW, height: VH } });

    let consoleErrors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 300)); });
    page.on('pageerror', (err) => consoleErrors.push(String(err).slice(0, 300)));

    await page.goto(BASE + FIRST_SLIDE, { waitUntil: 'domcontentloaded' });
    await settle(page);
    await page.waitForTimeout(1000); // fonts + first API round

    const slides = [];
    for (let i = 0; i < MAX_SLIDES; i++)
    {
        const hash = await page.evaluate(() => window.location.hash);
        consoleErrors = [];
        await settle(page);
        const findings = await page.evaluate(inspectSlide);
        findings.consoleErrors = [...new Set(consoleErrors)];
        const id = hash.replace('#', '');
        slides.push({ index: i + 1, id, ...findings });

        if (SHOTS)
        {
            await page.screenshot({ path: resolve(shotsDir, `${String(i + 1).padStart(2, '0')}-${id}.png`) });
        }

        const counts = ['outOfFrame', 'innerScroll', 'overlaps', 'occludedControls', 'smallMath', 'rawTokens', 'duplicateTitles', 'consoleErrors']
            .map((k) => `${k}:${findings[k].length}`).join(' ');
        console.log(`${String(i + 1).padStart(2)} ${hash.padEnd(24)} pageScroll:${findings.pageScroll ? 'YES' : 'no'} ${counts}`);

        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(350);
        const next = await page.evaluate(() => window.location.hash);
        if (next === hash) break;
    }

    await browser.close();

    const dirty = slides.filter((s) =>
        s.pageScroll || s.outOfFrame.length || s.innerScroll.length || s.overlaps.length
        || s.occludedControls.length || s.smallMath.length || s.rawTokens.length || s.duplicateTitles.length || s.consoleErrors.length);

    writeFileSync(resolve(OUT_DIR, 'gate-results.json'), JSON.stringify({ base: BASE, viewport: `${VW}x${VH}`, slides }, null, 2));

    const lines = [`# Overflow gate - ${BASE} @ ${VW}x${VH}`, '', `Slides: ${slides.length}, with findings: ${dirty.length}`, ''];
    for (const s of dirty)
    {
        lines.push(`## ${s.index}. #${s.id}`);
        if (s.pageScroll) lines.push('- pageScroll: document scrolls');
        for (const o of s.outOfFrame) lines.push(`- outOfFrame: ${o.el} rect=[${o.rect}]`);
        for (const o of s.innerScroll) lines.push(`- innerScroll: ${o.el} scroll=${o.scroll} client=${o.client} overflow=${o.overflow}`);
        for (const o of s.overlaps) lines.push(`- overlap: ${o.a} X ${o.b} ix=${o.intersection}`);
        for (const o of s.occludedControls) lines.push(`- occludedControl: ${o.el} hidden by ${o.by}`);
        for (const o of s.smallMath) lines.push(`- smallMath: ${o.el} ${o.size}px design (floor ${o.floor}, ${o.display ? 'display' : 'inline'})`);
        for (const o of s.rawTokens) lines.push(`- rawToken: ${o.el} shows markup "${o.text}"`);
        for (const o of s.duplicateTitles) lines.push(`- duplicateTitle: shell "${o.shell}" plus view heading "${o.own}"`);
        for (const e of s.consoleErrors) lines.push(`- consoleError: ${e}`);
        lines.push('');
    }
    writeFileSync(resolve(OUT_DIR, 'gate-report.md'), lines.join('\n'));

    console.log(`\n${dirty.length ? 'FINDINGS on ' + dirty.length + ' slide(s)' : 'CLEAN'} -> ${OUT_DIR}`);
    process.exit(dirty.length ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(2); });
