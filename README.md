# Portfolio

A two-layer portfolio for games, apps, tools and agents, built as a night-time arcade street.

- Layer 1: home. Press start, then scroll down a neon street. Every project is an arcade
  cabinet with its screenshot running on the CRT. Below the street: all games (filterable),
  how I work, achievements, contact.
- Layer 2: one page per project (play, store or repo panel, notes, 3D screens).

Stack: Vite, React, TypeScript, Tailwind v4, Motion, Three.js (with bloom).

```bash
npm install
npm run dev      # http://127.0.0.1:5200
npm run build    # static site in dist/
```

## Make it yours

Everything personal is in two files. No component needs to change.

- `src/data/site.ts`: name, headline, intro, about, email, social links
- `src/data/projects.ts`: one object per project

## Add a project

Drop a cover image in `public/covers/`, then add an entry to `src/data/projects.ts`.
The grid, filters, hero coverflow and project page all update from that one entry.
A project with no `cover` gets a generated one. A project with no `launch` shows
"Link coming soon" until you add one.

`launch` decides what the project page shows:

```ts
// Live web game, playable inside the page
launch: { type: 'web', url: 'https://yourname.itch.io/game/embed', embed: true }

// Web app or game that opens in a new tab (use when the host blocks iframes)
launch: { type: 'web', url: 'https://yourgame.example' }

// Steam store page with Steam's own widget
launch: { type: 'steam', appId: 1234567 }

// GitHub repo, shown as a live card (stars, language, last update)
launch: { type: 'github', repo: 'playtimexd/some-tool' }

// Anything else: itch.io page, App Store, third-party site
launch: { type: 'link', url: 'https://...', label: 'View on itch.io' }
```

`kind` is `game`, `app`, `tool` or `agent`. The home filters are built from whichever
kinds exist, so a new kind of project adds its own chip.

## The arcade

`src/lib/arcade.ts` is a framework-free Three.js scene. Scroll position drives a camera
dolly down the street: stop 0 is the entrance, stop N is cabinet N.

- one cabinet per project, built from the data. A final "next game" cabinet is always
  there, so the street never looks finished (copy lives in `site.nextGame`)
- each CRT shows the project's cover, with attract-mode drift when idle and a ripple under
  the cursor when it is the active cabinet
- click the active cabinet to open it, click another to travel to it
- arrow keys left and right, Enter to open, and a gamepad (d-pad, A) also work
- `3D on/off` and `Sound on/off` sit in the nav. Sound is synthesized, no audio files
- the boot screen's progress bar is real: it counts the covers, font and 3D chunk loading
- it drops bloom and rain by itself on a slow machine, and falls back to a flat layout
  without WebGL or with reduced motion
- the site is dark only on purpose: every surface is a lit screen on a night street

Project pages with two or more `shots` use `src/lib/flow.ts`, a smaller 3D coverflow.

## Deploy

`npm run build` produces a static `dist/` with relative asset paths, so it works from a
domain root or a GitHub Pages sub-path. Routing uses the URL hash, so no server rewrites are needed.
