import * as THREE from 'three';
import { rayBody } from './physics.js';

// slot order matches keys 1-7
export const WEAPONS = {
  gauntlet: {
    name: 'Gauntlet', slot: 1, color: 0xffcc66,
    ammoType: null, fireRate: 0.4, damage: 50, range: 64,
  },
  machinegun: {
    name: 'Machinegun', slot: 2, color: 0xffee88,
    ammoType: 'bullets', maxAmmo: 200, ammoGive: 100, ammoPickup: 50,
    fireRate: 0.1, damage: 7, spread: 0.02,
  },
  shotgun: {
    name: 'Shotgun', slot: 3, color: 0xff8833,
    ammoType: 'shells', maxAmmo: 50, ammoGive: 10, ammoPickup: 10,
    fireRate: 1.0, damage: 10, pellets: 11, spread: 0.06,
  },
  rocket: {
    name: 'Rocket Launcher', slot: 4, color: 0xff2211,
    ammoType: 'rocket', maxAmmo: 50, ammoGive: 10, ammoPickup: 5,
    fireRate: 0.8, damage: 100, splash: 100, splashRadius: 140, speed: 900,
  },
  lightning: {
    name: 'Lightning Gun', slot: 5, color: 0x88bbff,
    ammoType: 'cells', maxAmmo: 150, ammoGive: 60, ammoPickup: 30,
    fireRate: 0.05, damage: 7, range: 768,
  },
  rail: {
    name: 'Railgun', slot: 6, color: 0xff3366,
    ammoType: 'slugs', maxAmmo: 25, ammoGive: 10, ammoPickup: 10,
    fireRate: 1.5, damage: 100,
  },
  plasma: {
    name: 'Plasma Gun', slot: 7, color: 0xbb44ff,
    ammoType: 'cells', maxAmmo: 150, ammoGive: 40, ammoPickup: 30,
    fireRate: 0.1, damage: 20, splash: 12, splashRadius: 44, speed: 2000,
  },
};

export const SLOT_ORDER = Object.keys(WEAPONS).sort((a, b) => WEAPONS[a].slot - WEAPONS[b].slot);

// ---------------- firing ----------------

export function updateFiring(game, dt) {
  const p = game.player;
  p.cooldown -= dt;

  const wkey = p.currentWeapon;
  const w = WEAPONS[wkey];
  const firing = game.input.fire && !p.dead;

  // lightning beam is continuous
  if (wkey === 'lightning' && firing && p.ammo.cells > 0) {
    if (p.cooldown <= 0) {
      p.cooldown = w.fireRate;
      p.ammo.cells--;
      fireLightning(game, w);
      game.audio.lightning();
      p.recoil = Math.min(p.recoil + 0.3, 1);
    }
  } else {
    game.effects.lightningBeam(null, null, false);
    if (firing && p.cooldown <= 0) {
      fireOnce(game, wkey, w);
    }
  }
}

function fireOnce(game, wkey, w) {
  const p = game.player;
  if (w.ammoType && p.ammo[w.ammoType] <= 0) {
    // click - auto switch to machinegun
    game.audio.tone?.(0.05, { freq: 200, gain: 0.05 });
    p.switchWeapon(bestWeapon(p));
    p.cooldown = 0.3;
    return;
  }
  p.cooldown = w.fireRate;
  if (w.ammoType) p.ammo[w.ammoType]--;
  p.recoil = 1;

  const eye = p.eyePos();
  const dir = p.viewDir();

  switch (wkey) {
    case 'gauntlet': {
      game.audio.gauntlet();
      const hit = game.traceShot(eye, dir, w.range);
      if (hit.enemy) {
        hit.enemy.damage(game, w.damage, dir);
        game.effects.blood(hit.point);
        game.hud.hitmarker();
      }
      break;
    }
    case 'machinegun': {
      game.audio.machinegun();
      shootPellet(game, eye, dir, w.spread, w.damage);
      break;
    }
    case 'shotgun': {
      game.audio.shotgun();
      for (let i = 0; i < w.pellets; i++) shootPellet(game, eye, dir, w.spread, w.damage);
      break;
    }
    case 'rocket': {
      game.audio.rocketFire();
      spawnProjectile(game, {
        type: 'rocket', owner: 'player',
        pos: muzzlePos(p), vel: { x: dir.x * w.speed, y: dir.y * w.speed, z: dir.z * w.speed },
        dmg: w.damage, splash: w.splash, splashRadius: w.splashRadius,
      });
      break;
    }
    case 'rail': {
      game.audio.railgun();
      const hit = game.traceShot(eye, dir, 8192);
      game.effects.railTrail(muzzlePos(p), hit.point);
      if (hit.enemy) {
        hit.enemy.damage(game, w.damage, dir, 8);
        game.effects.blood(hit.point, 20);
        game.hud.hitmarker();
      } else if (hit.normal) {
        game.effects.impact(hit.point, hit.normal, { r: 1, g: 0.2, b: 0.4 });
      }
      break;
    }
    case 'plasma': {
      game.audio.plasma();
      spawnProjectile(game, {
        type: 'plasma', owner: 'player',
        pos: muzzlePos(p), vel: { x: dir.x * w.speed, y: dir.y * w.speed, z: dir.z * w.speed },
        dmg: w.damage, splash: w.splash, splashRadius: w.splashRadius,
      });
      break;
    }
  }
}

function shootPellet(game, eye, dir, spread, damage) {
  const d = {
    x: dir.x + (Math.random() - 0.5) * 2 * spread,
    y: dir.y + (Math.random() - 0.5) * 2 * spread,
    z: dir.z + (Math.random() - 0.5) * 2 * spread,
  };
  const len = Math.hypot(d.x, d.y, d.z);
  d.x /= len; d.y /= len; d.z /= len;
  const hit = game.traceShot(eye, d, 8192);
  if (hit.enemy) {
    hit.enemy.damage(game, damage, d);
    game.effects.blood(hit.point, 4);
    game.hud.hitmarker();
  } else if (hit.normal) {
    game.effects.impact(hit.point, hit.normal);
  }
}

function fireLightning(game, w) {
  const p = game.player;
  const eye = p.eyePos();
  const dir = p.viewDir();
  const hit = game.traceShot(eye, dir, w.range);
  game.effects.lightningBeam(muzzlePos(p), hit.point, true);
  if (hit.enemy) {
    hit.enemy.damage(game, w.damage, dir, 0.5);
    game.effects.blood(hit.point, 2);
    game.hud.hitmarker();
  } else if (hit.normal) {
    game.effects.impact(hit.point, hit.normal, { r: 0.6, g: 0.8, b: 1 });
  }
}

function muzzlePos(p) {
  const eye = p.eyePos();
  const dir = p.viewDir();
  const right = { x: -dir.z, z: dir.x }; // horizontal right vector (unnormalized ok for small offset)
  const rl = Math.hypot(right.x, right.z) || 1;
  return {
    x: eye.x + dir.x * 20 + (right.x / rl) * 8,
    y: eye.y + dir.y * 20 - 8,
    z: eye.z + dir.z * 20 + (right.z / rl) * 8,
  };
}

export function bestWeapon(p) {
  for (const k of ['rocket', 'rail', 'plasma', 'lightning', 'shotgun', 'machinegun']) {
    const w = WEAPONS[k];
    if (p.weapons.has(k) && p.ammo[w.ammoType] > 0) return k;
  }
  return 'gauntlet';
}

// ---------------- projectiles ----------------

const PROJ_STYLE = {
  rocket:   { color: 0xff5522, size: 7, light: 2000, trail: { r: 1, g: 0.5, b: 0.15 } },
  plasma:   { color: 0xcc66ff, size: 6, light: 900, trail: { r: 0.7, g: 0.3, b: 1 } },
  fireball: { color: 0xff7711, size: 9, light: 1400, trail: { r: 1, g: 0.4, b: 0.05 } },
};

export function spawnProjectile(game, def) {
  const style = PROJ_STYLE[def.type];
  const geo = new THREE.SphereGeometry(style.size, 8, 8);
  const mat = new THREE.MeshBasicMaterial({ color: style.color });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(def.pos.x, def.pos.y, def.pos.z);
  const light = new THREE.PointLight(style.color, style.light, 500, 1.8);
  mesh.add(light);
  game.scene.add(mesh);
  game.projectiles.push({ ...def, mesh, life: 10, style });
}

export function updateProjectiles(game, dt) {
  const projs = game.projectiles;
  for (let i = projs.length - 1; i >= 0; i--) {
    const pr = projs[i];
    pr.life -= dt;
    if (pr.life <= 0) { removeProjectile(game, i); continue; }

    const speed = Math.hypot(pr.vel.x, pr.vel.y, pr.vel.z);
    const stepLen = speed * dt;
    const dir = { x: pr.vel.x / speed, y: pr.vel.y / speed, z: pr.vel.z / speed };

    // find nearest hit along this frame's segment
    let hitDist = Infinity;
    let hitNormal = null;
    let hitEnemy = null;
    let hitPlayer = false;

    const wt = game.world.trace(pr.pos, dir, stepLen);
    if (wt) { hitDist = wt.dist; hitNormal = wt.normal; }

    if (pr.owner === 'player') {
      for (const e of game.enemies) {
        const t = rayBody(pr.pos, dir, e.body, Math.min(hitDist, stepLen));
        if (t != null && t < hitDist) { hitDist = t; hitEnemy = e; hitNormal = null; }
      }
    } else if (!game.player.dead) {
      const t = rayBody(pr.pos, dir, game.player, Math.min(hitDist, stepLen));
      if (t != null && t < hitDist) { hitDist = t; hitPlayer = true; hitNormal = null; }
    }

    if (hitDist <= stepLen) {
      const hp = { x: pr.pos.x + dir.x * hitDist, y: pr.pos.y + dir.y * hitDist, z: pr.pos.z + dir.z * hitDist };
      detonate(game, pr, hp, hitEnemy, hitPlayer, dir);
      removeProjectile(game, i);
      continue;
    }

    pr.pos.x += pr.vel.x * dt;
    pr.pos.y += pr.vel.y * dt;
    pr.pos.z += pr.vel.z * dt;
    pr.mesh.position.set(pr.pos.x, pr.pos.y, pr.pos.z);

    // exhaust trail
    if (pr.style.trail && Math.random() < 0.85) {
      game.effects.spawn(pr.pos, {
        x: -pr.vel.x * 0.05 + (Math.random() - 0.5) * 20,
        y: -pr.vel.y * 0.05 + (Math.random() - 0.5) * 20,
        z: -pr.vel.z * 0.05 + (Math.random() - 0.5) * 20,
      }, { color: pr.style.trail, size: pr.type === 'rocket' ? 8 : 5, life: 0.35, gravity: 0 });
    }

    // fell into lava
    if (pr.pos.y < game.level.lavaTop) {
      game.effects.explosion(pr.pos, false);
      removeProjectile(game, i);
    }
  }
}

function detonate(game, pr, point, hitEnemy, hitPlayer, dir) {
  const big = pr.type === 'rocket' || pr.type === 'fireball';
  game.effects.explosion(point, big);
  game.audio.explosion(distToPlayer(game, point));

  // direct hit damage
  if (hitEnemy) {
    hitEnemy.damage(game, pr.dmg, dir, big ? 6 : 1);
    game.hud.hitmarker();
  }
  if (hitPlayer) {
    game.player.damage(game, pr.dmg, dir);
  }
  // splash (direct victim excluded -- they already took full damage)
  if (pr.splash) {
    splashDamage(game, point, pr.splash, pr.splashRadius, pr.owner, hitEnemy);
  }
}

function removeProjectile(game, i) {
  const pr = game.projectiles[i];
  game.scene.remove(pr.mesh);
  pr.mesh.geometry.dispose();
  pr.mesh.material.dispose();
  game.projectiles.splice(i, 1);
}

export function splashDamage(game, center, dmg, radius, owner, excludeEnemy = null) {
  // enemies
  for (const e of game.enemies) {
    if (e === excludeEnemy) continue;
    if (owner !== 'player') continue; // demons don't hurt each other
    const c = e.center();
    const dx = c.x - center.x, dy = c.y - center.y, dz = c.z - center.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist >= radius) continue;
    const points = dmg * (1 - dist / radius);
    const n = dist > 0.1 ? { x: dx / dist, y: dy / dist, z: dz / dist } : { x: 0, y: 1, z: 0 };
    e.damage(game, points, n, points * 0.08);
  }
  // player (self-splash enables rocket jumps)
  const p = game.player;
  if (!p.dead) {
    const pc = { x: p.pos.x, y: p.pos.y + 28, z: p.pos.z };
    const dx = pc.x - center.x, dy = pc.y - center.y, dz = pc.z - center.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist < radius) {
      let points = dmg * (1 - dist / radius);
      const n = dist > 0.1 ? { x: dx / dist, y: dy / dist, z: dz / dist } : { x: 0, y: 1, z: 0 };
      // knockback (quake-style: proportional to damage)
      const kb = points * 7;
      p.vel.x += n.x * kb;
      p.vel.y += Math.max(n.y, 0.25) * kb; // up-bias makes rocket jumps work
      p.vel.z += n.z * kb;
      p.onGround = false;
      if (owner === 'player') points *= 0.5; // reduced self-damage
      p.damage(game, points, n, 0); // knockback already applied
    }
  }
}

function distToPlayer(game, point) {
  const p = game.player.pos;
  return Math.hypot(p.x - point.x, p.y - point.y, p.z - point.z);
}

// ---------------- first-person viewmodels ----------------

export function buildViewModel(wkey) {
  const w = WEAPONS[wkey];
  const g = new THREE.Group();
  g.scale.setScalar(0.55);
  const metal = new THREE.MeshStandardMaterial({ color: 0x66666f, metalness: 0.15, roughness: 0.5 });
  const glow = new THREE.MeshBasicMaterial({ color: w.color });

  if (wkey === 'gauntlet') {
    const fist = new THREE.Mesh(new THREE.BoxGeometry(7, 7, 12), metal);
    const blade = new THREE.Mesh(new THREE.ConeGeometry(2.4, 9, 6), glow);
    blade.rotation.x = -Math.PI / 2;
    blade.position.z = -10;
    g.add(fist, blade);
  } else {
    const body = new THREE.Mesh(new THREE.BoxGeometry(6, 7, 22), metal);
    body.position.z = -6;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 16, 10), metal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 1.5, -22);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 3, 8), glow);
    tip.rotation.x = Math.PI / 2;
    tip.position.set(0, 1.5, -30);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(4, 8, 5), metal);
    grip.position.set(0, -6, 0);
    g.add(body, barrel, tip, grip);
    if (wkey === 'rocket') {
      const mouth = new THREE.Mesh(new THREE.CylinderGeometry(4, 4.6, 8, 12), metal);
      mouth.rotation.x = Math.PI / 2;
      mouth.position.set(0, 1.5, -28);
      g.add(mouth);
    }
    if (wkey === 'rail') {
      const rail1 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 26), glow);
      rail1.position.set(-2.5, 3.5, -14);
      const rail2 = rail1.clone();
      rail2.position.x = 2.5;
      g.add(rail1, rail2);
    }
  }
  return g;
}
