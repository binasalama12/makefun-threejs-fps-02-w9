// All sound is synthesised with WebAudio: short oscillator blips for UI and
// beeps, filtered noise bursts for gunfire and the charge blast. No audio
// files are shipped, so the game stays fully offline. The context is created
// lazily on the first user gesture to satisfy browser autoplay rules.
export function createAudio() {
  let ctx = null;
  let master = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
    return ctx;
  }

  function tone(freqA, freqB, seconds, type, volume) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqA, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqB), t + seconds);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + seconds);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + seconds + 0.02);
  }

  function noise(seconds, volume, filterFreq, type = 'lowpass') {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + seconds);
    src.connect(filter).connect(gain).connect(master);
    src.start(t);
  }

  return {
    unlock() { ensure(); },
    shoot(kind) {
      if (kind === 'shotgun') { noise(0.22, 0.9, 900); tone(160, 60, 0.16, 'square', 0.25); }
      else if (kind === 'dmr') { noise(0.16, 0.8, 1600); tone(220, 70, 0.14, 'square', 0.3); }
      else if (kind === 'smg') { noise(0.08, 0.55, 2400); tone(320, 140, 0.07, 'square', 0.2); }
      else { noise(0.11, 0.65, 1900); tone(260, 90, 0.09, 'square', 0.22); }
    },
    dryFire() { tone(900, 700, 0.04, 'square', 0.12); },
    reload() { tone(500, 300, 0.07, 'square', 0.18); setTimeout(() => tone(700, 420, 0.07, 'square', 0.18), 160); },
    hit(kill) { tone(kill ? 1180 : 880, kill ? 700 : 660, 0.07, 'sine', 0.3); },
    // Headshot confirmation: a bright brass "ding-ding" an octave above the
    // body-hit blip, so a cracked cap is audible before it is visible.
    headshot(kill) {
      tone(1560, 1500, 0.06, 'triangle', 0.34);
      setTimeout(() => tone(kill ? 2090 : 1760, kill ? 1560 : 1400, 0.09, 'triangle', 0.3), 55);
    },
    hurt() { tone(140, 80, 0.18, 'sawtooth', 0.25); },
    buy() { tone(660, 660, 0.07, 'sine', 0.25); setTimeout(() => tone(990, 990, 0.09, 'sine', 0.25), 80); },
    denied() { tone(220, 180, 0.12, 'square', 0.2); },
    plantBeep() { tone(1250, 1250, 0.08, 'sine', 0.3); },
    planted() { tone(880, 880, 0.1, 'sine', 0.3); setTimeout(() => tone(1320, 1320, 0.14, 'sine', 0.3), 120); },
    defuse() { tone(700, 500, 0.16, 'sine', 0.28); },
    explode() { noise(1.1, 1.0, 420); tone(90, 32, 0.9, 'sine', 0.7); },
    grenade() { noise(0.5, 0.8, 700); tone(120, 45, 0.4, 'sine', 0.5); },
    roundWin() { tone(523, 523, 0.12, 'sine', 0.28); setTimeout(() => tone(784, 784, 0.18, 'sine', 0.28), 130); },
    roundLose() { tone(392, 392, 0.14, 'sine', 0.28); setTimeout(() => tone(262, 262, 0.22, 'sine', 0.28), 150); },
    throwWhoosh() { noise(0.18, 0.3, 1200, 'bandpass'); },
    smokePop() { noise(0.85, 0.4, 2600, 'highpass'); tone(340, 240, 0.2, 'sine', 0.1); },
  };
}
