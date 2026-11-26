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
    // Put the plane on a run at the first ring so the frame shows the
    // aircraft, the lit instruments and the orange hoop dead ahead.
    const ring = world.nextRing();
    if (ring) {
      const dx = ring.x - st.x;
      const dz = ring.z - st.z;
      const dist = Math.hypot(dx, dz);
      // Heading 0 is north (-z): the bearing to the ring.
      st.heading = Math.atan2(dx, -dz);
      // Stand off 170 m from the ring, at its height, then fly in.
      const back = 170 / Math.max(dist, 1);
      st.x = ring.x - dx * back;
      st.z = ring.z - dz * back;
      st.y = ring.y;
      st.speed = 85;
      st.throttle = 0.85;
    }
    for (let i = 0; i < 60 * 2; i++) {
      world.step(1 / 60, 0, 0, 0);
      if (st.crashed || st.won) break;
    }
    st.throttle = 0.85;
    return { screen: SCREEN_PLAY, best: 0 };
  }
  // end
  world.reset();
  for (const ring of st.rings) ring.taken = true;
  st.ringsTaken = st.rings.length;
  st.time = 214;
  st.timeBonus = Math.max(0, 300 - Math.round(st.time * 2));
  st.score = st.rings.length * 100 + 150 + st.timeBonus;
  st.landings = 1;
  st.won = true;
  st.message = `All ${st.rings.length} rings! Mission complete. +${st.timeBonus} time bonus.`;
  st.messageAt = st.time;
  st.y = 260;
  return { screen: SCREEN_WIN, best: st.score };
}
