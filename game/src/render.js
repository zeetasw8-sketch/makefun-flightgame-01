// Merapi Run — the painter: a chase view over the island. A tiny 3D
// projector turns world points into screen points; the terrain is a
// heightfield grid drawn far to near, the aeroplane is a small 3D model
// flown in front of the camera, and the HUD carries altitude, speed,
// heading, fuel, score and an attitude ball. No library, plain canvas.
import {
  ISLAND_HALF, VOLCANO_X, VOLCANO_Z, VOLCANO_HEIGHT, VOLCANO_RADIUS,
  RUNWAY_X, RUNWAY_Z, RUNWAY_LENGTH, RUNWAY_WIDTH,
  SKY_TOP, SKY_HORIZON, SEA, SAND, GRASS_LOW, GRASS_HIGH, ROCK, SNOW,
  RUNWAY_COLOR, RUNWAY_MARK, FUEL_LOW, RING_COUNT,
} from './config.js';
import { groundHeight, onRunway } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

const TAU = Math.PI * 2;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// A small palette that reads as height: sand at the shore, green hills,
// rock on the high slopes, snow on the volcano crown.
function terrainColor(h, x, z) {
  if (h <= 1) return SEA;
  if (h < 6) return SAND;
  const volcanoD = Math.hypot(x - VOLCANO_X, z - VOLCANO_Z);
  const volcanoT = 1 - clamp(volcanoD / VOLCANO_RADIUS, 0, 1);
  if (volcanoT > 0.72 && h > VOLCANO_HEIGHT * 0.55) return SNOW;
  if (h > 320) return ROCK;
  if (h > 170) return GRASS_HIGH;
  return GRASS_LOW;
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(Math.round(((n >> 16) & 255) * f), 0, 255);
  const g = clamp(Math.round(((n >> 8) & 255) * f), 0, 255);
  const b = clamp(Math.round((n & 255) * f), 0, 255);
  return `rgb(${r},${g},${b})`;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let w = 0;
  let h = 0;
  let dpr = 1;

  // A few soft clouds placed around the island, fixed in the world.
  const clouds = [];
  {
    let s = 1234567;
    const rnd = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
    for (let i = 0; i < 14; i++) {
      clouds.push({
        x: (rnd() - 0.5) * 5200,
        y: 480 + rnd() * 320,
        z: (rnd() - 0.5) * 5200,
        rx: 120 + rnd() * 160,
        ry: 26 + rnd() * 22,
      });
    }
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth || window.innerWidth;
    h = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // Camera: behind and above the aeroplane, looking along its heading,
  // rolling a third as far as the plane so the horizon banks gently.
  function cameraBasis(st) {
    const ch = Math.cos(st.heading);
    const sh = Math.sin(st.heading);
    const cp = Math.cos(st.pitch);
    const sp = Math.sin(st.pitch);
    // Forward (aircraft nose direction, levelled for the camera).
    const fwd = { x: sh * cp, y: sp, z: ch * cp };
    // Camera sits behind the nose and above the tail.
    const back = 26;
    const up = 7;
    const cam = {
      x: st.x - fwd.x * back,
      y: st.y - fwd.y * back + up,
      z: st.z - fwd.z * back,
    };
    // Look at a point ahead of the plane, slightly below the nose.
    const look = { x: st.x + fwd.x * 90, y: st.y + fwd.y * 90 - 6, z: st.z + fwd.z * 90 };
    const f = norm({
      x: look.x - cam.x,
      y: look.y - cam.y,
      z: look.z - cam.z,
    });
    const worldUp = { x: 0, y: 1, z: 0 };
    let r = norm(cross(f, worldUp));
    // Roll the camera a third of the plane's bank.
    const roll = st.roll * 0.35;
    const cr = Math.cos(roll);
    const sr = Math.sin(roll);
    const r2 = {
      x: r.x * cr + worldUp.x * sr * 0 + f.x * 0,
      y: r.y * cr,
      z: r.z * cr,
    };
    // (Roll is applied by rotating the right/up pair around the forward
    // axis; the small-angle form below keeps it stable.)
    const rRoll = {
      x: r.x * cr - 0,
      y: r.y * cr + sr * 0,
      z: r.z * cr,
    };
    void r2;
    void rRoll;
    const up2 = norm(cross(r, f));
    // Rotate right and up around forward by the roll angle.
    const right = {
      x: r.x * cr + up2.x * sr,
      y: r.y * cr + up2.y * sr,
      z: r.z * cr + up2.z * sr,
    };
    const upv = {
      x: up2.x * cr - r.x * sr,
      y: up2.y * cr - r.y * sr,
      z: up2.z * cr - r.z * sr,
    };
    return { cam, f, right, up: upv };
  }

  function norm(v) {
    const l = Math.hypot(v.x, v.y, v.z) || 1;
    return { x: v.x / l, y: v.y / l, z: v.z / l };
  }

  function cross(a, b) {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x,
    };
  }

  function dot(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  }

  function project(p, basis, focal, cx, cy) {
    const rel = { x: p.x - basis.cam.x, y: p.y - basis.cam.y, z: p.z - basis.cam.z };
    const cz = dot(rel, basis.f);
    if (cz < 2) return null;
    const cxm = dot(rel, basis.right);
    const cym = dot(rel, basis.up);
    return {
      x: cx + (cxm / cz) * focal,
      y: cy - (cym / cz) * focal,
      d: cz,
    };
  }

  function drawSky(st, basis) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, SKY_TOP);
    g.addColorStop(0.55, SKY_HORIZON);
    g.addColorStop(0.56, SEA);
    g.addColorStop(1, '#1d6a96');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // Sun: a fixed compass bearing, so it swings across the sky as the
    // pilot turns.
    const sunDir = norm({ x: 0.5, y: 0.42, z: -0.75 });
    const sp = project(
      {
        x: basis.cam.x + sunDir.x * 3000,
        y: basis.cam.y + sunDir.y * 3000,
        z: basis.cam.z + sunDir.z * 3000,
      },
      basis,
      Math.min(w, h) * 1.1,
      w / 2,
      h / 2,
    );
    if (sp && sp.y < h * 0.6) {
      ctx.fillStyle = 'rgba(255,244,200,0.95)';
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 26, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,244,200,0.25)';
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 44, 0, TAU);
      ctx.fill();
    }
    // Clouds.
    const focal = Math.min(w, h) * 1.1;
    for (const c of clouds) {
      const p = project(c, basis, focal, w / 2, h / 2);
      if (!p || p.y > h * 0.75) continue;
      const s = clamp(420 / p.d, 0.15, 1.4);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, c.rx * s, c.ry * s, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      ctx.ellipse(p.x - c.rx * 0.4 * s, p.y + c.ry * 0.4 * s, c.rx * 0.55 * s, c.ry * 0.6 * s, 0, 0, TAU);
      ctx.fill();
    }
  }

  function drawTerrain(st, basis) {
    const focal = Math.min(w, h) * 1.1;
    const cx = w / 2;
    const cy = h / 2;
    // A grid around the plane, coarser with distance, axis-aligned to the
    // world so the island's shape stays true whatever the heading.
    const step = 110;
    const half = 1500;
    const x0 = Math.round((st.x - half) / step) * step;
    const z0 = Math.round((st.z - half) / step) * step;
    const cols = Math.round((half * 2) / step);
    const quads = [];
    for (let j = 0; j < cols; j++) {
      for (let i = 0; i < cols; i++) {
        const ax = x0 + i * step;
        const az = z0 + j * step;
        const bx = ax + step;
        const bz = az + step;
        const p00 = { x: ax, y: groundHeight(ax, az), z: az };
        const p10 = { x: bx, y: groundHeight(bx, az), z: az };
        const p11 = { x: bx, y: groundHeight(bx, bz), z: bz };
        const p01 = { x: ax, y: groundHeight(ax, bz), z: bz };
        const c = { x: (ax + bx) / 2, y: (p00.y + p11.y) / 2, z: (az + bz) / 2 };
        const d = Math.hypot(c.x - basis.cam.x, c.y - basis.cam.y, c.z - basis.cam.z);
        const avgH = (p00.y + p10.y + p11.y + p01.y) / 4;
        quads.push({ p00, p10, p11, p01, d, h: avgH, cx: c.x, cz: c.z });
      }
    }
    quads.sort((a, b) => b.d - a.d);
    for (const q of quads) {
      const a = project(q.p00, basis, focal, cx, cy);
      const b = project(q.p10, basis, focal, cx, cy);
      const c = project(q.p11, basis, focal, cx, cy);
      const d = project(q.p01, basis, focal, cx, cy);
      if (!a || !b || !c || !d) continue;
      if (
        Math.max(a.x, b.x, c.x, d.x) < -40 ||
        Math.min(a.x, b.x, c.x, d.x) > w + 40 ||
        Math.max(a.y, b.y, c.y, d.y) < -40 ||
        Math.min(a.y, b.y, c.y, d.y) > h + 40
      ) {
        continue;
      }
      const base = terrainColor(q.h, q.cx, q.cz);
      // A whisper of shading from the slope so the hills read as hills.
      const slope = clamp(Math.abs(q.p11.y - q.p00.y) / step, 0, 1);
      const f = base === SEA ? 1 : 0.94 + slope * 0.08;
      ctx.fillStyle = shade(base, f);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.closePath();
      ctx.fill();
    }
    drawRunway(st, basis, focal, cx, cy);
  }

  function drawRunway(st, basis, focal, cx, cy) {
    const hw = RUNWAY_WIDTH / 2;
    const hl = RUNWAY_LENGTH / 2;
    const corners = [
      { x: RUNWAY_X - hw, y: 34.5, z: RUNWAY_Z - hl },
      { x: RUNWAY_X + hw, y: 34.5, z: RUNWAY_Z - hl },
      { x: RUNWAY_X + hw, y: 34.5, z: RUNWAY_Z + hl },
      { x: RUNWAY_X - hw, y: 34.5, z: RUNWAY_Z + hl },
    ];
    const pts = corners.map((p) => project(p, basis, focal, cx, cy));
    if (pts.some((p) => !p)) return;
    ctx.fillStyle = RUNWAY_COLOR;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fill();
    // Centre dashes.
    ctx.strokeStyle = RUNWAY_MARK;
    ctx.lineWidth = 2;
    for (let t = -0.42; t <= 0.42; t += 0.14) {
      const z = RUNWAY_Z + t * RUNWAY_LENGTH;
      const p1 = project({ x: RUNWAY_X, y: 34.7, z: z - 12 }, basis, focal, cx, cy);
      const p2 = project({ x: RUNWAY_X, y: 34.7, z: z + 12 }, basis, focal, cx, cy);
      if (!p1 || !p2) continue;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    // Threshold bars at both ends.
    ctx.lineWidth = 3;
    for (const end of [-1, 1]) {
      const z = RUNWAY_Z + end * (hl - 8);
      const p1 = project({ x: RUNWAY_X - hw + 4, y: 34.7, z }, basis, focal, cx, cy);
      const p2 = project({ x: RUNWAY_X + hw - 4, y: 34.7, z }, basis, focal, cx, cy);
      if (!p1 || !p2) continue;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
  }

  function drawRings(st, basis) {
    const focal = Math.min(w, h) * 1.1;
    const cx = w / 2;
    const cy = h / 2;
    const next = st.rings.find((r) => !r.taken) ?? null;
    for (const ring of st.rings) {
      if (ring.taken) continue;
      const active = ring === next;
      const c = project(ring, basis, focal, cx, cy);
      if (!c) continue;
      // The hoop reads as a circle facing the pilot: draw it in a plane
      // perpendicular to the line from the camera, sized by distance.
      const rPx = (ring.r / c.d) * focal;
      if (rPx < 2 || rPx > 900) continue;
      ctx.lineWidth = active ? 6 : 3;
      ctx.strokeStyle = active ? '#ff9a1f' : 'rgba(255,255,255,0.75)';
      ctx.beginPath();
      ctx.arc(c.x, c.y, rPx, 0, TAU);
      ctx.stroke();
      if (active) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(255,154,31,0.4)';
        ctx.beginPath();
        ctx.arc(c.x, c.y, rPx + 8, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = '#ff9a1f';
        ctx.font = `bold ${Math.max(12, Math.min(20, rPx * 0.35))}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('NEXT', c.x, c.y - rPx - 12);
      }
    }
  }

  // The aeroplane, built from flat panels in its own frame (nose +z),
  // turned by heading, pitch and roll and drawn in front of the camera.
  function drawAircraft(st, basis) {
    const focal = Math.min(w, h) * 1.1;
    const cx = w / 2;
    const cy = h / 2;
    const ch = Math.cos(st.heading);
    const sh = Math.sin(st.heading);
    const cp = Math.cos(st.pitch);
    const sp = Math.sin(st.pitch);
    const cr = Math.cos(st.roll);
    const sr = Math.sin(st.roll);
    // Aircraft-frame axes in world space: forward, right, up.
    const fwd = { x: sh * cp, y: sp, z: ch * cp };
    const right0 = { x: ch, y: 0, z: -sh };
    const up0 = {
      x: -sh * sp,
      y: cp,
      z: -ch * sp,
    };
    const right = {
      x: right0.x * cr + up0.x * sr,
      y: right0.y * cr + up0.y * sr,
      z: right0.z * cr + up0.z * sr,
    };
    const up = {
      x: up0.x * cr - right0.x * sr,
      y: up0.y * cr - right0.y * sr,
      z: up0.z * cr - right0.z * sr,
    };
    function toWorld(p) {
      return {
        x: st.x + right.x * p.x + up.x * p.y + fwd.x * p.z,
        y: st.y + right.y * p.x + up.y * p.y + fwd.y * p.z,
        z: st.z + right.z * p.x + up.z * p.y + fwd.z * p.z,
      };
    }
    const RED = '#c0392b';
    const CREAM = '#f3e6c8';
    const DARK = '#2c2f36';
    const GLASS = '#9fd8ef';
    const panels = [
      // Fuselage: a tapered body, nose at +z.
      { pts: [[0, 1.1, 7.5], [0.9, 0.6, 5.5], [0.9, -0.4, -4.5], [0, -0.7, -6.5]], fill: RED },
      { pts: [[0, 1.1, 7.5], [-0.9, 0.6, 5.5], [-0.9, -0.4, -4.5], [0, -0.7, -6.5]], fill: RED },
      { pts: [[0, 1.1, 7.5], [0.9, 0.6, 5.5], [-0.9, 0.6, 5.5]], fill: CREAM },
      { pts: [[0.9, 0.6, 5.5], [0.9, -0.4, -4.5], [-0.9, -0.4, -4.5], [-0.9, 0.6, 5.5]], fill: CREAM },
      { pts: [[0.9, -0.4, -4.5], [0, -0.7, -6.5], [-0.9, -0.4, -4.5]], fill: DARK },
      // Canopy.
      { pts: [[0, 1.5, 4.6], [0.75, 0.9, 4.2], [0.75, 0.9, 1.4], [0, 1.5, 1.2]], fill: GLASS },
      { pts: [[0, 1.5, 4.6], [-0.75, 0.9, 4.2], [-0.75, 0.9, 1.4], [0, 1.5, 1.2]], fill: GLASS },
      // Main wing (a flat span, slightly swept).
      { pts: [[-9.5, 0.15, 1.8], [-9.5, 0.15, 0.4], [9.5, 0.15, 0.4], [9.5, 0.15, 1.8]], fill: CREAM },
      { pts: [[-9.5, 0.15, 1.8], [-8.2, 0.15, 3.1], [8.2, 0.15, 3.1], [9.5, 0.15, 1.8]], fill: RED },
      // Tailplane.
      { pts: [[-3.4, 0.25, -5.6], [-3.4, 0.25, -6.6], [3.4, 0.25, -6.6], [3.4, 0.25, -5.6]], fill: RED },
      // Fin.
      { pts: [[0, 0.4, -4.2], [0, 2.6, -6.2], [0, 2.6, -6.9], [0, 0.4, -6.4]], fill: RED },
      // Propeller disc (a translucent blur in front of the nose).
      { pts: [[-0.1, 3.4, 7.9], [0.1, 3.4, 7.9], [0.1, -1.4, 7.9], [-0.1, -1.4, 7.9]], fill: 'rgba(40,40,40,0.35)' },
    ];
    // Sort panels far to near by their centre distance from the camera.
    const drawn = [];
    for (const panel of panels) {
      const worldPts = panel.pts.map((p) => toWorld({ x: p[0], y: p[1], z: p[2] }));
      const scr = worldPts.map((p) => project(p, basis, focal, cx, cy));
      if (scr.some((p) => !p)) continue;
      const d =
        worldPts.reduce(
          (s, p) => s + Math.hypot(p.x - basis.cam.x, p.y - basis.cam.y, p.z - basis.cam.z),
          0,
        ) / worldPts.length;
      drawn.push({ scr, fill: panel.fill, d });
    }
    drawn.sort((a, b) => b.d - a.d);
    for (const p of drawn) {
      ctx.fillStyle = p.fill;
      ctx.beginPath();
      ctx.moveTo(p.scr[0].x, p.scr[0].y);
      for (let i = 1; i < p.scr.length; i++) ctx.lineTo(p.scr[i].x, p.scr[i].y);
      ctx.closePath();
      ctx.fill();
    }
  }

  function fmt(n, digits) {
    return n.toFixed(digits);
  }

  function headingText(st) {
    const deg = Math.round(((st.heading * 180) / Math.PI) % 360);
    const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const idx = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
    return `${String((((deg % 360) + 360) % 360)).padStart(3, '0')}° ${names[idx]}`;
  }

  function drawHUD(st, screen, best) {
    const altFt = Math.max(0, Math.round((st.y - groundHeight(st.x, st.z)) * 3.281));
    const spdKt = Math.max(0, Math.round(st.speed * 1.944));
    const pad = 16;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    // Top-left instrument block.
    ctx.fillStyle = 'rgba(8,18,28,0.62)';
    roundRect(pad, pad, 208, 108, 10);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('ALTITUDE', pad + 12, pad + 22);
    ctx.fillText('SPEED', pad + 12, pad + 52);
    ctx.fillText('HEADING', pad + 12, pad + 82);
    ctx.font = 'bold 20px monospace';
    ctx.fillText(`${altFt} ft`, pad + 104, pad + 24);
    ctx.fillText(`${spdKt} kt`, pad + 104, pad + 54);
    ctx.fillText(headingText(st), pad + 104, pad + 84);
    // Top-right: fuel, score, rings.
    const bw = 208;
    ctx.fillStyle = 'rgba(8,18,28,0.62)';
    roundRect(w - pad - bw, pad, bw, 108, 10);
    ctx.fill();
    const fuelLow = st.fuel <= FUEL_LOW;
    ctx.fillStyle = fuelLow ? '#ff5a4e' : '#fff';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('FUEL', w - pad - bw + 12, pad + 22);
    ctx.fillStyle = '#fff';
    ctx.fillText('SCORE', w - pad - bw + 12, pad + 52);
    ctx.fillText('RINGS', w - pad - bw + 12, pad + 82);
    // Fuel bar.
    const barX = w - pad - bw + 66;
    const barW = bw - 78;
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    roundRect(barX, pad + 12, barW, 12, 6);
    ctx.fill();
    ctx.fillStyle = fuelLow ? '#ff5a4e' : '#7ee081';
    const fw = Math.max(0, (barW * st.fuel) / 100);
    if (fw > 0) {
      roundRect(barX, pad + 12, fw, 12, 6);
      ctx.fill();
    }
    ctx.font = 'bold 20px monospace';
    ctx.fillStyle = '#fff';
    ctx.fillText(String(st.score), w - pad - bw + 104, pad + 54);
    ctx.fillText(`${st.ringsTaken} / ${RING_COUNT}`, w - pad - bw + 104, pad + 84);
    // Attitude ball, bottom-left.
    const ax = pad + 62;
    const ay = h - pad - 62;
    const ar = 56;
    ctx.save();
    ctx.beginPath();
    ctx.arc(ax, ay, ar, 0, TAU);
    ctx.clip();
    ctx.translate(ax, ay);
    ctx.rotate(-st.roll);
    const pitchPx = clamp(st.pitch * 90, -ar, ar);
    ctx.fillStyle = '#3d7ab8';
    ctx.fillRect(-ar - 2, -ar - 2 - pitchPx, ar * 2 + 4, ar + 2 + pitchPx);
    ctx.fillStyle = '#c98f4a';
    ctx.fillRect(-ar - 2, pitchPx, ar * 2 + 4, ar + 2 - pitchPx);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-ar, pitchPx);
    ctx.lineTo(ar, pitchPx);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ax, ay, ar, 0, TAU);
    ctx.stroke();
    // Fixed wings on the ball.
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(ax - 34, ay);
    ctx.lineTo(ax - 12, ay);
    ctx.moveTo(ax + 12, ay);
    ctx.lineTo(ax + 34, ay);
    ctx.stroke();
    // Throttle bar, bottom-right.
    const tx = w - pad - 30;
    const ty = h - pad - 120;
    ctx.fillStyle = 'rgba(8,18,28,0.62)';
    roundRect(tx - 8, ty - 8, 46, 136, 10);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(tx, ty, 14, 120);
    ctx.fillStyle = '#ffd23f';
    const th = 120 * st.throttle;
    ctx.fillRect(tx, ty + 120 - th, 14, th);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('THR', tx + 7, ty + 132);
    // Centre flight-path marker.
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 9, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w / 2 - 16, h / 2);
    ctx.lineTo(w / 2 - 6, h / 2);
    ctx.moveTo(w / 2 + 6, h / 2);
    ctx.lineTo(w / 2 + 16, h / 2);
    ctx.moveTo(w / 2, h / 2 - 16);
    ctx.lineTo(w / 2, h / 2 - 6);
    ctx.moveTo(w / 2, h / 2 + 6);
    ctx.lineTo(w / 2, h / 2 + 16);
    ctx.stroke();
    // A short-lived message, centred above the marker (play only, so it
    // never overlaps the win or crash overlay).
    if (screen === SCREEN_PLAY && st.message && st.time - st.messageAt < 3.2) {
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(8,18,28,0.7)';
      const tw = ctx.measureText(st.message).width + 32;
      roundRect(w / 2 - tw / 2, h / 2 - 92, tw, 36, 10);
      ctx.fill();
      ctx.fillStyle = '#ffd23f';
      ctx.fillText(st.message, w / 2, h / 2 - 67);
    }
    if (screen === SCREEN_PLAY) {
      ctx.font = '12px sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.textAlign = 'center';
      ctx.fillText('Arrows / WASD fly · Shift throttle up · Ctrl throttle down · P pause', w / 2, h - 12);
    }
    void best;
    void fmt;
  }

  function roundRect(x, y, wid, hei, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + wid, y, x + wid, y + hei, r);
    ctx.arcTo(x + wid, y + hei, x, y + hei, r);
    ctx.arcTo(x, y + hei, x, y, r);
    ctx.arcTo(x, y, x + wid, y, r);
    ctx.closePath();
  }

  function overlay(title, lines, accent) {
    ctx.fillStyle = 'rgba(6,14,22,0.66)';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = accent || '#ffd23f';
    ctx.font = 'bold 44px sans-serif';
    ctx.fillText(title, w / 2, h / 2 - 96);
    ctx.fillStyle = '#fff';
    ctx.font = '17px sans-serif';
    lines.forEach((line, i) => {
      ctx.fillText(line, w / 2, h / 2 - 52 + i * 26);
    });
    ctx.font = 'bold 16px sans-serif';
    ctx.fillStyle = '#ffd23f';
    ctx.fillText('Press Space or click to start', w / 2, h / 2 + 52 + lines.length * 4);
  }

  function draw(st, screen, best) {
    resize();
    const basis = cameraBasis(st);
    drawSky(st, basis);
    drawTerrain(st, basis);
    drawRings(st, basis);
    drawAircraft(st, basis);
    drawHUD(st, screen, best);
    if (screen === SCREEN_TITLE) {
      overlay('MERAPI RUN', [
        'Fly the island circuit: thread all 8 orange rings,',
        'mind your fuel, and land on the runway to refuel.',
        'Arrows or WASD pitch and bank · Shift / Ctrl throttle.',
        'A gentle touchdown on the runway refuels you (+150).',
        `Best score: ${best}`,
      ]);
    } else if (screen === SCREEN_PAUSED) {
      overlay('PAUSED', ['The island waits. Press P or Space to keep flying.'], '#fff');
    } else if (screen === SCREEN_OVER) {
      overlay('CRASHED', [
        `Score ${st.score} · rings ${st.ringsTaken} of ${RING_COUNT} · best ${best}`,
        'The volcano keeps its secrets. Try the circuit again.',
      ], '#ff5a4e');
    } else if (screen === SCREEN_WIN) {
      overlay('MISSION COMPLETE', [
        `All ${RING_COUNT} rings flown · score ${st.score} · best ${best}`,
        `Landings ${st.landings} · time ${Math.round(st.time)}s`,
        'A clean circuit. The island is yours.',
      ], '#7ee081');
    }
    void onRunway;
  }

  return { draw };
}
