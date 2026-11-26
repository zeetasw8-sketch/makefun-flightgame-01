// Merapi Run — boot and the one loop. Input is sampled each frame, the
// world advances in fixed 1/60 s steps, and the renderer paints the
// result. The game moves between title, play, paused, crashed and
// mission-complete screens. ?shot=start|play|end (with &seed=N) stages
// one scene for a screenshot instead of running the loop.
import { STEP, BEST_KEY } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_CRASH, EVENT_WIN, EVENT_RING, EVENT_LAND, EVENT_FUEL } from './world.js';
import { ACTION_CONFIRM, ACTION_PAUSE, createInput } from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off: the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Flying. Thread the orange rings; land on the runway to refuel.');
  }

  function endGame(won) {
    screen = won ? SCREEN_WIN : SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(
      won
        ? `Mission complete. Score ${world.state.score}. Best ${best}.`
        : `Crashed. Score ${world.state.score}. Best ${best}.`,
    );
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN)) {
      startGame();
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Flying.');
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      // A slow orbit over the runway behind the title, so the title
      // screen already shows the island.
      world.state.heading += STEP * 0.05;
      return;
    }
    const events = world.step(STEP, input.pitch(), input.roll(), input.throttle());
    if (events & EVENT_WIN) endGame(true);
    else if (events & EVENT_CRASH) endGame(false);
    else if (events & EVENT_RING) announce(world.state.message);
    else if (events & EVENT_LAND) announce(world.state.message);
    else if (events & EVENT_FUEL) announce(world.state.message);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Merapi Run. Press Space or click to fly.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
