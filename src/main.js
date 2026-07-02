import * as THREE from 'three';
import { World, rayBody } from './physics.js';
import { buildLevel, updateLevel } from './level.js';
import { Player } from './player.js';
import { Hud } from './hud.js';
import { AudioSys } from './audio.js';
import { Effects } from './effects.js';
import { createItems, updateItems } from './items.js';
import { updateEnemies } from './enemies.js';
import { updateFiring, updateProjectiles, SLOT_ORDER } from './weapons.js';

// ---------------- renderer / scene ----------------

const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.45;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(100, window.innerWidth / window.innerHeight, 1, 12000);
scene.add(camera);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------- input ----------------

const input = {
  keys: {},
  fire: false,
  yaw: 0,
  pitch: 0,
  sensitivity: 0.0022,
  locked: false,
};

document.addEventListener('keydown', e => {
  input.keys[e.code] = true;
  if (e.code.startsWith('Digit')) {
    const n = parseInt(e.code.slice(5), 10);
    const key = SLOT_ORDER[n - 1];
    if (key && game.player) game.player.switchWeapon(key);
  }
  if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
});
document.addEventListener('keyup', e => { input.keys[e.code] = false; });

document.addEventListener('mousedown', e => {
  if (input.locked && e.button === 0) input.fire = true;
});
document.addEventListener('mouseup', e => {
  if (e.button === 0) input.fire = false;
});
document.addEventListener('mousemove', e => {
  if (!input.locked) return;
  input.yaw -= e.movementX * input.sensitivity;
  input.pitch -= e.movementY * input.sensitivity;
  const lim = Math.PI / 2 - 0.01;
  input.pitch = Math.max(-lim, Math.min(lim, input.pitch));
});
document.addEventListener('wheel', e => {
  if (!input.locked || !game.player) return;
  game.player.cycleWeapon(e.deltaY > 0 ? 1 : -1);
});
document.addEventListener('pointerlockchange', () => {
  input.locked = document.pointerLockElement === canvas;
  if (!input.locked) input.fire = false;
});

// ---------------- game state ----------------

const world = new World();
const level = buildLevel(scene, world);
const effects = new Effects(scene);
const audio = new AudioSys();
const hud = new Hud();
const player = new Player(camera);

const game = {
  scene, camera, renderer, world, level, effects, audio, hud, input, player,
  enemies: [],
  projectiles: [],
  items: [],
  time: 0,
  frags: 0,
  spawnTimer: 2,
  started: false,

  // hitscan trace against world + enemies; always returns a point
  traceShot(origin, dir, maxDist) {
    const wt = this.world.trace(origin, dir, maxDist);
    let dist = wt ? wt.dist : maxDist;
    let normal = wt ? wt.normal : null;
    let enemy = null;
    for (const e of this.enemies) {
      const t = rayBody(origin, dir, e.body, dist);
      if (t != null && t < dist) { dist = t; enemy = e; normal = null; }
    }
    return {
      dist, enemy, normal,
      point: {
        x: origin.x + dir.x * dist,
        y: origin.y + dir.y * dist,
        z: origin.z + dir.z * dist,
      },
    };
  },
};

game.items = createItems(scene, level.itemSpecs);
window.__game = game; // debug/testing handle

// ---------------- start / respawn flow ----------------

function lockPointer() {
  try {
    const res = canvas.requestPointerLock();
    if (res && res.catch) res.catch(() => {});
  } catch { /* pointer lock can fail right after ESC; harmless */ }
}

const menuScreen = document.getElementById('menu-screen');
const deathScreen = document.getElementById('death-screen');

menuScreen.addEventListener('click', () => {
  audio.init();
  menuScreen.style.display = 'none';
  document.body.classList.add('hud-visible');
  if (!game.started) {
    game.started = true;
    player.respawn(game);
    hud.message('WELCOME TO INFERNUM');
  }
  lockPointer();
});

deathScreen.addEventListener('click', () => {
  hud.hideDeath();
  player.respawn(game);
  lockPointer();
});

// re-lock when clicking back into a running game
canvas.addEventListener('click', () => {
  if (game.started && !player.dead && !input.locked) lockPointer();
});

// ---------------- main loop ----------------

let last = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.05) dt = 0.05; // clamp tab-switch spikes
  if (dt <= 0) return;

  if (game.started) {
    game.time += dt;

    // fixed-ish substeps keep movement stable at any framerate
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const sub = dt / steps;
    for (let i = 0; i < steps; i++) {
      player.update(game, sub);
    }

    updateFiring(game, dt);
    updateProjectiles(game, dt);
    updateEnemies(game, dt);
    updateItems(game, dt, game.time);
    hud.update(game, dt);
  }

  updateLevel(level, effects, dt, game.time);
  effects.update(dt);
  renderer.render(scene, camera);
}

requestAnimationFrame(frame);
