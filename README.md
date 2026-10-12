# Portfolio

A two-layer portfolio for games, apps, tools and agents, built as a strategy-game command screen.

- Layer 1: home. A 3D campaign map: one base per project standing in a hex canyon, on a
  supply line that runs into unexplored fog. Below the map: all games (filterable),
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

## The campaign map

`src/lib/world.ts` is a framework-free Three.js scene and `src/lib/layout.ts` decides where
each base stands (x is time, z is the lane for its kind). The HUD is plain React in
`src/components/Command.tsx`.

- one base per project, built from the data. The tower shape says what it is: hex tower for
  a game, block for an app, prism for a tool, core for an agent
- a final "next game" base always sits at the edge of unexplored territory, so the map never
  looks finished (copy lives in `site.nextGame`)
- low cinematic camera with pointer parallax and a field-of-view punch when you select
- drag to orbit, right-drag to pan, ctrl + wheel or the +/- buttons to zoom. The plain wheel
  is left alone so the page still scrolls
- click a base to select it, click it again (or press Q or Enter) to open the project
- HUD: radar minimap, roster with number hotkeys, selection panel, command card
  (Q open, W launch, E overview, A previous, S next), and gamepad (d-pad, A, B)
- `Map 3D/2D` and `Sound` toggles in the nav. Sound is synthesized, no audio files
- it drops bloom and dust by itself on a slow machine, and falls back to a 2D layout
  without WebGL or with reduced motion
- the site is dark only on purpose: the whole thing is a tactical screen

Project pages with two or more `shots` use `src/lib/flow.ts`, a smaller 3D coverflow.

## Deploy

`npm run build` produces a static `dist/` with relative asset paths, so it works from a
domain root or a GitHub Pages sub-path. Routing uses the URL hash, so no server rewrites are needed.
