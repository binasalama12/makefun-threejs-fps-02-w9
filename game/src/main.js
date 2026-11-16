// Coral Marina — Pier Charge. A round-based tactical FPS on three.js:
// the Tide Wardens (you plus Bima and Sinta) sail in from the south
// boardwalk; the Reef Raiders hold the marina. Win a round by wiping the
// Raiders out or by planting the charge at the pier tip and letting it
// blow; lose it by being wiped out, running out of time, or letting a
// Raider defuse. Between rounds a short buy phase turns round income
// into better guns and Foam Burst grenades. Accuracy is king: spread
// blooms on the move and under spray, and settles when you anchor or
// crouch. ?shot=start|play|end&seed=N renders one deterministic still.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld, SITE_POS, SITE_RADIUS, WARDEN_SPAWNS, RAIDER_SPAWNS } from './world.js';
import { createPlayer, collideMove } from './player.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { WEAPONS, BUY_ORDER, GRENADE_PRICE, GRENADE_NAME, SMOKE_PRICE, SMOKE_NAME, createLoadout, currentDef, spreadFor, createWeaponRig } from './weapons.js';
import { createBots, hasLineOfSight } from './bots.js';
import { createSmokeSystem } from './smoke.js';

const FIXED = 1 / 60;
const ROUND_TIME = 100;
const PLANT_TIME = 35;
const BUY_TIME = 12;
const FREEZE_TIME = 3;
const WIN_SCORE = 5;

const params = new URLSearchParams(window.location.search);
const shotMode = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(a) {
  return function next() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(shotMode ? seedParam * 7919 : (Date.now() % 2147483647));

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.sky), 42, 120);
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 260);
scene.add(camera);

// ---------- world / actors ----------
const world = createWorld(scene);
const player = createPlayer(world.colliders);
const body = player.state;
const loadout = createLoadout();
const rig = createWeaponRig(camera);
rig.setWeapon('pistol');
const audio = createAudio();
const hud = createHud();

const BOT_DEFS = [
  { name: 'Bima', team: 'warden', x: WARDEN_SPAWNS[1].x, z: WARDEN_SPAWNS[1].z, yaw: WARDEN_SPAWNS[1].yaw, skill: 0.45, waypoint: 11, hold: new THREE.Vector3(3.2, 0, -28.5) },
  { name: 'Sinta', team: 'warden', x: WARDEN_SPAWNS[2].x, z: WARDEN_SPAWNS[2].z, yaw: WARDEN_SPAWNS[2].yaw, skill: 0.58, waypoint: 12, hold: new THREE.Vector3(-3.1, 0, -27) },
  { name: 'Vargo', team: 'raider', x: RAIDER_SPAWNS[0].x, z: RAIDER_SPAWNS[0].z, yaw: RAIDER_SPAWNS[0].yaw, skill: 0.5, waypoint: 2 },
  { name: 'Mako', team: 'raider', x: RAIDER_SPAWNS[1].x, z: RAIDER_SPAWNS[1].z, yaw: RAIDER_SPAWNS[1].yaw, skill: 0.62, waypoint: 9 },
  { name: 'Rhea', team: 'raider', x: RAIDER_SPAWNS[2].x, z: RAIDER_SPAWNS[2].z, yaw: RAIDER_SPAWNS[2].yaw, skill: 0.55, waypoint: 5, role: 'site' },
];
const bots = createBots(scene, BOT_DEFS);
const botByName = new Map(bots.bots.map((b) => [b.name, b]));
const smoke = createSmokeSystem(scene);

// Enemy adapters shared by every bot's senses.
const playerAdapter = { isPlayer: true, alive: () => body.alive, position: () => body.position };
const botAdapters = new Map();
for (const b of bots.bots) {
  botAdapters.set(b, { isPlayer: false, bot: b, alive: () => b.alive, position: () => b.position });
}
function enemiesOf(bot) {
  if (bot.team === 'raider') {
    return [playerAdapter, ...bots.bots.filter((b) => b.team === 'warden').map((b) => botAdapters.get(b))];
  }
  return bots.bots.filter((b) => b.team === 'raider').map((b) => botAdapters.get(b));
}

// ---------- charge + effects ----------
const charge = new THREE.Group();
{
  const casing = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.2, 0.14),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5 }));
  const lampMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.coral), emissive: new THREE.Color(PALETTE.coral), emissiveIntensity: 2 });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), lampMat);
  lamp.position.y = 0.14;
  charge.add(casing, lamp);
  charge.visible = false;
  scene.add(charge);
}
const chargeLight = new THREE.PointLight(new THREE.Color(PALETTE.coral), 0, 9);
scene.add(chargeLight);

// Tracer pool: pre-allocated lines, reused per shot, never built per frame.
const tracers = [];
for (let i = 0; i < 28; i += 1) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 0x2));
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe2a8, transparent: true, opacity: 0.85 }));
  line.visible = false;
  line.frustumCulled = false;
  scene.add(line);
  tracers.push({ line, ttl: 0 });
}
function spawnTracer(a, b, color = 0xffe2a8) {
  const slot = tracers.find((t) => t.ttl <= 0) ?? tracers[0];
  const arr = slot.line.geometry.getAttribute('position');
  arr.setXYZ(0, a.x, a.y, a.z);
  arr.setXYZ(1, b.x, b.y, b.z);
  arr.needsUpdate = true;
  slot.line.material.color.setHex(color);
  slot.line.visible = true;
  slot.ttl = 0.07;
}
const effects = []; // expanding blast spheres
function spawnBlast(pos, color = 0xffa04e) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }));
  mesh.position.copy(pos).y += 0.8;
  scene.add(mesh);
  effects.push({ mesh, t: 0 });
}
const grenades = [];

// ---------- match state ----------
const S = {
  phase: 'buy', // buy | live | planted | roundEnd | matchEnd
  phaseT: BUY_TIME,
  round: 1,
  wScore: 0,
  rScore: 0,
  money: 800,
  kills: 0,
  deaths: 0,
  plantProgress: 0,
  defuseProgress: 0,
  endReason: '',
  started: false,
};
const input = createInput(renderer.domElement, onLockChange);

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}
function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
  syncCamera();
}

// ---------- economy ----------
function buyItems() {
  const items = BUY_ORDER.map((id, i) => ({
    key: i + 1, id, name: WEAPONS[id].name, price: WEAPONS[id].price,
    owned: loadout.owned.has(id), equipped: loadout.current === id,
    afford: S.money >= WEAPONS[id].price,
  }));
  items.push({
    key: 5, id: 'grenade', name: `${GRENADE_NAME} grenade`, price: GRENADE_PRICE,
    owned: loadout.grenades > 0, equipped: false, afford: S.money >= GRENADE_PRICE,
  });
  items.push({
    key: 6, id: 'smoke', name: `${SMOKE_NAME} smoke`, price: SMOKE_PRICE,
    owned: loadout.smokes > 0, equipped: false, afford: S.money >= SMOKE_PRICE,
  });
  return items;
}
function refreshBuy() { if (S.phase === 'buy') hud.showBuy(buyItems(), S.money); }
function equip(id) {
  if (!loadout.owned.has(id)) return;
  loadout.current = id;
  loadout.reloadLeft = 0;
  rig.setWeapon(WEAPONS[id].kind);
}
function buyKey(n) {
  const item = buyItems()[n - 1];
  if (!item) return;
  if (item.id === 'grenade') {
    if (S.money < GRENADE_PRICE || loadout.grenades >= 2) { audio.denied(); return; }
    S.money -= GRENADE_PRICE;
    loadout.grenades += 1;
    audio.buy();
  } else if (item.id === 'smoke') {
    if (S.money < SMOKE_PRICE || loadout.smokes >= 2) { audio.denied(); return; }
    S.money -= SMOKE_PRICE;
    loadout.smokes += 1;
    audio.buy();
    hud.feed(`Bought ${SMOKE_NAME} smoke`);
  } else if (loadout.owned.has(item.id)) {
    equip(item.id);
    audio.buy();
  } else if (S.money >= item.price) {
    S.money -= item.price;
    loadout.owned.add(item.id);
    const slot = loadout.ammo[item.id];
    slot.mag = WEAPONS[item.id].magSize;
    slot.reserve = WEAPONS[item.id].reserve;
    equip(item.id);
    audio.buy();
    hud.feed(`Bought ${item.name}`);
  } else audio.denied();
  refreshBuy();
}

// ---------- combat ----------
const _raycaster = new THREE.Raycaster();
const _dir = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _muzzle = new THREE.Vector3();
const _playerBox = new THREE.Box3();
const _hitPoint = new THREE.Vector3();

function aliveBotMeshes(exceptTeam = null) {
  const out = [];
  for (const b of bots.bots) {
    if (!b.alive) continue;
    if (exceptTeam && b.team === exceptTeam) continue;
    out.push(b.torso, b.headMesh);
  }
  return out;
}

function playerShoot() {
  const def = currentDef(loadout);
  const slot = loadout.ammo[loadout.current];
  if (loadout.reloadLeft > 0 || loadout.cooldown > 0) return;
  if (slot.mag <= 0) {
    audio.dryFire();
    loadout.cooldown = 0.3;
    startReload();
    return;
  }
  slot.mag -= 1;
  rig.pullTrigger(loadout);
  audio.shoot(def.kind);
  player.recoil(def.recoil * (0.8 + rng() * 0.5), (rng() - 0.5) * def.recoil * 0.9);
  const spread = spreadFor(loadout, player.speed(), body.crouching);
  camera.getWorldDirection(_dir);
  _muzzle.copy(camera.position).addScaledVector(_dir, 0.6);
  _muzzle.y -= 0.12;
  for (let p = 0; p < def.pellets; p += 1) {
    const d = _dir.clone();
    d.x += (rng() * 2 - 1) * spread;
    d.y += (rng() * 2 - 1) * spread;
    d.z += (rng() * 2 - 1) * spread;
    d.normalize();
    _raycaster.set(camera.position, d);
    _raycaster.far = 140;
    const hits = _raycaster.intersectObjects(world.shootables.concat(aliveBotMeshes()), false);
    let end = null;
    for (const hit of hits) {
      const bot = hit.object.userData.bot;
      if (bot && !bot.alive) continue;
      end = hit.point;
      if (bot) {
        const isHead = hit.object.userData.part === 'head';
        let dmg = def.damage * (isHead ? def.headMult : 1);
        if (hit.distance > def.range) dmg *= 0.45;
        const killed = bots.damage(bot, dmg);
        hud.hitMarker(killed, isHead);
        if (isHead) audio.headshot(killed); else audio.hit(killed);
        if (killed) {
          S.kills += 1;
          const reward = isHead ? 400 : 300;
          S.money += reward;
          hud.killFeed('You', bot.name, { headshot: isHead, weapon: def.name, bonus: `(+$${reward})` });
          checkElimination();
        }
      }
      break;
    }
    if (!end) end = camera.position.clone().addScaledVector(d, 70);
    spawnTracer(_muzzle, end, 0xffe2a8);
  }
}

function startReload() {
  const def = currentDef(loadout);
  const slot = loadout.ammo[loadout.current];
  if (loadout.reloadLeft > 0 || slot.mag >= def.magSize || slot.reserve <= 0) return;
  loadout.reloadLeft = def.reloadTime;
  audio.reload();
}

const BOT_DMG = 12;
function onBotFire(bot, target, err) {
  _origin.set(bot.position.x, bot.position.y + 1.32, bot.position.z);
  if (target.isPlayer) _hitPoint.set(body.position.x, body.position.y + body.eye - 0.12, body.position.z);
  else _hitPoint.set(target.bot.position.x, target.bot.position.y + 1.1, target.bot.position.z);
  _dir.subVectors(_hitPoint, _origin).normalize();
  _dir.x += (rng() * 2 - 1) * err;
  _dir.y += (rng() * 2 - 1) * err * 0.7;
  _dir.z += (rng() * 2 - 1) * err;
  _dir.normalize();
  const distToPlayer = body.alive ? _origin.distanceTo(body.position) : Infinity;
  if (distToPlayer < 30) audio.shoot('rifle');
  _raycaster.set(_origin, _dir);
  _raycaster.far = 90;
  const meshes = world.shootables.concat(aliveBotMeshes(bot.team));
  const hit = _raycaster.intersectObjects(meshes, false)[0];
  // The player is a box, not a mesh: test the same ray against it.
  let playerDist = Infinity;
  if (body.alive) {
    _playerBox.min.set(body.position.x - 0.37, body.position.y, body.position.z - 0.37);
    _playerBox.max.set(body.position.x + 0.37, body.position.y + body.height, body.position.z + 0.37);
    const p = _raycaster.ray.intersectBox(_playerBox, _hitPoint);
    if (p) playerDist = _origin.distanceTo(p);
  }
  const meshDist = hit ? hit.distance : Infinity;
  const gunTip = _origin.clone();
  gunTip.y -= 0.1;
  if (playerDist < meshDist) {
    spawnTracer(gunTip, _hitPoint, bot.team === 'raider' ? 0xff9a7a : 0x9ae8ff);
    if (bot.team === 'raider') hurtPlayer(BOT_DMG * (0.8 + rng() * 0.5));
    return;
  }
  if (hit) {
    spawnTracer(gunTip, hit.point, bot.team === 'raider' ? 0xff9a7a : 0x9ae8ff);
    const victim = hit.object.userData.bot;
    if (victim && victim.alive && victim.team !== bot.team) {
      const isHead = hit.object.userData.part === 'head';
      const dmg = BOT_DMG * (isHead ? 2.4 : 1);
      if (bots.damage(victim, dmg)) {
        hud.killFeed(bot.name, victim.name, { headshot: isHead });
        checkElimination();
      }
    }
  } else {
    spawnTracer(gunTip, _origin.clone().addScaledVector(_dir, 55), 0xffe2a8);
  }
}

function hurtPlayer(amount) {
  if (!body.alive || S.phase === 'roundEnd' || S.phase === 'matchEnd') return;
  body.hp -= amount;
  hud.damageFlash();
  audio.hurt();
  if (body.hp <= 0) {
    body.hp = 0;
    body.alive = false;
    S.deaths += 1;
    hud.feed('You were sunk by the Raiders');
    hud.showBanner('YOU ARE DOWN', 'Your crew fights on…');
    checkElimination();
  }
}

function throwGrenade() {
  if (loadout.grenades <= 0 || !body.alive) return;
  if (S.phase !== 'live' && S.phase !== 'planted') return;
  loadout.grenades -= 1;
  audio.throwWhoosh();
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.coral), roughness: 0.4 }));
  camera.getWorldDirection(_dir);
  mesh.position.copy(camera.position).addScaledVector(_dir, 0.5);
  scene.add(mesh);
  grenades.push({
    mesh, fuse: 1.5, kind: 'frag',
    vel: _dir.clone().multiplyScalar(17).add(new THREE.Vector3(0, 3.5, 0)),
    pos: mesh.position,
  });
}
function throwSmoke() {
  if (loadout.smokes <= 0 || !body.alive) return;
  if (S.phase !== 'live' && S.phase !== 'planted') return;
  loadout.smokes -= 1;
  audio.throwWhoosh();
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.foam), roughness: 0.5 }));
  camera.getWorldDirection(_dir);
  mesh.position.copy(camera.position).addScaledVector(_dir, 0.5);
  scene.add(mesh);
  grenades.push({
    mesh, fuse: 1.1, kind: 'smoke',
    vel: _dir.clone().multiplyScalar(16).add(new THREE.Vector3(0, 3.2, 0)),
    pos: mesh.position,
  });
}
function bloomSmoke(g) {
  scene.remove(g.mesh);
  smoke.spawn(g.pos);
  audio.smokePop();
  hud.feed(`${SMOKE_NAME} blooms — sight lines cut`);
}
function explodeGrenade(g) {
  scene.remove(g.mesh);
  spawnBlast(g.pos);
  audio.grenade();
  const hurt = (pos, apply) => {
    const d = pos.distanceTo(g.pos);
    if (d < 5.2) apply(Math.round(85 * (1 - d / 5.6)));
  };
  for (const b of bots.bots) {
    if (!b.alive) continue;
    if (!hasLineOfSight(g.pos, b.position, world.shootables) && g.pos.distanceTo(b.position) > 2) continue;
    hurt(b.position, (dmg) => {
      if (bots.damage(b, dmg)) {
        if (b.team === 'raider') { S.money += 200; hud.killFeed('You', b.name, { weapon: GRENADE_NAME }); }
        checkElimination();
      }
    });
  }
  if (body.alive) hurt(body.position, (dmg) => hurtPlayer(dmg * 0.55));
}

// ---------- round flow ----------
function checkElimination() {
  if (S.phase !== 'live' && S.phase !== 'planted') return;
  const raiders = bots.aliveCount('raider');
  const wardens = bots.aliveCount('warden') + (body.alive ? 1 : 0);
  if (raiders === 0) endRound('warden', 'Raiders eliminated');
  else if (wardens === 0) endRound('raider', 'Wardens eliminated');
}

function endRound(winner, reason) {
  if (S.phase === 'roundEnd' || S.phase === 'matchEnd') return;
  S.phase = 'roundEnd';
  S.phaseT = 4.2;
  S.endReason = reason;
  hud.hideBuy();
  hud.setPlant(null, '');
  if (winner === 'warden') {
    S.wScore += 1;
    S.money += 1500;
    audio.roundWin();
    hud.showBanner('WARDENS TAKE THE ROUND', `${reason} · +$1500`);
  } else {
    S.rScore += 1;
    S.money += 1200;
    audio.roundLose();
    hud.showBanner('RAIDERS TAKE THE ROUND', `${reason} · +$1200`);
  }
}

function startRound() {
  const spawn = WARDEN_SPAWNS[0];
  player.resetSpawn(spawn.x, spawn.z, spawn.yaw);
  bots.reset(BOT_DEFS);
  for (const g of grenades) scene.remove(g.mesh);
  grenades.length = 0;
  smoke.clear();
  for (const e of effects) scene.remove(e.mesh);
  effects.length = 0;
  charge.visible = false;
  chargeLight.intensity = 0;
  S.plantProgress = 0;
  S.defuseProgress = 0;
  S.phase = 'buy';
  S.phaseT = BUY_TIME;
  equip(loadout.current);
  refreshBuy();
  hud.showBanner(`ROUND ${S.round}`, 'Gear up at the chandlery');
}

function startMatch() {
  S.round = 1; S.wScore = 0; S.rScore = 0; S.money = 800; S.kills = 0; S.deaths = 0;
  const fresh = createLoadout();
  loadout.owned = fresh.owned;
  loadout.ammo = fresh.ammo;
  loadout.grenades = 0;
  loadout.smokes = 0;
  equip('harborline');
  startRound();
}

function showMatchEnd() {
  S.phase = 'matchEnd';
  const won = S.wScore > S.rScore;
  hud.showOverlay({
    title: won ? 'Marina Secured — Wardens Win' : 'Marina Lost — Raiders Win',
    copy: won
      ? 'The charge lit up the pier and the Raiders scattered. Coral Marina stays in Warden hands.'
      : 'The Raiders hold the marina tonight. Refit the crew and sail back in.',
    stats: [
      `Final score — Wardens ${S.wScore} : ${S.rScore} Raiders`,
      `Rounds played ${S.round} · Your eliminations ${S.kills} · Times sunk ${S.deaths}`,
      `Cash on hand $${S.money}`,
    ],
    action: 'Play again',
  });
  if (document.pointerLockElement) document.exitPointerLock();
}

function onLockChange(locked) {
  if (shotMode) return;
  if (locked) {
    S.started = true;
    hud.hideOverlay();
  } else if (S.phase !== 'matchEnd' && S.started) {
    hud.showOverlay({
      title: 'Coral Marina — Pier Charge',
      copy: 'Paused at the dock. Click to keep sailing.',
      stats: [`Round ${S.round} — Wardens ${S.wScore} : ${S.rScore} Raiders`, `Eliminations ${S.kills} · Cash $${S.money}`],
      action: 'Click to resume',
    });
  }
}
hud.onPlay(() => {
  audio.unlock();
  if (S.phase === 'matchEnd') startMatch();
  input.requestLock();
});

// ---------- simulation step ----------
const botCtx = {
  colliders: world.colliders,
  shootables: world.shootables,
  smokeBlock: (a, b) => smoke.blocks(a, b),
  holdMode: false,
  enemiesOf,
  objectiveFor(bot) {
    if (S.phase === 'planted') {
      if (bot.team === 'raider') return SITE_POS;
      return bot.holdPoint ?? null;
    }
    if (S.phase === 'live' && bot.role === 'site' && bot.team === 'raider') return SITE_POS;
    return null;
  },
  onBotFire,
};

function step(dt) {
  S.phaseT -= dt;
  world.update(dt, performance.now() / 1000);

  // Phase transitions driven by the clock.
  if (S.phase === 'buy' && S.phaseT <= 0) {
    // Freeze-time: weapons down, nobody moves, the objective banner gets
    // three clear seconds so the plan reads before the shooting starts.
    S.phase = 'freeze';
    S.phaseT = FREEZE_TIME;
    hud.hideBuy();
    hud.showBanner('PLANT THE CHARGE', 'Pier tip — hold F at the coral ring · the Raiders will defend it');
  } else if (S.phase === 'freeze' && S.phaseT <= 0) {
    S.phase = 'live';
    S.phaseT = ROUND_TIME;
    hud.showBanner('SAIL OUT', 'Plant the charge at the pier tip');
  } else if (S.phase === 'live' && S.phaseT <= 0) {
    endRound('raider', 'Time expired — no plant');
  } else if (S.phase === 'planted' && S.phaseT <= 0) {
    charge.visible = false;
    chargeLight.intensity = 0;
    spawnBlast(SITE_POS.clone());
    audio.explode();
    endRound('warden', 'Charge detonated at the pier tip');
  } else if (S.phase === 'roundEnd' && S.phaseT <= 0) {
    if (S.wScore >= WIN_SCORE || S.rScore >= WIN_SCORE) showMatchEnd();
    else { S.round += 1; startRound(); }
  }

  // The player moves in every active phase except freeze-time, where the
  // whole marina holds still; bots only fight once live.
  if (S.phase !== 'roundEnd' && S.phase !== 'matchEnd' && S.phase !== 'freeze') {
    if (body.alive) player.step(dt, input.state.keys);
    else body.eye += (0.55 - body.eye) * Math.min(1, dt * 3);
  }
  smoke.update(dt);
  rig.step(dt, loadout);
  botCtx.holdMode = S.phase === 'planted';
  if (S.phase === 'live' || S.phase === 'planted') bots.step(dt, botCtx);

  // Planting: hold F inside the ring.
  const inSite = body.position.distanceTo(SITE_POS) < SITE_RADIUS;
  if (S.phase === 'live' && body.alive && inSite && input.state.keys.has('KeyF')) {
    const before = Math.floor(S.plantProgress * 4);
    S.plantProgress += dt / 3;
    if (Math.floor(S.plantProgress * 4) !== before) audio.plantBeep();
    if (S.plantProgress >= 1) {
      S.phase = 'planted';
      S.phaseT = PLANT_TIME;
      charge.position.set(SITE_POS.x, 0.12, SITE_POS.z);
      charge.visible = true;
      audio.planted();
      hud.showBanner('CHARGE PLANTED', 'Defend the pier tip for 35 seconds');
      hud.feed('The charge is live at the pier tip');
    }
  } else if (S.phase === 'live') {
    S.plantProgress = Math.max(0, S.plantProgress - dt * 1.5);
  }
  if (S.phase === 'planted') {
    chargeLight.position.set(SITE_POS.x, 1, SITE_POS.z);
    chargeLight.intensity = (Math.sin(performance.now() / 90) > 0 ? 5 : 0.4);
    // A Raider standing on the charge defuses it.
    let defuser = null;
    for (const b of bots.bots) {
      if (b.team === 'raider' && b.alive && b.position.distanceTo(SITE_POS) < 1.7) defuser = b;
    }
    if (defuser) {
      S.defuseProgress += dt / 4;
      if (S.defuseProgress >= 1) {
        charge.visible = false;
        chargeLight.intensity = 0;
        audio.defuse();
        endRound('raider', `${defuser.name} defused the charge`);
      }
    } else S.defuseProgress = Math.max(0, S.defuseProgress - dt);
  }

  // Grenades in flight.
  for (let i = grenades.length - 1; i >= 0; i -= 1) {
    const g = grenades[i];
    g.fuse -= dt;
    g.vel.y -= 18 * dt;
    const ground = collideStepGrenade(g, dt);
    if (ground && g.vel.y < 0) { g.vel.y *= -0.35; g.vel.x *= 0.7; g.vel.z *= 0.7; }
    if (g.fuse <= 0) {
      grenades.splice(i, 1);
      if (g.kind === 'smoke') bloomSmoke(g); else explodeGrenade(g);
    }
  }
  // Tracers + blast effects fade.
  for (const t of tracers) {
    if (t.ttl > 0) { t.ttl -= dt; if (t.ttl <= 0) t.line.visible = false; }
  }
  for (let i = effects.length - 1; i >= 0; i -= 1) {
    const e = effects[i];
    e.t += dt * 1.6;
    e.mesh.scale.setScalar(1 + e.t * 7);
    e.mesh.material.opacity = Math.max(0, 0.85 * (1 - e.t));
    if (e.t >= 1) { scene.remove(e.mesh); effects.splice(i, 1); }
  }
}

function collideStepGrenade(g, dt) {
  const before = g.vel.y;
  const ground = collideMove(g.pos, g.vel, dt, 0.24, world.colliders, 0.12);
  if (ground !== null && before < 0) return true;
  return false;
}

// ---------- per-frame ----------
let lastTime = performance.now();
let accumulator = 0;
let prevFiring = false;

function handleKeys() {
  if (input.tapped('KeyR')) startReload();
  if (input.tapped('KeyG')) throwGrenade();
  if (input.tapped('KeyH')) throwSmoke();
  if (S.phase === 'buy') {
    for (let n = 1; n <= 6; n += 1) if (input.tapped(`Digit${n}`)) buyKey(n);
    if (input.tapped('KeyB')) hud.hideBuy();
  } else {
    const slots = ['harborline', 'kelp', 'breakwater', 'beacon', 'gullwing'];
    for (let n = 1; n <= 5; n += 1) {
      if (input.tapped(`Digit${n}`) && loadout.owned.has(slots[n - 1])) { equip(slots[n - 1]); audio.buy(); }
    }
    if (input.tapped('KeyB') && S.phase === 'live') hud.feed('The chandlery is closed mid-round');
  }
  input.clearPressed();
}

function refreshHud() {
  const def = currentDef(loadout);
  const slot = loadout.ammo[loadout.current];
  hud.setVitals(body.hp, S.money);
  hud.setAmmo(slot.mag, slot.reserve, def.name, loadout.grenades, loadout.smokes);
  hud.setTop(S.round, S.wScore, S.rScore, S.phaseT, S.phase);
  hud.setCrosshair(spreadFor(loadout, player.speed(), body.crouching) * 620);
  if (S.phase === 'live' && body.alive && body.position.distanceTo(SITE_POS) < SITE_RADIUS && S.plantProgress > 0) {
    hud.setPlant(S.plantProgress, 'Planting the charge…');
  } else if (S.phase === 'planted' && S.defuseProgress > 0.02) {
    hud.setPlant(S.defuseProgress, 'A Raider is defusing!');
  } else hud.setPlant(null, '');
  let objective = '';
  if (S.phase === 'buy') objective = 'Buy phase — the chandlery is open (keys 1–6)';
  else if (S.phase === 'freeze') objective = 'Freeze — plant the charge at the pier tip';
  else if (S.phase === 'live') objective = body.position.distanceTo(SITE_POS) < SITE_RADIUS ? 'Hold F to plant the charge' : 'Plant the charge at the pier tip';
  else if (S.phase === 'planted') objective = 'Charge planted — defend the pier tip!';
  else if (S.phase === 'roundEnd') objective = S.endReason;
  hud.setObjective(objective);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (input.state.locked && S.phase !== 'matchEnd') {
    const look = input.takeLook();
    if (body.alive) player.look(look.x, look.y);
    handleKeys();
    const firing = input.state.firing;
    const def = currentDef(loadout);
    if (firing && body.alive && (S.phase === 'live' || S.phase === 'planted')) {
      if (def.auto || !prevFiring) playerShoot();
    }
    prevFiring = firing;
    accumulator += dt;
    let n = 0;
    while (accumulator >= FIXED && n < 5) { step(FIXED); accumulator -= FIXED; n += 1; }
    if (accumulator > FIXED * 5) accumulator = 0;
  }
  syncCamera();
  refreshHud();
  renderer.render(scene, camera);
}

// ---------- screenshot mode ----------
function placeBot(name, x, z, yaw) {
  const b = botByName.get(name);
  b.position.set(x, 0, z);
  b.yaw = yaw;
  b.group.rotation.y = yaw;
  return b;
}
function setupShot(mode) {
  hud.hideOverlay();
  hud.hideBuy();
  world.update(0.016, 1.1);
  if (mode === 'start') {
    body.position.set(-12.5, 0, 14.5);
    equip('harborline');
    S.money = 2450;
    S.phase = 'buy';
    S.phaseT = BUY_TIME;
    aimAt(new THREE.Vector3(0, 1.2, -18));
    hud.showBuy(buyItems(), S.money);
    hud.showOverlay({
      title: 'Coral Marina — Pier Charge',
      copy: 'Sail in, fight down the boardwalk, and plant the charge at the pier tip. Wardens vs Raiders, first to 5 rounds.',
      stats: ['Round 1 · Cash $2450 · Beacon AR available at the chandlery'],
      action: 'Click to play',
    });
    hud.setObjective('Buy phase — the chandlery is open (keys 1–6)');
  } else if (mode === 'play') {
    body.position.set(2.5, 0, -4.5);
    body.hp = 68;
    loadout.owned.add('beacon');
    equip('beacon');
    loadout.ammo.beacon.mag = 17;
    S.money = 1350;
    S.phase = 'live';
    S.phaseT = 47;
    S.round = 3;
    S.wScore = 2;
    S.rScore = 1;
    placeBot('Sinta', -3.5, -8.5, Math.PI);
    placeBot('Bima', -8, 2, Math.PI * 0.9);
    placeBot('Vargo', -1.5, -17, 0.1);
    placeBot('Mako', 4.5, -21, -0.2);
    placeBot('Rhea', 1, -30, 0);
    aimAt(new THREE.Vector3(-1.2, 1.25, -17));
    loadout.flash = 0.05;
    rig.step(0.001, loadout);
    const from = new THREE.Vector3(2.3, 1.45, -5.2);
    const to = new THREE.Vector3(-1.3, 1.3, -16.6);
    spawnTracer(from, to, 0xffe2a8);
    tracers[0].ttl = 9999;
    hud.setObjective('Plant the charge at the pier tip');
  } else { // end
    body.position.set(5.5, 0, -24);
    S.wScore = 5;
    S.rScore = 3;
    S.round = 8;
    S.kills = 9;
    S.deaths = 4;
    S.money = 2600;
    S.phase = 'matchEnd';
    charge.position.set(SITE_POS.x, 0.12, SITE_POS.z);
    charge.visible = true;
    placeBot('Bima', 2.5, -29, 2.6);
    placeBot('Sinta', -2.8, -27.5, -2.4);
    placeBot('Vargo', -6, -12, 0.4);
    botByName.get('Vargo').alive = false;
    botByName.get('Vargo').group.rotation.x = -1.5;
    aimAt(new THREE.Vector3(0, 1, -33));
    hud.showOverlay({
      title: 'Marina Secured — Wardens Win',
      copy: 'The charge lit up the pier and the Raiders scattered. Coral Marina stays in Warden hands.',
      stats: [
        'Final score — Wardens 5 : 3 Raiders',
        'Rounds played 8 · Your eliminations 9 · Times sunk 4',
        'Cash on hand $2600',
      ],
      action: 'Play again',
    });
  }
  refreshHud();
  // The end scoreboard reads best with the buy panel and feed out of the way.
  if (mode === 'end') hud.setObjective('Final — Wardens take Coral Marina');
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- boot ----------
player.resetSpawn(WARDEN_SPAWNS[0].x, WARDEN_SPAWNS[0].z, WARDEN_SPAWNS[0].yaw);
refreshBuy();
syncCamera();
if (shotMode) {
  setupShot(shotMode);
  let painted = 0;
  const paint = () => {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) window.__shotReady = true;
  };
  requestAnimationFrame(paint);
} else {
  hud.showOverlay({
    title: 'Coral Marina — Pier Charge',
    copy: 'Sail in, fight down the boardwalk, and plant the charge at the pier tip. Wardens vs Raiders, first to 5 rounds.',
    stats: ['Win by elimination or by detonating the charge · Lose it to a defuse or the clock'],
    action: 'Click to play',
  });
  requestAnimationFrame(frame);
}
