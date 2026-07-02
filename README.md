# INFERNUM

A Quake Arena–style FPS set in hell, running in the browser. Built with Three.js and a
custom Quake-physics engine — no game engine, no binary assets (all textures and sounds
are generated procedurally at runtime).

## Run it

```sh
npm install
npm run dev      # then open the printed localhost URL
```

`npm run build` produces a static bundle in `dist/`.

## Controls

| Input | Action |
|---|---|
| WASD | Move |
| Mouse | Aim |
| Space | Jump (hold to bunny-hop) |
| LMB | Fire |
| 1–7 / wheel | Switch weapon |
| Esc | Release mouse |

## Movement

The player physics is a faithful port of Q3A's `pmove`: friction 6, ground accel 10,
air accel 1, 320 ups ground speed, 270 jump velocity, 800 gravity, 18-unit step-up.
That means the classic tech all works:

- **Strafe-jumping / bunny-hopping** — hold jump and air-strafe to build speed past 320
- **Rocket jumps** — self-splash knockback with an upward bias, half self-damage
- **Jump pads, teleporters** (with exit fling), and lava that hungers

## Arsenal

Gauntlet, Machinegun, Shotgun, Rocket Launcher, Lightning Gun, Railgun, Plasma Gun —
Q3-flavored damage numbers, splash radii, and fire rates.

## The Pit

A single arena: central lava pit with an altar (rocket launcher) reached by stairs or
jump pads, four corner towers (railgun / plasma / armor), wall ledges (lightning gun /
mega health) reached by jump pads, two teleporter gates, and demons — charging lost
souls, fireball-lobbing imps, and hell knights — that spawn faster the longer you live.
Frags count. Death is temporary.

## Code map

```
src/physics.js   Quake pmove + AABB brush world, ray traces, collide & slide
src/level.js     arena brushes, procedural textures, sky shader, lava, atmosphere
src/player.js    player state, damage/armor, view bob, viewmodels
src/weapons.js   weapon defs, hitscan + projectiles, splash/knockback
src/enemies.js   demon AI + spawner
src/items.js     pickups (health/armor/ammo/weapons) with respawn timers
src/effects.js   GPU particle pool, explosions, rail trails, lightning beam
src/audio.js     all-synthesized WebAudio SFX + ambient drone
src/hud.js       DOM HUD
src/main.js      loop, input, wiring
```
