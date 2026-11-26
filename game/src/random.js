// A small seeded generator (mulberry32) so a ?seed=N flight is repeatable:
// the same seed lays out the same rings and the same clouds every time.
export function createRandom(seed) {
  let a = seed >>> 0;
  function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function range(min, max) {
    return min + (max - min) * next();
  }
  function pick(list) {
    return list[Math.floor(next() * list.length)];
  }
  return { next, range, pick };
}
