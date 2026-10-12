# Portfolio

A two-layer portfolio for games, apps, tools and agents.

- Layer 1: home. One screen, nothing but a row of floating game cartridges. A hidden sidebar
  (the Menu button) holds the game list, a short about and contact.
- Layer 2: one page per project (play, store or repo panel, notes, 3D screens).

The sidebar is a drawer over the page, not another page, so the site stays two layers deep.

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

## The cartridges

`src/lib/cartridges.ts` builds the scene, `src/components/Cartridges.tsx` is the page.

- one cartridge per project, with its cover as the label, and one blank cartridge at the end
  for the next game (copy in `site.nextGame`)
- move the mouse: the row drifts if it is wider than the screen, the cartridge under the
  cursor lifts and tilts toward it
- click it: the camera moves into the label and the project opens
- on touch: drag the row, tap once to select, tap again to open
- the label under the row is a real link, and Left, Right and Enter work from the keyboard
- no WebGL or reduced motion: the 3D row is replaced by a plain headline and a grid of covers

Project pages with two or more `shots` use `src/lib/flow.ts`, a smaller 3D coverflow.

In dev, `window.__CARTS__.advance(seconds)` runs frames without animation frames, for tests in
a hidden tab. It is removed from production builds.

## Deploy

`npm run build` produces a static `dist/` with relative asset paths, so it works from a
domain root or a GitHub Pages sub-path. Routing uses the URL hash, so no server rewrites are needed.
