# Oblune: design system (draft 7)

The site for oblunestudio.com, the one-person studio of Bharat Khanna. It is built to Awwwards Site of the Year standard.

## The idea: phases

The Oblune mark is a disc with a crescent cut out. It works as the "O" and as a moon (*lune*). The crescent is one phase in a continuous family, so the mark doubles as a status system, and the whole page is one lunar journey:

| Phase | Illumination | Meaning | Projects |
| --- | --- | --- | --- |
| Crescent | 0.3 | In development | Stocky |
| Half | 0.5 | Prototype | Haqdar |
| Gibbous | 0.8 | Waiting on the App Store | Bite, Mull |
| Full | 1.0 | Live | Alfard, Article |

The logo sits at 0.75. `src/lib/phase.ts` holds the geometry, and every moon on the site uses it: favicon, glyphs, nav, orbit bead, shader.

## The work, by kind

Eight projects in four categories, in this order on the home page (`src/data/projects.ts` holds all copy and case-study content):

| Category | Projects | Context |
| --- | --- | --- |
| Apps | Mull, Bite | Own products |
| AI | Alfard, Haqdar | Alfard is open source (MIT); Haqdar was a finalist at the USAII Global AI Hackathon 2026 |
| Web | Article, Power & Policy, Stocky | Own products; Power & Policy co-founded (team of two, I built all of it) |
| E-commerce | Viraj Mahajan | Client work: virajmahajan.co on Shopify Horizon, Razorpay, Judge.me |

The moon still marks status (crescent in development, full is live); the category is what the page is organised by.

## The home page (top to bottom)

1. **Loader.** Five droplets of mercury merge into the chrome emblem, "blune" arrives, the logo splits: letters FLIP into the nav, the moon flies to the hero. No choice to make. Once seen in a session (`sessionStorage oblune:seen`), the page comes straight in (`html.quick`). The hero headline is painted under the loader from the first frame, so LCP is the first paint (about 70ms).
2. **Hero.** Headline beside the chrome moon in its phase dial.
3. **Index** (pinned). "Eight projects, four kinds of work": the moon with its "% lit" readout beneath it (inside the left half, so it never meets the list), category chips (hover lights a category's rows, click jumps to it), eight rows whose rules draw themselves in. Hovering a row sweeps it in the project's own colour from the left and floats a still of the work at its end.
4. **Category bands** (`CategoryBand.astro`) before each group: a giant italic word struck in steel, whose highlight travels with the scroll, the category's line, and its projects.
5. **Chapters.** Status and context badge, the giant name (links to the case study), CTAs: Read the case study, the live product, Browse the code (opens the repo window). The steps scroll beside a lit sphere in the product's colour (a soft shadow slides away as it waxes) with the WebGL devices in front. Each ends with "The whole story".
6. **Practice.** "One person, the whole product": a steel moon (SVG, sticky) fills by quarters as the line passes each discipline (25, 50, 75, 100%), with an arc per quarter and the readout; each discipline links to the projects that show it. No floating previews.
7. **Night.** The dusk line, the moon, the sentence brief (now with "a website" and "an online store").

## Case studies (`/work/<slug>`)

Built from the same data, without three.js. **One grid for every section**: its number and label sit in the left three columns and stay pinned while you read; the content takes the other nine. The gap between sections is one value (`--gap`), so spacing never drifts.

1. **Hero:** name, line, status, context, timeline, role, stack, CTAs.
2. **Stage:** full bleed in the product's colour (CSS devices at different depths, parallax and pointer tilt).
3. **In numbers:** two to four real, checkable facts (scale, speed or reach), each with its source in mono under it, counting up on first sight. No slogans dressed as numbers.
4. **The brief**, **How it works** (sticky device over a soft moon in the product's colour, the real screen per step; Alfard's is the gate terminal you answer), **Decisions**, **The system** (a line runs down the pipeline with the bead, each part lighting as it arrives).
5. **Every screen:** a tilted wall of every screen in the product's colour; its columns drift against each other as you pass, the plane leans toward the pointer, and any screen opens large from where it sat.
6. **Live, right here** (Article only), **The code** (the repo browser inline, behind a shield: the page keeps the wheel until you click "Click to explore the code", and takes it back when the pointer leaves), **Where it is now** (status, outcome, CTAs), a one-line foot.
7. **Next:** the page becomes the next case study. A pinned panel shows its line and name; as you keep scrolling, its colour sweeps in like the terminator and the ring fills. At the end the curtain takes over in exactly that state (`curtain.hold`) and the page swaps beneath it, so the hand-over cannot be seen. Arriving at the bottom by the back button never triggers it; only scrolling down into it does.

## The code browser (`src/lib/repo/`)

Any `[data-repo-open]` opens that repo in a graphite window that grows out of the button; `[data-repo-inline]` hosts one in the page. README (rendered at build), the tree, files fetched live from raw.githubusercontent.com and highlighted with Shiki (JavaScript engine, a theme from the site's palette, one grammar loaded per language on first use), commits, a ⌘K / T / `/` go-to-file finder, arrow keys through the tree, and links like `#code/mull/lib/core/money.dart:L12`.

- Snapshots live in `src/data/repos/<slug>.json`. Refresh with `node tools/snapshot-repos.mjs` (5 API calls a repo; set `GITHUB_TOKEN` to lift the 60-an-hour limit).
- On open, the browser asks GitHub once whether anything moved; if so it catches up (commits and tree). If the API refuses, it says it is showing the snapshot.
- Nothing of it loads until first use (about 62KB gzipped, plus about 15KB per grammar).

## Page to page

**The site never reloads.** `src/lib/router.ts` fetches the next page (prefetched on hover, focus or touch), covers the screen with the curtain, unmounts the old page (`Scope.kill()`: every listener, ticker callback, observer, tween and ScrollTrigger it made), swaps `[data-view]` and the page's styles, mounts the new page and lifts the curtain. Back and forward restore your scroll position. Anything that fails falls back to a normal page load.

- **What persists** (in `Base.astro`, outside the view): the nav and island, the curtain, the code and live windows, the grain, the cursor label, the WebGL canvas, Lenis, and the sound. So the music never stops between pages.
- **The curtain** (`Curtain.astro`, `lib/curtain.ts`): night crosses the screen as the terminator crosses the moon (a clip-path ellipse, in from the right, out to the left), carrying the destination's name, a kicker (`Case study · Web · 06 / 08`) and a moon that waxes to its phase. The names come from a routes table rendered in `Base.astro`.
- **In-page jumps** (menu, chips, table of contents): near targets glide with Lenis; anything more than 1.6 screens away crosses under a quicker curtain instead of racing through the page.
- **Pages** are modules with `mount(ctx) → { destroy, target, intro }` (`scripts/home.ts`, `scripts/case.ts`); `scripts/app.ts` boots once per visit. The World, the line and the bead are made on the first visit home and reused on every return (stages rebind to the new DOM, so shaders never recompile).

**Navigation:** one 44px row, every item centred 38px from the top: the wordmark (folds into its moon further down), the island, the sound toggle, and **Work with me**. A fade of the page colour sits behind the nav once you are past the hero, so copy never runs under it.
- The island shows where you are (moon at the section's phase inside a scroll ring) and, in a chapter, a separate light **Case study** pill with its own arrow disc, split from the label by a hairline. On case pages the pill opens the live site in the live window.
- The menu is a two-column panel: all eight projects (number, phase glyph, name, category) and Studio links on the left; on the right a card that shows the hovered project's still (whole, at its 16:10, on the day surface), line and status (or the studio card with New Delhi's time). On home, projects jump to their chapters; elsewhere they open case studies.

**Live window** (`LiveDialog.astro`, `lib/live.ts`): live products that allow framing (articlenews.co) open running in a browser window over the page, with Desktop/Phone and reload. Sites that refuse (mullapp.in, powerpolicy.in, virajmahajan.co send `X-Frame-Options: DENY`) are never shown as captures: their links open the real site in a new tab. Set `embed: true` on a project once its site allows `frame-ancestors https://oblunestudio.com` and its links open the window instead.

**Cursor** (`lib/cursor.ts`, fine pointers only): an ink dot exactly at the pointer and a ring on an underdamped spring that stretches along its motion, both in `difference` so they read by day, at night and over the work's colours. Over anything pressable the ring swells and fills, waxing in from the right; over `data-cursor` it becomes a word pill (Open, View, Next…) beside the pointer; text fields get the native caret; frames (a live site) hide it.

**Micro-interactions:** buttons fill with a curved terminator edge from the side the pointer entered; labels ripple a wave of font weight through their letters; magnetic CTAs; a contextual cursor label.

**Sound** (`src/lib/audio.ts`, synthesised in Web Audio, nothing downloaded). Browsers only let audio begin inside a click, tap or key press (scrolling does not count), so the visit has a door: `lib/enter.ts` probes whether the AudioContext runs without one, and if not, asks once. On a first visit the loader ends with the whole logo and **Enter** beneath it (↵ works; "Enter without sound" is remembered); on any other first page, the same control rests over the page on a blurred veil. If sound already runs, or was turned off before, nothing is asked. a five-voice pad that glides to a chord per section and sinks at night; glass notes on steps; Karplus-Strong plucks on the line; ticks on hover, bells on press, a bloop when the metal gives, air when the island opens or a page changes. **On by default**: browsers only allow audio after a click, tap or key press, so it is armed on arrival and starts with the first gesture (at once in Chrome when you came from this site). A note by the toggle says "Sound starts when you click" until it plays. Turning it off is remembered.

## Architecture

- **Astro 7**, static output. GSAP (ScrollTrigger, SplitText) and Lenis on the GSAP ticker. No pinning plugins: sections pin with CSS `position: sticky`.
- **`src/lib/world/`**: one persistent WebGL canvas behind the page (`World.ts`); 1 world unit = 1 CSS px, so 3D locks onto DOM slots.
  - `EmblemLayer.ts`: the moon, a raymarched SDF in one fragment shader (phase, tilt, ripples, six mercury droplets, day shadow or night glow).
  - `devices.ts`: phones at iPhone 17 Pro screen proportions (1206×2622), plates at 2880×1888; the screen shader does rounded corners, the island cutout, push / rise / fade transitions, tall-capture scrolling and a glass sheen.
  - `chapters.ts`: one choreography per project: a pose, scale and screen per step, eased by critically damped springs; each stage is scissored to its chapter's body column.
  - `line.ts`: the anti-aliased, pluckable ribbon for the orbit line (2.2px drawn, 3px ghost dots), whose tip bends toward the bead; and `Bead`, the ink drop at the head.
- **The orbit line** (`src/lib/orbitPath.ts`): on desktop it wanders. From the index moon it swings across the page, makes a pen flourish in the open space above each category, runs down the gutter and draws the category's rule, stopping right above the next chapter's moon so it drops into the gap beside the copy; it loops each chapter's moon, runs through the steps, and swings across the gap to the next chapter (with a flourish every other time). Every px of line costs at least 0.36px of scroll, so the head can never draw faster than 2.8px per px scrolled (loops and sideways runs used to be squeezed into a few px of scroll, which read as dashes). The schedule is the one closest to "level with 60% of the screen" that keeps that promise (a late-leaning blend of the earliest and latest valid schedules, smoothed over 240px of line), kept between 16% and 88% of the screen wherever the pace allows. On top of that, the drawn head follows the scroll on a short spring with a top speed, and snaps only on jumps under the curtain. On phones it keeps to the gutter.
- **The bead** replaces the emblem at the head: the moon shrinks into it after the index and swells back out of it at the footer. It follows the head on an underdamped spring (it lags on turns and settles with a wobble), stretches along its motion, breathes a faint halo, sends a ring out at each step, is drawn toward the pointer within 120px (the line's tip follows it) and plucks the line when let go; clicking it makes it jump.
- **Layering:** sky and stage moons (z 0), the canvas (z 1), all text (z 3), grain (z 40), cursor label (z 45), loader (z 50; the canvas lifts to z 55 while it is up).
- **Screens:** `public/work/tex/<project>/*.webp`, all real: native simulator screenshots (Mull, Bite), live captures (Stocky incl. its dashboard via a demo user, Article, mullapp.in), Haqdar re-set at 3× from the bot's messages (`tools/screens/haqdar.html`, serve the repo root to render it).

## Palette and type

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#ecece9` | the page by day; `#0a0a0c` at night (the finale) |
| `--ink` | `#141416` | text and glyphs (the logo's ink) |
| `--ink-2` | `#55565b` | secondary text, about 6:1 |
| `--ink-3` | `#8a8b90` | large or decorative only |

There is no accent colour: chrome is the material and colour comes from the work. Satoshi (variable) is used everywhere. JetBrains Mono is for data only. No em dashes in our copy.

## Performance and access

**Measured (M4, production build, draft 6):** fast wheel scroll through the whole home page: 2 frames over 20ms in 944 (draft 5: 31), p99 16.8ms (was 33.4). Stage screens now use the half-size textures (a device is never drawn wider than about 1,400 device px), which cut GPU uploads during a fast scroll from 1.4s to 0.1s. The world lowers its pixel ratio a step (2 → 1.5 → 1.25) if frames keep running long. No console errors on any page, phone or desktop, with or without reduced motion; no sideways scroll.

**Draft 5:** home 60fps through the whole scroll (median 16.7ms, p95 16.8ms), case pages the same; LCP about 70ms on the home page and case pages, desktop and phone; no console errors with or without reduced motion; one h1 per page; every control named; no sideways scroll.

**Earlier (draft 3):** 60fps through the whole scroll (median and p99 16.8ms, about 10 frames over 20ms in 4,000). Earlier draft 2 numbers:
- 60fps while scrolling every section.
- Frame cost under 1ms on average.
- Page parsed at about 130ms.
- Moon shader compiled at about 0.4s.
- About 209KB of gzipped JS.

**Reduced motion:**
- No loader, and the moon is static.
- Devices settle in place, and only their screens change.
- The line is drawn in full and steps still activate by position; no droplet, no grain drift.

**Without WebGL:** stills and the SVG emblem.

**Accessibility:**
- One h1 and ordered headings, with names on every control.
- The kinetic headline keeps an `aria-label`.
- The copy confirmation is announced.
- The skip link and focus rings are kept.
