// Tiny WebAudio blips. No asset files; everything is synthesised.

let ctx = null;
let muted = false;

function ac() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, dur, { type = 'sine', gain = 0.12, slide = 0, delay = 0 } = {}) {
  const a = ac();
  if (!a || muted) return;
  const t0 = a.currentTime + delay;

  const osc = a.createOscillator();
  const amp = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);

  amp.gain.setValueAtTime(0, t0);
  amp.gain.linearRampToValueAtTime(gain, t0 + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  osc.connect(amp).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export const sfx = {
  /** One cat swallowed. Pitch climbs with the combo so chains feel good. */
  absorb(index = 0) {
    tone(420 + index * 70, 0.16, { type: 'triangle', gain: 0.1, slide: 260 });
  },
  /** A hole filled up and vanished. */
  clear() {
    [523, 659, 784, 1047].forEach((f, i) =>
      tone(f, 0.3, { type: 'triangle', gain: 0.1, delay: i * 0.055 }));
  },
  blocked() {
    tone(150, 0.1, { type: 'square', gain: 0.05, slide: -60 });
  },
  win() {
    [523, 659, 784, 1047, 1319].forEach((f, i) =>
      tone(f, 0.45, { type: 'triangle', gain: 0.11, delay: i * 0.09 }));
  },
  fail() {
    [392, 330, 262].forEach((f, i) =>
      tone(f, 0.45, { type: 'sine', gain: 0.1, delay: i * 0.13 }));
  },
  tick() {
    tone(880, 0.06, { type: 'sine', gain: 0.05 });
  },
};

export function setMuted(v) { muted = v; }
export function isMuted() { return muted; }
