// Quake-style physics: units are roughly Quake units (player is 56 tall).
// Movement math follows Q3A's pmove: friction -> accelerate -> collide & slide.

export const GRAVITY = 800;
export const JUMP_VELOCITY = 270;
export const GROUND_SPEED = 320;
export const GROUND_ACCEL = 10;
export const AIR_ACCEL = 1;
export const FRICTION = 6;
export const STOP_SPEED = 100;
export const STEP_HEIGHT = 18;

const EPS = 0.03125; // 1/32, quake's magic epsilon

export class Box {
  constructor(minX, minY, minZ, maxX, maxY, maxZ) {
    this.min = { x: minX, y: minY, z: minZ };
    this.max = { x: maxX, y: maxY, z: maxZ };
  }
}

export class World {
  constructor() {
    this.boxes = [];
  }

  addBox(minX, minY, minZ, maxX, maxY, maxZ) {
    const b = new Box(minX, minY, minZ, maxX, maxY, maxZ);
    this.boxes.push(b);
    return b;
  }

  overlaps(min, max) {
    const out = [];
    for (const b of this.boxes) {
      if (min.x < b.max.x && max.x > b.min.x &&
          min.y < b.max.y && max.y > b.min.y &&
          min.z < b.max.z && max.z > b.min.z) out.push(b);
    }
    return out;
  }

  anyOverlap(min, max) {
    for (const b of this.boxes) {
      if (min.x < b.max.x && max.x > b.min.x &&
          min.y < b.max.y && max.y > b.min.y &&
          min.z < b.max.z && max.z > b.min.z) return true;
    }
    return false;
  }

  // Ray vs all boxes (slab method). dir must be normalized.
  // Returns { dist, point:{x,y,z}, normal:{x,y,z} } or null.
  trace(origin, dir, maxDist) {
    let best = maxDist;
    let bestNormal = null;
    for (const b of this.boxes) {
      const res = rayBox(origin, dir, b, best);
      if (res) { best = res.t; bestNormal = res.normal; }
    }
    if (!bestNormal) return null;
    return {
      dist: best,
      point: {
        x: origin.x + dir.x * best,
        y: origin.y + dir.y * best,
        z: origin.z + dir.z * best,
      },
      normal: bestNormal,
    };
  }
}

export function rayBox(o, d, box, maxDist) {
  let tmin = 0, tmax = maxDist;
  let normal = null;
  for (const axis of ['x', 'y', 'z']) {
    const inv = 1 / (d[axis] === 0 ? 1e-30 : d[axis]);
    let t1 = (box.min[axis] - o[axis]) * inv;
    let t2 = (box.max[axis] - o[axis]) * inv;
    let sign = -1;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; sign = 1; }
    if (t1 > tmin) {
      tmin = t1;
      normal = { x: 0, y: 0, z: 0 };
      normal[axis] = sign;
    }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (!normal || tmin <= 0) return null; // started inside or no entry
  return { t: tmin, normal };
}

// Ray vs a body's AABB (feet-origin). Returns t or null.
export function rayBody(o, d, body, maxDist) {
  const box = {
    min: { x: body.pos.x - body.halfW, y: body.pos.y, z: body.pos.z - body.halfW },
    max: { x: body.pos.x + body.halfW, y: body.pos.y + body.height, z: body.pos.z + body.halfW },
  };
  const res = rayBox(o, d, box, maxDist);
  return res ? res.t : null;
}

// Q3A ground friction.
export function applyFriction(vel, dt) {
  const speed = Math.hypot(vel.x, vel.z);
  if (speed < 0.1) { vel.x = 0; vel.z = 0; return; }
  const control = speed < STOP_SPEED ? STOP_SPEED : speed;
  let newspeed = speed - control * FRICTION * dt;
  if (newspeed < 0) newspeed = 0;
  const scale = newspeed / speed;
  vel.x *= scale;
  vel.z *= scale;
}

// Q3A accelerate: only adds speed up to wishspeed *in the wish direction*,
// which is what makes air-strafing gain speed.
export function accelerate(vel, wishX, wishZ, wishspeed, accel, dt) {
  const currentspeed = vel.x * wishX + vel.z * wishZ;
  const addspeed = wishspeed - currentspeed;
  if (addspeed <= 0) return;
  let accelspeed = accel * dt * wishspeed;
  if (accelspeed > addspeed) accelspeed = addspeed;
  vel.x += accelspeed * wishX;
  vel.z += accelspeed * wishZ;
}

function bodyBounds(body, out) {
  out.min.x = body.pos.x - body.halfW;
  out.min.y = body.pos.y;
  out.min.z = body.pos.z - body.halfW;
  out.max.x = body.pos.x + body.halfW;
  out.max.y = body.pos.y + body.height;
  out.max.z = body.pos.z + body.halfW;
}

const _b = { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };

// Move a body (pos = feet center, vel, halfW, height, onGround) through the
// world with axis-separated collide & slide, step-up, and stair snap-down.
export function moveBody(world, body, dt) {
  const wasGround = body.onGround;

  // --- horizontal axes with step-up ---
  for (const axis of ['x', 'z']) {
    if (body.vel[axis] === 0) continue;
    body.pos[axis] += body.vel[axis] * dt;
    bodyBounds(body, _b);
    const hits = world.overlaps(_b.min, _b.max);
    for (const b of hits) {
      // try stepping up onto low ledges
      const rise = b.max.y - body.pos.y;
      if (rise > 0 && rise <= STEP_HEIGHT && (wasGround || body.onGround)) {
        const oldY = body.pos.y;
        body.pos.y = b.max.y + EPS;
        bodyBounds(body, _b);
        if (!world.anyOverlap(_b.min, _b.max)) { body.onGround = true; continue; }
        body.pos.y = oldY;
        bodyBounds(body, _b);
      }
      // clip: push out along this axis
      if (body.vel[axis] > 0) body.pos[axis] = b.min[axis] - body.halfW - EPS;
      else body.pos[axis] = b.max[axis] + body.halfW + EPS;
      body.vel[axis] = 0;
      bodyBounds(body, _b);
    }
  }

  // --- vertical axis ---
  body.onGround = false;
  body.pos.y += body.vel.y * dt;
  bodyBounds(body, _b);
  const vhits = world.overlaps(_b.min, _b.max);
  for (const b of vhits) {
    if (body.vel.y <= 0) {
      // landing on top of a box (only if we actually came from above)
      if (body.pos.y < b.max.y && body.pos.y > b.max.y - 40) {
        body.pos.y = b.max.y + EPS;
        body.vel.y = 0;
        body.onGround = true;
      }
    } else {
      // head bump
      if (body.pos.y + body.height > b.min.y) {
        body.pos.y = b.min.y - body.height - EPS;
        body.vel.y = 0;
      }
    }
    bodyBounds(body, _b);
  }

  // --- snap down stairs/ledges so running downhill doesn't launch you ---
  if (!body.onGround && wasGround && body.vel.y <= 0) {
    bodyBounds(body, _b);
    const feet = body.pos.y;
    _b.min.y = feet - STEP_HEIGHT;
    _b.max.y = feet;
    let top = -Infinity;
    for (const b of world.overlaps(_b.min, _b.max)) {
      if (b.max.y <= feet + EPS && b.max.y > top) top = b.max.y;
    }
    if (top > -Infinity) {
      body.pos.y = top + EPS;
      body.vel.y = 0;
      body.onGround = true;
    }
  }
}

// A full pmove step for anything that walks (player, ground enemies).
// input: { wishX, wishZ (normalized wish dir), speed, jump }
export function pmove(world, body, input, dt) {
  if (body.onGround) {
    if (input.jump) {
      body.vel.y = JUMP_VELOCITY;
      body.onGround = false;
      // no friction on jump frame -> preserves bunnyhop speed
      accelerate(body.vel, input.wishX, input.wishZ, input.speed, AIR_ACCEL, dt);
    } else {
      applyFriction(body.vel, dt);
      accelerate(body.vel, input.wishX, input.wishZ, input.speed, GROUND_ACCEL, dt);
      body.vel.y = -GRAVITY * dt; // keep pressed to ground
    }
  } else {
    accelerate(body.vel, input.wishX, input.wishZ, input.speed, AIR_ACCEL, dt);
    body.vel.y -= GRAVITY * dt;
  }
  moveBody(world, body, dt);
}
