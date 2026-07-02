import * as THREE from 'three';
import { WEAPONS } from './weapons.js';

const RESPAWN = { weapon: 15, health25: 20, mega: 35, shard: 25, armor50: 25, ammo: 30 };

function itemMesh(spec) {
  const g = new THREE.Group();
  if (spec.type === 'health25') {
    const cross = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xffcc44, emissive: 0xbb6600, emissiveIntensity: 0.8 });
    const a = new THREE.Mesh(new THREE.BoxGeometry(28, 10, 10), mat);
    const b = new THREE.Mesh(new THREE.BoxGeometry(10, 28, 10), mat);
    cross.add(a, b);
    g.add(cross);
  } else if (spec.type === 'mega') {
    const mat = new THREE.MeshStandardMaterial({ color: 0x3388ff, emissive: 0x1144cc, emissiveIntensity: 1.2 });
    const a = new THREE.Mesh(new THREE.BoxGeometry(36, 14, 14), mat);
    const b = new THREE.Mesh(new THREE.BoxGeometry(14, 36, 14), mat);
    g.add(a, b);
  } else if (spec.type === 'shard') {
    const mat = new THREE.MeshStandardMaterial({ color: 0x66ff66, emissive: 0x22aa22, emissiveIntensity: 0.8, metalness: 0.6 });
    g.add(new THREE.Mesh(new THREE.OctahedronGeometry(12), mat));
  } else if (spec.type === 'armor50') {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffaa22, emissive: 0xaa5500, emissiveIntensity: 0.9, metalness: 0.7 });
    g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(20), mat));
  } else if (spec.type === 'ammo') {
    const colors = { shells: 0xcc4411, rocket: 0xdd2200, cells: 0xbb44ff, slugs: 0x44ff99, bullets: 0xcccc44 };
    const mat = new THREE.MeshStandardMaterial({
      color: 0x332222, emissive: colors[spec.weapon] || 0xff8800, emissiveIntensity: 0.6,
    });
    g.add(new THREE.Mesh(new THREE.BoxGeometry(24, 24, 24), mat));
  } else if (spec.type === 'weapon') {
    const w = WEAPONS[spec.weapon];
    const mat = new THREE.MeshStandardMaterial({
      color: 0x222226, metalness: 0.8, roughness: 0.35,
      emissive: w.color, emissiveIntensity: 0.5,
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(44, 14, 14), mat);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 30, 10), mat);
    barrel.rotation.z = Math.PI / 2;
    barrel.position.x = 30;
    g.add(body, barrel);
    g.scale.setScalar(1.2);
  }
  return g;
}

export function createItems(scene, specs) {
  const items = [];
  for (const spec of specs) {
    const mesh = itemMesh(spec);
    mesh.position.set(spec.pos.x, spec.pos.y + 28, spec.pos.z);
    scene.add(mesh);
    items.push({ ...spec, mesh, active: true, timer: 0, phase: Math.random() * Math.PI * 2 });
  }
  return items;
}

export function updateItems(game, dt, time) {
  const p = game.player;
  for (const it of items(game)) {
    if (!it.active) {
      it.timer -= dt;
      if (it.timer <= 0) {
        it.active = true;
        it.mesh.visible = true;
        game.effects.flash(it.mesh.position, 0xffee99, 500, 200, 0.3);
      }
      continue;
    }
    // spin & bob
    it.mesh.rotation.y += dt * 2;
    it.mesh.position.y = it.pos.y + 28 + Math.sin(time * 2.4 + it.phase) * 6;

    if (p.dead) continue;
    const dx = p.pos.x - it.pos.x;
    const dy = (p.pos.y + 28) - (it.pos.y + 28);
    const dz = p.pos.z - it.pos.z;
    if (dx * dx + dz * dz < 44 * 44 && Math.abs(dy) < 64) {
      if (tryPickup(game, it)) {
        it.active = false;
        it.mesh.visible = false;
        it.timer = RESPAWN[it.type] || 25;
        game.hud.pickupFlash();
      }
    }
  }
}

function items(game) { return game.items; }

function tryPickup(game, it) {
  const p = game.player;
  const hud = game.hud;
  switch (it.type) {
    case 'health25':
      if (p.health >= 100) return false;
      p.health = Math.min(100, p.health + 25);
      game.audio.pickup();
      hud.message('+25 HEALTH');
      return true;
    case 'mega':
      if (p.health >= 200) return false;
      p.health = Math.min(200, p.health + 100);
      game.audio.pickup(true);
      hud.message('MEGA HEALTH');
      return true;
    case 'shard':
      if (p.armor >= 150) return false;
      p.armor = Math.min(150, p.armor + 5);
      game.audio.pickup();
      return true;
    case 'armor50':
      if (p.armor >= 150) return false;
      p.armor = Math.min(150, p.armor + 50);
      game.audio.pickup(true);
      hud.message('HEAVY ARMOR');
      return true;
    case 'ammo': {
      const w = Object.values(WEAPONS).find(w => w.ammoType === it.weapon);
      const cap = w ? w.maxAmmo : 200;
      if (p.ammo[it.weapon] >= cap) return false;
      p.ammo[it.weapon] = Math.min(cap, p.ammo[it.weapon] + (w ? w.ammoPickup : 25));
      game.audio.pickup();
      hud.message(`${it.weapon.toUpperCase()} AMMO`);
      return true;
    }
    case 'weapon': {
      const w = WEAPONS[it.weapon];
      const owned = p.weapons.has(it.weapon);
      const full = p.ammo[w.ammoType] >= w.maxAmmo;
      if (owned && full) return false;
      p.weapons.add(it.weapon);
      p.ammo[w.ammoType] = Math.min(w.maxAmmo, p.ammo[w.ammoType] + w.ammoGive);
      game.audio.weaponPickup();
      hud.message(w.name.toUpperCase());
      if (!owned) game.player.switchWeapon(it.weapon);
      hud.updateWeaponBar(p);
      return true;
    }
  }
  return false;
}
