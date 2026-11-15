// Coral Marina: a yacht basin fought over on foot. A wide timber boardwalk
// (south) holds the Warden spawn and two huts; a narrow pier reaches north
// over open water to the charge site at its tip. The boathouse west and the
// cafe east pinch three lanes — west yard, central boardwalk, east slips —
// that all funnel onto the pier. Everything solid is a box collider and a
// bullet stop; the water, boats and masts are dressing built from the same
// primitives.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const SITE_POS = new THREE.Vector3(0, 0, -33);
export const SITE_RADIUS = 3.6;

export const WAYPOINTS = [
  [-16, 12], [-16, -1], [-10, -10], [-5, -13], [0, -16], [0, -24], [0, -32],
  [6, -13], [11, -9], [16, -1], [16, 11], [8, 15], [-8, 15], [0, 5],
  [-7, -3], [7, -3], [-13, 5], [13, 6],
].map(([x, z]) => new THREE.Vector3(x, 0, z));

export const WARDEN_SPAWNS = [
  { x: -14, z: 16, yaw: Math.PI * 0.85 },
  { x: -17.5, z: 12.5, yaw: Math.PI * 0.8 },
  { x: -10.5, z: 18, yaw: Math.PI * 0.9 },
];
export const RAIDER_SPAWNS = [
  { x: -16, z: -11, yaw: -Math.PI * 0.15 },
  { x: 15, z: -7, yaw: Math.PI * 0.2 },
  { x: 3.5, z: -21, yaw: Math.PI },
];

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];
  const shootables = [];
  const mat = (hex, rough = 0.9, metal = 0.02) =>
    new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), roughness: rough, metalness: metal });
  const M = {
    deck: mat(PALETTE.deck, 0.95), deckDark: mat(PALETTE.deckDark, 0.95),
    white: mat(PALETTE.whitewash, 0.85), shutter: mat(PALETTE.shutter, 0.7),
    roof: mat(PALETTE.roof, 0.8), coral: mat(PALETTE.coral, 0.6),
    aqua: mat(PALETTE.aqua, 0.55, 0.1), crate: mat(PALETTE.crate, 0.9),
    barrel: mat(PALETTE.barrel, 0.5, 0.25), brass: mat(PALETTE.brass, 0.35, 0.6),
    ink: mat(PALETTE.ink, 0.8), foam: mat(PALETTE.foam, 0.4),
  };

  function box(w, h, d, x, y, z, material, solid = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (solid) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }
  function cylinder(rt, rb, h, x, y, z, material, solid = true, seg = 12) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (solid) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }

  // --- Ground: boardwalk slab + pier strip, both topping out at y = 0.
  box(44, 0.5, 40, 0, -0.25, 0, M.deck);
  box(8, 0.5, 17, 0, -0.25, -28.5, M.deckDark);
  // Plank stripes so the deck reads as timber at a glance (non-solid).
  for (let z = -19; z <= 19; z += 4) box(44, 0.02, 0.18, 0, 0.012, z, M.deckDark, false);
  for (let z = -36; z <= -21; z += 3) box(8, 0.02, 0.16, 0, 0.012, z, M.deck, false);

  // --- Water: one big translucent plane below deck level, plus foam lips.
  const waterMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.water), roughness: 0.28, metalness: 0.15,
    transparent: true, opacity: 0.94,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(340, 340), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.55;
  water.receiveShadow = true;
  group.add(water);
  const deep = new THREE.Mesh(new THREE.PlaneGeometry(340, 340), mat(PALETTE.waterDeep, 1));
  deep.rotation.x = -Math.PI / 2;
  deep.position.y = -1.4;
  group.add(deep);
  box(44.6, 0.16, 0.5, 0, -0.28, 20.2, M.foam, false);
  box(0.5, 0.16, 40.5, -22.2, -0.28, 0, M.foam, false);
  box(0.5, 0.16, 40.5, 22.2, -0.28, 0, M.foam, false);

  // --- Railings keep everyone out of the drink (low, shoot-over height).
  box(44, 1.0, 0.3, 0, 0.5, 19.8, M.white);
  box(0.3, 1.0, 40, -21.8, 0.5, 0, M.white);
  box(0.3, 1.0, 40, 21.8, 0.5, 0, M.white);
  box(0.3, 1.0, 17, -3.9, 0.5, -28.5, M.white);
  box(0.3, 1.0, 17, 3.9, 0.5, -28.5, M.white);
  box(8, 1.0, 0.3, 0, 0.5, -36.8, M.coral); // pier tip rail behind the site

  // --- Boathouse (west): whitewash walls, shutter doors, coral roof.
  box(0.4, 3.4, 10, -20.5, 1.7, -9, M.white);
  box(0.4, 3.4, 10, -11.5, 1.7, -9, M.white);
  box(9.4, 3.4, 0.4, -16, 1.7, -14, M.white);
  box(3.4, 3.4, 0.4, -19.3, 1.7, -4, M.white);
  box(3.4, 3.4, 0.4, -12.7, 1.7, -4, M.white);
  box(9.8, 0.35, 10.8, -16, 3.6, -9, M.roof);
  box(2.6, 2.4, 0.18, -16, 1.2, -3.85, M.shutter, false); // door leaf in the gap
  box(6.5, 1.1, 1.1, -16, 0.55, -6.5, M.crate); // workbench cover inside the yard mouth

  // --- Cafe hut (east) with an aqua awning and a serving counter.
  box(7, 2.9, 0.4, 15.5, 1.45, -11, M.white);
  box(0.4, 2.9, 7, 19, 1.45, -7.5, M.white);
  box(7, 2.9, 0.4, 15.5, 1.45, -4, M.white);
  box(7.6, 0.3, 7.6, 15.5, 3.05, -7.5, M.roof);
  box(4.6, 0.18, 2.0, 13.4, 2.2, -7.5, M.aqua, false); // awning
  box(3.6, 1.05, 0.9, 12.3, 0.52, -7.5, M.crate); // counter

  // --- Ticket kiosk (south centre) and planters splitting the boardwalk.
  box(3.2, 2.6, 2.6, 6, 1.3, 9, M.white);
  box(3.8, 0.28, 3.2, 6, 2.75, 9, M.shutter);
  box(5.5, 0.95, 1.1, -3, 0.47, 3, M.white);
  box(5.5, 0.95, 1.1, 4, 0.47, -6, M.white);
  box(1.1, 0.95, 5.0, -7, 0.47, -8, M.white);
  box(1.1, 0.95, 5.0, 8, 0.47, 2, M.white);

  // --- Crates, barrels and lobster pots: the working cover of the marina.
  const crateAt = (x, z, s = 1.15, y = null) => box(s, s, s, x, y ?? s / 2, z, M.crate);
  crateAt(-9, 11); crateAt(-7.8, 11, 0.9, 0.45); crateAt(-8.4, 11, 0.8, 1.55);
  crateAt(12, 13); crateAt(13.2, 13); crateAt(12.6, 13, 0.85, 1.55);
  crateAt(-4, -13); crateAt(-2.8, -13);
  crateAt(10, -14); crateAt(11.2, -14, 0.9, 0.45);
  crateAt(-13, -17); crateAt(14, 4, 1.3, 0.65);
  crateAt(-2.2, -22, 1.0, 0.5); crateAt(2.4, -27, 1.0, 0.5); crateAt(-2.4, -30, 0.9, 0.45);
  const barrelAt = (x, z) => cylinder(0.42, 0.42, 1.05, x, 0.52, z, M.barrel);
  barrelAt(-18, 6); barrelAt(-17.1, 6.6); barrelAt(18.5, -14); barrelAt(9, 17);
  barrelAt(-9.5, -17.5); barrelAt(3.1, -18.6); barrelAt(-3.2, -25.5);

  // --- Lamp posts and mooring bollards (thin cover, strong silhouettes).
  for (const [x, z] of [[-20, 17], [20, 17], [-20, -18], [20, -18], [-3.4, -20], [3.4, -20], [0, 18]]) {
    cylinder(0.09, 0.12, 3.4, x, 1.7, z, M.ink);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xffe6a8, emissive: 0xffc46b, emissiveIntensity: 0.9 }));
    lamp.position.set(x, 3.5, z);
    group.add(lamp);
  }
  for (const [x, z] of [[-3.4, -24], [3.4, -30], [-3.4, -35], [3.4, -35.5]]) {
    cylinder(0.16, 0.2, 0.7, x, 0.35, z, M.brass);
  }

  // --- Charge site marker at the pier tip: a coral ring and beacon pylon.
  const ring = new THREE.Mesh(new THREE.RingGeometry(SITE_RADIUS - 0.35, SITE_RADIUS, 40),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.coral), transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(SITE_POS.x, 0.03, SITE_POS.z);
  group.add(ring);
  box(0.5, 1.5, 0.5, 2.8, 0.75, -35.8, M.ink);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.coral), emissive: new THREE.Color(PALETTE.coral), emissiveIntensity: 1.4 }));
  beacon.position.set(2.8, 1.65, -35.8);
  group.add(beacon);

  // --- Boats from primitives, moored in the water beside the pier.
  const boats = [];
  function boat(x, z, yaw, hullHex) {
    const b = new THREE.Group();
    const hullMat = mat(hullHex, 0.6);
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 6.4), hullMat);
    hull.position.y = 0.1;
    const bow = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.8, 1.8), hullMat);
    bow.position.set(0, 0.12, -3.9);
    bow.rotation.y = Math.PI / 4;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.9, 2.0), M.white);
    cabin.position.set(0, 0.95, 0.6);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 5.2, 8), M.deckDark);
    mast.position.set(0, 2.8, -1.2);
    const sailShape = new THREE.Shape();
    sailShape.moveTo(0, 0); sailShape.lineTo(0, 3.4); sailShape.lineTo(1.9, 0.3); sailShape.lineTo(0, 0);
    const sail = new THREE.Mesh(new THREE.ShapeGeometry(sailShape),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.foam), side: THREE.DoubleSide, roughness: 0.9 }));
    sail.position.set(0.07, 1.4, -1.2);
    b.add(hull, bow, cabin, mast, sail);
    b.position.set(x, -0.75, z);
    b.rotation.y = yaw;
    b.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    group.add(b);
    // Fixed per-boat phase (not Math.random) so screenshot scenes stay
    // deterministic for a given seed.
    boats.push({ group: b, phase: boats.length * 1.93 });
    return b;
  }
  boat(9.5, -27, 0.25, PALETTE.whitewash);
  boat(-9.5, -30, -0.3, PALETTE.coral);
  boat(13, -14, 1.2, PALETTE.shutter);
  boat(-14, -22, 0.9, PALETTE.brass);

  // --- Light: high sun, warm key with shadows, aqua bounce off the water.
  const hemi = new THREE.HemisphereLight(new THREE.Color(PALETTE.sky), new THREE.Color(PALETTE.waterDeep), 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
  sun.position.set(26, 34, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -38; sun.shadow.camera.right = 38;
  sun.shadow.camera.top = 38; sun.shadow.camera.bottom = -38;
  sun.shadow.camera.far = 110;
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);
  const bounce = new THREE.DirectionalLight(new THREE.Color(PALETTE.aqua), 0.5);
  bounce.position.set(-18, 8, -24);
  scene.add(bounce);

  let pulse = 0;
  return {
    colliders,
    shootables,
    group,
    update(dt, t) {
      pulse += dt;
      water.position.y = -0.55 + Math.sin(t * 0.7) * 0.05;
      waterMat.opacity = 0.92 + Math.sin(t * 1.3) * 0.03;
      for (const b of boats) {
        b.group.position.y = -0.75 + Math.sin(t * 0.8 + b.phase) * 0.09;
        b.group.rotation.z = Math.sin(t * 0.6 + b.phase) * 0.02;
      }
      const s = 1 + Math.sin(pulse * 2.4) * 0.03;
      ring.scale.set(s, s, 1);
      beacon.material.emissiveIntensity = 1.1 + Math.sin(pulse * 3.2) * 0.6;
    },
  };
}
