import * as THREE from 'three';

// ---------------- procedural textures ----------------

function makeCanvas(size, fn) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  fn(ctx, size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function rockTexture(base = [58, 44, 40], vary = 22) {
  return makeCanvas(256, (ctx, s) => {
    ctx.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 5000; i++) {
      const v = (Math.random() - 0.5) * 2 * vary;
      ctx.fillStyle = `rgb(${base[0] + v | 0},${base[1] + v | 0},${base[2] + v | 0})`;
      ctx.fillRect(Math.random() * s, Math.random() * s, 2 + Math.random() * 4, 2 + Math.random() * 4);
    }
    // cracks
    ctx.strokeStyle = 'rgba(8,4,3,0.7)';
    for (let i = 0; i < 25; i++) {
      ctx.beginPath();
      let x = Math.random() * s, y = Math.random() * s;
      ctx.moveTo(x, y);
      for (let j = 0; j < 6; j++) {
        x += (Math.random() - 0.5) * 60;
        y += (Math.random() - 0.5) * 60;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // faint ember veins
    ctx.strokeStyle = 'rgba(140,30,5,0.25)';
    for (let i = 0; i < 10; i++) {
      ctx.beginPath();
      let x = Math.random() * s, y = Math.random() * s;
      ctx.moveTo(x, y);
      for (let j = 0; j < 5; j++) {
        x += (Math.random() - 0.5) * 80;
        y += (Math.random() - 0.5) * 80;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  });
}

function lavaTexture() {
  return makeCanvas(256, (ctx, s) => {
    ctx.fillStyle = '#doesnotmatter';
    const grad = ctx.createLinearGradient(0, 0, s, s);
    grad.addColorStop(0, '#ff4400');
    grad.addColorStop(0.5, '#cc2200');
    grad.addColorStop(1, '#ff6600');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 900; i++) {
      const r = 4 + Math.random() * 22;
      const bright = Math.random();
      ctx.fillStyle = bright > 0.75
        ? `rgba(255,${200 + Math.random() * 55 | 0},60,0.5)`
        : `rgba(${60 + Math.random() * 60 | 0},8,4,0.45)`;
      ctx.beginPath();
      ctx.arc(Math.random() * s, Math.random() * s, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

// ---------------- level construction ----------------

export function buildLevel(scene, world) {
  const level = {
    spawnPoints: [],
    enemySpawns: [],
    jumpPads: [],
    teleporters: [],
    itemSpecs: [],
    torches: [],
    lavaTop: -110,
    lavaMeshes: [],
    animated: [],
  };

  const rockTex = rockTexture();
  rockTex.repeat.set(4, 4);
  const rockMat = new THREE.MeshStandardMaterial({ map: rockTex, roughness: 0.95, metalness: 0.05 });

  const darkTex = rockTexture([38, 27, 25], 16);
  darkTex.repeat.set(4, 4);
  const darkMat = new THREE.MeshStandardMaterial({ map: darkTex, roughness: 1, metalness: 0 });

  const trimMat = new THREE.MeshStandardMaterial({
    color: 0x1a0f0c, roughness: 0.6, metalness: 0.3,
    emissive: 0xff2200, emissiveIntensity: 0.25,
  });

  const lavaTex = lavaTexture();
  lavaTex.repeat.set(6, 6);
  const lavaMat = new THREE.MeshBasicMaterial({ map: lavaTex });
  level.lavaMat = lavaMat;

  // helper: physics box + visual box in one call
  function brush(minX, minY, minZ, maxX, maxY, maxZ, mat = rockMat, visual = true) {
    world.addBox(minX, minY, minZ, maxX, maxY, maxZ);
    if (visual) {
      const geo = new THREE.BoxGeometry(maxX - minX, maxY - minY, maxZ - minZ);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
      scene.add(mesh);
      return mesh;
    }
    return null;
  }

  const A = 1152;      // arena half-size
  const PIT = 384;     // lava pit half-size
  const WALL_H = 640;

  // ---- main floor: 4 slabs around the central lava pit ----
  brush(-A, -32, -A, -PIT, 0, A);          // west
  brush(PIT, -32, -A, A, 0, A);            // east
  brush(-PIT, -32, -A, PIT, 0, -PIT);      // north
  brush(-PIT, -32, PIT, PIT, 0, A);        // south

  // pit floor (deep below lava surface)
  brush(-PIT, -220, -PIT, PIT, -180, PIT, darkMat);
  // pit walls (inner faces of the slabs) are the slab sides; add liner for looks
  brush(-PIT - 8, -180, -PIT - 8, PIT + 8, -32, -PIT, darkMat);
  brush(-PIT - 8, -180, PIT, PIT + 8, -32, PIT + 8, darkMat);
  brush(-PIT - 8, -180, -PIT, -PIT, -32, PIT, darkMat);
  brush(PIT, -180, -PIT, PIT + 8, -32, PIT, darkMat);

  // ---- lava surface (visual only; damage handled by height check) ----
  const lavaGeo = new THREE.PlaneGeometry(PIT * 2 - 4, PIT * 2 - 4);
  const lava = new THREE.Mesh(lavaGeo, lavaMat);
  lava.rotation.x = -Math.PI / 2;
  lava.position.set(0, level.lavaTop, 0);
  scene.add(lava);
  level.lavaMeshes.push(lava);

  // big warm light from the pit
  const lavaLight = new THREE.PointLight(0xff4411, 45000, 2600, 1.7);
  lavaLight.position.set(0, 60, 0);
  scene.add(lavaLight);
  level.lavaLight = lavaLight;

  // ---- central platform above the lava + two crossing bridges ----
  brush(-144, 96, -144, 144, 128, 144, rockMat);              // the altar
  brush(-24, -180, -24, 24, 96, 24, darkMat);                  // supporting pillar
  brush(-48, -16, -PIT, 48, 0, -144, rockMat);                 // north bridge (at floor level)
  brush(-48, -16, 144, 48, 0, PIT, rockMat);                   // south bridge
  brush(-PIT, -16, -48, -144, 0, 48, rockMat);                 // west bridge
  brush(144, -16, -48, PIT, 0, 48, rockMat);                   // east bridge
  // stairs from bridges up to the altar (steps of 16, climbable via step-up... 96 high needs jump pads or stairs)
  for (let i = 0; i < 6; i++) {
    const y0 = i * 16, y1 = 96;
    const d = 144 + (6 - i) * 24;
    brush(-48, y0, d - 24, 48, Math.min(y0 + 16, y1), d, rockMat); // south staircase
  }
  for (let i = 0; i < 6; i++) {
    const y0 = i * 16;
    const d = -(144 + (6 - i) * 24);
    brush(-48, y0, d, 48, y0 + 16, d + 24, rockMat); // north staircase
  }

  // ---- perimeter walls ----
  brush(-A - 64, -32, -A - 64, A + 64, WALL_H, -A, darkMat);
  brush(-A - 64, -32, A, A + 64, WALL_H, A + 64, darkMat);
  brush(-A - 64, -32, -A, -A, WALL_H, A, darkMat);
  brush(A, -32, -A, A + 64, WALL_H, A, darkMat);

  // ---- corner towers (192 high, with stair spiral of big steps) ----
  const towers = [
    [-A + 288, -A + 288], [A - 288, -A + 288], [-A + 288, A - 288], [A - 288, A - 288],
  ];
  for (const [tx, tz] of towers) {
    brush(tx - 128, 0, tz - 128, tx + 128, 192, tz + 128, rockMat);
    // stairs approaching from the arena center side
    const sx = Math.sign(-tx), sz = Math.sign(-tz);
    for (let i = 0; i < 12; i++) {
      const y = i * 16;
      const off = 128 + (12 - i) * 20;
      brush(tx + (sx > 0 ? 128 + (12 - i - 1) * 20 : -off),
            y,
            tz - 48 * sz - (sz > 0 ? 0 : 0) - 48,
            tx + (sx > 0 ? off : -(128 + (12 - i - 1) * 20)),
            y + 16,
            tz - 48 * sz + 48,
            rockMat);
    }
    level.enemySpawns.push({ x: tx, y: 192, z: tz });
  }

  // ---- side ledges along east & west walls (reachable by jump pads) ----
  brush(-A, 160, -640, -A + 192, 192, 640, rockMat);
  brush(A - 192, 160, -640, A, 192, 640, rockMat);

  // ---- scattered pillars for cover ----
  const pillars = [
    [-640, -640], [640, -640], [-640, 640], [640, 640],
    [0, -800], [0, 800], [-800, 0], [800, 0],
  ];
  for (const [px, pz] of pillars) {
    brush(px - 56, 0, pz - 56, px + 56, 224, pz + 56, darkMat);
    brush(px - 68, 224, pz - 68, px + 68, 248, pz + 68, trimMat); // glowing cap
  }

  // ---- jump pads ----
  function jumpPad(x, z, vy, vx = 0, vz = 0) {
    brush(x - 48, 0, z - 48, x + 48, 8, z + 48, trimMat);
    const glowGeo = new THREE.CylinderGeometry(40, 40, 4, 24);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.85 });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.set(x, 10, z);
    scene.add(glow);
    level.animated.push({ mesh: glow, type: 'pad' });
    level.jumpPads.push({
      min: { x: x - 48, y: 0, z: z - 48 },
      max: { x: x + 48, y: 40, z: z + 48 },
      vel: { x: vx, y: vy, z: vz },
    });
  }
  // pads up to the side ledges (ledge top y=192: vy 600 apexes at 225)
  jumpPad(-825, 200, 600, -300, 0);
  jumpPad(825, -200, 600, 300, 0);
  // pads on the east/west bridges onto the central altar (top y=128)
  jumpPad(-300, 0, 550, 280, 0);
  jumpPad(300, 0, 550, -280, 0);

  // ---- teleporters: two gates that swap you across the arena ----
  function teleGate(x, z, destX, destZ, destYaw) {
    // frame
    brush(x - 72, 0, z - 16, x - 56, 160, z + 16, trimMat);
    brush(x + 56, 0, z - 16, x + 72, 160, z + 16, trimMat);
    brush(x - 72, 160, z - 16, x + 72, 184, z + 16, trimMat);
    // portal surface (visual)
    const pGeo = new THREE.PlaneGeometry(112, 160);
    const pMat = new THREE.MeshBasicMaterial({
      color: 0x7733ff, transparent: true, opacity: 0.55, side: THREE.DoubleSide,
    });
    const portal = new THREE.Mesh(pGeo, pMat);
    portal.position.set(x, 80, z);
    scene.add(portal);
    level.animated.push({ mesh: portal, type: 'portal' });
    level.teleporters.push({
      min: { x: x - 56, y: 0, z: z - 20 },
      max: { x: x + 56, y: 160, z: z + 20 },
      dest: { x: destX, y: 2, z: destZ },
      destYaw,
    });
  }
  teleGate(-900, -A + 40, 900, A - 140, Math.PI);   // NW gate -> SE corner, facing north
  teleGate(900, A - 40, -900, -A + 140, 0);         // SE gate -> NW corner, facing south

  // ---- torches on pillars & walls ----
  const torchSpots = [
    [-640, 260, -640], [640, 260, -640], [-640, 260, 640], [640, 260, 640],
    [120, 140, 120], [-120, 140, -120], // altar corners
  ];
  for (const [x, y, z] of torchSpots) {
    level.torches.push({ x, y, z });
  }

  // ---- player spawn points ----
  level.spawnPoints = [
    { x: -800, y: 2, z: -800, yaw: Math.PI * 0.75 },
    { x: 800, y: 2, z: -800, yaw: -Math.PI * 0.75 },
    { x: -800, y: 2, z: 800, yaw: Math.PI * 0.25 },
    { x: 800, y: 2, z: 800, yaw: -Math.PI * 0.25 },
    { x: 0, y: 2, z: -900, yaw: Math.PI },
    { x: 0, y: 2, z: 900, yaw: 0 },
  ];

  // ---- enemy spawn points (floor + ledges) ----
  level.enemySpawns.push(
    { x: -600, y: 2, z: 0 }, { x: 600, y: 2, z: 0 },
    { x: 0, y: 2, z: -600 }, { x: 0, y: 2, z: 600 },
    { x: -900, y: 2, z: -400 }, { x: 900, y: 2, z: 400 },
    { x: -A + 96, y: 194, z: 0 }, { x: A - 96, y: 194, z: 0 },
    { x: 0, y: 130, z: 0 },
  );

  // ---- items ----
  const I = level.itemSpecs;
  // weapons
  I.push({ type: 'weapon', weapon: 'shotgun', pos: { x: -700, y: 0, z: -300 } });
  I.push({ type: 'weapon', weapon: 'shotgun', pos: { x: 700, y: 0, z: 300 } });
  I.push({ type: 'weapon', weapon: 'rocket', pos: { x: 0, y: 128, z: 0 } });        // altar
  I.push({ type: 'weapon', weapon: 'rail', pos: { x: -A + 288, y: 192, z: -A + 288 } }); // NW tower
  I.push({ type: 'weapon', weapon: 'lightning', pos: { x: A - 96 - 20, y: 192, z: 0 } }); // east ledge
  I.push({ type: 'weapon', weapon: 'plasma', pos: { x: A - 288, y: 192, z: A - 288 } });  // SE tower
  // mega health + heavy armor
  I.push({ type: 'mega', pos: { x: -A + 96, y: 192, z: 0 } });   // west ledge
  I.push({ type: 'armor50', pos: { x: A - 288, y: 192, z: -A + 288 } }); // NE tower
  // health bubbles
  for (const [x, z] of [[-500, -500], [500, -500], [-500, 500], [500, 500], [0, -300], [0, 300]]) {
    I.push({ type: 'health25', pos: { x, y: 0, z } });
  }
  // armor shards near altar bridges
  for (const [x, z] of [[-250, 0], [250, 0], [0, -250], [0, 250]]) {
    I.push({ type: 'shard', pos: { x, y: 0, z } });
  }
  // ammo
  I.push({ type: 'ammo', weapon: 'rocket', pos: { x: -300, y: 0, z: -700 } });
  I.push({ type: 'ammo', weapon: 'rocket', pos: { x: 300, y: 0, z: 700 } });
  I.push({ type: 'ammo', weapon: 'shells', pos: { x: -700, y: 0, z: 300 } });
  I.push({ type: 'ammo', weapon: 'shells', pos: { x: 700, y: 0, z: -300 } });
  I.push({ type: 'ammo', weapon: 'cells', pos: { x: A - 288, y: 192, z: A - 288 - 100 } });
  I.push({ type: 'ammo', weapon: 'slugs', pos: { x: -A + 288, y: 192, z: -A + 288 + 100 } });
  I.push({ type: 'ammo', weapon: 'bullets', pos: { x: -100, y: 0, z: -850 } });
  I.push({ type: 'ammo', weapon: 'bullets', pos: { x: 100, y: 0, z: 850 } });

  // ---------------- atmosphere ----------------

  // hellish sky dome
  const skyGeo = new THREE.SphereGeometry(6000, 24, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vPos;
      void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vPos;
      uniform float uTime;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
                   mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      void main() {
        vec3 d = normalize(vPos);
        float h = clamp(d.y, 0.0, 1.0);
        vec3 horizon = vec3(0.60, 0.10, 0.02);
        vec3 zenith = vec3(0.06, 0.01, 0.02);
        vec3 col = mix(horizon, zenith, pow(h, 0.5));
        // slow rolling smoke
        float n = noise(d.xz / max(0.15, d.y + 0.3) * 3.0 + uTime * 0.02);
        n += 0.5 * noise(d.xz / max(0.15, d.y + 0.3) * 7.0 - uTime * 0.03);
        col += vec3(0.20, 0.03, 0.0) * n * (1.0 - h);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(sky);
  level.skyMat = skyMat;

  scene.fog = new THREE.FogExp2(0x1c0603, 0.00020);

  const hemi = new THREE.HemisphereLight(0x995533, 0x3a1409, 2.6);
  scene.add(hemi);
  const amb = new THREE.AmbientLight(0x553322, 0.9);
  scene.add(amb);
  const dir = new THREE.DirectionalLight(0xff6633, 1.3);
  dir.position.set(0.3, 1, 0.2);
  scene.add(dir);

  // torch lights + flame cones
  for (const t of level.torches) {
    const l = new THREE.PointLight(0xff7733, 16000, 1100, 1.8);
    l.position.set(t.x, t.y + 20, t.z);
    scene.add(l);
    t.light = l;
    t.baseIntensity = 16000;
    const flameGeo = new THREE.ConeGeometry(10, 30, 8);
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffaa33 });
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.set(t.x, t.y + 15, t.z);
    scene.add(flame);
    t.flame = flame;
  }

  return level;
}

// per-frame level animation: lava scroll, portal spin, torch flicker, embers
export function updateLevel(level, effects, dt, time) {
  level.lavaMat.map.offset.x = Math.sin(time * 0.05) * 0.2 + time * 0.008;
  level.lavaMat.map.offset.y = time * 0.011;
  level.lavaLight.intensity = 42000 + Math.sin(time * 2.1) * 6000 + Math.sin(time * 5.7) * 3000;
  level.skyMat.uniforms.uTime.value = time;

  for (const a of level.animated) {
    if (a.type === 'pad') {
      a.mesh.rotation.y += dt * 2;
      a.mesh.material.opacity = 0.6 + Math.sin(time * 5) * 0.25;
    } else if (a.type === 'portal') {
      a.mesh.material.opacity = 0.4 + Math.sin(time * 3) * 0.2;
    }
  }

  for (const t of level.torches) {
    t.light.intensity = t.baseIntensity * (0.8 + Math.random() * 0.4);
    t.flame.scale.y = 0.8 + Math.random() * 0.5;
  }

  // rising embers from the lava pit
  if (Math.random() < dt * 30) {
    effects.spawn(
      { x: (Math.random() - 0.5) * 700, y: level.lavaTop + 5, z: (Math.random() - 0.5) * 700 },
      { x: (Math.random() - 0.5) * 30, y: 60 + Math.random() * 90, z: (Math.random() - 0.5) * 30 },
      { color: { r: 1, g: 0.45, b: 0.08 }, size: 5, life: 3.5, gravity: -20, drag: 0.1 },
    );
  }
  // occasional lava bubble burst
  if (Math.random() < dt * 2) {
    const p = { x: (Math.random() - 0.5) * 650, y: level.lavaTop, z: (Math.random() - 0.5) * 650 };
    effects.burst(p, 8, { speed: 120, color: { r: 1, g: 0.5, b: 0.05 }, size: 8, life: 1.0, gravity: 300, upBias: 3 });
  }
  // torch embers
  for (const t of level.torches) {
    if (Math.random() < dt * 8) {
      effects.spawn(
        { x: t.x, y: t.y + 20, z: t.z },
        { x: (Math.random() - 0.5) * 20, y: 50, z: (Math.random() - 0.5) * 20 },
        { color: { r: 1, g: 0.6, b: 0.1 }, size: 4, life: 1.2, gravity: -30 },
      );
    }
  }
}
