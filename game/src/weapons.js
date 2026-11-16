// The Coral Marina armoury: five invented firearms plus a foam-burst
// grenade, each with its own price, damage, cadence, magazine and spread
// profile. Spread is the heart of the gunplay: it blooms while moving or
// spraying and settles to a pinpoint when the shooter stands still or
// crouches, so planted feet win duels.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  harborline: {
    id: 'harborline', name: 'Harborline P9', kind: 'pistol', price: 0,
    damage: 24, headMult: 4.0, fireGap: 0.24, auto: false, magSize: 12, reserve: 48,
    reloadTime: 1.25, pellets: 1, spreadBase: 0.006, spreadMove: 0.02, recoil: 0.011, range: 60,
  },
  kelp: {
    id: 'kelp', name: 'Kelp-9 Spraygun', kind: 'smg', price: 900,
    damage: 17, headMult: 3.2, fireGap: 0.075, auto: true, magSize: 32, reserve: 96,
    reloadTime: 1.7, pellets: 1, spreadBase: 0.011, spreadMove: 0.034, recoil: 0.007, range: 45,
  },
  breakwater: {
    id: 'breakwater', name: 'Breakwater SG', kind: 'shotgun', price: 1100,
    damage: 11, headMult: 2.0, fireGap: 0.85, auto: false, magSize: 6, reserve: 24,
    reloadTime: 2.4, pellets: 7, spreadBase: 0.045, spreadMove: 0.06, recoil: 0.03, range: 22,
  },
  beacon: {
    id: 'beacon', name: 'Beacon AR', kind: 'rifle', price: 2400,
    damage: 33, headMult: 4.0, fireGap: 0.105, auto: true, magSize: 30, reserve: 90,
    // Playtest tuning (W9 revision): the Beacon kicked a touch too hard for
    // its mid-range job, so recoil eases 0.012 -> 0.010 and its moving
    // spread tightens 0.026 -> 0.023. Anchored fire is unchanged, so the
    // stop-and-plant accuracy reward stays exactly where it was.
    reloadTime: 1.9, pellets: 1, spreadBase: 0.004, spreadMove: 0.023, recoil: 0.010, range: 80,
  },
  gullwing: {
    id: 'gullwing', name: 'Gullwing DMR', kind: 'dmr', price: 2700,
    damage: 68, headMult: 3.0, fireGap: 0.62, auto: false, magSize: 8, reserve: 32,
    reloadTime: 2.1, pellets: 1, spreadBase: 0.0015, spreadMove: 0.03, recoil: 0.026, range: 110,
  },
};
export const BUY_ORDER = ['kelp', 'breakwater', 'beacon', 'gullwing'];
export const GRENADE_PRICE = 300;
export const GRENADE_NAME = 'Foam Burst';
export const SMOKE_PRICE = 200;
export const SMOKE_NAME = 'Mist Veil';

export function createLoadout() {
  // owned: weapon ids the player has bought (the pistol is always owned).
  // ammo is tracked per weapon so switching keeps each magazine honest.
  const ammo = {};
  for (const id of Object.keys(WEAPONS)) {
    ammo[id] = { mag: WEAPONS[id].magSize, reserve: WEAPONS[id].reserve };
  }
  return {
    owned: new Set(['harborline']),
    current: 'harborline',
    ammo,
    grenades: 0,
    smokes: 0,
    cooldown: 0,
    reloadLeft: 0,
    flash: 0,
    kick: 0,
    shotsFired: 0, // consecutive shots, drives spray bloom
    bloomCool: 0,
  };
}

export function currentDef(loadout) { return WEAPONS[loadout.current]; }

export function spreadFor(loadout, speed, crouching) {
  const def = currentDef(loadout);
  const moveT = Math.min(1, speed / 5.4);
  let spread = def.spreadBase + moveT * def.spreadMove;
  // Playtest tuning (W9 revision): sustained-fire bloom now grows a little
  // slower per shot (0.0022 -> 0.0019) and caps lower (0.02 -> 0.018), so a
  // disciplined 4-5 round burst stays honest while a full mag dump still
  // blooms wide. Crouch settles slightly deeper (0.55 -> 0.52).
  spread += Math.min(0.018, loadout.shotsFired * 0.0019); // sustained fire blooms
  if (crouching) spread *= 0.52;
  if (speed < 0.4) spread *= 0.6; // fully stopped: the reward for anchoring
  return spread;
}

// A chunky low-poly view model per weapon kind, rebuilt on switch. Colours
// come from the marina palette: whitewash bodies, shutter-teal furniture,
// brass fittings and a coral safety stripe.
export function buildViewModel(kind) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.whitewash), roughness: 0.45, metalness: 0.3 });
  const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.shutter), roughness: 0.6, metalness: 0.25 });
  const brassMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.brass), roughness: 0.35, metalness: 0.6 });
  const coralMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.coral), roughness: 0.5, metalness: 0.1 });
  const add = (w, h, d, x, y, z, mat) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    group.add(m);
    return m;
  };
  if (kind === 'pistol') {
    add(0.07, 0.09, 0.24, 0, 0, -0.05, bodyMat);
    add(0.06, 0.05, 0.2, 0, 0.06, -0.06, darkMat);
    add(0.06, 0.14, 0.07, 0, -0.1, 0.05, darkMat);
  } else if (kind === 'smg') {
    add(0.08, 0.1, 0.34, 0, 0, -0.08, bodyMat);
    add(0.05, 0.05, 0.22, 0, 0.02, -0.32, darkMat);
    add(0.05, 0.16, 0.06, 0, -0.13, -0.02, darkMat);
    add(0.07, 0.07, 0.16, 0, -0.01, 0.16, coralMat);
  } else if (kind === 'shotgun') {
    add(0.09, 0.1, 0.4, 0, 0, -0.1, darkMat);
    add(0.07, 0.07, 0.34, 0, 0.01, -0.42, brassMat);
    add(0.08, 0.09, 0.2, 0, -0.02, 0.18, bodyMat);
  } else if (kind === 'dmr') {
    add(0.07, 0.09, 0.46, 0, 0, -0.14, bodyMat);
    add(0.04, 0.04, 0.42, 0, 0.03, -0.55, darkMat);
    add(0.05, 0.07, 0.12, 0, 0.1, -0.1, brassMat); // scope block
    add(0.06, 0.13, 0.06, 0, -0.11, 0.02, darkMat);
    add(0.07, 0.08, 0.2, 0, -0.01, 0.24, darkMat);
  } else { // rifle
    add(0.08, 0.1, 0.42, 0, 0, -0.12, bodyMat);
    add(0.05, 0.05, 0.3, 0, 0.02, -0.42, darkMat);
    add(0.05, 0.15, 0.06, 0, -0.12, 0.0, darkMat);
    add(0.07, 0.08, 0.2, 0, -0.01, 0.2, coralMat);
    add(0.03, 0.06, 0.03, 0, 0.09, -0.2, brassMat); // front post
  }
  group.position.set(0.25, -0.22, -0.45);
  return group;
}

export function createWeaponRig(camera) {
  const holder = new THREE.Group();
  camera.add(holder);
  let model = null;
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.16, 0.16),
    new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.visible = false;
  holder.add(flash);
  const light = new THREE.PointLight(0xffc46b, 0, 6);
  holder.add(light);

  return {
    holder,
    setWeapon(kind) {
      if (model) holder.remove(model);
      model = buildViewModel(kind);
      holder.add(model);
      flash.position.set(0.25, -0.19, kind === 'dmr' ? -1.05 : -0.85);
      light.position.set(0.25, -0.17, -0.7);
    },
    step(dt, loadout) {
      loadout.cooldown = Math.max(0, loadout.cooldown - dt);
      loadout.flash = Math.max(0, loadout.flash - dt);
      loadout.bloomCool = Math.max(0, loadout.bloomCool - dt);
      if (loadout.bloomCool === 0) loadout.shotsFired = Math.max(0, loadout.shotsFired - dt * 14);
      loadout.kick += (0 - loadout.kick) * Math.min(1, dt * 13);
      if (model) {
        model.position.z = -0.45 + loadout.kick;
        model.rotation.x = loadout.kick * 2.0;
        if (loadout.reloadLeft > 0) model.rotation.x = -0.5 * Math.sin(Math.min(1, loadout.reloadLeft) * Math.PI);
      }
      flash.visible = loadout.flash > 0;
      if (flash.visible) flash.rotation.z = loadout.flash * 40;
      light.intensity = loadout.flash > 0 ? 6 : 0;
      if (loadout.reloadLeft > 0) {
        loadout.reloadLeft = Math.max(0, loadout.reloadLeft - dt);
        if (loadout.reloadLeft === 0) {
          const def = currentDef(loadout);
          const slot = loadout.ammo[loadout.current];
          const take = Math.min(def.magSize - slot.mag, slot.reserve);
          slot.mag += take;
          slot.reserve -= take;
        }
      }
    },
    pullTrigger(loadout) {
      const def = currentDef(loadout);
      loadout.cooldown = def.fireGap;
      loadout.flash = 0.055;
      loadout.kick = 0.05 + def.recoil * 1.4;
      loadout.shotsFired += 1;
      loadout.bloomCool = 0.35;
    },
  };
}
