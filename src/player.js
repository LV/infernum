import * as THREE from 'three';
import { pmove, JUMP_VELOCITY, GROUND_SPEED } from './physics.js';
import { WEAPONS, SLOT_ORDER, buildViewModel, bestWeapon } from './weapons.js';

const EYE_HEIGHT = 50;

export class Player {
  constructor(camera) {
    this.camera = camera;
    this.pos = { x: 0, y: 0, z: 0 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.halfW = 15;
    this.height = 56;
    this.onGround = false;
    this.yaw = 0;
    this.pitch = 0;

    this.health = 100;
    this.armor = 0;
    this.dead = false;
    this.deaths = 0;

    this.weapons = new Set(['gauntlet', 'machinegun']);
    this.ammo = { bullets: 100, shells: 0, rocket: 0, cells: 0, slugs: 0 };
    this.currentWeapon = 'machinegun';
    this.cooldown = 0;
    this.switchTimer = 0;

    this.recoil = 0;
    this.bobPhase = 0;
    this.damageTilt = 0;
    this.lavaTimer = 0;
    this.padCooldown = 0;
    this.wasOnGround = false;

    // small fill light so the viewmodel isn't a silhouette
    const vmLight = new THREE.PointLight(0xffbb88, 350, 180, 1.6);
    vmLight.position.set(12, 8, -8);
    camera.add(vmLight);

    // first-person weapon models
    this.viewModels = {};
    for (const k of SLOT_ORDER) {
      const vm = buildViewModel(k);
      vm.visible = false;
      camera.add(vm);
      this.viewModels[k] = vm;
    }
    this.viewModels[this.currentWeapon].visible = true;
  }

  eyePos() {
    return { x: this.pos.x, y: this.pos.y + EYE_HEIGHT, z: this.pos.z };
  }

  viewDir() {
    const cp = Math.cos(this.pitch);
    return {
      x: -Math.sin(this.yaw) * cp,
      y: Math.sin(this.pitch),
      z: -Math.cos(this.yaw) * cp,
    };
  }

  switchWeapon(key) {
    if (!this.weapons.has(key) || key === this.currentWeapon) return;
    const w = WEAPONS[key];
    if (w.ammoType && this.ammo[w.ammoType] <= 0 && key !== 'gauntlet') return;
    this.viewModels[this.currentWeapon].visible = false;
    this.currentWeapon = key;
    this.viewModels[key].visible = true;
    this.cooldown = Math.max(this.cooldown, 0.25);
    this.switchTimer = 0.25;
  }

  cycleWeapon(dir) {
    const idx = SLOT_ORDER.indexOf(this.currentWeapon);
    for (let i = 1; i <= SLOT_ORDER.length; i++) {
      const k = SLOT_ORDER[(idx + dir * i + SLOT_ORDER.length * 8) % SLOT_ORDER.length];
      const w = WEAPONS[k];
      if (this.weapons.has(k) && (!w.ammoType || this.ammo[w.ammoType] > 0)) {
        this.switchWeapon(k);
        return;
      }
    }
  }

  damage(game, amount, dir, knockback = 0) {
    if (this.dead) return;
    // armor absorbs 2/3
    const absorbed = Math.min(this.armor, amount * (2 / 3));
    this.armor = Math.max(0, this.armor - absorbed);
    this.health -= (amount - absorbed);

    if (dir && knockback) {
      this.vel.x += dir.x * knockback;
      this.vel.y += Math.abs(dir.y) * knockback * 0.5 + knockback * 0.25;
      this.vel.z += dir.z * knockback;
    }
    this.damageTilt = Math.min(1, this.damageTilt + amount / 40);
    game.hud.damageFlash(Math.min(1, amount / 50));
    game.audio.hurt();

    if (this.health <= 0) {
      this.health = 0;
      this.die(game);
    }
  }

  die(game) {
    this.dead = true;
    this.deaths++;
    game.audio.die();
    game.effects.gib({ x: this.pos.x, y: this.pos.y + 28, z: this.pos.z });
    game.hud.showDeath(game);
    for (const k of SLOT_ORDER) this.viewModels[k].visible = false;
    document.exitPointerLock?.();
  }

  respawn(game) {
    const spawns = game.level.spawnPoints;
    const s = spawns[Math.floor(Math.random() * spawns.length)];
    this.pos = { x: s.x, y: s.y, z: s.z };
    this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = s.yaw;
    this.pitch = 0;
    this.health = 125; // spawn bonus, like Q3
    this.armor = 0;
    this.dead = false;
    this.weapons = new Set(['gauntlet', 'machinegun']);
    this.ammo = { bullets: 100, shells: 0, rocket: 0, cells: 0, slugs: 0 };
    this.currentWeapon = 'machinegun';
    for (const k of SLOT_ORDER) this.viewModels[k].visible = k === this.currentWeapon;
    this.cooldown = 0.3;
    game.effects.teleportFx(this.pos);
    game.audio.teleport();
    game.hud.updateWeaponBar(this);
  }

  update(game, dt) {
    const input = game.input;
    if (this.dead) return;

    this.yaw = input.yaw;
    this.pitch = input.pitch;
    this.padCooldown -= dt;

    // health decay above 100 (mega health)
    if (this.health > 100) {
      this.health = Math.max(100, this.health - dt * 1);
    }

    // build wish direction from keys, rotated by yaw
    let fw = 0, side = 0;
    if (input.keys['KeyW']) fw += 1;
    if (input.keys['KeyS']) fw -= 1;
    if (input.keys['KeyD']) side += 1;
    if (input.keys['KeyA']) side -= 1;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    // forward is -Z rotated by yaw
    let wishX = -sin * fw + cos * side;
    let wishZ = -cos * fw - sin * side;
    const wl = Math.hypot(wishX, wishZ);
    if (wl > 0) { wishX /= wl; wishZ /= wl; }

    const wasGround = this.onGround;
    const jumped = input.keys['Space'] && this.onGround;
    pmove(game.world, this, {
      wishX, wishZ,
      speed: wl > 0 ? GROUND_SPEED : 0,
      jump: input.keys['Space'],
    }, dt);
    if (jumped) game.audio.jump();
    if (!wasGround && this.onGround && this.vel.y <= 0) {
      if (this.landVel < -400) game.audio.land();
    }
    this.landVel = this.vel.y;

    // falling out of the world safety net
    if (this.pos.y < -400) this.pos.y = -400;

    // ---- lava ----
    const inLavaXZ = Math.abs(this.pos.x) < 384 && Math.abs(this.pos.z) < 384;
    if (inLavaXZ && this.pos.y < game.level.lavaTop + 4) {
      this.lavaTimer -= dt;
      game.hud.lavaVignette(true);
      if (this.lavaTimer <= 0) {
        this.lavaTimer = 0.4;
        this.damage(game, 12, { x: 0, y: 1, z: 0 }, 60);
        game.audio.burn();
        game.effects.burst({ x: this.pos.x, y: this.pos.y + 10, z: this.pos.z }, 10,
          { speed: 100, color: { r: 1, g: 0.5, b: 0.05 }, size: 8, life: 0.6, upBias: 3 });
      }
    } else {
      game.hud.lavaVignette(false);
    }

    // ---- jump pads ----
    if (this.padCooldown <= 0) {
      for (const pad of game.level.jumpPads) {
        if (this.pos.x > pad.min.x && this.pos.x < pad.max.x &&
            this.pos.z > pad.min.z && this.pos.z < pad.max.z &&
            this.pos.y > pad.min.y - 4 && this.pos.y < pad.max.y) {
          this.vel.x = pad.vel.x;
          this.vel.y = pad.vel.y;
          this.vel.z = pad.vel.z;
          this.onGround = false;
          this.padCooldown = 0.4;
          game.audio.jumppad();
          game.effects.jumppadFx({ x: this.pos.x, y: this.pos.y + 5, z: this.pos.z });
          break;
        }
      }
    }

    // ---- teleporters ----
    for (const t of game.level.teleporters) {
      if (this.pos.x > t.min.x && this.pos.x < t.max.x &&
          this.pos.z > t.min.z && this.pos.z < t.max.z &&
          this.pos.y > t.min.y - 4 && this.pos.y < t.max.y) {
        game.effects.teleportFx(this.pos);
        this.pos = { x: t.dest.x, y: t.dest.y, z: t.dest.z };
        input.yaw = this.yaw = t.destYaw;
        // fling you out of the gate, quake style
        const speed = Math.max(Math.hypot(this.vel.x, this.vel.z), 400);
        this.vel.x = -Math.sin(t.destYaw) * speed;
        this.vel.z = -Math.cos(t.destYaw) * speed;
        this.vel.y = 0;
        game.audio.teleport();
        game.effects.teleportFx(this.pos);
        break;
      }
    }

    // ---- camera ----
    const speed2d = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && speed2d > 20) this.bobPhase += dt * speed2d * 0.028;
    const bob = Math.sin(this.bobPhase) * Math.min(speed2d / GROUND_SPEED, 1.4) * 1.6;

    this.camera.position.set(this.pos.x, this.pos.y + EYE_HEIGHT + bob, this.pos.z);
    this.camera.rotation.order = 'YXZ';
    this.recoil = Math.max(0, this.recoil - dt * 6);
    this.damageTilt = Math.max(0, this.damageTilt - dt * 3);
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch + this.recoil * 0.025;
    this.camera.rotation.z = Math.sin(game.time * 30) * this.damageTilt * 0.012;

    // viewmodel sway
    const vm = this.viewModels[this.currentWeapon];
    this.switchTimer = Math.max(0, this.switchTimer - dt);
    vm.position.set(
      7 + Math.sin(this.bobPhase * 0.5) * Math.min(speed2d / GROUND_SPEED, 1) * 0.6,
      -7 + Math.abs(Math.sin(this.bobPhase)) * Math.min(speed2d / GROUND_SPEED, 1) * 0.8 - this.switchTimer * 24,
      -18 + this.recoil * 3.5,
    );
    vm.rotation.x = this.recoil * 0.12;
  }
}
