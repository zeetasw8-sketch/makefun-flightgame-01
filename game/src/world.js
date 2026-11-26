// Merapi Run — the flight world: terrain, the aeroplane, rings, fuel and
// the rules that end a sortie (crash, out of fuel, or all rings flown).
// The aeroplane flies in world metres: x east, y up, z south. Heading 0
// points north (-z), heading PI points south (+z). The island is a square
// of hills around a volcano; beyond it is open sea at height 0.
import {
  ISLAND_HALF, VOLCANO_X, VOLCANO_Z, VOLCANO_HEIGHT, VOLCANO_RADIUS,
  RUNWAY_X, RUNWAY_Z, RUNWAY_LENGTH, RUNWAY_WIDTH,
  START_X, START_Y, START_Z, START_HEADING, START_SPEED,
  MAX_SPEED, MIN_SPEED, STALL_SPEED, ACCEL, DRAG, CLIMB_FACTOR,
  TURN_RATE, PITCH_RATE, ROLL_RATE, ROLL_DAMP, PITCH_DAMP,
  MAX_PITCH, MAX_ROLL, FUEL_MAX, FUEL_BURN, FUEL_BURN_THROTTLE, FUEL_LOW,
  RING_COUNT, RING_RADIUS, RING_POINTS, LANDING_POINTS,
  LOW_PASS_POINTS, LOW_PASS_MAX_AGL, TIME_BONUS_MAX, TIME_BONUS_RATE,
  CRASH_CLEARANCE, LANDING_MAX_SPEED, LANDING_MAX_SINK, STEP,
} from './config.js';

export const EVENT_NONE = 0;
export const EVENT_RING = 1;
export const EVENT_LAND = 2;
export const EVENT_CRASH = 4;
export const EVENT_FUEL = 8;
export const EVENT_WIN = 16;
export const EVENT_LOW_PASS = 32;

const TAU = Math.PI * 2;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// Smooth noise from a few sines: cheap, repeatable, and it reads as hills.
function hills(x, z) {
  const a = Math.sin(x * 0.0016 + 1.7) * Math.cos(z * 0.0013 - 0.6);
  const b = Math.sin((x + z) * 0.0009 + 4.1) * 0.7;
  const c = Math.sin(x * 0.0031 - 2.2) * Math.sin(z * 0.0027 + 0.9) * 0.45;
  return (a + b + c) * 55;
}

function volcano(x, z) {
  const dx = x - VOLCANO_X;
  const dz = z - VOLCANO_Z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d >= VOLCANO_RADIUS) return 0;
  const t = 1 - d / VOLCANO_RADIUS;
  return VOLCANO_HEIGHT * t * t * (0.55 + 0.45 * t);
}

// Height of the ground at a point. Sea is 0 outside the island square;
// the south shore flattens out so the runway sits on level ground.
export function groundHeight(x, z) {
  const ax = Math.abs(x);
  const az = Math.abs(z);
  if (ax > ISLAND_HALF || az > ISLAND_HALF) return 0;
  const edge = Math.min(ISLAND_HALF - ax, ISLAND_HALF - az);
  const shore = clamp(edge / 260, 0, 1);
  let h = 34 + hills(x, z) * shore + volcano(x, z);
  const nearRunway =
    Math.abs(x - RUNWAY_X) < RUNWAY_WIDTH * 2.2 &&
    Math.abs(z - RUNWAY_Z) < RUNWAY_LENGTH * 0.62;
  if (nearRunway) h = 34;
  return Math.max(0, h);
}

export function onRunway(x, z) {
  return (
    Math.abs(x - RUNWAY_X) < RUNWAY_WIDTH / 2 &&
    Math.abs(z - RUNWAY_Z) < RUNWAY_LENGTH / 2
  );
}

function ringPositions(random) {
  const spots = [];
  const used = [];
  for (let i = 0; i < RING_COUNT; i++) {
    let x = 0;
    let z = 0;
    let ok = false;
    for (let tries = 0; tries < 40 && !ok; tries++) {
      x = random.range(-1500, 1500);
      z = random.range(-1500, 1500);
      const dRunway = Math.hypot(x - RUNWAY_X, z - RUNWAY_Z);
      const dVolcano = Math.hypot(x - VOLCANO_X, z - VOLCANO_Z);
      ok =
        dRunway > 420 &&
        dVolcano > VOLCANO_RADIUS * 0.55 &&
        used.every((p) => Math.hypot(x - p[0], z - p[1]) > 520);
    }
    used.push([x, z]);
    const y = groundHeight(x, z) + random.range(150, 320);
    spots.push({ x, y, z, r: RING_RADIUS, taken: false });
  }
  return spots;
}

export function createWorld(random) {
  const rings = ringPositions(random);
  const state = {
    x: START_X,
    y: START_Y,
    z: START_Z,
    heading: START_HEADING,
    pitch: 0,
    roll: 0,
    speed: START_SPEED,
    throttle: 0.62,
    fuel: FUEL_MAX,
    score: 0,
    ringsTaken: 0,
    rings,
    landed: false,
    crashed: false,
    outOfFuel: false,
    won: false,
    message: '',
    messageAt: 0,
    time: 0,
    landings: 0,
    lowPassDone: false,
    timeBonus: 0,
  };

  function reset() {
    state.x = START_X;
    state.y = START_Y;
    state.z = START_Z;
    state.heading = START_HEADING;
    state.pitch = 0;
    state.roll = 0;
    state.speed = START_SPEED;
    state.throttle = 0.62;
    state.fuel = FUEL_MAX;
    state.score = 0;
    state.ringsTaken = 0;
    state.landed = false;
    state.crashed = false;
    state.outOfFuel = false;
    state.won = false;
    state.message = '';
    state.messageAt = 0;
    state.time = 0;
    state.landings = 0;
    state.lowPassDone = false;
    state.timeBonus = 0;
    for (const ring of rings) ring.taken = false;
  }

  function say(text) {
    state.message = text;
    state.messageAt = state.time;
  }

  function nextRing() {
    return rings.find((r) => !r.taken) ?? null;
  }

  // One fixed step. pitchInput and rollInput are -1, 0 or 1; throttleDelta
  // is -1, 0 or 1. Returns an event bitmask for the frame.
  function step(dt, pitchInput, rollInput, throttleDelta) {
    if (state.crashed || state.won) return EVENT_NONE;
    state.time += dt;
    let events = EVENT_NONE;

    state.throttle = clamp(state.throttle + throttleDelta * dt * 0.55, 0, 1);
    const engineOn = state.fuel > 0;
    if (!engineOn && !state.outOfFuel) {
      state.outOfFuel = true;
      events |= EVENT_FUEL;
      say('Out of fuel — glide to the runway!');
    }

    const targetSpeed = engineOn ? state.throttle * MAX_SPEED : 0;
    state.speed += (targetSpeed - state.speed) * (1 - Math.exp(-ACCEL * 0.09 * dt));
    state.speed -= state.speed * DRAG * dt * 0.12;
    // Climbing bleeds speed, diving gains it; below stall speed the wing
    // stops holding and the nose drops.
    state.speed -= Math.sin(state.pitch) * 9 * dt;
    state.speed = clamp(state.speed, 0, MAX_SPEED + 12);

    const pitchTarget = pitchInput * MAX_PITCH;
    state.pitch += (pitchTarget - state.pitch) * (1 - Math.exp(-PITCH_DAMP * dt));
    state.pitch = clamp(state.pitch, -MAX_PITCH, MAX_PITCH);
    const rollTarget = rollInput * MAX_ROLL;
    state.roll += (rollTarget - state.roll) * (1 - Math.exp(-ROLL_DAMP * dt));
    state.roll = clamp(state.roll, -MAX_ROLL, MAX_ROLL);

    // A banked turn: heading swings in the direction of the roll, faster
    // at speed and at steeper bank.
    state.heading += Math.sin(state.roll) * TURN_RATE * (state.speed / MAX_SPEED) * dt * 2.2;
    state.heading = ((state.heading % TAU) + TAU) % TAU;

    const lift = state.speed > STALL_SPEED ? 1 : state.speed / STALL_SPEED;
    const climb = Math.sin(state.pitch) * state.speed * CLIMB_FACTOR * lift;
    const sink = state.speed < STALL_SPEED ? (STALL_SPEED - state.speed) * 0.35 : 0;
    const vy = climb - sink;
    const vx = Math.sin(state.heading) * state.speed;
    const vz = -Math.cos(state.heading) * state.speed;
    state.x += vx * dt;
    state.z += vz * dt;
    state.y += vy * dt;

    // Fuel burns with the throttle; coasting on idle sips it.
    if (engineOn) {
      state.fuel = Math.max(
        0,
        state.fuel - (FUEL_BURN + FUEL_BURN_THROTTLE * state.throttle) * dt,
      );
      if (state.fuel <= FUEL_LOW && state.fuel > 0 && state.time % 1 < dt * 2) {
        // (The renderer flashes the gauge; no message spam here.)
      }
    }

    // Low pass: buzz the runway under 30 m above the ground and it
    // pays once per flight — a reward for flying low and steady.
    const agl = state.y - groundHeight(state.x, state.z);
    if (
      !state.lowPassDone &&
      onRunway(state.x, state.z) &&
      agl < LOW_PASS_MAX_AGL &&
      agl > CRASH_CLEARANCE &&
      state.speed > 40
    ) {
      state.lowPassDone = true;
      state.score += LOW_PASS_POINTS;
      events |= EVENT_LOW_PASS;
      say(`Low pass over the runway! +${LOW_PASS_POINTS}`);
    }

    // Rings: fly through the hoop and it counts.
    const ring = nextRing();
    if (ring) {
      const d = Math.hypot(state.x - ring.x, state.y - ring.y, state.z - ring.z);
      if (d < ring.r) {
        ring.taken = true;
        state.ringsTaken += 1;
        state.score += RING_POINTS;
        events |= EVENT_RING;
        if (state.ringsTaken >= RING_COUNT) {
          state.won = true;
          events |= EVENT_WIN;
          // A time bonus: the faster the circuit, the more it pays.
          state.timeBonus = Math.max(0, Math.round(TIME_BONUS_MAX - state.time * TIME_BONUS_RATE));
          state.score += state.timeBonus;
          say(`All ${RING_COUNT} rings! Mission complete. +${state.timeBonus} time bonus.`);
        } else {
          say(`Ring ${state.ringsTaken} of ${RING_COUNT}! +${RING_POINTS}`);
        }
      }
    }

    // Ground contact: a gentle touchdown on the runway is a landing
    // (refuel, bonus, take off again); anything else is a crash.
    const ground = groundHeight(state.x, state.z);
    if (state.y <= ground + CRASH_CLEARANCE) {
      const gentle = vy > -LANDING_MAX_SINK;
      const slow = state.speed <= LANDING_MAX_SPEED;
      const level = Math.abs(state.pitch) < 0.18 && Math.abs(state.roll) < 0.35;
      if (onRunway(state.x, state.z) && gentle && slow && level) {
        state.y = ground + CRASH_CLEARANCE;
        state.fuel = FUEL_MAX;
        state.outOfFuel = false;
        state.landings += 1;
        state.score += LANDING_POINTS;
        state.speed = Math.min(state.speed, LANDING_MAX_SPEED);
        state.pitch = 0;
        state.roll = 0;
        events |= EVENT_LAND;
        say(`Landed! Refuelled. +${LANDING_POINTS}`);
      } else {
        state.crashed = true;
        state.y = ground + CRASH_CLEARANCE;
        events |= EVENT_CRASH;
        say('Crashed!');
      }
    }

    // The sea is a crash too (the island is the only dry land).
    if (state.y <= 2 && !state.crashed) {
      state.crashed = true;
      state.y = 2;
      events |= EVENT_CRASH;
      say('Ditched in the sea!');
    }

    return events;
  }

  return { state, reset, step, groundHeight, onRunway, nextRing, say };
}
