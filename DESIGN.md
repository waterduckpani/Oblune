# Oblune: design system (draft 10)

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

Draft 10 (2026-10-01): one continuous scroll from day into night, a ribbon that follows you on every page.

1. **Loader** as before; the moon lands in the hero with a half-turn.
2. **Hero.** Headline and the chrome moon. The ribbon is one open stroke (`orbit()` in Ribbon.ts): in from the right, behind the moon across the top, round the left, in front along the bottom, away to the right. No closed ring, so nothing crosses. **The moon is the hero's interaction** (2026-10-02): drag it sideways to turn it through a month (its width is half a month; past full it wanes, drawn mirrored, and the mirror only ever flips at new or full, where the shape is symmetric); arrow keys step an eighth; a press plays a whole month. A soft tick sounds at each eighth, the readout top right (`[data-hero-phase]`) names the phase ("Waning crescent · 34%") and otherwise hints "Drag the moon through its month". A moment after you let go, or at once once you scroll on, it eases back to the logo's phase.
3. **Selected work.** Two-column grid; covers drawn on the stage (bend at most ~18px with the scroll's speed, arrive behind a curved edge, zoom a touch on hover). Each cover is composed for its product in the lab stage (a close-up for Mull, a fanned deck for Bite, a staircase for Haqdar, a paper on a desk for Article, an oversized display for Power & Policy, a mirrored pair for Stocky, a lookbook spread for Viraj; Alfard keeps its terminal), rendered with `tools/covers.mjs` at 2400/1400/800 plus the share card. **Hovering a card shows its phase:** a small ink pill fades up in the cover's lower left with the four phases a project goes through (crescent in development, half prototype, gibbous ready, full live), lit one after another up to the one it has reached, then that phase's name. Keyboard focus shows it too; touch screens rely on the status row. Scroll-driven versions (a terminator sweeping the cover, the cover opening through the emblem) were tried and dropped on 2026-10-04: they read as a black blind. (A sticky gutter dial with a WebGL moon and a bare percentage was cut on 2026-10-04: it looked low-res at that size, vanished abruptly, and nobody could read it.) **Night and day are eclipses:** three discs drawn by `world/Night.ts` (a full-screen quad at the back of the stage, under the covers, line and moon), all centred a little below the screen (x = vw/2, y = 1.15vh): the work's night, the studio's day inside it, and the dusk's night, which keeps the screen to the end. Each grows with the scroll on a spring (rate 9), radius = R × progress², so it starts slow and then takes over; progress runs while its section's top goes from the bottom of the screen to 35% down. The night has stars that drift at 0.12× the scroll and a silver eclipse rim; the day has a dawn haze and its own rim. What a sky takes recedes (the hero grid, the work's words via `--recede`, the whole studio), and what it brings arrives only when wholly inside it (`--arrive` on the work head and the dusk words, opacity on the studio top), so no word ever sits across an edge. `.work` and `.dusk` carry the night tokens (not without WebGL); the nav takes them when its row is inside a night; `data-night` on the root flips only once the dusk has the whole screen. The line comes back in under the lede, runs down the gutter between the columns, and is silver per pixel wherever it is inside a night (`Ribbon.setDiscs`). The old fixed `.sky` crossfade is gone.
4. **Studio.** The ribbon comes back in from the right, makes one wide curve round the right of the title, back under it through the white above the disciplines, down between bio and list, under the list, and down the right margin (the title's height is measured from its box, since its words may still be rising); bio, disciplines, facts, marquee.
5. **Dusk** (`Dusk.astro`, not pinned). "Every product here started as a sliver." The sky turns from day to night across it; the words and the ribbon (ink by day, silver at night) turn with it. Under the words, the moon pays the line off: it waxes from a sliver (a ring) to full as it rises up the screen, with "N% lit" under it, and the ribbon comes down the right side, rings it in front along its bottom, and leaves to the left, down to the contact moon.
6. **Contact** (`Contact.astro`). A letter on paper: blanks to fill (name, the idea, an email) and choices to tap (what you are building, when to start). The chrome moon beside it waxes from a sliver to full as the five parts are completed (the readout says how full, and a caption says what is next); sending plays its phases. The ribbon ends orbiting that moon, the same gesture as the hero.

**The ribbon** (`world/Ribbon.ts`, driven by `RibbonDriver` in `world/stage.ts`): a tube shaded like a printed object (a body lifting toward one soft light, one fine highlight, a faint edge), ink by day and silver at night. It keeps to margins and gutters, crosses pictures but never words, and loops only in open space. Both ends taper like a pen's stroke (over eight radii, to a rounded point), so wherever the drawing has got to it ends in a tip, never a cut. It draws on with the scroll, the first screen's part at once, and the last stretch is squeezed so it is always whole by the bottom of the page. The pointer plucks it.

**Nav:** every project in the menu opens its case study; Home is in the menu.

## Case studies (`/work/<slug>`)

- **Each is a world of its own:** the page takes the product's colour (dark products turn the page dark), and the ribbon follows you in (`case.ts`, thinner tube), drawn like a pen line as you read, never retracting: one long arc falling from the top right through the space beside the name and down the channel between the line and the facts (the right margin when the name is too long), in behind the stage; then a fixed lane right of the widest section label (the labels stick while their section passes, so the lane must clear all of them) and left of the body, swaying a little; a cursive loop (a prolate trochoid) only where sections leave a band of white over 230px, at least 1.2 screens apart; a turn towards the foot to sign off. It goes behind the stage and the screens reel, which are opaque. Phones: only a short swing in from the edge, under the buttons and into the stage. The route is rebuilt 2.6s after mount, once the hero has risen, so nothing is measured mid-reveal.
- **How it works:** the step nearest the middle of the screen is the one on the device (measured every frame, not on fixed trigger lines); a rail of numbered steps under the device shows where you are and jumps; step titles jump too; the device leans a little toward the pointer.
- **Every screen:** a reel of every screen in the product's colour that runs sideways as you scroll down (pinned; height = the track's width), with a counter and a progress line; any screen opens large. Phones: a row you swipe.
- **The code:** a Mac window built from the repo snapshot (its real top-level files, README title and lead, commit count); clicking opens the code browser, which closes with its red light.
- **Next:** "Next case study" set large, with a keep-scrolling progress line, as the next product's colour sweeps in.
- Mull's case study links mullapp.in but shows no captures of it.

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

**Sound** (`src/lib/audio.ts`, synthesised in Web Audio, nothing downloaded). Browsers only let audio begin inside a click, tap or key press (scrolling does not count), so the visit has a door: `lib/enter.ts` asks the browser whether sound may run without one (`getAutoplayPolicy` where it exists; no AudioContext is made just to ask, as making one is a long task at start-up), and if not, asks once. The reverb's impulse is written a slice per task. On a first visit the loader ends with the whole logo and **Enter** beneath it (↵ works; "Enter without sound" is remembered); on any other first page, the same control rests over the page on a blurred veil. If sound already runs, or was turned off before, nothing is asked. a five-voice pad that glides to a chord per section and sinks at night; glass notes on steps; Karplus-Strong plucks on the line; ticks on hover, bells on press, a bloop when the metal gives, air when the island opens or a page changes. **On by default**: browsers only allow audio after a click, tap or key press, so it is armed on arrival and starts with the first gesture (at once in Chrome when you came from this site). A note by the toggle says "Sound starts when you click" until it plays. Turning it off is remembered.

## Architecture

- **Astro 7**, static output. GSAP (ScrollTrigger, SplitText) and Lenis on the GSAP ticker. No pinning plugins: sections pin with CSS `position: sticky`.
- **`src/lib/world/`**: the stage.
  - `World.ts`: one fixed full-screen canvas; one scene in page space (1 unit = 1 CSS px, y up, the page's top at 0) under an orthographic camera that follows the scroll, so everything shares one depth buffer. Draws only when something changed. MSAA on. `warm()` compiles every material, hidden ones included. Draw order: covers (0), ribbon (1), moon (2); depth decides who is in front.
  - `Moon.ts` + `moonGeometry.ts`: the moon as real geometry from the logo's phase maths, polished silver lit by a white sweep with an overhead bank and two rim kickers, and nothing behind the camera (PMREM 1024, roughness 0.035 to 0.045). Panels facing the face reflect as smeared bars and as fans off the crescent tips, because the face is so smooth and the panels lean at the mark's own 24 degrees, so keep that part of the studio empty, the shadow and night glow shaded from the logo's 2D SDF.
  - `Ribbon.ts`, `Cards.ts`: above. Cover textures are ImageBitmaps uploaded one per frame.
  - `/lab/ribbon` is the look-development page for the moon and ribbon; `/lab/stage` renders the covers.
- **Layering:** sky and stage moons (z 0), the canvas (z 1), all text (z 3), grain (z 40), cursor label (z 45), loader (z 50; the canvas lifts to z 55 while it is up).
- **Screens:** `public/work/tex/<project>/*.webp`, all real: native simulator screenshots (Mull, Bite), live captures (Stocky incl. its dashboard via a demo user, Article, mullapp.in, powerpolicy.in, virajmahajan.co), Haqdar re-set at 3× from the bot's messages (`tools/screens/haqdar.html?s=a…e`, serve the repo root to render it; `e` is set from the strings in `bot/main.py`). Phones are 1206×2622 with an iOS status bar (`tools/screens/statusbar.html`, laid over Mull's app screens, and above P&P's pages in the page's colour); desktops are 2880×1888 with a browser toolbar (`tools/screens/toolbar.html?url=…&tint=…`). Each has a half-size `-s` twin. Encode at WebP q88 (full) / q84 (`-s`): lower quality rings around small type.
- **Covers:** `public/work/<slug>-2400.webp` and `-1400.webp` (menu cards, index previews, the stage fallback) and `public/work/share/<slug>.jpg` (1600×1000, the share image). Rendered by `/lab/stage?p=<slug>` on the dev server (the home stage's own `Device`, studio light and full-size screens over the project's colours) at 1200×750 @3, then downsampled.

## Palette and type

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#ecece9` | the page by day; `#0a0a0c` at night (the finale) |
| `--ink` | `#141416` | text and glyphs (the logo's ink) |
| `--ink-2` | `#55565b` | secondary text, about 6:1 |
| `--ink-3` | `#8a8b90` | large or decorative only |

There is no accent colour: chrome is the material and colour comes from the work. Satoshi (variable) is used everywhere. JetBrains Mono is for data only. No em dashes in our copy.

## Performance and access

**Start-up pass (2026-10-02).** Lighthouse, mobile (production build, local): home 79 → 98 (LCP 3.1 → 2.2s, TBT 540 → 80ms), case pages 92 → 98; desktop 100. Long tasks at start-up, CPU throttled 4×: 242 + 277ms → 65 + 73ms. What changed:
- **The menu's thumbnails are made on the first open** (`chrome.ts`, from `data-menu-img`, the 800px cover). Hidden with `visibility`, they sat in the viewport and loaded at high priority with the page, and Lighthouse's LCP counts every high-priority request before it.
- **No AudioContext before the first gesture** (`audio.probe`): `new AudioContext()` alone was a 127ms task, made only to ask whether sound could run. The reverb's impulse is written in slices.
- **The stage is built before the page mounts, a step per task** (`prepareWorld()` in `world/stage.ts`, the router awaits a page's optional `prepare()`): renderer, then the studio light. The word reveals below the first screen and the first ribbon route run in a task of their own after mount.
- Covers come in 800/1400/2400 (`srcset`, and the stage takes the 800 on phones); only the first is eager, and all are `fetchpriority="low"`.
- Gotcha: the `strip-lab` hook in `astro.config.mjs` deletes the lab page's own chunks from `_astro/`; it must match only `stage.astro_*`, or it also deletes `lib/world/stage.ts`'s chunk and the stage never loads in production. And the repo lives on an iCloud-synced Desktop: rebuilding over an existing `dist` can leave conflict copies (`dist/work/tex/mull 2`) and an empty folder in its place, so test builds go to a fresh `--outDir`.

**Draft 9 (2026-10-01).** Presented frames with vsync off (M4, 1512x982 @2, pointer moving, production build): hero ~350 to 400fps, work ~275, studio ~340 to 380, portal ~275, night ~590. A fast wheel scroll through the whole page and back, twice, at @2: 1,151 frames, none over 20ms (median and p99 16.7ms). No console errors on any page (desktop, phone, reduced motion), no sideways scroll.

**Case pages take on the product's colour** (`case.ts` sets `--bg`/`--day` from `data-tint`; dark products switch the ink to night).

**Draft 8 (2026-10-01).** Measured as presented frames with vsync off (M4, 1512x982 @2, pointer moving, production build): hero about 1,000fps (draft 7: 920, and the moon now renders at full resolution while it moves), studio about 900, night about 790, the work stage about 750 once its covers are decoded. Covers are decoded ahead (`img.decode()`) as the stage approaches, so no change of project waits on a picture. The per-chapter WebGL devices, the orbit line and the bead are gone from the home page; the case pages never used WebGL.

**Performance pass (2026-10-01, after the image pass).** The lag was the GPU, not the main thread. Measured as the most frames the machine can present with vsync off (M4, 1512×982 @2, pointer moving): hero 69 → 920fps, chapter stage 345 → 465, index 209 → 427. What changed:
- **The moon is cached** (`EmblemLayer.prepare`/`draw`): it is raymarched into a texture only when its pose, phase, light, droplets, size or a ripple change (60% resolution while moving, one full-resolution pass 0.12s after it settles), and the texture is placed each frame. Its pass runs before anything touches the canvas: on tiled GPUs (Apple, phones) a target switch mid-frame writes the whole canvas out and reads it back.
- **No MSAA on dense screens** (`antialias: devicePixelRatio < 1.5`): the screens, the moon and the line all smooth their own edges, and a multisampled canvas made every render-target switch catastrophic (21fps on the hero).
- **The hero dial** is three stacked SVGs; the ring and the needle turn as whole GPU layers (CSS transform, `will-change`) instead of rewriting an SVG attribute that re-rasterised 72 ticks every frame.
- **Scroll skew** only touches the titles on screen (IntersectionObserver), each on its own layer while it is visible. The cursor writes a transform only when it changed. Hero letter weights move in steps of 6, so a line relays out only on a real change.
- Main thread with the CPU throttled 4×: at most ~7.5ms a frame (home scroll). A rare long frame (one in several fast full-page scrolls, at the bottom of the home page) did not reproduce under tracing; GC pauses stay under 15ms.
- Gotcha: Astro's scoped styles do not reach nodes built in script (the live Gate terminal was unstyled); use `:global()` under the component root. And the CSS minifier keeps only the last of `backdrop-filter`/`-webkit-backdrop-filter`, so the standard property must come last.

**Measured (M4, production build, draft 6):** fast wheel scroll through the whole home page: 2 frames over 20ms in 944 (draft 5: 31), p99 16.8ms (was 33.4). Stage screens load the half-size textures (which cut GPU uploads during a fast scroll from 1.4s to 0.1s); a device drawn larger than 70% of its half-size screen gets the full-size one once the page has been still for 0.2s, uploaded only while still, and released 4s after it leaves the screen. The screen shader samples with a −0.65 LOD bias so small type stays crisp under trilinear filtering. (Draft 8, image pass: the same fast-scroll test now shows 4 long frames near the bottom of the page on the way back up, with the old textures too, so they predate the image changes.) The world lowers its pixel ratio a step (2 → 1.5 → 1.25) if frames keep running long. No console errors on any page, phone or desktop, with or without reduced motion; no sideways scroll.

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
