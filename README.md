# Portfolio

A two-layer portfolio for games, apps, tools and agents.

- Layer 1: home (3D project coverflow, filterable work grid, about, contact)
- Layer 2: one page per project (play, store or repo panel, notes, 3D screens)

Stack: Vite, React, TypeScript, Tailwind v4, Motion, Three.js.

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

## The 3D layer

`src/lib/flow.ts` is a framework-free Three.js coverflow. The hero shows every project;
a project page with two or more `shots` shows them the same way.

- drag, swipe, arrow keys or the arrow buttons to browse
- hover ripples and RGB-splits the cover under the cursor, and the stage leans toward the pointer
- click the front cover to open it
- falls back to static images without WebGL, and turns motion off with `prefers-reduced-motion`
- pauses rendering when off screen or when the tab is hidden

## Deploy

`npm run build` produces a static `dist/` with relative asset paths, so it works from a
domain root or a GitHub Pages sub-path. Routing uses the URL hash, so no server rewrites are needed.
