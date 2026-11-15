// Keyboard, mouse and pointer lock. The rest of the game reads a plain state
// object: a set of held key codes, a firing flag, one-shot action flags the
// main loop consumes, and accumulated mouse movement drained once per frame.
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const state = {
    keys,
    locked: false,
    firing: false,
    lookX: 0,
    lookY: 0,
    pressed: new Set(),
  };

  window.addEventListener('keydown', (event) => {
    if (!keys.has(event.code)) state.pressed.add(event.code);
    keys.add(event.code);
    if (event.code === 'Space' || event.code.startsWith('Arrow')) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => { keys.clear(); state.firing = false; });
  window.addEventListener('mousemove', (event) => {
    if (!state.locked) return;
    state.lookX += event.movementX;
    state.lookY += event.movementY;
  });
  window.addEventListener('mousedown', (event) => {
    if (state.locked && event.button === 0) state.firing = true;
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) state.firing = false;
  });
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) { keys.clear(); state.firing = false; }
    onLockChange(state.locked);
  });

  return {
    state,
    requestLock() { canvas.requestPointerLock(); },
    takeLook() {
      const out = { x: state.lookX, y: state.lookY };
      state.lookX = 0;
      state.lookY = 0;
      return out;
    },
    // One-shot key test: true only on the frame the key went down.
    tapped(code) {
      if (!state.pressed.has(code)) return false;
      state.pressed.delete(code);
      return true;
    },
    clearPressed() { state.pressed.clear(); },
  };
}
