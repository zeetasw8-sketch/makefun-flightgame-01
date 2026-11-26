// Merapi Run — tuning numbers for the island flight game.
// All distances are metres, speeds metres per second, angles radians.
// The island is a 4000 by 4000 metre square centred on the origin; the
// volcano rises at its middle and the runway sits on the flat south shore.
export const ISLAND_HALF = 2000;
export const VOLCANO_X = 350;
export const VOLCANO_Z = -450;
export const VOLCANO_HEIGHT = 620;
export const VOLCANO_RADIUS = 900;

export const RUNWAY_X = 0;
export const RUNWAY_Z = 1500;
export const RUNWAY_LENGTH = 420;
export const RUNWAY_WIDTH = 34;

export const START_X = 0;
export const START_Y = 150;
export const START_Z = 1150;
export const START_HEADING = Math.PI;
export const START_SPEED = 55;

export const MAX_SPEED = 95;
export const MIN_SPEED = 18;
export const STALL_SPEED = 24;
export const ACCEL = 14;
export const DRAG = 0.12;
export const CLIMB_FACTOR = 0.55;
export const TURN_RATE = 0.55;
export const PITCH_RATE = 0.6;
export const ROLL_RATE = 1.4;
export const ROLL_DAMP = 2.2;
export const PITCH_DAMP = 1.6;
export const MAX_PITCH = 0.5;
export const MAX_ROLL = 1.1;

export const FUEL_MAX = 100;
export const FUEL_BURN = 1.6;
export const FUEL_BURN_THROTTLE = 2.4;
export const FUEL_LOW = 25;

export const RING_COUNT = 8;
export const RING_RADIUS = 26;
export const RING_POINTS = 100;
export const LANDING_POINTS = 150;

export const CRASH_CLEARANCE = 4;
export const LANDING_MAX_SPEED = 42;
export const LANDING_MAX_SINK = 6;

export const STEP = 1 / 60;
export const LIVES = 1;
export const BEST_KEY = 'merapi-run-best';

export const SKY_TOP = '#1d5fa8';
export const SKY_HORIZON = '#bfe0f2';
export const SEA = '#2a7fb8';
export const SAND = '#e0c98f';
export const GRASS_LOW = '#5d9e4a';
export const GRASS_HIGH = '#4a7d3a';
export const ROCK = '#8a7a68';
export const SNOW = '#f4f8fb';
export const RUNWAY_COLOR = '#3a3f46';
export const RUNWAY_MARK = '#f2f2f2';
