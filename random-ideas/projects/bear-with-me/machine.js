(() => {
  "use strict";
  const STORAGE_KEY = "random.bear-with-me.v1";
  const $ = id => document.getElementById(id);
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  let saved;
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { /* Storage is optional. */ }

  class BearMachine {
    constructor() {
      this.renderer = new window.BearRenderer();
      this.progress = window.BearProgress.read(saved);
      this.busy = false;
      this.on = false;
      this.interruptions = 0;
      this.reprimands = 0;
      this.returning = this.progress.counts.some(Boolean);
      this.audio = null;
      this.idleController = null;
      this.idleTimer = null;
      this.hoverSince = 0;
      this.hesitated = false;
      this.offerResolve = null;
      this.renderer.reduced = this.progress.motion ?? media.matches;
      this.bind();
      if (this.progress.retired) this.renderer.prop("retirement", "retired", { anchor: "world", x: 420, y: 365, s: .85, keep: true });
      if (this.returning) $("caption").textContent = this.progress.retired ? "Retired. Subject to further interruptions." : "Still here, then. The bear remembers.";
      this.refresh();
      $("machine-switch").disabled = false;
    }

    save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.progress)); } catch { /* Private browsing can still enjoy a useless box. */ } }
    refresh() {
      const seen = this.progress.counts.filter(Boolean).length;
      $("seen-count").textContent = String(seen).padStart(2, "0");
      $("scene-total").textContent = String(window.BearScenes.length);
      $("progress-fill").style.width = `${seen / window.BearScenes.length * 100}%`;
      $("scene-order").value = this.progress.mode;
      $("sound-toggle").setAttribute("aria-pressed", String(this.progress.sound));
      $("sound-toggle").innerHTML = `<span aria-hidden="true">♫</span> Sound ${this.progress.sound ? "on" : "off"}`;
      $("motion-toggle").setAttribute("aria-pressed", String(this.renderer.reduced));
      $("stage").dataset.busy = String(this.busy);
      $("machine-switch").setAttribute("aria-label", this.busy ? "The bear is responding. Click again to express impatience." : "Disturb the bear");
      $("start-over").disabled = this.busy;
      $("scene-order").disabled = this.busy;
      $("status-dot").classList.toggle("busy", this.busy);
    }

    bind() {
      $("machine-switch").addEventListener("click", () => {
        this.resumeAudio();
        if (this.busy) { this.interruptions = Math.min(this.interruptions + 1, 3); return; }
        void this.play();
      });
      $("machine-switch").addEventListener("pointerenter", event => { if (event.pointerType !== "touch") void this.peek(true); });
      $("machine-switch").addEventListener("pointerleave", () => { if (!this.busy) void this.hidePeek(); });
      $("stage").addEventListener("pointermove", event => {
        if (this.busy || this.renderer.state.rise > 150) return;
        const rect = $("stage").getBoundingClientRect();
        this.renderer.state.gazeX = Math.max(-7, Math.min(7, ((event.clientX - rect.left) / rect.width - .47) * 23));
        this.renderer.render();
      });
      $("offered-paw").addEventListener("click", () => this.offerResolve?.(true));
      $("scene-order").addEventListener("change", event => { this.progress.mode = event.target.value; this.save(); });
      $("sound-toggle").addEventListener("click", () => {
        this.progress.sound = !this.progress.sound;
        if (this.progress.sound) { this.resumeAudio(); this.sound("switch-on"); }
        else this.foley?.stop();
        this.save(); this.refresh();
      });
      $("motion-toggle").addEventListener("click", () => {
        this.renderer.reduced = !this.renderer.reduced;
        this.progress.motion = this.renderer.reduced;
        if (!this.busy) void this.hidePeek();
        this.save(); this.refresh();
      });
      media.addEventListener("change", () => { if (this.progress.motion === null) { this.renderer.reduced = media.matches; this.refresh(); } });
      $("start-over").addEventListener("click", () => this.reset());
      document.addEventListener("visibilitychange", () => {
        if (document.hidden && !this.busy) { this.cancelIdle(); this.renderer.reset(); if (this.progress.retired) this.renderer.prop("retirement", "retired", { anchor: "world", x: 420, y: 365, s: .85, keep: true }); }
      });
    }

    resumeAudio() {
      if (!this.progress.sound) return;
      try {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) return;
        this.audio ??= new Audio();
        this.foley ??= new window.BearSound(this.audio);
        if (this.audio.state === "suspended") this.audio.resume().catch(() => {});
      } catch { /* Audio support never gates interaction. */ }
    }
    sound(kind, volume = 1) {
      if (!this.progress.sound || !this.audio || this.audio.state !== "running") return;
      this.foley?.play(kind, volume);
    }

    setSwitch(on) {
      this.on = on;
      this.renderer.switch(on);
      $("machine-switch").setAttribute("aria-checked", String(on));
      this.sound(on ? "switch-on" : "switch-off");
    }
    cancelIdle() { clearTimeout(this.idleTimer); this.idleController?.abort(); this.idleController = null; }
    async peek(hover = false) {
      if (this.busy || this.progress.retired || this.renderer.reduced || document.hidden) return;
      if (hover) this.hoverSince = performance.now();
      this.cancelIdle();
      const controller = this.idleController = new AbortController(), signal = controller.signal;
      try {
        // A small lid lift hints at life inside; only a click reveals the bear.
        this.sound("lid-peek");
        await this.renderer.move({ lid: .04 }, 300, signal);
        if (!hover) { await this.renderer.wait(900, signal); await this.hidePeek(); }
      } catch (error) { if (error.name !== "AbortError") console.error(error); }
    }
    async hidePeek() {
      if (this.busy) return;
      this.hoverSince = 0;
      this.cancelIdle();
      const signal = (this.idleController = new AbortController()).signal;
      try {
        const wasOpen = this.renderer.state.lid > .005;
        await this.renderer.move({ lid: 0 }, 260, signal);
        if (wasOpen) this.sound("lid-close", .2);
      } catch (error) { if (error.name !== "AbortError") console.error(error); }
    }

    async acknowledgeImpatience(signal) {
      if (!this.interruptions || this.reprimands >= 2 || this.renderer.state.rise > 90) return;
      const howMany = this.interruptions;
      this.interruptions = 0;
      this.reprimands++;
      const state = this.renderer.state;
      const previous = { gazeX: state.gazeX, gazeY: state.gazeY, tilt: state.tilt };
      $("caption").textContent = howMany > 1 ? "Repeated clicking has been noted. Service will now be slower." : "Yes. The bear noticed the first time.";
      await this.renderer.move({ gazeX: 0, gazeY: 0, tilt: 0 }, 220, signal);
      await this.renderer.wait(300 + howMany * 130, signal);
      await this.renderer.move(previous, 220, signal);
    }

    async dramaticPause(ms, signal) {
      const r = this.renderer, eye = r.state.eye;
      const hold = Math.min(2000, Math.max(1100, ms * 1.85));
      await r.wait(hold * .6, signal);
      if (eye > .3 && !r.reduced) {
        await r.move({ eye: 0 }, 140, signal);
        await r.wait(45, signal);
        await r.move({ eye }, 220, signal);
      }
      await r.wait(hold * .4, signal);
    }

    motionDuration(ms, motion = "smooth") {
      if (this.renderer.reduced || ms <= 0) return ms;
      // Loose objects fall under gravity, independently of the bear's mood.
      if (motion === "fall") return ms;
      // Keep ordinary gestures near 400 ms; stretch the contrast on either
      // side. Apply once per action, not again to its smaller movement phases.
      const stretch = Math.max(.5, Math.min(3, (ms / 400) ** 1.05));
      const weight = { heavy: 1.65, weary: 1.7, hesitant: 1.5, gentle: 1.25 }[motion] ?? 1;
      return Math.min(5200, Math.max(80, Math.round(ms * stretch * weight)));
    }

    context(signal) {
      const machine = this, r = this.renderer;
      const c = {
        closeSpeed: 500,
        motion: "smooth",
        toggle: window.BearRenderer.hardwareGeometry().tip,
        async move(values, ms = 400, motion) {
          // Looking and blinking stay responsive even when the body is tired.
          motion ??= Object.keys(values).every(key => ["eye", "gazeX", "gazeY"].includes(key)) ? "smooth" : c.motion;
          await machine.acknowledgeImpatience(signal);
          if (values.lid !== undefined && Math.abs(values.lid - r.state.lid) > .06) machine.sound("lid-open", .65);
          if (ms >= 140 && ["lx", "ly", "rx", "ry", "rise", "x"].some(key => Math.abs((values[key] ?? r.state[key]) - r.state[key]) > 20)) {
            machine.sound("plush");
            for (const p of r.props.values()) {
              const prefix = p.anchor === "left" ? "l" : p.anchor === "right" ? "r" : null;
              if (prefix && [prefix + "x", prefix + "y"].some(key => Math.abs((values[key] ?? r.state[key]) - r.state[key]) > 12)) {
                machine.sound(window.BearSound.material(p.type), .4);
              }
            }
          }
          await r.move(values, machine.motionDuration(ms, motion), signal, motion);
          if (values.lid === 0) machine.sound("lid-close");
        },
        wait(ms) { return machine.dramaticPause(ms, signal); },
        beat(ms = 250) { return r.wait(ms, signal); },
        atSwitch(values, ms = 400, motion) {
          const pose = { ...values };
          if (pose.x !== undefined) pose.x -= r.layout.offsetX;
          const offset = r.layout.offsetX + (pose.x ?? r.state.x);
          for (const key of ["lx", "rx"]) if (pose[key] !== undefined) pose[key] -= offset;
          return c.move(pose, ms, motion);
        },
        async open(lid = 1, rise = 0, ms = 420, motion = c.motion) {
          const duration = machine.motionDuration(ms, motion);
          r.expression(); r.wear(c.headwear || "");
          machine.sound("lid-open");
          await r.move({ lid }, duration * .65, signal, motion);
          machine.sound("plush");
          await r.move({ rise, eye: 1, lx: 366, ly: 313, rx: 451, ry: 314, lr: 0, rr: 0, leftInside: 1, rightInside: 1 }, duration, signal, motion);
          for (const p of r.props.values()) machine.sound(window.BearSound.material(p.type), .35);
          if (ms >= 400) await machine.dramaticPause(450, signal);
          if (machine.returning) {
            machine.returning = false;
            await r.move({ gazeX: 0, eye: .65, tilt: 0 }, 180, signal);
            await r.wait(400, signal);
          }
          if (machine.hesitated) {
            machine.hesitated = false;
            $("caption").textContent = "You had time to reconsider.";
            await r.move({ gazeX: 0, eye: .6 }, 200, signal);
            await r.wait(450, signal);
            await r.move({ eye: 1 }, 200, signal);
          }
        },
        async off({ ms = 400, hold = 90, stay = false, roll = 30, motion = c.motion } = {}) {
          const s = r.state;
          const { approach, contact: touch } = window.BearRenderer.hardwareGeometry();
          const stretch = ms > 0 ? machine.motionDuration(ms, motion) / ms : 1;
          const contactMotion = motion === "hesitant" ? "commit" : motion === "weary" ? "heavy" : motion;
          const recoveryMotion = motion === "hesitant" ? "snap" : motion === "weary" ? "heavy" : motion;
          // Lean toward a distant switch instead of stretching the seated arm.
          const shoulder = window.BearRenderer.shoulderPosition("right");
          const dy = touch.y - (shoulder.y + s.rise);
          const shoulderX = shoulder.x + s.x + r.layout.offsetX;
          if (Math.hypot(shoulderX - touch.x, dy) > 106) {
            const reachX = Math.sqrt(Math.max(0, 106 ** 2 - dy ** 2));
            await c.move({ x: touch.x + reachX - shoulder.x - r.layout.offsetX }, 380, motion === "hesitant" || motion === "weary" ? "heavy" : motion);
          }
          await c.move({ rx: approach.x - s.x - r.layout.offsetX, ry: approach.y - s.rise, rr: roll }, ms, motion);
          await r.wait(ms >= 600 ? 600 : ms >= 400 ? 300 : 40, signal);
          const contact = motion === "hesitant" && !r.reduced ? 120 : Math.min(260, ms * .5) * stretch;
          await r.move({ rx: touch.x - s.x - r.layout.offsetX, ry: touch.y - s.rise }, r.reduced ? contact : Math.max(60, contact), signal, contactMotion);
          machine.setSwitch(false);
          await r.wait(hold, signal);
          if (!stay) await r.move({ rx: 451, ry: 314, rr: 0 }, machine.motionDuration(Math.min(400, ms), recoveryMotion), signal, recoveryMotion);
        },
        on() { machine.setSwitch(true); },
        face(type) { r.expression(type); },
        sound(kind, volume) { machine.sound(kind, volume); },
        anchor(id, anchor) { r.anchorProp(id, anchor); },
        async turn(id, type) {
          await c.pmove(id, { sx: .04 }, 200);
          r.replaceProp(id, type);
          await c.pmove(id, { sx: 1 }, 200);
        },
        drop(id, values, ms = 450) { r.anchorProp(id, "world"); return c.pmove(id, values, ms, "fall"); },
        wear(type) { c.headwear = type; r.wear(type); if (r.state.rise < 100) machine.sound(window.BearSound.material(type), .5); },
        outfit(type) { r.outfit(type); if (r.state.rise < 100) machine.sound("cloth", .5); },
        prop(id, type, options) {
          const prop = r.prop(id, type, options);
          if (prop.opacity > 0 && (prop.anchor === "world" || r.state.rise < 100)) machine.sound(window.BearSound.material(type), .5);
          return prop;
        },
        pmove(id, values, ms = 400, motion = c.motion) {
          machine.sound(window.BearSound.material(r.props.get(id)?.type), .65);
          return r.moveProp(id, values, machine.motionDuration(ms, motion), signal, motion);
        },
        async place(id, x, y, ms = 450) {
          const p = r.props.get(id);
          if (!p || !["left", "right"].includes(p.anchor)) throw new Error(`Cannot place ${id}`);
          const prefix = p.anchor === "left" ? "l" : "r";
          const point = r.propPosition({ anchor: "world", x, y });
          await c.move({ [prefix + "x"]: point.x - p.x - r.state.x - r.layout.offsetX, [prefix + "y"]: point.y - p.y - r.state.rise, [p.anchor + "Inside"]: 0 }, ms);
          r.anchorProp(id, "world");
          machine.sound(window.BearSound.material(p.type), .5);
        },
        async stow(id, hand = "left") {
          const p = r.props.get(id);
          if (!p) return;
          const prefix = hand === "left" ? "l" : "r";
          if (p.anchor === "world" || p.anchor === "inside") {
            const point = r.propPosition(p);
            await c.move({ [prefix + "x"]: point.x - r.state.x - r.layout.offsetX, [prefix + "y"]: point.y + 17 - r.state.rise, [hand + "Inside"]: 0 }, 400);
            r.anchorProp(id, hand);
          }
          await c.move({ [prefix + "x"]: hand === "left" ? 376 : 438, [prefix + "y"]: 281 - r.state.rise }, 350);
          r.anchorProp(id, "inside");
          await c.pmove(id, { y: 465 }, 400);
          r.removeProp(id);
          await c.move({ [prefix + "x"]: hand === "left" ? 366 : 451, [prefix + "y"]: 313 }, 250);
        },
        remove(id) { r.removeProp(id); },
        async repeat(times, fn) { for (let i = 0; i < times; i++) await fn(i); },
        offer(type) { return machine.offer(type, signal); }
      };
      return c;
    }

    offer(type, signal) {
      const button = $("offered-paw");
      button.textContent = type === "paw" ? "Shake paw" : "Accept cookie";
      button.hidden = false;
      $("caption").textContent = type === "paw" ? "A paw has been offered. This is optional." : "A cookie has entered the negotiations.";
      return new Promise(resolve => {
        let settled = false;
        const finish = accepted => {
          if (settled) return;
          settled = true; clearTimeout(timer); button.hidden = true;
          if (document.activeElement === button) $("machine-switch").focus({ preventScroll: true });
          this.offerResolve = null;
          signal.removeEventListener("abort", cancel);
          resolve(accepted);
        };
        const cancel = () => finish(false);
        const timer = setTimeout(() => finish(false), 2400 / this.renderer.speed);
        this.offerResolve = finish;
        signal.addEventListener("abort", cancel, { once: true });
        if (signal.aborted) finish(false);
      });
    }

    async play(index = window.BearProgress.choose(this.progress)) {
      if (this.busy || !Number.isInteger(index) || !window.BearScenes[index]) return false;
      this.hesitated = this.hoverSince > 0 && performance.now() - this.hoverSince > 1200;
      this.hoverSince = 0;
      this.cancelIdle();
      this.busy = true; this.interruptions = 0; this.reprimands = 0;
      const controller = new AbortController(), signal = controller.signal;
      const scene = window.BearScenes[index], c = this.context(signal);
      let completed = false;
      $("invitation").setAttribute("opacity", "0");
      $("caption").textContent = "The bear is considering your request.";
      $("announcement").textContent = "Switch on. The bear is responding.";
      this.setSwitch(true); this.refresh();
      try {
        await this.renderer.assetsReady;
        if (this.progress.retired) {
          await c.open(); await c.move({ eye: .55, tilt: -9, gazeY: 7 }, 400);
          await c.stow("retirement"); this.progress.retired = false;
          $("caption").textContent = "Retirement has been cancelled by one click.";
          await c.wait(550);
        }
        this.renderer.clearProps(); this.renderer.wear(); this.renderer.outfit();
        Object.assign(this.renderer.state, { eye: 1, gazeX: 0, gazeY: 0, ear: 0, tilt: 0 });
        this.renderer.expression(); this.renderer.render();
        await scene.play(c);
        // A scene must physically reach the switch before it is allowed to finish.
        if (this.on) await c.off();
        const exitMotion = c.exitMotion ?? c.motion;
        const closeDuration = this.motionDuration(c.closeSpeed, exitMotion);
        await this.renderer.retractHands(this.motionDuration(Math.min(400, c.closeSpeed), exitMotion), signal, exitMotion);
        this.sound("plush");
        await this.renderer.move({ rise: 260, x: 0, tilt: 0, boxX: 0, boxR: 0 }, closeDuration, signal, exitMotion);
        await this.renderer.move({ lid: 0 }, closeDuration * .7, signal, exitMotion);
        this.sound("lid-close", c.closeSpeed < 300 ? 1 : .7);
        this.renderer.clearProps(true);
        this.renderer.wear(); this.renderer.outfit();
        this.progress.counts[index]++;
        this.progress.last = index;
        this.progress.retired = scene.id === 50;
        this.save();
        completed = true;
        $("caption").textContent = c.caption ?? scene.caption;
        $("announcement").textContent = `${scene.description} Switch off. The bear is back in the box. ${this.progress.counts.filter(Boolean).length} of ${window.BearScenes.length} reactions witnessed.`;
      } catch (error) {
        console.error("The bear lost its train of thought:", error);
        this.renderer.reset();
        this.progress.retired = false;
        $("caption").textContent = "A brief technical sulk. The switch is ready again.";
        $("announcement").textContent = "The scene was interrupted. Try the switch again.";
      } finally {
        controller.abort();
        if (this.on) this.setSwitch(false);
        this.offerResolve?.(false);
        this.busy = false; this.refresh();
        if (completed && !this.renderer.reduced && !this.progress.retired) this.idleTimer = setTimeout(() => void this.peek(), 9000);
      }
      return completed;
    }

    reset() {
      if (this.busy) return;
      this.cancelIdle(); this.renderer.reset(); this.setSwitch(false);
      const prefs = { sound: this.progress.sound, mode: this.progress.mode, motion: this.progress.motion };
      this.progress = { ...window.BearProgress.fresh(), ...prefs };
      this.returning = false; this.save(); this.refresh();
      this.hoverSince = 0; this.hesitated = false;
      $("invitation").setAttribute("opacity", "1");
      $("caption").textContent = "A fresh start. The bear has learned nothing.";
      $("announcement").textContent = `Progress reset. All ${window.BearScenes.length} reactions are ready to discover again.`;
    }
  }

  // Exposed for reproducible browser verification of every performance.
  window.bearMachine = new BearMachine();
})();
