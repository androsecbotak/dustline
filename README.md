# dustline

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/androsecbotak/dustline/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/androsecbotak/dustline/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

DUSTLINE is a round-based tactical first-person shooter in the style Counter-Strike made famous, built on three.js and running entirely offline in a browser. Two teams fight over a desert outpost at dusk: plant the bomb at A or B, or eliminate the other team. First to 5 rounds takes the match.

## What is in the game

- **Two teams, bots that fight back.** You lead two Vanguard teammates against four Crimson defenders. Bots patrol the bombsites, follow routes through the map, hold positions, react to gunfire, and converge to defuse a planted bomb.
- **Rounds, money, a buy menu.** Earn money per kill and per round, then spend it between rounds: a rifle, an SMG, a sniper, frag grenades and armour.
- **Gunplay where accuracy pays.** Hits are checked against bodies with more damage to the head; recoil and spread grow with movement and sustained fire, so stopping to aim wins fights. Crouch, jump, and collide with the map.
- **An objective beyond killing.** Carry the bomb, plant it at A or B (hold E), and defend it while the fuse runs — or stop the Crimson team planting and defusing.
- **A map with lanes worth playing.** A west lane to site A, an east lane to site B, and a mid courtyard with a watchtower, containers, crates and sandbags, lit by a low amber sun.
- **A full HUD.** Health and armour, ammunition, the round timer, the score, money, a kill feed, a dynamic crosshair, hit markers and a damage vignette — plus synthesized WebAudio gunfire, footsteps, round stingers and a bomb ticker. No audio files, no network.

## Play it

```sh
node serve.ts
```

Then open http://localhost:8080 and click to play. `W A S D` move, mouse looks, click fires, `R` reloads, `Q` switches weapon, `G` throws a grenade, `E` (hold) plants the bomb, `B` opens the buy menu, `Ctrl` crouches, `Space` jumps.

---

Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards
