// Screenshot staging for Merapi Run. ?shot=start|play|end (with &seed=N)
// freezes one scene and paints it twice, then sets window.__shotReady.
// start: the title screen over the runway, the plane on the ground line.
// play: mid-circuit, banked toward the next ring with the runway behind.
// end: the win screen after the last ring, over the island.
import { SCREEN_TITLE, SCREEN_PLAY, SCREEN_WIN } from './render.js';

export function stageShot(name, world) {
  const st = world.state;
  if (name === 'start') {
    world.reset();
    st.y = 52;
    st.speed = 0;
    st.throttle = 0;
    st.pitch = 0;
    st.roll = 0;
    return { screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'play') {
    world.reset();
    // Fly the plane forward in a gentle bank toward the first ring so
    // the frame shows terrain, the lit instruments and a ring ahead.
    for (let i = 0; i < 60 * 10; i++) {
      world.step(1 / 60, 0.08, 0.18, 0.4);
      if (st.crashed || st.won) break;
    }
    st.throttle = 0.7;
    return { screen: SCREEN_PLAY, best: 0 };
  }
  // end
  world.reset();
  for (const ring of st.rings) ring.taken = true;
  st.ringsTaken = st.rings.length;
  st.score = st.rings.length * 100 + 150;
  st.landings = 1;
  st.time = 214;
  st.won = true;
  st.message = `All ${st.rings.length} rings! Mission complete.`;
  st.messageAt = st.time;
  st.y = 260;
  return { screen: SCREEN_WIN, best: st.score };
}
