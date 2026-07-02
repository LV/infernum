import { WEAPONS, SLOT_ORDER } from './weapons.js';

export class Hud {
  constructor() {
    this.healthEl = document.getElementById('health-val');
    this.armorEl = document.getElementById('armor-val');
    this.ammoEl = document.getElementById('ammo-val');
    this.fragsEl = document.getElementById('frags');
    this.timerEl = document.getElementById('timer');
    this.messagesEl = document.getElementById('messages');
    this.weaponBarEl = document.getElementById('weapon-bar');
    this.damageEl = document.getElementById('damage-vignette');
    this.lavaEl = document.getElementById('lava-vignette');
    this.pickupEl = document.getElementById('pickup-flash');
    this.hitmarkerEl = document.getElementById('hitmarker');
    this.deathScreen = document.getElementById('death-screen');
    this.deathStats = document.getElementById('death-stats');
    this.menuScreen = document.getElementById('menu-screen');

    this.damageAlpha = 0;
    this.pickupAlpha = 0;
    this.hitTimer = 0;

    this.slots = {};
    for (const k of SLOT_ORDER) {
      const w = WEAPONS[k];
      const div = document.createElement('div');
      div.className = 'wslot';
      div.textContent = `${w.slot} ${w.name.toUpperCase()}`;
      this.weaponBarEl.appendChild(div);
      this.slots[k] = div;
    }
  }

  setFrags(n) {
    this.fragsEl.textContent = `FRAGS ${n}`;
  }

  setTimer(t) {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    this.timerEl.textContent = `${m}:${s.toString().padStart(2, '0')}`;
  }

  message(text) {
    const div = document.createElement('div');
    div.className = 'msg';
    div.textContent = text;
    this.messagesEl.appendChild(div);
    while (this.messagesEl.children.length > 4) this.messagesEl.firstChild.remove();
    setTimeout(() => div.remove(), 2600);
  }

  damageFlash(strength) {
    this.damageAlpha = Math.min(1, this.damageAlpha + strength);
  }

  pickupFlash() {
    this.pickupAlpha = 1;
  }

  lavaVignette(on) {
    this.lavaEl.style.opacity = on ? 1 : 0;
  }

  hitmarker() {
    this.hitTimer = 0.18;
    this.hitmarkerEl.style.opacity = 1;
  }

  updateWeaponBar(p) {
    for (const k of SLOT_ORDER) {
      const el = this.slots[k];
      el.className = 'wslot';
      if (p.weapons.has(k)) el.classList.add('owned');
      if (p.currentWeapon === k) el.classList.add('current');
    }
  }

  showDeath(game) {
    this.deathScreen.style.display = 'flex';
    this.deathStats.textContent = `FRAGS ${game.frags}  ·  SURVIVED ${Math.floor(game.time / 60)}:${Math.floor(game.time % 60).toString().padStart(2, '0')}`;
  }

  hideDeath() {
    this.deathScreen.style.display = 'none';
  }

  update(game, dt) {
    const p = game.player;
    const hp = Math.ceil(p.health);
    this.healthEl.textContent = hp;
    this.healthEl.classList.toggle('low', hp <= 30);
    this.armorEl.textContent = Math.floor(p.armor);
    const w = WEAPONS[p.currentWeapon];
    this.ammoEl.textContent = w.ammoType ? p.ammo[w.ammoType] : '∞';

    this.updateWeaponBar(p);
    this.setTimer(game.time);

    this.damageAlpha = Math.max(0, this.damageAlpha - dt * 1.8);
    this.damageEl.style.opacity = this.damageAlpha.toFixed(2);
    this.pickupAlpha = Math.max(0, this.pickupAlpha - dt * 4);
    this.pickupEl.style.opacity = this.pickupAlpha.toFixed(2);

    if (this.hitTimer > 0) {
      this.hitTimer -= dt;
      if (this.hitTimer <= 0) this.hitmarkerEl.style.opacity = 0;
    }
  }
}
