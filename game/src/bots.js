// Marina bots: low-poly crew figures with a simple tactical brain. Each bot
// walks a waypoint route across the boardwalk, checks line of sight to its
// enemies every few ticks, and when it sees one it stops at range, strafes
// between bursts and fires with distance-based error. Raiders push the pier
// when the charge is planted (to defuse it); Wardens fall back to hold the
// pier tip. Bodies expose separate torso and head hit meshes so headshots
// pay for every shooter, human or bot.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { collideMove } from './player.js';
import { WAYPOINTS } from './world.js';

const BOT_SPEED = 3.6;
const BOT_HEIGHT = 1.74;
const SIGHT_RANGE = 34;
const FOV_COS = -0.15; // generous peripheral vision, blocked by walls anyway

const _ray = new THREE.Raycaster();
const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
const _dir = new THREE.Vector3();

export function hasLineOfSight(a, b, shootables, smokeBlock = null) {
  _from.set(a.x, 1.5, a.z);
  _to.set(b.x, 1.35, b.z);
  _dir.subVectors(_to, _from);
  const dist = _dir.length();
  if (dist > SIGHT_RANGE) return false;
  _dir.normalize();
  _ray.set(_from, _dir);
  _ray.far = dist - 0.6;
  if (_ray.intersectObjects(shootables, false).length > 0) return false;
  // A bloomed Mist Veil cloud blocks sight exactly like a wall does.
  if (smokeBlock && smokeBlock(a, b)) return false;
  return true;
}

function buildFigure(team) {
  const group = new THREE.Group();
  const kit = new THREE.MeshStandardMaterial({
    color: new THREE.Color(team === 'warden' ? PALETTE.warden : PALETTE.raider),
    roughness: 0.65, metalness: 0.05,
  });
  const skin = new THREE.MeshStandardMaterial({ color: 0xe8b98d, roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.8 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.72, 0.3), kit);
  torso.position.y = 1.06;
  torso.userData.part = 'torso';
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), skin);
  head.position.y = 1.6;
  head.userData.part = 'head';
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.18, 0.09, 10), kit);
  cap.position.y = 1.72;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.68, 0.2), dark);
  legL.position.set(-0.14, 0.34, 0);
  const legR = legL.clone();
  legR.position.x = 0.14;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.62), dark);
  gun.position.set(0.3, 1.12, -0.25);
  group.add(torso, head, cap, legL, legR, gun);
  group.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  return { group, torso, head, legL, legR };
}

export function createBots(scene, defs) {
  const bots = [];
  const hitMeshes = [];
  for (const def of defs) {
    const fig = buildFigure(def.team);
    fig.group.position.set(def.x, 0, def.z);
    scene.add(fig.group);
    const bot = {
      name: def.name,
      team: def.team,
      group: fig.group,
      torso: fig.torso,
      headMesh: fig.head,
      legL: fig.legL,
      legR: fig.legR,
      position: fig.group.position,
      velocity: new THREE.Vector3(),
      yaw: def.yaw ?? 0,
      hp: 100,
      alive: true,
      waypoint: def.waypoint ?? 0,
      thinkLeft: Math.random() * 0.2,
      target: null, // {kind:'player'|'bot', ref} chosen by main via setTargets
      visibleFor: 0,
      burstLeft: 0,
      burstWait: 0.4 + Math.random() * 0.5,
      shotCooldown: 0,
      strafeDir: Math.random() < 0.5 ? -1 : 1,
      strafeFlip: 1 + Math.random(),
      walkPhase: Math.random() * 6,
      fallT: 0,
      skill: def.skill ?? 0.5, // 0..1: reaction and accuracy
      holdPoint: def.hold ?? null,
      role: def.role ?? 'patrol',
    };
    fig.torso.userData.bot = bot;
    fig.head.userData.bot = bot;
    hitMeshes.push(fig.torso, fig.head);
    bots.push(bot);
  }

  function nearestWaypointIndex(pos) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < WAYPOINTS.length; i += 1) {
      const d = WAYPOINTS[i].distanceToSquared(pos);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  // Advances one bot. `ctx` carries the shared senses: enemy list (positions
  // + alive probes), the world colliders/shootables, the objective state and
  // a fire callback so main owns damage, tracers and sound.
  function stepBot(bot, dt, ctx) {
    if (!bot.alive) {
      bot.fallT = Math.min(1, bot.fallT + dt * 3);
      bot.group.rotation.x = -bot.fallT * 1.5;
      bot.group.position.y = -bot.fallT * 0.1;
      return;
    }
    bot.walkPhase += dt * (bot.velocity.length() > 0.2 ? 7 : 0);
    bot.legL.rotation.x = Math.sin(bot.walkPhase) * 0.5;
    bot.legR.rotation.x = -Math.sin(bot.walkPhase) * 0.5;

    bot.thinkLeft -= dt;
    if (bot.thinkLeft <= 0) {
      bot.thinkLeft = 0.12 + (1 - bot.skill) * 0.1;
      // Pick the closest visible enemy; keep a target briefly after losing sight.
      let best = null;
      let bestD = Infinity;
      for (const enemy of ctx.enemiesOf(bot)) {
        if (!enemy.alive()) continue;
        const p = enemy.position();
        const d = p.distanceTo(bot.position);
        if (d > SIGHT_RANGE) continue;
        const facing = -Math.sin(bot.yaw) * (p.x - bot.position.x) - Math.cos(bot.yaw) * (p.z - bot.position.z);
        if (d > 3 && facing / (d || 1) < FOV_COS) continue;
        if (!hasLineOfSight(bot.position, p, ctx.shootables, ctx.smokeBlock)) continue;
        if (d < bestD) { bestD = d; best = enemy; }
      }
      if (best) { bot.target = best; bot.visibleFor = 0.9; }
      else bot.visibleFor = Math.max(0, bot.visibleFor - 0.12);
      if (bot.visibleFor === 0) bot.target = null;
    }

    let moveTarget = null;
    let wantFire = false;
    if (bot.target) {
      const p = bot.target.position();
      const d = p.distanceTo(bot.position);
      bot.yaw = Math.atan2(-(p.x - bot.position.x), -(p.z - bot.position.z));
      if (d > 16) moveTarget = p; // close the distance
      else {
        // In range: sidestep between bursts to stay a hard target.
        bot.strafeFlip -= dt;
        if (bot.strafeFlip <= 0) { bot.strafeDir *= -1; bot.strafeFlip = 0.7 + Math.random() * 0.9; }
        moveTarget = {
          x: bot.position.x + Math.cos(bot.yaw) * bot.strafeDir * 2.2,
          z: bot.position.z - Math.sin(bot.yaw) * bot.strafeDir * 2.2,
        };
      }
      wantFire = bot.visibleFor > 0.55 || (bot.target && hasLineOfSight(bot.position, p, ctx.shootables, ctx.smokeBlock));
    } else if (ctx.objectiveFor(bot)) {
      moveTarget = ctx.objectiveFor(bot);
    } else if (bot.holdPoint && ctx.holdMode) {
      moveTarget = bot.holdPoint;
    } else {
      const wp = WAYPOINTS[bot.waypoint % WAYPOINTS.length];
      if (bot.position.distanceTo(wp) < 1.6) bot.waypoint += bot.team === 'warden' ? 1 : 2;
      moveTarget = wp;
    }

    // Steering: accelerate toward the move target, capped, collision-resolved.
    const vel = bot.velocity;
    if (moveTarget) {
      const dx = moveTarget.x - bot.position.x;
      const dz = moveTarget.z - bot.position.z;
      const len = Math.hypot(dx, dz);
      if (!bot.target) bot.yaw = Math.atan2(-dx, -dz);
      const speed = bot.target ? BOT_SPEED * 0.72 : BOT_SPEED;
      if (len > 0.4) {
        vel.x += ((dx / len) * speed - vel.x) * Math.min(1, dt * 6);
        vel.z += ((dz / len) * speed - vel.z) * Math.min(1, dt * 6);
      } else {
        vel.x *= Math.max(0, 1 - dt * 8);
        vel.z *= Math.max(0, 1 - dt * 8);
      }
    }
    vel.y -= 21 * dt;
    const ground = collideMove(bot.position, vel, dt, BOT_HEIGHT, ctx.colliders, 0.36);
    if (ground !== null) vel.y = 0;
    bot.group.rotation.y = bot.yaw;

    // Firing discipline: bursts of 3-5, pauses between, error shrinks with skill.
    bot.shotCooldown -= dt;
    if (wantFire && bot.target) {
      if (bot.burstLeft <= 0 && bot.burstWait > 0) bot.burstWait -= dt;
      if (bot.burstWait <= 0 && bot.burstLeft <= 0) {
        bot.burstLeft = 3 + Math.floor(Math.random() * 3);
        // Tuned after play-testing the first build: pauses were so long that
        // Raiders felt passive on the pier push. Skilled bots now re-engage
        // noticeably faster, while raw recruits still hesitate.
        bot.burstWait = 0.38 + Math.random() * 0.45 - bot.skill * 0.22;
      }
      if (bot.burstLeft > 0 && bot.shotCooldown <= 0) {
        bot.shotCooldown = 0.13;
        bot.burstLeft -= 1;
        const p = bot.target.position();
        const d = p.distanceTo(bot.position);
        const err = (0.028 + d * 0.0016) * (1.25 - bot.skill * 0.6);
        ctx.onBotFire(bot, bot.target, err);
      }
    } else {
      bot.burstLeft = 0;
      bot.burstWait = Math.max(bot.burstWait, 0.25);
    }
  }

  return {
    bots,
    hitMeshes,
    step(dt, ctx) { for (const bot of bots) stepBot(bot, dt, ctx); },
    damage(bot, amount) {
      if (!bot.alive) return false;
      bot.hp -= amount;
      if (bot.hp > 0) return false;
      bot.alive = false;
      bot.fallT = 0;
      return true;
    },
    aliveCount(team) { return bots.filter((b) => b.team === team && b.alive).length; },
    reset(defsAgain) {
      for (let i = 0; i < bots.length; i += 1) {
        const bot = bots[i];
        const def = defsAgain[i];
        bot.hp = 100;
        bot.alive = true;
        bot.fallT = 0;
        bot.target = null;
        bot.visibleFor = 0;
        bot.group.rotation.set(0, 0, 0);
        bot.position.set(def.x, 0, def.z);
        bot.velocity.set(0, 0, 0);
        bot.yaw = def.yaw ?? 0;
        bot.waypoint = nearestWaypointIndex(bot.position);
      }
    },
    nearestWaypointIndex,
  };
}
