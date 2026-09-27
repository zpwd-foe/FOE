/* Small, local Web Audio foley. No downloads, music, or permanently running loops. */
(() => {
  "use strict";
  class BearSound {
    constructor(context) {
      this.context = context;
      this.sources = new Set();
      this.last = new Map();
      this.output = context.createGain();
      this.output.gain.value = 1.1;
      this.output.connect(context.destination);
      this.noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
      const samples = this.noise.getChannelData(0);
      let seed = 301;
      for (let i = 0; i < samples.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        samples[i] = seed / 2147483648 - 1;
      }
    }

    static material(type) {
      if (["book", "album", "album-back", "clipboard", "scroll", "sign", "denied", "retired", "why", "screen"].includes(type)) return "paper";
      if (["periscope", "spoon", "glasses"].includes(type)) return "metal";
      if (["ruler", "stamp", "stool", "blocks", "chair"].includes(type)) return "wood";
      if (type === "stopwatch") return "tick";
      if (type === "sparkle" || type === "cookie") return null;
      return type ? "cloth" : null;
    }

    voice(source, duration, level, delay = 0, filter = null, attack = .003) {
      const ctx = this.context, start = ctx.currentTime + delay;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(level, start + Math.min(attack, duration * .25));
      gain.gain.exponentialRampToValueAtTime(.00001, start + duration);
      if (filter) { source.connect(filter); filter.connect(gain); }
      else source.connect(gain);
      gain.connect(this.output);
      this.sources.add(source);
      source.onended = () => {
        this.sources.delete(source);
        source.disconnect(); filter?.disconnect(); gain.disconnect();
      };
      source.start(start); source.stop(start + duration + .005);
    }

    friction(frequency, duration, level, delay = 0, q = .7, attack = .012) {
      const ctx = this.context, source = ctx.createBufferSource(), filter = ctx.createBiquadFilter();
      source.buffer = this.noise;
      filter.type = "bandpass";
      filter.frequency.value = frequency;
      filter.Q.value = q;
      this.voice(source, duration, level, delay, filter, attack);
    }

    resonance(frequency, duration, level, delay = 0) {
      const source = this.context.createOscillator();
      source.type = "sine";
      source.frequency.value = frequency;
      this.voice(source, duration, level, delay);
    }

    play(kind, volume = 1) {
      if (!kind) return;
      const now = this.context.currentTime;
      const cooldown = ["plush", "cloth", "paper"].includes(kind) ? .18 : .035;
      if (now - (this.last.get(kind) ?? -Infinity) < cooldown) return;
      this.last.set(kind, now);
      const noise = (hz, seconds, gain, delay = 0, q = .7, attack = .012) => this.friction(hz, seconds, gain * volume, delay, q, attack);
      const tone = (hz, seconds, gain, delay = 0) => this.resonance(hz, seconds, gain * volume, delay);
      switch (kind) {
        case "switch-on": case "switch-off": {
          const lower = kind === "switch-off" ? .83 : 1;
          noise(2800, .022, .2, 0, .7, .001);
          noise(1450, .04, .22, .022, .9, .001);
          tone(870 * lower, .035, .045, .022);
          tone(2140 * lower, .018, .024);
          break;
        }
        case "lid-open": case "lid-peek": {
          const quiet = kind === "lid-peek" ? .4 : 1;
          // Uneven friction pulses give the hinge a tiny wooden creak.
          for (let i = 0; i < 4; i++) {
            noise(430 + i * 95, .07 + i * .015, .09 * quiet, i * .05, 5, .009);
            noise(1600, .055, .018 * quiet, i * .05);
          }
          break;
        }
        case "lid-close":
          noise(750, .07, .25, 0, .7, .001);
          tone(145, .14, .11); tone(317, .075, .045); tone(580, .04, .019);
          noise(1800, .025, .04, .055, .7, .001);
          break;
        case "wood":
          noise(1100, .045, .16, 0, .7, .001);
          tone(330, .06, .07); tone(720, .027, .025);
          break;
        case "metal":
          noise(3400, .024, .12, 0, .7, .001);
          tone(1783, .13, .035); tone(2867, .085, .018); tone(4193, .04, .008);
          break;
        case "tick":
          noise(4300, .015, .11, 0, 1, .001);
          tone(1850, .016, .028);
          break;
        case "paper":
          noise(2600, .14, .16, 0, .6, .018);
          noise(4100, .12, .11, .065, .5, .025);
          noise(1800, .045, .08, .17);
          break;
        case "cloth": case "plush": {
          const quiet = kind === "plush" ? .55 : 1;
          noise(1200, .19, .13 * quiet, 0, .4, .035);
          noise(2400, .14, .045 * quiet, .06, .5, .025);
          break;
        }
      }
    }

    stop() {
      for (const source of this.sources) { try { source.stop(); } catch { /* Already ended. */ } }
      this.sources.clear(); this.last.clear();
    }
  }
  window.BearSound = BearSound;
})();
