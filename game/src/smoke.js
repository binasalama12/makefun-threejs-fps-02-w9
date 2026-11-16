// Mist Veil smoke clouds: a thrown canister blooms into a pale, churning
// cloud that blocks vision for everyone — bots test their sight lines
// against the live cloud list, so a veil dropped on the pier mouth or the
// cafe lane genuinely breaks an angle instead of just decorating it.
// Clouds are a fixed pool built once at boot: no per-frame allocation,
// no geometry churn, and `clear()` resets the pool between rounds.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const MAX_CLOUDS = 6;
const BLOOM_TIME = 1.15; // seconds from pop to full radius
const FULL_RADIUS = 3.4;
const LIFE = 13; // total seconds, including the fade-out tail
const FADE_TAIL = 2.6;
const PUFFS = 9;

// Fixed puff layout (unit offsets, scaled by the cloud radius) so every
// cloud reads as one churning mass rather than a single grey ball.
const PUFF_LAYOUT = [
  [0, 0.32, 0, 1.0], [0.55, 0.22, 0.3, 0.72], [-0.5, 0.26, -0.35, 0.78],
  [0.3, 0.18, -0.55, 0.66], [-0.35, 0.2, 0.5, 0.7], [0.05, 0.55, 0.1, 0.62],
  [-0.15, 0.12, -0.1, 0.8], [0.62, 0.3, -0.15, 0.55], [-0.6, 0.34, 0.18, 0.58],
];

const _ab = new THREE.Vector3();
const _ac = new THREE.Vector3();

export function createSmokeSystem(scene) {
  const clouds = [];
  for (let i = 0; i < MAX_CLOUDS; i += 1) {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE.foam), roughness: 1, metalness: 0,
      transparent: true, opacity: 0, depthWrite: false,
    });
    const puffs = [];
    for (const [ox, oy, oz, s] of PUFF_LAYOUT) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(s, 10, 8), mat);
      puff.position.set(ox, oy, oz);
      group.add(puff);
      puffs.push(puff);
    }
    group.visible = false;
    scene.add(group);
    clouds.push({ group, mat, puffs, age: Infinity, radius: 0, spin: 0.12 + i * 0.05 });
  }

  // Segment (a->b, ground plane) vs cloud disc: true when the sight line
  // passes through the dense part of a bloomed cloud.
  function blocks(a, b) {
    for (const c of clouds) {
      if (c.age > LIFE || c.radius < 1.1) continue;
      const cx = c.group.position.x;
      const cz = c.group.position.z;
      _ab.set(b.x - a.x, 0, b.z - a.z);
      _ac.set(cx - a.x, 0, cz - a.z);
      const lenSq = _ab.lengthSq() || 1;
      const t = Math.max(0, Math.min(1, _ac.dot(_ab) / lenSq));
      const dx = a.x + _ab.x * t - cx;
      const dz = a.z + _ab.z * t - cz;
      if (dx * dx + dz * dz < (c.radius * 0.92) ** 2) return true;
    }
    return false;
  }

  return {
    spawn(pos) {
      const cloud = clouds.find((c) => c.age > LIFE) ?? clouds[0];
      cloud.group.position.set(pos.x, 0.55, pos.z);
      cloud.age = 0;
      cloud.radius = 0.4;
      cloud.group.visible = true;
    },
    update(dt) {
      for (const c of clouds) {
        if (c.age > LIFE) { c.group.visible = false; continue; }
        c.age += dt;
        const bloom = Math.min(1, c.age / BLOOM_TIME);
        c.radius = 0.4 + (FULL_RADIUS - 0.4) * (1 - (1 - bloom) ** 3);
        c.group.scale.setScalar(c.radius);
        c.group.rotation.y += dt * c.spin;
        const fadeIn = Math.min(1, c.age / 0.35);
        const fadeOut = Math.min(1, Math.max(0, (LIFE - c.age) / FADE_TAIL));
        c.mat.opacity = 0.52 * Math.min(fadeIn, fadeOut);
        if (c.age > LIFE) c.group.visible = false;
      }
    },
    blocks,
    clear() {
      for (const c of clouds) { c.age = Infinity; c.radius = 0; c.group.visible = false; }
    },
  };
}
