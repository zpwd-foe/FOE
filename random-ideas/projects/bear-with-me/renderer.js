/* A small SVG puppet: all positions use the same 860 × 540 coordinate system. */
(() => {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  const home = { lid: 0, rise: 260, x: 0, tilt: 0, eye: 1, gazeX: 0, gazeY: 0, ear: 0, lx: 366, ly: 313, rx: 451, ry: 314, lr: 0, rr: 0, leftInside: 1, rightInside: 1, boxX: 0, boxR: 0 };
  const { art, headwear, outfits } = window.BearArtwork || {};

  class BearRenderer {
    static motionProgress(t, motion = "smooth") {
      t = Math.max(0, Math.min(1, t));
      const smooth = p => p * p * (3 - 2 * p);
      if (motion === "linear") return t;
      if (motion === "heavy") return smooth(t ** 1.7);
      if (motion === "gentle") return (1 - Math.cos(Math.PI * t)) / 2;
      if (motion === "snap") return 1 - (1 - t) ** 4;
      if (motion === "commit") return smooth(t ** 2.3);
      if (motion === "fall") return t * t;
      // Stops belong to the gesture: the hand, its lift arc and the wrist
      // all rest together, then resume along the same path without jumping.
      const beats = motion === "hesitant"
        ? [[0, 0], [.34, .58], [.66, .58], [1, 1]]
        : motion === "weary"
          ? [[0, 0], [.2, .3], [.42, .3], [.68, .72], [.84, .72], [1, 1]]
          : null;
      if (!beats) return smooth(t);
      for (let i = 1; i < beats.length; i++) {
        const [end, to] = beats[i], [start, from] = beats[i - 1];
        if (t <= end) return from + (to - from) * smooth((t - start) / (end - start));
      }
      return 1;
    }

    static boxPoint(x, y) {
      // Keep scene choreography in puppet coordinates while giving the bear
      // the compact, close-fitting box from the photographic reference.
      return { x: 420 + (x - 420) * .56, y: 353 + (y - 353) * .58 };
    }

    static projectBox(x, y, depth) {
      const scale = 1 / (1 + depth * (1 / .88 - 1));
      return { x: 830 + (x - 830) * scale, y: -397 + (y + 397) * scale, scale };
    }

    static lidGeometry(openness) {
      const angle = Math.max(0, Math.min(1.15, openness)) * Math.PI / 2;
      const point = (u, v, thickness = 0) => BearRenderer.projectBox(
        215 + 410 * u,
        353 - .75 * 193 * (1 - v) * Math.sin(angle) + thickness * Math.cos(angle),
        .96 - .75 * (1 - v) * Math.cos(angle) + thickness / 193 * Math.sin(angle));
      return { point, frontLeft: point(0, 0), frontRight: point(1, 0), backRight: point(1, 1), backLeft: point(0, 1) };
    }

    static polygon(points) {
      return points.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join("") + "Z";
    }

    static stageLayout() {
      const front = BearRenderer.projectBox(420, 353, .28);
      const back = BearRenderer.projectBox(420, 353, .90);
      const center = BearRenderer.boxPoint((front.x + back.x) / 2, front.y);
      return { offsetX: center.x - 407, rimY: center.y };
    }

    static hardwareGeometry(on = true) {
      // Stage coordinates shared by the drawing, hit target and choreography.
      const mount = { x: 420, y: 349 }, tip = { x: 420, y: on ? 326 : 332 };
      return { mount, tip, pivot: { x: 420, y: 345 }, washer: { rx: 8.2, ry: 3 },
        indicator: { x: 470, y: 346, rx: 5.1, ry: 2.8 },
        approach: { x: tip.x + 11, y: tip.y - 4 }, contact: { x: tip.x - 11, y: tip.y + 9 } };
    }

    static fingerJoints() {
      // Match v7: a deeper top finger, then five regular end-grain fingers.
      // The left and right schedules are identical, including the foot margin.
      return [354, 382, 403.3, 424.6, 445.9, 467.2].map((y, i) => ({ y, height: i ? 10.5 : 19, width: 11.6 }));
    }

    makeBoxDetails() {
      const path = (parent, d, fill, stroke, width = .6) => {
        const node = document.createElementNS(NS, "path");
        for (const [key, value] of Object.entries({ d, fill, stroke, "stroke-width": width })) node.setAttribute(key, value);
        document.getElementById(parent).append(node);
      };
      const joints = BearRenderer.fingerJoints();
      for (const [index, joint] of joints.entries()) {
        for (const x of [205, 635 - joint.width]) {
          path("front-finger-joints", `M${x} ${joint.y}h${joint.width}v${joint.height}h${-joint.width}Z`, "url(#hinoki-end)", "#a26a3c", .3);
        }
        const top = joint.y + joint.height, bottom = joints[index + 1]?.y ?? 485;
        if (bottom > top) path("side-finger-joints", BearRenderer.polygon([
          BearRenderer.projectBox(635, top, 0), BearRenderer.projectBox(635, top, .11),
          BearRenderer.projectBox(635, bottom, .11), BearRenderer.projectBox(635, bottom, 0)
        ]), "url(#hinoki-end)", "#ac794d", .45);
      }
      document.getElementById("asanoha-inlay").setAttribute("d", BearRenderer.asanohaInlay());
      const { mount, indicator } = BearRenderer.hardwareGeometry();
      document.getElementById("toggle-switch").setAttribute("transform", `translate(${mount.x} ${mount.y})`);
      document.getElementById("indicator-lamp").setAttribute("transform", `translate(${indicator.x} ${indicator.y})`);
      this.hitTarget = document.getElementById("machine-switch");
      this.hitTargetResize = new ResizeObserver(() => this.updateHitTarget());
      this.hitTargetResize.observe(document.getElementById("stage"));
    }

    updateHitTarget() {
      if (!this.hitTarget) return;
      const stage = document.getElementById("stage"), host = stage.getBoundingClientRect();
      const fitting = document.getElementById("toggle-switch").getBoundingClientRect();
      if (!host.width || !host.height || !fitting.width) return;
      // Derive the target from the rendered fitting: viewBox, responsive scale,
      // resize and the box's tiny rotations all contribute to this rectangle.
      const sx = stage.clientWidth / host.width, sy = stage.clientHeight / host.height;
      const width = Math.max(44, fitting.width * sx + 12), height = Math.max(44, fitting.height * sy + 12);
      Object.assign(this.hitTarget.style, {
        left: `${(fitting.left + fitting.width / 2 - host.left) * sx - width / 2}px`,
        top: `${(fitting.top + fitting.height / 2 - host.top) * sy - height / 2}px`,
        width: `${width}px`, height: `${height}px`, transform: "none"
      });
    }

    static asanohaInlay() {
      // V7 uses a triangular lattice split at each triangle's centroid.
      // Sharing edges gives continuous six-leaf stars with no loose ends.
      const side = 46.5, pitch = Math.sqrt(3) * side / 2, edges = new Map();
      const key = p => `${p.x.toFixed(3)} ${p.y.toFixed(3)}`;
      const line = (a, b) => { const points = [key(a), key(b)].sort(); edges.set(points.join("/"), `M${points[0]}L${points[1]}`); };
      const triangle = vertices => {
        const center = { x: vertices.reduce((n, p) => n + p.x, 0) / 3, y: vertices.reduce((n, p) => n + p.y, 0) / 3 };
        vertices.forEach((p, i) => { line(p, vertices[(i + 1) % 3]); line(center, p); });
      };
      for (let col = -1; col <= 10; col++) for (let row = -2; row <= 3; row++) {
        const x = 226 + col * pitch, y = 383 + row * side + (col % 2) * side / 2;
        const a = { x, y }, b = { x, y: y + side };
        const c = { x: x + pitch, y: y + side / 2 }, d = { x: x + pitch, y: y - side / 2 };
        triangle([a, b, c]); triangle([a, d, c]);
      }
      return [...edges.values()].join("");
    }

    makeWoodSurface(group, columns = false) {
      // Thin texture strips follow the same perspective as the actual surface.
      // SVG's affine image transform alone cannot fit a tapered quadrilateral.
      const count = 20, step = 1 / count;
      const strips = Array.from({ length: count }, (_, i) => {
        const strip = document.createElementNS(NS, "svg");
        strip.setAttribute("width", columns ? step + .001 : 1);
        strip.setAttribute("height", columns ? 1 : step + .001);
        strip.setAttribute("viewBox", columns ? `${i * 1536 / count} 0 ${1536 / count + 1.536} 1024` : `0 ${i * 1024 / count} 1536 ${1024 / count + 1.024}`);
        strip.setAttribute("preserveAspectRatio", "none");
        const image = document.createElementNS(NS, "use");
        image.setAttribute("href", "#hinoki-texture");
        strip.append(image); group.append(strip);
        return strip;
      });
      return point => strips.forEach((strip, i) => {
        const u = columns ? i * step : 0, v = columns ? 0 : i * step;
        const p = point(u, v), px = point(u + (columns ? step : 1), v), py = point(u, v + (columns ? 1 : step));
        const du = columns ? step : 1, dv = columns ? 1 : step;
        strip.setAttribute("transform", `matrix(${(px.x - p.x) / du} ${(px.y - p.y) / du} ${(py.x - p.x) / dv} ${(py.y - p.y) / dv} ${p.x} ${p.y})`);
      });
    }

    static elbowPosition(sx, sy, px, py, side) {
      const dx = px - sx, dy = py - sy, distance = Math.hypot(dx, dy);
      const extension = Math.max(0, Math.min(1, (distance - 50) / 64));
      const fold = 1 - extension * extension * (3 - 2 * extension);
      // A sewn shoulder keeps the elbow low and outward. The pole stays in
      // body coordinates, even when the paw crosses or rests on the shoulder.
      return { x: sx + dx * .48 + side * 22 * fold, y: sy + dy * .48 + 31 * fold };
    }

    static armPose(sx, sy, px, py, side, gesture = 0) {
      // A plush arm can compress, but cannot extend like a telescopic rod.
      const dx = px - sx, dy = py - sy, reach = Math.hypot(dx, dy);
      const scale = Math.min(1, 114 / Math.max(1, reach));
      px = sx + dx * scale; py = sy + dy * scale;
      const elbow = BearRenderer.elbowPosition(sx, sy, px, py, side);
      // A bounded sideways roll has no +/-180-degree angle seam. The paw
      // follows the forearm without unwinding when it passes below the elbow.
      const forearm = Math.max(1, Math.hypot(px - elbow.x, py - elbow.y));
      const wrist = 18 * (px - elbow.x) / forearm + 27 * Math.tanh(gesture / 45);
      return { x: px, y: py, elbow, wrist };
    }

    static armSurface(sx, sy, hand, side, count = 32) {
      const a = { x: sx, y: sy }, d = { x: hand.x, y: hand.y };
      const dx = d.x - sx, dy = d.y - sy, reach = Math.hypot(dx, dy);
      const extension = Math.max(0, Math.min(1, (reach - 50) / 64));
      const fold = 1 - extension * extension * (3 - 2 * extension);
      const b = { x: sx + dx * .25 + side * 22 * fold, y: sy + dy * .25 + 48 * fold };
      const c = { x: sx + dx * .75 + side * 38 * fold, y: sy + dy * .75 + 28 * fold };
      // A single curve distributes the bend through the stuffing. Unequal
      // controls retain a rounded fold even with the paw at the shoulder.
      return Array.from({ length: count + 1 }, (_, i) => {
        const t = i / count, u = t, v = 1 - u;
        const x = v ** 3 * a.x + 3 * v * v * u * b.x + 3 * v * u * u * c.x + u ** 3 * d.x;
        const y = v ** 3 * a.y + 3 * v * v * u * b.y + 3 * v * u * u * c.y + u ** 3 * d.y;
        const vx = 3 * v * v * (b.x - a.x) + 6 * v * u * (c.x - b.x) + 3 * u * u * (d.x - c.x);
        const vy = 3 * v * v * (b.y - a.y) + 6 * v * u * (c.y - b.y) + 3 * u * u * (d.y - c.y);
        const speed = Math.max(.001, Math.hypot(vx, vy));
        const ax = 6 * v * (c.x - 2 * b.x + a.x) + 6 * u * (d.x - 2 * c.x + b.x);
        const ay = 6 * v * (c.y - 2 * b.y + a.y) + 6 * u * (d.y - 2 * c.y + b.y);
        const curvature = (vx * ay - vy * ax) / speed ** 3;
        const width = (20.5 - 3 * t + 2 * Math.sin(Math.PI * t)) * (1.06 - .1 * Math.min(1, reach / 114));
        // Stuffing compresses on the inside of a fold. Limiting that offset
        // to the bend radius prevents the skin from turning inside out.
        const innerWidth = Math.min(width, .72 / Math.max(.001, Math.abs(curvature)));
        const topWidth = curvature < 0 ? innerWidth : width, bottomWidth = curvature > 0 ? innerWidth : width;
        return { x, y, top: { x: x + vy / speed * topWidth, y: y - vx / speed * topWidth }, bottom: { x: x - vy / speed * bottomWidth, y: y + vx / speed * bottomWidth } };
      });
    }

    makeArmSurface(side) {
      const root = document.getElementById(`${side}-arm-surface`);
      const count = 32, tiles = [];
      const lining = document.createElementNS(NS, "path");
      lining.id = `${side}-arm-lining`; lining.setAttribute("fill", "#b47c46"); root.append(lining);
      const forearmMask = document.getElementById(`${side}-forearm-opaque`);
      const emergence = document.querySelector(`#${side}-arm-emergence path`);
      for (let i = 0; i < count * 2; i++) {
        const clip = document.createElementNS(NS, "clipPath"), path = document.createElementNS(NS, "path");
        clip.id = `${side}-arm-tile-${i}`; clip.setAttribute("clipPathUnits", "userSpaceOnUse");
        clip.append(path); root.append(clip);
        const tile = document.createElementNS(NS, "g"), artwork = document.createElementNS(NS, "use");
        tile.setAttribute("clip-path", `url(#${clip.id})`);
        artwork.setAttribute("href", "#plush-arm"); artwork.setAttribute("width", "512"); artwork.setAttribute("height", "286");
        tile.append(artwork); root.append(tile); tiles.push({ path, artwork });
      }
      const outline = document.createElementNS(NS, "clipPath"), contour = document.createElementNS(NS, "path");
      outline.id = `${side}-arm-contour`; outline.append(contour); root.append(outline);
      const bendClip = document.createElementNS(NS, "g"), bend = document.createElementNS(NS, "g"), fur = document.createElementNS(NS, "use");
      bendClip.setAttribute("clip-path", `url(#${outline.id})`); bend.setAttribute("mask", "url(#arm-bend-fur)");
      fur.setAttribute("href", "#plush-arm"); fur.setAttribute("x", "-39"); fur.setAttribute("y", "-25"); fur.setAttribute("width", "78"); fur.setAttribute("height", "50");
      bend.append(fur); bendClip.append(bend); root.append(bendClip);
      return (sx, sy, hand, direction) => {
        const mesh = BearRenderer.armSurface(sx, sy, hand, direction, count);
        // A submerged shoulder stays behind the wall. Only the sleeve that
        // crosses the opening can come forward with the paw.
        const rim = this.layout.rimY;
        let exposed = `M150 0H700V${sy <= rim ? 730 : rim}H150Z`;
        if (sy > rim && hand.y < rim) {
          let start = count;
          while (start > 0 && mesh[start - 1].y < rim) start--;
          const distal = mesh.slice(start);
          exposed += BearRenderer.polygon([...distal.map(p => p.top), ...distal.map(p => p.bottom).reverse()]);
        }
        emergence.setAttribute("d", exposed);
        const inset = (p, edge) => ({ x: p.x + (edge.x - p.x) * .78, y: p.y + (edge.y - p.y) * .78 });
        // Solid fabric beneath the fibres also seals antialiased mesh seams.
        // Only the outer fringe retains the atlas's semitransparent alpha.
        lining.setAttribute("d", BearRenderer.polygon([...mesh.map(p => inset(p, p.top)), ...mesh.map(p => inset(p, p.bottom)).reverse()]));
        // A folded forearm can cross the shoulder's screen position. Restore
        // its opacity by material position, independent of the root fade.
        const forearm = mesh.slice(Math.floor(count * .35));
        forearmMask.setAttribute("d", BearRenderer.polygon([...forearm.map(p => p.top), ...forearm.map(p => p.bottom).reverse()]));
        const lengths = [0];
        for (let i = 1; i <= count; i++) lengths.push(lengths[i - 1] + Math.hypot(mesh[i].x - mesh[i - 1].x, mesh[i].y - mesh[i - 1].y));
        const textureScale = 512 / Math.max(1, lengths[count]);
        contour.setAttribute("d", BearRenderer.polygon([...mesh.map(p => p.top), ...mesh.map(p => p.bottom).reverse()]));
        // Keep fur fibres at their native density over the compressed fold.
        // This material blend follows translation only, within the curved skin.
        bend.setAttribute("transform", `translate(${mesh[count / 2].x} ${mesh[count / 2].y})`);
        for (let i = 0; i < count; i++) {
          const p = mesh[i], q = mesh[i + 1], u = lengths[i] * textureScale, step = Math.max(.001, (lengths[i + 1] - lengths[i]) * textureScale);
          for (let half = 0; half < 2; half++) {
            const { path, artwork } = tiles[i * 2 + half];
            const [a, b, c] = half ? [p.top, q.bottom, p.bottom] : [p.top, q.top, q.bottom];
            path.setAttribute("d", BearRenderer.polygon([a, b, c]));
            const xx = (half ? q.bottom.x - p.bottom.x : q.top.x - p.top.x) / step;
            const xy = (half ? q.bottom.y - p.bottom.y : q.top.y - p.top.y) / step;
            const yx = (half ? p.bottom.x - p.top.x : q.bottom.x - q.top.x) / 286;
            const yy = (half ? p.bottom.y - p.top.y : q.bottom.y - q.top.y) / 286;
            artwork.setAttribute("transform", `matrix(${xx} ${xy} ${yx} ${yy} ${p.top.x - xx * u} ${p.top.y - xy * u})`);
          }
        }
      };
    }

    static shoulderPosition(side) {
      // Sewn into the torso below the neck, not on top of the cheek silhouette.
      return { x: side === "right" ? 449 : 365, y: 311 };
    }

    static eyeGeometry(cx, openness, expression = "neutral", side = -1) {
      const styles = {
        neutral: { open: 1, cheek: 0, slant: 0 },
        flat: { open: .8, cheek: 0, slant: .65 },
        sad: { open: .94, cheek: 0, slant: -1.1 },
        smile: { open: .98, cheek: 1.5, slant: 0 },
        surprised: { open: 1.12, cheek: 0, slant: 0 }
      };
      const style = styles[expression] || styles.neutral;
      const open = Math.max(.001, Math.min(1.12, openness * style.open));
      const visible = Math.min(1, open), cy = 233, rx = 16, ry = 14;
      // The upper lid rolls over a fixed, round eye. The lower lid rises only
      // at the end of a blink, rather than flattening the eye into a slit.
      const meeting = cy + 2;
      const top = cy - ry + (ry + 2) * (1 - visible) ** .65;
      const lowerLift = (1 - Math.min(1, visible / .18)) ** 1.5;
      const bottom = Math.max(top + .01, cy + ry - (ry - 2) * lowerLift - style.cheek * Math.min(1, visible / .18));
      const edgeFade = Math.min(1, visible / .18);
      const slope = style.slant * side * edgeFade;
      const bow = Math.sin(Math.PI * visible) * 2.1 * edgeFade;
      const upper = `M${cx - rx} ${top + slope} Q${cx} ${top - bow} ${cx + rx} ${top - slope}`;
      const path = `${upper}L${cx + rx} ${bottom}Q${cx} ${bottom - style.cheek * visible * .4} ${cx - rx} ${bottom}Z`;
      return { path, upper, open, top, bottom, meeting };
    }

    renderEyes() {
      const s = this.state;
      for (const [side, cx, direction] of [["left", 373, -1], ["right", 439, 1]]) {
        const eye = BearRenderer.eyeGeometry(cx, s.eye, this.faceMode, direction);
        this.nodes[`${side}-eye-opening`].setAttribute("d", eye.path);
        const opacity = Math.max(0, Math.min(1, (eye.open - .025) / .075));
        this.nodes[`${side}-eye`].setAttribute("opacity", opacity);
        this.nodes[`${side}-lid-shadow`].setAttribute("d", eye.upper);
        // Build the recess from the clipped aperture, then spread it onto the
        // adjoining fur. Masking after the spread would erase the lid crease.
        this.nodes[`${side}-socket-shadow`].setAttribute("opacity", opacity);
        // The fur-covered lid retains a cupped edge while it rolls down into
        // the socket; the glass and its contact crease render above this shade.
        this.nodes[`${side}-lid-volume`].setAttribute("opacity", Math.sin(Math.PI * Math.min(1, eye.open)) * .9 * opacity);
        // Only the iris turns: the sclera, socket rim and surrounding fur stay
        // fixed. A side glance exposes the cream crescent in the reference.
        const gazeX = Math.max(-4.5, Math.min(4.5, s.gazeX * .65));
        const gazeY = Math.max(-3, Math.min(3, s.gazeY * .43));
        this.nodes[`${side}-iris`].setAttribute("transform", `translate(${gazeX} ${gazeY}) translate(${cx} 233) scale(1.04) translate(${-cx} -233)`);
      }
    }

    constructor() {
      this.state = { ...home };
      this.faceMode = "neutral";
      this.assetsReady = window.BearArtwork.preloadCore();
      this.speed = 1;
      this.reduced = false;
      this.props = new Map();
      this.layout = BearRenderer.stageLayout();
      document.getElementById("stage").style.setProperty("--stage-offset", `${this.layout.offsetX / 480 * 100}%`);
      const leftEdge = BearRenderer.boxPoint(219, 353).x, rightEdge = BearRenderer.boxPoint(649, 353).x;
      document.querySelector("#opening-clip path").setAttribute("d", `M185 0H690V${this.layout.rimY - 36}H${rightEdge}V${this.layout.rimY}H${leftEdge}V${this.layout.rimY - 36}H185Z`);
      this.nodes = {};
      for (const id of ["lid-wood", "lid-texture", "lid-grain", "lid-inset", "lid-front-edge", "lid-right-edge", "lid-hinge-leaves", "bear-body", "bear-head", "left-ear", "right-ear", "left-eye", "right-eye", "mouth", "left-arm", "right-arm", "left-paw", "right-paw", "box-assembly", "head-accessory", "body-accessory", "held-props", "front-props", "lever", "lever-highlight", "lever-tip", "switch-light"]) this.nodes[id] = document.getElementById(id);
      for (const id of ["left-lid-hinge", "right-lid-hinge", "left-fixed-hinge", "right-fixed-hinge"]) this.nodes[id] = document.getElementById(id);
      for (const side of ["left", "right"]) for (const part of ["eye-opening", "iris", "lid-shadow", "lid-volume", "socket-shadow", "paw-shadow", "shoulder-root"]) this.nodes[`${side}-${part}`] = document.getElementById(`${side}-${part}`);
      for (const id of ["chin-cast-shadow", "belly-rim-shadow"]) this.nodes[id] = document.getElementById(id);
      this.makeBoxDetails();
      this.lidTexture = this.makeWoodSurface(this.nodes["lid-texture"]);
      this.makeWoodSurface(document.getElementById("rim-texture"))((u, v) => BearRenderer.projectBox(205 + u * 430, 353, v));
      this.makeWoodSurface(document.getElementById("side-texture"), true)((u, v) => BearRenderer.projectBox(635, 353 + v * 132, u));
      // A reaching hand passes over the ledge. A tucked hand belongs behind it.
      // Keep each paw, forearm and held prop together when changing depth.
      // Root artwork stays behind the torso. The exposed upper-arm segment
      // blends forward so a reach keeps a continuous shoulder-to-paw silhouette.
      this.insideHands = document.getElementById("arms");
      this.frontHands = document.createElementNS(NS, "g");
      this.frontHands.id = "reaching-hands";
      this.nodes["box-assembly"].insertBefore(this.frontHands, this.nodes["front-props"]);
      // The head can lean over either side of the opening. Keep it above the
      // side walls, with only the front rim hiding it as the bear descends.
      document.querySelector("#head-reveal path").setAttribute("d", `M185 0H690V${this.layout.rimY}H185Z`);
      const headLayer = document.createElementNS(NS, "g");
      headLayer.id = "exposed-head"; headLayer.setAttribute("clip-path", "url(#head-reveal)");
      headLayer.append(this.nodes["bear-head"]);
      const hardware = document.getElementById("switch-drawing");
      this.nodes["box-assembly"].insertBefore(headLayer, hardware);
      // "Inside" means behind the rim, not behind the face.
      for (const layer of [this.insideHands, this.nodes["held-props"]]) {
        layer.setAttribute("clip-path", "url(#opening-clip)");
        this.nodes["box-assembly"].insertBefore(layer, hardware);
      }
      this.backProps = document.createElementNS(NS, "g"); this.backProps.id = "back-props";
      this.nodes["bear-body"].before(this.backProps);
      this.backOutfit = document.createElementNS(NS, "g"); this.backOutfit.id = "back-outfit";
      document.getElementById("shoulders").before(this.backOutfit);
      this.armLayers = {};
      for (const [depth, parent] of [["inside", this.insideHands], ["front", this.frontHands]]) {
        const layer = this.armLayers[depth] = document.createElementNS(NS, "g");
        layer.id = `${depth}-sleeves`; parent.prepend(layer);
      }
      this.handGroups = {};
      this.armSurfaces = {};
      for (const side of ["left", "right"]) {
        const group = this.handGroups[side] = document.createElementNS(NS, "g");
        group.id = `${side}-hand`;
        group.append(this.nodes[`${side}-paw`]);
        this.armLayers.inside.append(this.nodes[`${side}-arm`]);
        this.insideHands.append(group);
        this.armSurfaces[side] = this.makeArmSurface(side);
      }
      this.switch(false);
      this.render();
    }

    render() {
      const s = this.state, n = this.nodes, originX = this.layout.offsetX, bearX = s.x + originX;
      const hands = {};
      const { point, frontLeft, frontRight, backRight, backLeft } = BearRenderer.lidGeometry(s.lid);
      const poly = BearRenderer.polygon;
      const lid = poly([frontLeft, frontRight, backRight, backLeft]);
      n["lid-wood"].setAttribute("d", lid);
      this.lidTexture(point);
      n["lid-front-edge"].setAttribute("d", poly([frontLeft, frontRight, point(1, 0, 3.2), point(0, 0, 3.2)]));
      n["lid-right-edge"].setAttribute("d", poly([backRight, frontRight, point(1, 0, 3.2), point(1, 1, 3.2)]));
      n["lid-grain"].setAttribute("d", lid);
      n["lid-inset"].setAttribute("d", poly([point(.012, .025), point(.988, .025), point(.988, .975), point(.012, .975)]));
      for (const [side, u] of [["left", .105], ["right", .84]]) {
        const p = point(u, .91), px = point(u + 1 / 410, .91), py = point(u, .91 + 1 / 143), hinge = point(u, 1);
        n[`${side}-lid-hinge`].setAttribute("transform", `matrix(${px.x - p.x} ${px.y - p.y} ${py.x - p.x} ${py.y - p.y} ${p.x} ${p.y})`);
        n[`${side}-fixed-hinge`].setAttribute("transform", `translate(${hinge.x} ${hinge.y}) scale(${hinge.scale})`);
      }
      n["bear-body"].setAttribute("transform", `translate(${bearX} ${s.rise})`);
      this.backOutfit.setAttribute("transform", `translate(${bearX} ${s.rise})`);
      n["bear-head"].setAttribute("transform", `translate(${bearX} ${s.rise}) rotate(${s.tilt} 407 255)`);
      n["left-ear"].setAttribute("transform", `rotate(${-s.ear} 350 213)`);
      n["right-ear"].setAttribute("transform", `rotate(${s.ear} 464 213)`);
      const tilt = s.tilt * Math.PI / 180;
      n["chin-cast-shadow"].setAttribute("transform", `translate(${-Math.sin(tilt) * 28} ${(Math.cos(tilt) - 1) * 8}) rotate(${s.tilt * .35} 409 307)`);
      // The opening shades the lower belly in box coordinates as the bear rises.
      n["belly-rim-shadow"].setAttribute("y", this.layout.rimY - 32 - s.rise);
      this.renderEyes();
      ["left", "right"].forEach((side, index) => {
        const layer = s[`${side}Inside`] ? this.insideHands : this.frontHands;
        const sleeves = this.armLayers[s[`${side}Inside`] ? "inside" : "front"];
        // Stable order: both sleeves, then both paws with their props.
        sleeves.append(n[`${side}-arm`]); layer.append(this.handGroups[side]);
        n[`${side}-arm`].setAttribute("clip-path", `url(#${side}-arm-emergence)`);
        const shoulder = BearRenderer.shoulderPosition(side);
        const shoulderX = shoulder.x + bearX, shoulderY = shoulder.y + s.rise;
        const hand = hands[side] = BearRenderer.armPose(shoulderX, shoulderY, s[index ? "rx" : "lx"] + bearX, s[index ? "ry" : "ly"] + s.rise, index ? 1 : -1, s[index ? "rr" : "lr"]);
        const { x: px, y: py } = hand;
        this.armSurfaces[side](shoulderX, shoulderY, hand, index ? 1 : -1);
        n[`${side}-shoulder-root`].setAttribute("transform", `translate(${shoulderX} ${shoulderY})`);
        n[`${side}-paw`].setAttribute("transform", `translate(${px} ${py}) rotate(${hand.wrist})`);
        n[`${side}-paw-shadow`].setAttribute("transform", `translate(${px - bearX + 3} ${py - s.rise + 5}) rotate(${hand.wrist})`);
      });
      n["box-assembly"].setAttribute("transform", `translate(${s.boxX} 0) rotate(${s.boxR} 435 485)`);
      const boxPose = `${s.boxX},${s.boxR}`;
      if (this.hitBoxPose !== boxPose) { this.hitBoxPose = boxPose; this.updateHitTarget(); }
      for (const p of this.props.values()) {
        const { x, y } = this.propPosition(p, hands);
        p.node.setAttribute("transform", `translate(${x} ${y}) rotate(${p.r}) scale(${p.s * p.sx} ${p.s})`);
        p.node.setAttribute("opacity", p.opacity);
      }
    }

    async tween(target, values, ms = 400, signal, easing = "smooth") {
      if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
      if (this.reduced) {
        // Keep each story beat, but remove travel, shaking, and bounce animations.
        Object.assign(target, values);
        this.render();
        await this.wait(Math.min(ms, 130), signal);
        return;
      }
      const start = Object.fromEntries(Object.keys(values).map(key => [key, target[key]]));
      const duration = Math.max(1, ms / this.speed);
      if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
      return new Promise((resolve, reject) => {
        let frame, began;
        const abort = () => { cancelAnimationFrame(frame); signal?.removeEventListener("abort", abort); reject(new DOMException("Cancelled", "AbortError")); };
        signal?.addEventListener("abort", abort, { once: true });
        const tick = time => {
          began ??= time;
          const t = Math.min(1, (time - began) / duration);
          const progress = BearRenderer.motionProgress(t, easing);
          for (const key of Object.keys(values)) target[key] = start[key] + (values[key] - start[key]) * progress;
          if (target === this.state && !("rise" in values)) {
            for (const prefix of ["l", "r"]) {
              const x = `${prefix}x`, y = `${prefix}y`, rotation = `${prefix}r`;
              if (x in values && y in values) {
                const distance = Math.hypot(values[x] - start[x], values[y] - start[y]);
                target[y] -= Math.min(10, distance * .09) * Math.sin(Math.PI * progress);
              }
              if (rotation in values) target[rotation] = start[rotation] + (values[rotation] - start[rotation]) * progress ** 1.18;
            }
          }
          this.render();
          if (t < 1) frame = requestAnimationFrame(tick);
          else { signal?.removeEventListener("abort", abort); resolve(); }
        };
        frame = requestAnimationFrame(tick);
      });
    }

    async retractHands(ms = 350, signal, easing = "smooth") {
      const pose = {};
      for (const [side, prefix, x] of [["left", "l", 376], ["right", "r", 438]]) {
        if (this.state[`${side}Inside`]) continue;
        pose[`${prefix}x`] = x - this.state.x;
        pose[`${prefix}y`] = 286 - this.state.rise;
        pose[`${prefix}r`] = 0;
      }
      if (Object.keys(pose).length) await this.tween(this.state, pose, ms, signal, easing);
      // Change layers only when the paws have cleared the ledge, avoiding a cut.
      this.state.leftInside = 1;
      this.state.rightInside = 1;
      this.render();
    }

    async move(values, ms = 400, signal, easing = "smooth") {
      const target = { ...values };
      const clearanceEasing = ["hesitant", "weary"].includes(easing) ? "gentle" : easing;
      const descending = target.rise > this.state.rise && target.rise >= 55;
      if (descending) await this.retractHands(Math.min(350, ms * .65), signal, clearanceEasing);
      for (const [side, prefix] of [["left", "l"], ["right", "r"]]) {
        const depth = `${side}Inside`;
        const movingHand = [`${prefix}x`, `${prefix}y`, `${prefix}r`].some(key => key in target);
        const goingInside = target[depth] === 1 || (target[depth] === undefined && movingHand && (target[`${prefix}y`] ?? this.state[`${prefix}y`]) + this.state.rise > 353);
        if (goingInside && !this.state[depth]) {
          await this.tween(this.state, { [`${prefix}x`]: (side === "left" ? 376 : 438) - this.state.x, [`${prefix}y`]: 286 - this.state.rise, [`${prefix}r`]: 0 }, Math.min(350, ms), signal, clearanceEasing);
          this.state[depth] = 1;
        }
        if (target[depth] !== undefined || goingInside) {
          this.state[depth] = goingInside ? 1 : 0;
          delete target[depth];
        } else if (!descending && [`${prefix}x`, `${prefix}y`, `${prefix}r`].some(key => key in target)) {
          if (this.state[depth] && this.state[`${prefix}y`] + this.state.rise > 300) {
            // Emerge through the opening before reaching forward over the ledge.
            await this.tween(this.state, { [`${prefix}y`]: 286 - this.state.rise }, Math.min(250, ms * .65), signal, clearanceEasing);
          }
          this.state[depth] = 0;
        }
      }
      return this.tween(this.state, target, ms, signal, easing);
    }
    wait(ms, signal) {
      return new Promise((resolve, reject) => {
        if (signal?.aborted) { reject(new DOMException("Cancelled", "AbortError")); return; }
        const done = () => { signal?.removeEventListener("abort", abort); resolve(); };
        const timer = setTimeout(done, (this.reduced ? Math.min(ms, 160) : ms) / this.speed);
        const abort = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); reject(new DOMException("Cancelled", "AbortError")); };
        signal?.addEventListener("abort", abort, { once: true });
      });
    }

    prop(id, type, options = {}) {
      this.removeProp(id);
      if (!art[type]) throw new Error(`Unknown prop: ${type}`);
      const node = document.createElementNS(NS, "g");
      node.innerHTML = art[type];
      node.dataset.prop = id;
      node.setAttribute("filter", "url(#prop-shadow)");
      const p = { id, type, node, anchor: "left", x: 0, y: -17, r: 0, s: 1, sx: 1, opacity: 1, keep: false, ...options };
      this.propLayer(p).append(node);
      this.props.set(id, p);
      this.render();
      return p;
    }

    moveProp(id, values, ms, signal, easing = "smooth") {
      const prop = this.props.get(id);
      if (!prop) throw new Error(`Missing prop: ${id}`);
      return this.tween(prop, values, ms, signal, easing);
    }
    propLayer(p) {
      return p.anchor === "world" ? this.nodes["front-props"] : p.anchor === "inside" ? (p.depth === "back" ? this.backProps : this.nodes["held-props"]) : this.handGroups[p.anchor];
    }
    handPosition(side) {
      const s = this.state, prefix = side === "left" ? "l" : "r", shoulder = BearRenderer.shoulderPosition(side);
      const x = s.x + this.layout.offsetX;
      return BearRenderer.armPose(shoulder.x + x, shoulder.y + s.rise, s[prefix + "x"] + x, s[prefix + "y"] + s.rise, side === "left" ? -1 : 1);
    }
    propPosition(p, hands) {
      if (p.anchor === "world") return { x: p.x, y: p.y > 353 ? BearRenderer.boxPoint(p.x, p.y).y : p.y };
      if (p.anchor === "inside") return { x: p.x + this.layout.offsetX, y: p.y };
      const hand = hands?.[p.anchor] || this.handPosition(p.anchor);
      return { x: p.x + hand.x, y: p.y + hand.y };
    }
    anchorProp(id, anchor) {
      const p = this.props.get(id);
      if (!p) throw new Error(`Missing prop: ${id}`);
      const point = this.propPosition(p);
      // Preserve the visible point, including the box-front Y projection,
      // before converting to the destination coordinate system.
      if (anchor === "world") { p.x = point.x; p.y = point.y > 353 ? 353 + (point.y - 353) / .58 : point.y; }
      else if (anchor === "inside") { p.x = point.x - this.layout.offsetX; p.y = point.y; }
      else { const hand = this.handPosition(anchor); p.x = point.x - hand.x; p.y = point.y - hand.y; }
      p.anchor = anchor; this.propLayer(p).append(p.node); this.render();
    }
    replaceProp(id, type) {
      const p = this.props.get(id);
      if (!p || !art[type]) throw new Error(`Cannot replace ${id} with ${type}`);
      p.node.innerHTML = art[type]; p.type = type; this.render();
    }
    removeProp(id) { this.props.get(id)?.node.remove(); this.props.delete(id); }
    clearProps(keep = false) { for (const [id, p] of this.props) if (!keep || !p.keep) this.removeProp(id); }
    wear(type = "") { this.nodes["head-accessory"].innerHTML = headwear[type] || ""; }
    outfit(type = "") {
      this.nodes["body-accessory"].innerHTML = type === "cape" ? "" : outfits[type] || "";
      this.backOutfit.innerHTML = type === "cape" ? outfits.cape : "";
    }
    expression(type = "neutral") {
      this.faceMode = type;
      const mouths = {
        neutral: "M407 264v7m0 0q-7 7-13 0m13 0q7 7 13 0",
        flat: "M407 264v8m-10 4h20",
        sad: "M407 264v7m-11 9q11-9 22 0",
        surprised: "M407 264v5m-5 7a5 7 0 1 0 10 0a5 7 0 1 0-10 0",
        smile: "M407 264v5m-13 2q13 16 26 0"
      };
      this.nodes.mouth.setAttribute("d", mouths[type] || mouths.neutral);
      this.renderEyes();
    }
    switch(on) {
      // The toggle moves fore/aft on the collar's centreline. Its projected
      // length changes with the throw; the stem never slides across the socket.
      const { mount, tip, pivot } = BearRenderer.hardwareGeometry(on);
      const y = tip.y - mount.y, root = pivot.y - mount.y;
      this.nodes.lever.setAttribute("d", `M0 ${root}L0 ${y}`);
      this.nodes["lever-highlight"].setAttribute("d", `M-.8 ${root - .7}L-.8 ${y + .8}`);
      this.nodes["lever-tip"].setAttribute("cx", 0);
      this.nodes["lever-tip"].setAttribute("cy", y);
      this.nodes["lever-tip"].setAttribute("ry", on ? "1.25" : "1.65");
      this.nodes["switch-light"].setAttribute("fill", on ? "url(#led-on)" : "url(#led-off)");
      document.getElementById("switch-light-spill").setAttribute("opacity", on ? "1" : "0");
      this.updateHitTarget();
    }
    reset() { Object.assign(this.state, home); this.wear(); this.outfit(); this.expression(); this.clearProps(); this.switch(false); this.render(); }
  }
  window.BearRenderer = BearRenderer;
})();
