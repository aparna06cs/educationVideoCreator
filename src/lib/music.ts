import type { MusicMood } from "./lesson-types";

type MoodSpec = {
  root: number;
  chords: number[][];
  chordSeconds: number;
  arpSeconds: number;
  arpGain: number;
  padGain: number;
  filter: number;
};

const SPECS: Record<Exclude<MusicMood, "none">, MoodSpec> = {
  calm: {
    root: 146.83,
    chords: [
      [0, 4, 7],
      [-3, 2, 5],
      [-5, 0, 4],
      [-1, 2, 7],
    ],
    chordSeconds: 6,
    arpSeconds: 1.2,
    arpGain: 0.045,
    padGain: 0.07,
    filter: 900,
  },
  focus: {
    root: 130.81,
    chords: [
      [0, 3, 7],
      [0, 5, 10],
      [-2, 3, 7],
      [-4, 3, 8],
    ],
    chordSeconds: 4.5,
    arpSeconds: 0.75,
    arpGain: 0.04,
    padGain: 0.06,
    filter: 1200,
  },
  upbeat: {
    root: 174.61,
    chords: [
      [0, 4, 7],
      [5, 9, 12],
      [-3, 4, 7],
      [2, 5, 9],
    ],
    chordSeconds: 3.2,
    arpSeconds: 0.36,
    arpGain: 0.05,
    padGain: 0.055,
    filter: 1800,
  },
};

const semitone = (root: number, steps: number) => root * Math.pow(2, steps / 12);

/**
 * Generative background score built entirely with Web Audio — no audio files,
 * so it loops for any lesson length and ducks under the narration.
 */
export class MusicEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private step = 0;
  private mood: MusicMood = "calm";
  private volume = 1;

  constructor(mood: MusicMood) {
    this.mood = mood;
  }

  async start() {
    if (this.mood === "none" || this.ctx) return;
    const Ctor: typeof AudioContext =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    if (ctx.state === "suspended") await ctx.resume().catch(() => {});
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    this.ctx = ctx;
    this.master = master;
    this.fadeTo(this.volume, 2.5);

    const spec = SPECS[this.mood as Exclude<MusicMood, "none">];
    this.schedule(spec);
    this.timer = setInterval(() => this.schedule(spec), spec.chordSeconds * 1000);
  }

  private schedule(spec: MoodSpec) {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const now = ctx.currentTime + 0.05;
    const chord = spec.chords[this.step % spec.chords.length]!;
    this.step += 1;

    // sustained pad
    for (const step of chord) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = spec.filter;
      osc.type = "sine";
      osc.frequency.value = semitone(spec.root, step);
      const detune = ctx.createOscillator();
      detune.type = "triangle";
      detune.frequency.value = semitone(spec.root, step) * 2.002;
      const detuneGain = ctx.createGain();
      detuneGain.gain.value = 0.25;

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(spec.padGain, now + spec.chordSeconds * 0.4);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + spec.chordSeconds * 1.05);

      osc.connect(filter);
      detune.connect(detuneGain).connect(filter);
      filter.connect(gain).connect(master);
      osc.start(now);
      detune.start(now);
      osc.stop(now + spec.chordSeconds * 1.1);
      detune.stop(now + spec.chordSeconds * 1.1);
    }

    // gentle arpeggio on top
    const steps = Math.floor(spec.chordSeconds / spec.arpSeconds);
    for (let i = 0; i < steps; i++) {
      const at = now + i * spec.arpSeconds;
      const note = chord[i % chord.length]! + (i % 3 === 2 ? 12 : 0);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = semitone(spec.root * 2, note);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(spec.arpGain, at + 0.06);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + spec.arpSeconds * 0.95);
      osc.connect(gain).connect(master);
      osc.start(at);
      osc.stop(at + spec.arpSeconds);
    }
  }

  private fadeTo(value: number, seconds: number) {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), ctx.currentTime);
    master.gain.linearRampToValueAtTime(Math.max(value, 0), ctx.currentTime + seconds);
  }

  /** Duck under narration (0.35) or lift between scenes (1). */
  setDuck(ducked: boolean) {
    this.volume = ducked ? 0.35 : 1;
    this.fadeTo(this.volume, 0.8);
  }

  setMuted(muted: boolean) {
    this.fadeTo(muted ? 0 : this.volume, 0.4);
  }

  async stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.fadeTo(0, 0.6);
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    if (ctx) setTimeout(() => void ctx.close().catch(() => {}), 900);
  }
}
