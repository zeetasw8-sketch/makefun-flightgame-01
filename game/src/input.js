// Keyboard and mouse for Merapi Run. Arrows (or W/S and A/D) fly the
// plane: up/down pitches, left/right banks into a turn. Shift throttles
// up, Control throttles down; Space (or a click) confirms on the title
// and game-over screens, P pauses. The mouse steers too: holding the
// left button and dragging left or right banks the plane.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let mouseBank = 0;
  let mouseDown = false;
  let mouseX = 0;

  function onKeyDown(e) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
      e.preventDefault();
    }
    keys.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    if (e.key === ' ' || e.key === 'Enter') actions |= ACTION_CONFIRM;
    if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') actions |= ACTION_PAUSE;
  }

  function onKeyUp(e) {
    keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  }

  function onMouseDown(e) {
    mouseDown = true;
    mouseX = e.clientX;
    actions |= ACTION_CONFIRM;
  }

  function onMouseMove(e) {
    if (!mouseDown) return;
    const dx = e.clientX - mouseX;
    mouseX = e.clientX;
    mouseBank = Math.max(-1, Math.min(1, mouseBank + dx * 0.004));
  }

  function onMouseUp() {
    mouseDown = false;
    mouseBank = 0;
  }

  function onBlur() {
    keys.clear();
    mouseDown = false;
    mouseBank = 0;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('blur', onBlur);

  function pitch() {
    if (keys.has('ArrowUp') || keys.has('w')) return 1;
    if (keys.has('ArrowDown') || keys.has('s')) return -1;
    return 0;
  }

  function roll() {
    let r = 0;
    if (keys.has('ArrowLeft') || keys.has('a')) r -= 1;
    if (keys.has('ArrowRight') || keys.has('d')) r += 1;
    if (mouseDown && Math.abs(mouseBank) > 0.05) r += Math.max(-1, Math.min(1, mouseBank));
    return Math.max(-1, Math.min(1, r));
  }

  function throttle() {
    let t = 0;
    if (keys.has('Shift')) t += 1;
    if (keys.has('Control')) t -= 1;
    return t;
  }

  function takeActions() {
    const a = actions;
    actions = 0;
    return a;
  }

  return { pitch, roll, throttle, takeActions };
}
