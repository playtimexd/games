# Portfolio

A two-layer portfolio for games, apps, tools and agents, built as a 3D game room you can play.

- Layer 1: home. A small game room at night with a cartridge shelf, a console and CRT TV,
  and a pinball machine you can actually play. Below it: all games (filterable), how I work,
  achievements, contact.
- Layer 2: one page per project (play, store or repo panel, notes, 3D screens).

Stack: Vite, React, TypeScript, Tailwind v4, Motion, Three.js (with bloom and shadows).

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

## The game room

`src/lib/den.ts` builds the room and runs the cameras. `src/lib/pinball.ts` is the physics,
pure 2D with no rendering, so it runs headless. The HUD is `src/components/Den.tsx`.

Three stations, with cinematic cuts between them (keys 1, 2, 3 or the tabs):

- **Room**: the whole room. Click the pinball machine to play or the shelf to browse.
- **Browse**: one cartridge per project on the shelf. Click one to select it, click it again
  (or press Enter) and it flies into the console, the TV switches on and the project opens.
- **Play**: the pinball table. Each project is a target with its cover on it. Hit it and the
  project is selected, with its title on the backbox display and its art on the TV. Roll the
  ball into the hole to open the selected project.

Controls on the table: hold Space to charge and release to launch, Z and / (or the arrow keys)
for the flippers, and on a phone the Left, Launch and Right buttons. A gamepad works too.

How it scales:

- a new project adds a cartridge and, up to 10, a pinball target. The last cartridge is always
  an empty one for the next game (copy in `site.nextGame`)
- the shelf grows by rows. Past 10 projects the table keeps the first 10 and Browse has all of them
- `Map 3D/2D` and `Sound` toggles sit in the nav. Sound is synthesized, there are no audio files
- it drops shadows and bloom by itself on a slow machine, and falls back to a 2D layout
  without WebGL or with reduced motion
- the site is dark only on purpose: it is a game room at night

In dev, `window.__DEN__` exposes `sim(seconds)` and `advance(seconds)` so physics and the open
flow can be tested without animation frames. It is removed from production builds.

Project pages with two or more `shots` use `src/lib/flow.ts`, a smaller 3D coverflow.

## Deploy

`npm run build` produces a static `dist/` with relative asset paths, so it works from a
domain root or a GitHub Pages sub-path. Routing uses the URL hash, so no server rewrites are needed.
