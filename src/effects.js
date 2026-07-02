import * as THREE from 'three';

const MAX_PARTICLES = 3000;

const particleVert = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aAlpha;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (900.0 / max(1.0, -mv.z));
    gl_Position = projectionMatrix * mv;
  }
`;

const particleFrag = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.05, d) * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor, a);
  }
`;

export class Effects {
  constructor(scene) {
    this.scene = scene;

    // ---- particle pool ----
    this.positions = new Float32Array(MAX_PARTICLES * 3);
    this.colors = new Float32Array(MAX_PARTICLES * 3);
    this.sizes = new Float32Array(MAX_PARTICLES);
    this.alphas = new Float32Array(MAX_PARTICLES);
    this.vels = new Float32Array(MAX_PARTICLES * 3);
    this.life = new Float32Array(MAX_PARTICLES);
    this.maxLife = new Float32Array(MAX_PARTICLES);
    this.grav = new Float32Array(MAX_PARTICLES);
    this.drag = new Float32Array(MAX_PARTICLES);
    this.baseSize = new Float32Array(MAX_PARTICLES);
    this.cursor = 0;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
    const mat = new THREE.ShaderMaterial({
      vertexShader: particleVert,
      fragmentShader: particleFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);

    // ---- pooled flash lights ----
    this.lights = [];
    for (let i = 0; i < 6; i++) {
      const l = new THREE.PointLight(0xff6622, 0, 600, 1.6);
      l.visible = false;
      scene.add(l);
      this.lights.push({ light: l, life: 0, maxLife: 1, intensity: 0 });
    }

    // ---- fading trails (railgun) ----
    this.trails = [];

    // ---- lightning beam ----
    const beamGeo = new THREE.BufferGeometry();
    beamGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(16 * 3), 3));
    this.beam = new THREE.Line(beamGeo, new THREE.LineBasicMaterial({
      color: 0xaaddff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.beam.visible = false;
    this.beam.frustumCulled = false;
    scene.add(this.beam);
    this.beamGlow = new THREE.PointLight(0x88bbff, 0, 500, 1.8);
    scene.add(this.beamGlow);
  }

  spawn(pos, vel, opts = {}) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % MAX_PARTICLES;
    this.positions[i * 3] = pos.x;
    this.positions[i * 3 + 1] = pos.y;
    this.positions[i * 3 + 2] = pos.z;
    this.vels[i * 3] = vel.x;
    this.vels[i * 3 + 1] = vel.y;
    this.vels[i * 3 + 2] = vel.z;
    const c = opts.color || { r: 1, g: 0.5, b: 0.1 };
    this.colors[i * 3] = c.r;
    this.colors[i * 3 + 1] = c.g;
    this.colors[i * 3 + 2] = c.b;
    this.baseSize[i] = opts.size || 6;
    this.sizes[i] = this.baseSize[i];
    this.maxLife[i] = this.life[i] = opts.life || 0.8;
    this.alphas[i] = 1;
    this.grav[i] = opts.gravity != null ? opts.gravity : 400;
    this.drag[i] = opts.drag != null ? opts.drag : 0.2;
  }

  burst(pos, count, opts = {}) {
    const speed = opts.speed || 200;
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const s = speed * (0.3 + Math.random() * 0.7);
      this.spawn(pos, {
        x: Math.sin(phi) * Math.cos(theta) * s + (opts.baseVel?.x || 0),
        y: Math.cos(phi) * s * (opts.upBias || 1) + (opts.baseVel?.y || 0),
        z: Math.sin(phi) * Math.sin(theta) * s + (opts.baseVel?.z || 0),
      }, opts);
    }
  }

  flash(pos, color, intensity, dist, life = 0.25) {
    let slot = this.lights.find(l => l.life <= 0);
    if (!slot) slot = this.lights[0];
    slot.light.position.set(pos.x, pos.y, pos.z);
    slot.light.color.set(color);
    slot.light.distance = dist;
    slot.light.visible = true;
    slot.intensity = intensity;
    slot.maxLife = slot.life = life;
  }

  // ---------------- canned effects ----------------

  explosion(pos, big = true) {
    const n = big ? 50 : 18;
    this.burst(pos, n, { speed: big ? 350 : 180, color: { r: 1, g: 0.55, b: 0.12 }, size: big ? 14 : 8, life: 0.7, gravity: 150 });
    this.burst(pos, n / 2, { speed: big ? 200 : 100, color: { r: 1, g: 0.9, b: 0.4 }, size: big ? 20 : 10, life: 0.35, gravity: 0 });
    this.burst(pos, 12, { speed: 120, color: { r: 0.25, g: 0.22, b: 0.2 }, size: 16, life: 1.4, gravity: -60, drag: 1.0 });
    this.flash(pos, 0xff7722, big ? 2200 : 900, big ? 700 : 350, big ? 0.35 : 0.2);
  }

  impact(pos, normal, color) {
    const c = color || { r: 1, g: 0.7, b: 0.3 };
    for (let i = 0; i < 8; i++) {
      this.spawn(pos, {
        x: normal.x * 120 + (Math.random() - 0.5) * 140,
        y: normal.y * 120 + Math.random() * 120,
        z: normal.z * 120 + (Math.random() - 0.5) * 140,
      }, { color: c, size: 4, life: 0.4, gravity: 500 });
    }
  }

  blood(pos, count = 14) {
    this.burst(pos, count, { speed: 160, color: { r: 0.7, g: 0.05, b: 0.02 }, size: 7, life: 0.7, gravity: 600 });
  }

  gib(pos) {
    this.burst(pos, 40, { speed: 280, color: { r: 0.75, g: 0.06, b: 0.02 }, size: 10, life: 1.0, gravity: 600 });
    this.burst(pos, 15, { speed: 150, color: { r: 1, g: 0.4, b: 0.1 }, size: 12, life: 0.5, gravity: 100 });
    this.flash(pos, 0xcc2200, 700, 300, 0.25);
  }

  teleportFx(pos) {
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 20 + Math.random() * 10;
      this.spawn(
        { x: pos.x + Math.cos(a) * r, y: pos.y + Math.random() * 60, z: pos.z + Math.sin(a) * r },
        { x: 0, y: 120 + Math.random() * 100, z: 0 },
        { color: { r: 0.6, g: 0.3, b: 1 }, size: 8, life: 0.6, gravity: 0 },
      );
    }
    this.flash(pos, 0x8844ff, 1500, 500, 0.3);
  }

  spawnFx(pos) {
    this.burst({ x: pos.x, y: pos.y + 30, z: pos.z }, 30, { speed: 120, color: { r: 1, g: 0.2, b: 0.05 }, size: 10, life: 0.8, gravity: -100 });
    this.flash(pos, 0xff2200, 1200, 400, 0.4);
  }

  jumppadFx(pos) {
    this.burst(pos, 20, { speed: 150, color: { r: 1, g: 0.6, b: 0.1 }, size: 8, life: 0.5, gravity: -200, upBias: 2 });
    this.flash(pos, 0xffaa33, 800, 300, 0.25);
  }

  railTrail(from, to) {
    const dir = new THREE.Vector3(to.x - from.x, to.y - from.y, to.z - from.z);
    const len = dir.length();
    dir.normalize();
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(from.x, from.y, from.z),
      new THREE.Vector3(to.x, to.y, to.z),
    ]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: 0xff3355, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    line.frustumCulled = false;
    this.scene.add(line);
    this.trails.push({ obj: line, life: 0.8, maxLife: 0.8 });

    // spiral of particles down the beam
    const steps = Math.min(80, Math.floor(len / 24));
    const up = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const side = new THREE.Vector3().crossVectors(dir, up).normalize();
    const side2 = new THREE.Vector3().crossVectors(dir, side).normalize();
    for (let i = 0; i < steps; i++) {
      const t = (i / steps) * len;
      const ang = i * 0.9;
      const r = 7;
      this.spawn({
        x: from.x + dir.x * t + (side.x * Math.cos(ang) + side2.x * Math.sin(ang)) * r,
        y: from.y + dir.y * t + (side.y * Math.cos(ang) + side2.y * Math.sin(ang)) * r,
        z: from.z + dir.z * t + (side.z * Math.cos(ang) + side2.z * Math.sin(ang)) * r,
      }, { x: 0, y: 10, z: 0 }, { color: { r: 1, g: 0.15, b: 0.3 }, size: 5, life: 0.8, gravity: 0, drag: 0 });
    }
  }

  lightningBeam(from, to, visible) {
    this.beam.visible = visible;
    this.beamGlow.intensity = visible ? 900 : 0;
    if (!visible) return;
    const pts = this.beam.geometry.attributes.position;
    const n = 16;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const jit = (i === 0 || i === n - 1) ? 0 : 9;
      pts.setXYZ(i,
        from.x + (to.x - from.x) * t + (Math.random() - 0.5) * jit,
        from.y + (to.y - from.y) * t + (Math.random() - 0.5) * jit,
        from.z + (to.z - from.z) * t + (Math.random() - 0.5) * jit,
      );
    }
    pts.needsUpdate = true;
    this.beamGlow.position.set(to.x, to.y, to.z);
  }

  update(dt) {
    // particles
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.alphas[i] = 0; continue; }
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.vels[i * 3] *= d;
      this.vels[i * 3 + 1] = this.vels[i * 3 + 1] * d - this.grav[i] * dt;
      this.vels[i * 3 + 2] *= d;
      this.positions[i * 3] += this.vels[i * 3] * dt;
      this.positions[i * 3 + 1] += this.vels[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.vels[i * 3 + 2] * dt;
      const frac = this.life[i] / this.maxLife[i];
      this.alphas[i] = frac;
      this.sizes[i] = this.baseSize[i] * (0.5 + 0.5 * frac);
    }
    const attrs = this.points.geometry.attributes;
    attrs.position.needsUpdate = true;
    attrs.aAlpha.needsUpdate = true;
    attrs.aSize.needsUpdate = true;

    // lights
    for (const l of this.lights) {
      if (l.life <= 0) continue;
      l.life -= dt;
      if (l.life <= 0) { l.light.visible = false; l.light.intensity = 0; continue; }
      l.light.intensity = l.intensity * (l.life / l.maxLife);
    }

    // trails
    for (let i = this.trails.length - 1; i >= 0; i--) {
      const tr = this.trails[i];
      tr.life -= dt;
      if (tr.life <= 0) {
        this.scene.remove(tr.obj);
        tr.obj.geometry.dispose();
        tr.obj.material.dispose();
        this.trails.splice(i, 1);
      } else {
        tr.obj.material.opacity = tr.life / tr.maxLife;
      }
    }
  }
}
