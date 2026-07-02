import * as THREE from 'three';
import { pmove, moveBody, GRAVITY, rayBody } from './physics.js';
import { spawnProjectile } from './weapons.js';

const TYPES = {
  skull: {
    hp: 40, halfW: 14, height: 28, speed: 300, contactDmg: 12, score: 1,
  },
  imp: {
    hp: 80, halfW: 16, height: 56, speed: 190, fireballDmg: 14, fireRate: 2.4, score: 1,
  },
  knight: {
    hp: 240, halfW: 22, height: 72, speed: 150, fireballDmg: 18, fireRate: 3.2, score: 3,
  },
};

// ---------------- meshes ----------------

function skullMesh() {
  const g = new THREE.Group();
  const bone = new THREE.MeshStandardMaterial({ color: 0xd8c8a8, roughness: 0.8 });
  const head = new THREE.Mesh(new THREE.SphereGeometry(13, 12, 10), bone);
  head.scale.y = 1.15;
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(14, 7, 10), bone);
  jaw.position.set(0, -12, -4);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2200 });
  const e1 = new THREE.Mesh(new THREE.SphereGeometry(3.2, 8, 8), eyeMat);
  e1.position.set(-5, 2, -10);
  const e2 = e1.clone();
  e2.position.x = 5;
  const hornMat = new THREE.MeshStandardMaterial({ color: 0x554433, roughness: 0.7 });
  const h1 = new THREE.Mesh(new THREE.ConeGeometry(2.5, 12, 6), hornMat);
  h1.position.set(-8, 13, 0);
  h1.rotation.z = 0.5;
  const h2 = h1.clone();
  h2.position.x = 8;
  h2.rotation.z = -0.5;
  g.add(head, jaw, e1, e2, h1, h2);
  const light = new THREE.PointLight(0xff3300, 500, 200, 1.8);
  g.add(light);
  return g;
}

function impMesh(scale = 1, color = 0x8a3020) {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(10, 8, 24, 8), skin);
  torso.position.y = 34;
  const head = new THREE.Mesh(new THREE.SphereGeometry(8, 10, 8), skin);
  head.position.y = 52;
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffcc00 });
  const e1 = new THREE.Mesh(new THREE.SphereGeometry(2, 6, 6), eyeMat);
  e1.position.set(-3.5, 53, -6.5);
  const e2 = e1.clone();
  e2.position.x = 3.5;
  const hornMat = new THREE.MeshStandardMaterial({ color: 0x332211 });
  const h1 = new THREE.Mesh(new THREE.ConeGeometry(2, 10, 6), hornMat);
  h1.position.set(-6, 61, 0);
  h1.rotation.z = 0.6;
  const h2 = h1.clone();
  h2.position.x = 6;
  h2.rotation.z = -0.6;
  const legMat = skin;
  const l1 = new THREE.Mesh(new THREE.CylinderGeometry(3, 2.5, 22, 6), legMat);
  l1.position.set(-5, 11, 0);
  const l2 = l1.clone();
  l2.position.x = 5;
  const a1 = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2, 20, 6), skin);
  a1.position.set(-12, 36, 0);
  a1.rotation.z = 0.3;
  const a2 = a1.clone();
  a2.position.x = 12;
  a2.rotation.z = -0.3;
  g.add(torso, head, e1, e2, h1, h2, l1, l2, a1, a2);
  g.scale.setScalar(scale);
  return g;
}

// ---------------- enemy class ----------------

let nextId = 1;

export class Enemy {
  constructor(game, type, pos) {
    this.id = nextId++;
    this.type = type;
    const def = TYPES[type];
    this.def = def;
    this.hp = def.hp;
    this.body = {
      pos: { x: pos.x, y: pos.y, z: pos.z },
      vel: { x: 0, y: 0, z: 0 },
      halfW: def.halfW,
      height: def.height,
      onGround: false,
    };
    this.attackTimer = 1 + Math.random() * 2;
    this.chargeTimer = 0;
    this.painTimer = 0;
    this.wanderAngle = Math.random() * Math.PI * 2;
    this.wanderTimer = 0;

    if (type === 'skull') this.mesh = skullMesh();
    else if (type === 'imp') this.mesh = impMesh();
    else this.mesh = impMesh(1.35, 0x401818);
    game.scene.add(this.mesh);

    this.flashMats = [];
    this.mesh.traverse(o => { if (o.isMesh && o.material.emissive !== undefined) this.flashMats.push(o.material); });
  }

  center() {
    return { x: this.body.pos.x, y: this.body.pos.y + this.body.height / 2, z: this.body.pos.z };
  }

  hasLOS(game) {
    const c = this.center();
    const p = game.player.eyePos();
    const dx = p.x - c.x, dy = p.y - c.y, dz = p.z - c.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist < 1) return true;
    const dir = { x: dx / dist, y: dy / dist, z: dz / dist };
    return !game.world.trace(c, dir, dist);
  }

  damage(game, amount, dir, kbScale = 2) {
    if (this.dead) return;
    this.hp -= amount;
    this.painTimer = 0.15;
    if (dir) {
      this.body.vel.x += dir.x * amount * kbScale;
      this.body.vel.y += Math.abs(dir.y * amount * kbScale) * 0.3 + amount * 0.5;
      this.body.vel.z += dir.z * amount * kbScale;
    }
    if (this.hp <= 0) {
      this.die(game);
    } else {
      game.audio.enemyPain(distToPlayer(game, this.body.pos));
    }
  }

  die(game) {
    const c = this.center();
    game.effects.gib(c);
    game.audio.enemyDie(distToPlayer(game, this.body.pos));
    game.frags += this.def.score;
    game.hud.setFrags(game.frags);
    game.hud.message(killMessage(this.type));
    this.dead = true;
    game.scene.remove(this.mesh);
  }

  update(game, dt) {
    const def = this.def;
    const p = game.player;
    const b = this.body;
    const c = this.center();
    const toPlayer = {
      x: p.pos.x - b.pos.x,
      y: (p.pos.y + 28) - c.y,
      z: p.pos.z - b.pos.z,
    };
    const distH = Math.hypot(toPlayer.x, toPlayer.z);
    const dist = Math.hypot(toPlayer.x, toPlayer.y, toPlayer.z);
    const los = !p.dead && this.hasLOS(game);

    if (this.painTimer > 0) {
      this.painTimer -= dt;
      for (const m of this.flashMats) m.emissive.setHex(0xff0000);
    } else {
      for (const m of this.flashMats) m.emissive.setHex(0x000000);
    }

    if (this.type === 'skull') {
      // flying: seek the player's head, charge when close with LOS
      this.chargeTimer -= dt;
      const target = p.dead ? null : { x: p.pos.x, y: p.pos.y + 40, z: p.pos.z };
      let accel = 420;
      let maxSpeed = def.speed;
      if (this.chargeTimer > 0) { accel = 900; maxSpeed = 520; }
      else if (los && dist < 500 && Math.random() < dt * 0.8) {
        this.chargeTimer = 1.1;
        game.audio.enemyPain(dist);
      }
      if (target && los) {
        const d = Math.max(dist, 1);
        b.vel.x += (toPlayer.x / d) * accel * dt;
        b.vel.y += ((target.y - c.y) / d) * accel * dt;
        b.vel.z += (toPlayer.z / d) * accel * dt;
      } else {
        // lazy wander
        this.wanderTimer -= dt;
        if (this.wanderTimer <= 0) { this.wanderTimer = 2; this.wanderAngle = Math.random() * Math.PI * 2; }
        b.vel.x += Math.cos(this.wanderAngle) * 150 * dt;
        b.vel.z += Math.sin(this.wanderAngle) * 150 * dt;
        b.vel.y += (Math.sin(game.time * 1.5 + this.id) * 40 - b.vel.y) * dt;
      }
      const sp = Math.hypot(b.vel.x, b.vel.y, b.vel.z);
      if (sp > maxSpeed) {
        const s = maxSpeed / sp;
        b.vel.x *= s; b.vel.y *= s; b.vel.z *= s;
      }
      moveBody(game.world, b, dt);

      // contact damage
      if (!p.dead && dist < 46) {
        p.damage(game, def.contactDmg, { x: toPlayer.x / dist, y: 0.4, z: toPlayer.z / dist }, 200);
        b.vel.x = -toPlayer.x / dist * 380;
        b.vel.y = 200;
        b.vel.z = -toPlayer.z / dist * 380;
        this.chargeTimer = 0;
      }
      // burn in lava
      if (b.pos.y < game.level.lavaTop + 10) this.damage(game, 1000);
    } else {
      // grounded demons: walk toward player, lob fireballs
      let wishX = 0, wishZ = 0;
      if (los && distH > 1) {
        wishX = toPlayer.x / distH;
        wishZ = toPlayer.z / distH;
        // keep some range for throwers
        if (distH < 220) { wishX *= -0.6; wishZ *= -0.6; }
      } else {
        this.wanderTimer -= dt;
        if (this.wanderTimer <= 0) { this.wanderTimer = 1.5 + Math.random() * 2; this.wanderAngle = Math.random() * Math.PI * 2; }
        wishX = Math.cos(this.wanderAngle) * 0.5;
        wishZ = Math.sin(this.wanderAngle) * 0.5;
      }
      const wl = Math.hypot(wishX, wishZ);
      const input = {
        wishX: wl > 0 ? wishX / wl : 0,
        wishZ: wl > 0 ? wishZ / wl : 0,
        speed: def.speed * (wl > 0 ? Math.min(wl, 1) : 0),
        jump: false,
      };
      pmove(game.world, b, input, dt);

      // fireballs
      this.attackTimer -= dt;
      if (this.attackTimer <= 0 && los && dist < 1400 && !p.dead) {
        this.attackTimer = def.fireRate * (0.8 + Math.random() * 0.4);
        const from = { x: c.x, y: c.y + def.height * 0.25, z: c.z };
        const speed = this.type === 'knight' ? 620 : 520;
        // lead the player slightly
        const tt = dist / speed * 0.6;
        const aim = {
          x: p.pos.x + p.vel.x * tt - from.x,
          y: p.pos.y + 30 + p.vel.y * tt * 0.3 - from.y,
          z: p.pos.z + p.vel.z * tt - from.z,
        };
        const al = Math.hypot(aim.x, aim.y, aim.z);
        const volleys = this.type === 'knight' ? [-0.12, 0, 0.12] : [0];
        for (const spread of volleys) {
          const cos = Math.cos(spread), sin = Math.sin(spread);
          const dx = (aim.x * cos - aim.z * sin) / al;
          const dz = (aim.x * sin + aim.z * cos) / al;
          spawnProjectile(game, {
            type: 'fireball', owner: 'enemy',
            pos: { x: from.x, y: from.y, z: from.z },
            vel: { x: dx * speed, y: aim.y / al * speed, z: dz * speed },
            dmg: def.fireballDmg, splash: 10, splashRadius: 60,
          });
        }
        game.audio.fireball(dist);
      }
      // burn in lava
      if (b.pos.y < game.level.lavaTop + 10) this.damage(game, 1000);
    }

    // update mesh
    this.mesh.position.set(b.pos.x, b.pos.y, b.pos.z);
    if (this.type === 'skull') {
      this.mesh.position.y = b.pos.y + b.height / 2;
      this.mesh.rotation.y = Math.atan2(-toPlayer.x, -toPlayer.z);
      this.mesh.rotation.z = Math.sin(game.time * 3 + this.id) * 0.1;
    } else {
      this.mesh.rotation.y = Math.atan2(-toPlayer.x, -toPlayer.z);
      // walk bob
      const sp = Math.hypot(b.vel.x, b.vel.z);
      this.mesh.position.y = b.pos.y + Math.abs(Math.sin(game.time * 8 + this.id)) * Math.min(sp / def.speed, 1) * 4;
    }
  }
}

function killMessage(type) {
  const msgs = {
    skull: ['SOUL RELEASED', 'SKULL SHATTERED', 'BACK TO THE PIT'],
    imp: ['IMP SLAIN', 'DEMON DOWN', 'SENT BACK BELOW'],
    knight: ['HELL KNIGHT DESTROYED', 'THE BRUTE FALLS'],
  };
  const arr = msgs[type];
  return arr[Math.floor(Math.random() * arr.length)];
}

function distToPlayer(game, pos) {
  const p = game.player.pos;
  return Math.hypot(p.x - pos.x, p.y - pos.y, p.z - pos.z);
}

// ---------------- spawner ----------------

export function updateEnemies(game, dt) {
  for (let i = game.enemies.length - 1; i >= 0; i--) {
    const e = game.enemies[i];
    e.update(game, dt);
    if (e.dead) game.enemies.splice(i, 1);
  }

  // population scales with time
  const minutes = game.time / 60;
  const targetPop = Math.min(4 + Math.floor(minutes * 1.2), 11);
  game.spawnTimer -= dt;
  if (game.enemies.length < targetPop && game.spawnTimer <= 0) {
    game.spawnTimer = 1.2;
    spawnRandomEnemy(game, minutes);
  }
}

function spawnRandomEnemy(game, minutes) {
  const spawns = game.level.enemySpawns;
  const p = game.player.pos;
  // prefer spawn points away from the player
  const candidates = spawns.filter(s => Math.hypot(s.x - p.x, s.z - p.z) > 500);
  const s = (candidates.length ? candidates : spawns)[Math.floor(Math.random() * (candidates.length || spawns.length))];

  const r = Math.random();
  let type = 'skull';
  if (minutes > 0.5 && r < 0.45) type = 'imp';
  if (minutes > 2 && r < 0.18) type = 'knight';

  const e = new Enemy(game, type, { x: s.x, y: s.y + (type === 'skull' ? 60 : 0), z: s.z });
  game.enemies.push(e);
  game.effects.spawnFx(s);
  game.audio.enemySpawn(Math.hypot(s.x - p.x, s.z - p.z));
}
