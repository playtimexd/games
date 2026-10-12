// Everything personal lives here. Edit this file, not the components.

export const site = {
  name: 'Your Name',
  role: 'Game producer',
  email: 'you@yourdomain.com',
  headline: ['Pick a cartridge.'],
  intro:
    'Game producer. Each cartridge opens a project.',
  /** The last, blank cartridge. Always there, so the row never looks finished. */
  nextGame: {
    title: 'Next game',
    body: 'The next cartridge is still blank. Get in touch if you want to follow along.',
    screen: ['NEXT GAME', 'IN PROGRESS'],
  },
  about: {
    statement:
      'I take games from first prototype to something people can open, play and react to.',
    responsibilities: [
      {
        title: 'Scope and schedule',
        body: 'Cutting a design down to what can ship, then keeping the plan honest week to week.',
      },
      {
        title: 'Pipeline and tools',
        body: 'Building the tools, build steps and automation that let a small team move fast.',
      },
      {
        title: 'Playtests and feedback',
        body: 'Getting builds in front of players early and turning what they do into decisions.',
      },
      {
        title: 'Release',
        body: 'Packaging, store pages, web hosting and the last-mile checks before a link goes public.',
      },
    ],
  },
  links: [{ label: 'GitHub', url: 'https://github.com/playtimexd' }],
}
