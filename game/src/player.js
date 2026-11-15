// Player body: walk acceleration with ground friction, a slower crouch,
// gravity and a small hop, resolved axis by axis against the world's box
// colliders so corners slide instead of sticking. The same resolver is
// reused for bots through the exported collideMove helper.
import * as THREE from 'three';

export const PLAYER_RADIUS = 0.36;
const STAND_HEIGHT = 1.74;
const CROUCH_HEIGHT = 1.14;
const STAND_EYE = 1.62;
const CROUCH_EYE = 1.04;
const WALK_SPEED = 5.4;
const CROUCH_SPEED = 2.5;
const GRAVITY = 21;
const JUMP_SPEED = 6.4;

// Moves `pos` (feet position) by vel*dt, one axis at a time, cancelling an
// axis when the swept box would enter a collider. Returns the ground height
// landed on, or null when airborne. Shared by the player and the bots.
export function collideMove(pos, vel, dt, height, colliders, radius = PLAYER_RADIUS) {
  const probe = collideMove._probe ?? (collideMove._probe = new THREE.Box3());
  const hits = (x, y, z, lift) => {
    probe.min.set(x - radius, y + lift, z - radius);
    probe.max.set(x + radius, y + height - lift, z + radius);
    for (const c of colliders) if (probe.intersectsBox(c)) return c;
    return null;
  };
  const nx = pos.x + vel.x * dt;
  if (!hits(nx, pos.y, pos.z, 0.05)) pos.x = nx; else vel.x = 0;
  const nz = pos.z + vel.z * dt;
  if (!hits(pos.x, pos.y, nz, 0.05)) pos.z = nz; else vel.z = 0;
  pos.y += vel.y * dt;
  let ground = null;
  const hit = hits(pos.x, pos.y, pos.z, 0);
  if (hit && vel.y <= 0) { ground = hit.max.y; pos.y = ground; }
  else if (hit) { pos.y = hit.min.y - height; vel.y = 0; }
  if (pos.y < 0) { pos.y = 0; ground = 0; }
  return ground;
}

export function createPlayer(colliders) {
  const state = {
    position: new THREE.Vector3(-14, 0, 16),
    velocity: new THREE.Vector3(),
    yaw: Math.PI * 0.82,
    pitch: 0,
    eye: STAND_EYE,
    height: STAND_HEIGHT,
    crouching: false,
    onGround: true,
    hp: 100,
    alive: true,
  };
  const wish = new THREE.Vector3();

  function look(dx, dy) {
    state.yaw -= dx * 0.0021;
    state.pitch = Math.max(-1.45, Math.min(1.45, state.pitch - dy * 0.0021));
  }

  function recoil(pitchKick, yawKick) {
    state.pitch = Math.min(1.45, state.pitch + pitchKick);
    state.yaw += yawKick;
  }

  function step(dt, keys) {
    const wantCrouch = keys.has('ControlLeft') || keys.has('KeyC');
    state.crouching = wantCrouch;
    state.height = wantCrouch ? CROUCH_HEIGHT : STAND_HEIGHT;
    const eyeGoal = wantCrouch ? CROUCH_EYE : STAND_EYE;
    state.eye += (eyeGoal - state.eye) * Math.min(1, dt * 11);

    const fwd = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const side = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    wish.set(0, 0, 0);
    if (fwd || side) {
      const s = Math.sin(state.yaw);
      const c = Math.cos(state.yaw);
      wish.set(-s * fwd + c * side, 0, -c * fwd - s * side).normalize();
    }
    const topSpeed = wantCrouch ? CROUCH_SPEED : WALK_SPEED;
    const accel = state.onGround ? 11 : 2.2;
    state.velocity.x += (wish.x * topSpeed - state.velocity.x) * Math.min(1, accel * dt);
    state.velocity.z += (wish.z * topSpeed - state.velocity.z) * Math.min(1, accel * dt);

    if (keys.has('Space') && state.onGround) {
      state.velocity.y = JUMP_SPEED;
      state.onGround = false;
    }
    state.velocity.y -= GRAVITY * dt;
    const ground = collideMove(state.position, state.velocity, dt, state.height, colliders);
    state.onGround = ground !== null;
    if (state.onGround) state.velocity.y = 0;
    state.velocity.y = Math.max(-32, state.velocity.y);
  }

  return {
    state,
    step,
    look,
    recoil,
    speed() { return Math.hypot(state.velocity.x, state.velocity.z); },
    resetSpawn(x, z, yaw) {
      state.position.set(x, 0, z);
      state.velocity.set(0, 0, 0);
      state.yaw = yaw;
      state.pitch = 0;
      state.hp = 100;
      state.alive = true;
    },
  };
}
