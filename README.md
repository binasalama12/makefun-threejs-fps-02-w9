[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/binasalama12/makefun-threejs-fps-02-w9/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/binasalama12/makefun-threejs-fps-02-w9/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

# Coral Marina — Pier Charge

A round-based tactical FPS in the browser, built on three.js. Two crews
fight over a sunlit yacht marina: the **Tide Wardens** sail in from the
south boardwalk while the **Reef Raiders** hold the docks. Win a round by
eliminating the Raiders or by planting a charge at the tip of the pier and
keeping it alive until it blows. Lose it by getting wiped out, letting the
clock run out, or letting a Raider defuse. First crew to 5 rounds takes
the marina.

## How to play

Serve the `game/` folder with any static file server (for example
`python3 -m http.server` inside `game/`) and open `index.html` in desktop
Chrome. Click **Click to play** to lock the mouse and start round 1.

Each round opens with a short buy phase at the marina chandlery. Kills and
round results pay cash; spend it on stronger guns and Foam Burst grenades.
When the buy clock ends you sail out: fight down the boardwalk lanes —
west boathouse yard, central boardwalk, east cafe slips — onto the narrow
pier, stand in the coral ring at its tip, and hold **F** to plant. After
the plant, Raiders rush the pier to defuse while your crew holds the tip
for 35 seconds.

## Controls

| Input | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look |
| Left click | Fire |
| R | Reload |
| 1 – 5 | Switch weapon (buy during the buy phase) |
| Ctrl or C | Crouch (steadier aim, slower move) |
| Space | Hop |
| F (hold, at the pier tip) | Plant the charge |
| G | Throw a Foam Burst grenade |
| B | Close the buy panel |

## Features

- **Original marina map** — boardwalk, boathouse, cafe hut, ticket kiosk,
  crate-and-barrel cover, a narrow pier over open water, bobbing boats
  built from primitives, and animated water.
- **Accuracy-first gunplay** — spread blooms while moving or spraying and
  settles to near-pinpoint when you stop or crouch; headshots multiply
  damage; every gun has its own recoil, cadence and falloff range.
- **Five invented weapons plus a grenade** — Harborline P9 pistol, Kelp-9
  Spraygun, Breakwater SG, Beacon AR and Gullwing DMR, each with its own
  price and stats, plus the Foam Burst area grenade.
- **Bot crews with jobs** — Bima and Sinta fight beside you; Vargo, Mako
  and Rhea patrol waypoint routes, check line of sight, strafe between
  bursts, rush the pier to defuse after a plant, and hold the site.
- **Full round economy and HUD** — health, cash, round, timer, team
  score, ammo, kill feed, buy panel, plant/defuse progress and a final
  scoreboard.
- **Synthesised sound** — gunfire, hits, buys, plant beeps and the charge
  blast are all generated with WebAudio; there are no audio files.
- **Offline and build-free** — static ES modules, a vendored three.js,
  no network requests. Deterministic screenshot scenes are available via
  `?shot=start|play|end&seed=N` for captures.

## Handing it in

`node main.ts` (with `MAKEFUN_OUTPUT_DIR` set outside the grader) copies
`game/` and `screenshots/` to the output folder and writes the entry's
`dossier.json` with the vendored make.fun library.
