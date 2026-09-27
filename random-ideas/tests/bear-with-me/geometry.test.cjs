const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../../projects/bear-with-me/renderer.js"), "utf8"), sandbox);
const Renderer = sandbox.window.BearRenderer;

test("closed lid covers every opening corner with a seating margin, without touching the switch", () => {
  const lid = Renderer.lidGeometry(0);
  const opening = [[219, .28], [621, .28], [621, .90], [219, .90]];
  for (const [worldX, worldDepth] of opening) {
    const { x, y } = Renderer.projectBox(worldX, 353, worldDepth);
    const depth = (y - lid.backLeft.y) / (lid.frontLeft.y - lid.backLeft.y);
    assert.ok(depth > 0 && depth < 1, "opening must sit beneath the lid");
    const left = lid.backLeft.x + (lid.frontLeft.x - lid.backLeft.x) * depth;
    const right = lid.backRight.x + (lid.frontRight.x - lid.backRight.x) * depth;
    assert.ok(x - left >= 3, "left edge must overlap the opening");
    assert.ok(right - x >= 3, "right edge must overlap the opening");
  }
  const seated = lid.point(0, 0, 3.2);
  assert.ok(Renderer.boxPoint(seated.x, seated.y).y < 343, "lid thickness must clear the mounting washer");
});

test("box depth converges and the lid rotates around fixed hinges", () => {
  const frontWidth = Renderer.projectBox(635, 353, 0).x - Renderer.projectBox(205, 353, 0).x;
  const rearWidth = Renderer.projectBox(635, 353, 1).x - Renderer.projectBox(205, 353, 1).x;
  assert.ok(rearWidth < frontWidth * .9, "rear edge must appear shorter than the front");
  const closed = Renderer.lidGeometry(0);
  for (let open = 0; open <= 1.1; open += .025) {
    const lid = Renderer.lidGeometry(open);
    assert.deepEqual(lid.backLeft, closed.backLeft);
    assert.deepEqual(lid.backRight, closed.backRight);
    assert.ok(Number.isFinite(lid.frontLeft.x) && Number.isFinite(lid.frontLeft.y));
    assert.ok(lid.frontRight.x > lid.frontLeft.x);
  }
});

test("compact hardware sits on the ledge with room for the closing lid and the indicator inset", () => {
  const { mount, washer, indicator, tip, contact } = Renderer.hardwareGeometry();
  const frontLeft = Renderer.boxPoint(205, 353), frontRight = Renderer.boxPoint(635, 353);
  assert.equal(mount.x, (frontLeft.x + frontRight.x) / 2, "toggle belongs at front centre");
  assert.ok(washer.rx * 2 / (frontRight.x - frontLeft.x) < .075, "base should match the compact v7 proportions");
  assert.ok(indicator.x - mount.x > 5 * washer.rx, "lamp needs clear space from the toggle");
  assert.ok(frontRight.y - indicator.y - indicator.ry >= 4, "lamp must be inset from the bevel");
  assert.ok(frontRight.y - mount.y - washer.ry >= 1, "washer must sit fully on the ledge");
  for (let open = 0; open <= 1.1; open += .025) {
    const lid = Renderer.lidGeometry(open), lowerEdge = lid.point(1, 0, 3.2);
    const edgeY = Renderer.boxPoint(lowerEdge.x, lowerEdge.y).y;
    assert.ok(edgeY < indicator.y - indicator.ry, "lid must not sweep through the indicator bezel");
    assert.ok(edgeY < mount.y - washer.ry, "lid must clear the toggle mounting");
  }
  for (const on of [false, true]) {
    const hardware = Renderer.hardwareGeometry(on);
    assert.equal(hardware.tip.x, hardware.pivot.x, "stem stays centred throughout its throw");
    assert.ok(hardware.tip.y < hardware.pivot.y);
  }
  // The teddy's pad reaches the new stem rather than the former tall toggle.
  const shoulder = Renderer.shoulderPosition("right"), offset = Renderer.stageLayout().offsetX;
  const hand = Renderer.armPose(shoulder.x + offset, shoulder.y, contact.x, contact.y, 1, 30);
  assert.equal(hand.x, contact.x); assert.equal(hand.y, contact.y);
  assert.ok(Math.hypot(tip.x - hand.x, tip.y - hand.y) < 18);
});

test("the inlay is a connected asanoha lattice without loose ends inside the front panel", () => {
  const degrees = new Map();
  for (const match of Renderer.asanohaInlay().matchAll(/M([\d.-]+) ([\d.-]+)L([\d.-]+) ([\d.-]+)/g)) {
    for (const key of [`${match[1]} ${match[2]}`, `${match[3]} ${match[4]}`]) degrees.set(key, (degrees.get(key) || 0) + 1);
  }
  const interior = [...degrees].filter(([key]) => {
    const [x, y] = key.split(' ').map(Number);
    return x > 227 && x < 613 && y > 368 && y < 470;
  });
  assert.ok(interior.length > 30, 'the panel needs the fine repeat seen in v7');
  for (const [key, degree] of interior) assert.ok(degree === 3 || degree === 12, `disconnected inlay at ${key}: ${degree} lines`);
});

test("the bear sits centrally in a deep opening and gestures have a limited reach and wrist turn", () => {
  const front = Renderer.projectBox(420, 353, .28), back = Renderer.projectBox(420, 353, .9);
  const frontEdge = Renderer.boxPoint(front.x, front.y), rearEdge = Renderer.boxPoint(back.x, back.y);
  assert.ok(frontEdge.y - rearEdge.y > 30, "the opening needs visible depth around the bear");
  assert.ok(Math.abs(Renderer.stageLayout().offsetX + 407 - (frontEdge.x + rearEdge.x) / 2) < 1e-8);
  for (const side of [-1, 1]) {
    for (let degrees = 0; degrees < 360; degrees += 3) {
      const angle = degrees * Math.PI / 180;
      const hand = Renderer.armPose(407, 294, 407 + 180 * Math.cos(angle), 294 + 180 * Math.sin(angle), side, degrees - 180);
      assert.ok(Math.hypot(hand.x - 407, hand.y - 294) <= 114.001);
      assert.ok(Math.abs(hand.wrist) <= 45);
    }
  }
  const shoulder = Renderer.shoulderPosition("right");
  const hand = Renderer.armPose(shoulder.x + Renderer.stageLayout().offsetX, shoulder.y, 409, 325, 1, 30);
  assert.equal(hand.x, 409, "the limited arm must still reach the centred switch");
  assert.equal(hand.y, 325);
});

test("elbows fold outward for raised paws and stay continuous through changes of direction", () => {
  const sr = Renderer.shoulderPosition("right"), sl = Renderer.shoulderPosition("left");
  const right = Renderer.elbowPosition(sr.x, sr.y, sr.x + 30, sr.y - 45, 1);
  const left = Renderer.elbowPosition(sl.x, sl.y, sl.x - 30, sl.y - 45, -1);
  assert.ok(right.x > sr.x && left.x < sl.x);
  assert.ok(right.y > sr.y - 45 && left.y > sl.y - 45, "elbows support raised paws from below");
  assert.ok(Math.abs(right.x + left.x - 814) < 1e-10, "left and right bends should mirror");
  for (const side of [-1, 1]) {
    let previous;
    for (let angle = 0; angle <= 360; angle++) {
      const radians = angle * Math.PI / 180;
      const elbow = Renderer.elbowPosition(407, 294, 407 + 60 * Math.cos(radians), 294 + 60 * Math.sin(radians), side);
      assert.ok(Number.isFinite(elbow.x) && Number.isFinite(elbow.y));
      if (previous) assert.ok(Math.hypot(elbow.x - previous.x, elbow.y - previous.y) < 2, "elbow must not flip as the paw changes direction");
      previous = elbow;
    }
  }
});

test("crossing the shoulder keeps the elbow folded instead of collapsing or orbiting", () => {
  for (const side of [-1, 1]) {
    let previous;
    for (let i = 0; i <= 240; i++) {
      const angle = i * Math.PI / 120;
      const hand = Renderer.armPose(407, 311, 407 + .5 * Math.cos(angle), 311 + .5 * Math.sin(angle), side);
      assert.ok((hand.elbow.x - 407) * side > 15, "the elbow must remain on its own side of the body");
      assert.ok(hand.elbow.y > 331, "a tucked paw must retain the hanging upper arm");
      if (previous) {
        assert.ok(Math.hypot(hand.elbow.x - previous.elbow.x, hand.elbow.y - previous.elbow.y) < .1);
        assert.ok(Math.abs(hand.wrist - previous.wrist) < .1);
      }
      previous = hand;
    }
  }
});

test("wrist roll has no angle-wrap jump as the forearm passes below the elbow", () => {
  for (const side of [-1, 1]) {
    let previous;
    for (let degrees = 0; degrees <= 360; degrees += .5) {
      const a = degrees * Math.PI / 180;
      const hand = Renderer.armPose(407, 311, 407 + 85 * Math.cos(a), 311 + 85 * Math.sin(a), side);
      if (previous) assert.ok(Math.abs(hand.wrist - previous.wrist) < 1, "a small paw movement must not unwind the wrist");
      previous = hand;
    }
  }
});

test("the deforming arm stays attached, finite and mirrored in folded and extended poses", () => {
  for (const [dx, dy] of [[0, 0], [2, 3], [-70, 26], [36, -71], [-49, -23], [0, 110], [110, 0]]) {
    const hands = [-1, 1].map(side => Renderer.armPose(407, 311, 407 + dx * side, 311 + dy, side));
    const surfaces = hands.map((hand, i) => Renderer.armSurface(407, 311, hand, i ? 1 : -1));
    for (const [i, surface] of surfaces.entries()) {
      assert.equal(surface[0].x, 407); assert.equal(surface[0].y, 311);
      assert.equal(surface.at(-1).x, hands[i].x); assert.equal(surface.at(-1).y, hands[i].y);
      for (const p of surface) {
        for (const edge of [p.top, p.bottom]) {
          assert.ok(Number.isFinite(edge.x) && Number.isFinite(edge.y));
          assert.ok(Math.hypot(edge.x - p.x, edge.y - p.y) <= 24, "folding must not inflate or tear the sleeve");
        }
      }
    }
    for (let i = 0; i < surfaces[0].length; i++) {
      assert.ok(Math.abs(surfaces[0][i].x + surfaces[1][i].x - 814) < 1e-8);
      assert.ok(Math.abs(surfaces[0][i].y - surfaces[1][i].y) < 1e-8);
    }
  }
});

test("eyelids close fully and expression shapes remain valid across all scene eye poses", () => {
  for (const expression of ["neutral", "flat", "sad", "smile", "surprised"]) {
    let previousHeight = 0;
    for (let open = 0; open <= 1.25; open += .025) {
      const eye = Renderer.eyeGeometry(373, open, expression, -1);
      assert.ok(!/NaN|Infinity/.test(eye.path));
      assert.ok(eye.bottom > eye.top);
      const height = eye.bottom - eye.top;
      assert.ok(height >= previousHeight - 1e-8, "lids must open continuously");
      previousHeight = height;
    }
    const shut = Renderer.eyeGeometry(373, 0, expression);
    assert.ok(shut.bottom - shut.top < 1, "blink must conceal the glass eye");
  }
  assert.ok(Renderer.eyeGeometry(373, 1, "flat").open < Renderer.eyeGeometry(373, 1, "neutral").open);
  assert.ok(Renderer.eyeGeometry(373, 1, "surprised").open > Renderer.eyeGeometry(373, 1, "neutral").open);
});

test("half-open eyes keep their lower socket while the upper lid descends", () => {
  const open = Renderer.eyeGeometry(373, 1);
  const half = Renderer.eyeGeometry(373, .5);
  const quarter = Renderer.eyeGeometry(373, .25);
  assert.equal(half.bottom, open.bottom, "a half blink must not lift the lower eye into a slit");
  assert.equal(quarter.bottom, open.bottom, "the lower lid waits until the end of a blink");
  assert.ok(half.top > open.top && quarter.top > half.top);
  assert.ok(half.top < 233, "the half-open eye should retain its round lower hemisphere");
  const shut = Renderer.eyeGeometry(373, 0);
  assert.ok(shut.bottom - shut.top < .2);
});
