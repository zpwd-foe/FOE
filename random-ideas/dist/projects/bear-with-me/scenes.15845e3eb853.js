/* Each scene is a distinct performance. The director supplies movement, props,
   interaction and timing; emotional labels stay out of the visitor's interface. */
((root) => {
  "use strict";
  const scenes = [];
  // Load only the props used by the selected performance. Scene tests verify coverage.
  const sceneAssets = {
    1: ['nightcap'], 7: ['book'], 8: ['blanket'], 15: ['cloth'],
    21: ['cookie'], 22: ['flower'], 23: ['glasses', 'clipboard', 'ruler', 'stamp', 'denied'],
    24: ['sign'], 25: ['stool'], 26: ['headband', 'stopwatch'], 28: ['sparkle'],
    29: ['curtain', 'cover'], 32: ['screen'], 34: ['periscope', 'disguise'],
    36: ['blocks'], 37: ['rope'], 38: ['hat', 'cookie', 'spoon'], 40: ['flag'],
    42: ['album-back', 'album'], 43: ['cape'], 45: ['chair'], 46: ['cushion'],
    48: ['heart'], 50: ['retired']
  };
  // IDs stay fixed when a performance is removed, preserving saved discoveries.
  const scene = (id, emotion, caption, description, play) => scenes.push({ id, emotion, caption, description, play, assets: sceneAssets[id] || [] });

  scene(1, "Sleepiness", "This could have waited.", "A sleepy bear misses the switch, then finds it.", async c => {
    c.motion = "heavy";
    c.closeSpeed = 700;
    c.wear("nightcap"); await c.open(.85, 27, 700);
    await c.atSwitch({ eye: .25, tilt: -12, rx: 468, ry: 300 }, 550);
    await c.wait(350); await c.move({ eye: .65, gazeY: 7, tilt: -4 }, 350); await c.off({ ms: 800 });
    await c.move({ tilt: 14, eye: .05, ear: 12 }, 330);
  });
  scene(2, "Shyness", "You have been acknowledged. Briefly.", "The bear peeks over the rim and reaches while hiding its face.", async c => {
    c.motion = "gentle";
    await c.open(.4, 90, 620); await c.move({ eye: .75, gazeY: 6 }, 220); await c.wait(350);
    await c.move({ x: -28, tilt: -9, gazeX: 6 }, 320);
    await c.move({ rise: 50, lid: .7, lx: 386, ly: 225 }, 450);
    await c.off({ ms: 650, motion: "hesitant" });
  });
  scene(3, "Curiosity", "The investigation has produced a click.", "The bear inspects the switch, pokes it, and startles itself.", async c => {
    await c.open(); await c.move({ tilt: 14, gazeX: 2, gazeY: 7, x: -12 }, 350);
    await c.move({ tilt: -13, x: 14 }, 350); await c.wait(250);
    await c.off({ ms: 250, stay: true, motion: "snap" }); c.face("surprised");
    await c.move({ x: -10, rise: 7, rx: 443, ry: 280, tilt: -8, ear: 14 }, 180, "snap");
    await c.wait(500);
  });
  scene(5, "Confusion", "Apparently this is what paws are for.", "The bear examines its paw from two angles, then discovers a use for it.", async c => {
    await c.open(); await c.move({ rx: 467, ry: 251, rr: -24, gazeX: 6, tilt: 12 }, 350);
    await c.move({ rx: 446, ry: 242, rr: 24, tilt: -10 }, 500); await c.wait(300);
    await c.off(); await c.move({ rx: 457, ry: 243, rr: -25, gazeX: 6 }, 350);
  });
  scene(6, "Politeness", "Thank you for your entirely unnecessary request.", "The bear waves, gently switches off, and gives a small bow.", async c => {
    c.motion = "gentle";
    await c.open(); c.face("smile");
    await c.move({ lx: 329, ly: 216, lr: -25 }, 300);
    await c.repeat(2, async () => { await c.move({ lx: 340, ly: 212, lr: 14 }, 250); await c.move({ lx: 328, ly: 220, lr: -14 }, 250); });
    await c.move({ lx: 366, ly: 293, lr: 0 }, 350);
    await c.off({ ms: 500 }); await c.move({ rise: 20, tilt: 6, eye: .25 }, 350);
  });
  scene(7, "Distraction", "You interrupted a particularly uneventful chapter.", "The bear keeps reading while its free paw misses the switch twice.", async c => {
    c.prop("reading", "book", { anchor: "left", x: 10, y: -5, s: .8 });
    await c.open(); await c.move({ lx: 376, ly: 270, gazeY: 7, eye: .65, tilt: -5 }, 350);
    await c.atSwitch({ rx: 481, ry: 338 }, 350); await c.atSwitch({ rx: 451, ry: 340 }, 300);
    await c.move({ gazeX: 2, gazeY: 7, tilt: 2, eye: .9 }, 260); await c.beat(250);
    await c.off({ ms: 400 }); await c.move({ tilt: -6, gazeX: -5, gazeY: 7, eye: .65 }, 350);
    c.sound("paper", .5); await c.wait(350);
  });
  scene(8, "Comfort-seeking", "One paw has been exposed to the elements.", "Wrapped in a blanket, the bear reluctantly uncovers one paw.", async c => {
    c.motion = "heavy";
    c.closeSpeed = 650;
    c.outfit("blanket"); await c.open(.8, 20, 650);
    await c.move({ lx: 399, ly: 294, rx: 415, ry: 292, eye: .5, tilt: -8 }, 350);
    await c.wait(650); await c.move({ rx: 447, ry: 281, eye: .65 }, 450); c.sound("cloth");
    await c.beat(300); await c.off({ ms: 650 });
    await c.move({ rx: 403, ry: 291, lx: 416, ly: 290, eye: .15 }, 300);
  });
  scene(9, "Reluctance", "The task was eventually assigned to the only available bear.", "The bear rests on the rim, then reaches very slowly.", async c => {
    c.motion = "heavy";
    c.closeSpeed = 750;
    await c.open(.7, 34, 550); c.face("flat");
    await c.move({ eye: .55, lx: 382, ly: 265, rx: 441, ry: 265, tilt: -4 }, 400);
    await c.wait(800); await c.move({ rise: 27, eye: .8, gazeY: 7 }, 500);
    await c.off({ ms: 1050, motion: "hesitant" }); await c.move({ rise: 36, eye: .45 }, 450);
  });
  scene(10, "Mild irritation", "An opinion is forming.", "The bear grips the rim, stares at the visitor, and presses deliberately.", async c => {
    await c.open(); c.face("flat");
    await c.move({ lx: 331, ly: 313, rx: 485, ry: 313, eye: .7 }, 300);
    await c.wait(650); await c.move({ gazeY: 7, tilt: 0 }, 240);
    await c.off({ ms: 550, hold: 350 }); await c.move({ gazeY: 0, eye: .6 }, 250); await c.wait(350);
  });
  scene(11, "Suspicion", "Both exits have been checked. You are still here.", "The bear peeks from either side while watching the visitor.", async c => {
    await c.open(.5, 67); await c.move({ x: -55, gazeX: -7, tilt: -12 }, 350);
    await c.move({ rise: 260 }, 400); await c.move({ x: 58, gazeX: 7 }, 350);
    await c.move({ rise: 48, lid: .8, tilt: 12 }, 350); await c.wait(300);
    await c.move({ x: 0, gazeX: 0, tilt: 0, rise: 0, lid: 1 }, 350); await c.off();
  });
  scene(12, "Disbelief", "Yes. It was on. Again.", "The bear switches off, disappears, and comes back to inspect its work.", async c => {
    await c.open(); await c.off(); await c.move({ rise: 260 }, 450); await c.move({ lid: .04 }, 320);
    await c.wait(350); await c.move({ lid: 1 }, 330); await c.move({ rise: 8, tilt: 15, gazeY: 7 }, 500);
    await c.move({ x: 0, tilt: 12, rise: 35, gazeY: 7 }, 400); await c.wait(450);
  });
  scene(13, "Annoyance", "Three seating arrangements. None solved the problem.", "The bear tries several comfortable poses before dealing with the switch.", async c => {
    await c.open(); c.face("flat");
    await c.move({ x: -18, tilt: -12, lx: 379, ly: 270 }, 330); await c.wait(230);
    await c.move({ x: 20, tilt: 12, lx: 361, ly: 313, rx: 439, ry: 275 }, 400); await c.wait(230);
    await c.move({ x: 0, tilt: 0, rise: 27, eye: .5, rx: 449, ry: 294 }, 350); await c.off();
  });
  scene(14, "Accusation", "The evidence points in your general direction.", "The bear points at the switch, points at you, and folds its arms.", async c => {
    await c.open(); await c.atSwitch({ rx: 437, ry: c.toggle.y - 17, rr: 18, gazeX: 2, gazeY: 7 }, 450); await c.wait(300);
    await c.move({ rx: 414, ry: 258, rr: 0, gazeX: 0, gazeY: 0}, 350);
    await c.wait(500); await c.move({ lx: 433, ly: 291, rx: 379, ry: 302 }, 350);
    await c.off({ ms: 450 });
  });
  scene(15, "Passive aggression", "The switch has been cleaned of your involvement.", "The bear wipes the switch after using it, then closes the lid precisely.", async c => {
    c.prop("cloth", "cloth", { anchor: "right", s: .8 }); await c.open();
    await c.off({ ms: 900, stay: true, motion: "gentle" });
    await c.repeat(3, async () => { await c.atSwitch({ rx: 427, ry: c.toggle.y + 21, rr: 8 }, 230); await c.atSwitch({ rx: 398, ry: c.toggle.y + 20, rr: -8 }, 230); });
    await c.move({ rx: 451, ry: 285, gazeY: 7 }, 400); await c.wait(300); await c.stow("cloth", "right"); c.closeSpeed = 240;
  });
  scene(16, "Contempt", "Minimal contact. Maximum opinion.", "The bear leans away and reaches using the very edge of a paw.", async c => {
    await c.open(); c.face("flat"); await c.move({ x: -36, tilt: -16, eye: .5}, 400);
    await c.off({ ms: 800, roll: 42, motion: "gentle" });
    await c.move({ rx: 442, ry: 270, rr: 28 }, 300); await c.wait(300);
  });
  scene(17, "Exasperation", "A brief consultation with both paws.", "The bear rubs its face, flattens an ear, and straightens it again.", async c => {
    await c.open(); await c.move({ lx: 373, ly: 236, rx: 438, ry: 236, eye: .08 }, 300);
    await c.repeat(2, async () => { await c.move({ ly: 248, ry: 248, tilt: -5 }, 180); await c.move({ ly: 232, ry: 232, tilt: 5 }, 180); });
    await c.move({ lx: 344, ly: 192, ear: 17, rx: 451, ry: 314 }, 250);
    await c.move({ ear: 0, lx: 366, ly: 313, eye: .65, tilt: 0 }, 350); await c.off();
  });
  scene(18, "Defiance", "The switch is under new management.", "The bear switches off and keeps a protective paw over it.", async c => {
    await c.open(); await c.off({ stay: true });
    await c.atSwitch({ x: 0, rise: 20, tilt: 9, rx: 409, ry: c.toggle.y - 11, lx: 449, ly: 310 }, 400);
    await c.wait(1000); await c.move({ gazeX: -6 }, 250); await c.beat(250);
    await c.move({ gazeX: 0, tilt: 0, rx: 451, ry: 294 }, 550);
  });
  scene(20, "Outrage", "Dignity is not included with this model.", "The bear climbs up, gets stuck on the rim, and wriggles free.", async c => {
    c.motion = "snap";
    await c.open(1, -37, 230); c.face("surprised");
    await c.move({ lx: 318, ly: 352, rx: 479, ry: 352, tilt: 10, x: 15 }, 300);
    await c.repeat(2, async () => { await c.move({ x: 22, lx: 311, rx: 472, tilt: -7, boxR: .35 }, 280); await c.move({ x: 10, lx: 323, rx: 484, tilt: 9, boxR: -.35 }, 280); });
    await c.move({ rise: -10, x: 0, tilt: 0, boxR: 0, lx: 347, ly: 315, rx: 475, ry: 315 }, 450);
    await c.off(); await c.move({ x: 0, rise: 0, boxR: 0, tilt: 0 }, 300);
  });
  scene(21, "Bargaining", "Negotiations have failed. The cookie is staying.", "The bear offers a cookie in exchange for some peace.", async c => {
    c.prop("offer", "cookie", { anchor: "left", s: .7 }); await c.open();
    await c.move({ lx: 314, ly: 265, tilt: -10 }, 350);
    if (await c.offer("cookie")) {
      c.remove("offer");
      c.caption = "One cookie poorer. Still switching it off.";
      await c.move({ lx: 292, ly: 252 }, 250); await c.wait(230);
    }
    await c.move({ lx: 373, ly: 283, tilt: 5, gazeX: -5 }, 600); await c.wait(350); await c.off();
  });
  scene(22, "Appeasement", "A small diplomatic incident. With a flower.", "The bear offers a flower while quietly switching off with its other paw.", async c => {
    c.motion = "gentle";
    c.prop("flower", "flower", { anchor: "left", s: .75, y: -19 }); await c.open(); c.face("smile");
    await c.move({ lx: 310, ly: 250, tilt: -12 }, 400); await c.wait(500);
    await c.off({ ms: 900 }); await c.move({ eye: .45, rise: 12, tilt: -5 }, 350);
    await c.move({ lx: 369, ly: 276, gazeX: -4 }, 550);
  });
  scene(23, "Bureaucratic detachment", "Your request has been processed. Unfortunately.", "The bear measures, checks a clipboard, and stamps the request unnecessary.", async c => {
    c.wear("glasses"); c.prop("form", "clipboard", { anchor: "left", s: .75 }); await c.open();
    c.prop("measure", "ruler", { anchor: "right", s: .7 }); await c.atSwitch({ rx: 419, ry: c.toggle.y + 18, gazeX: 0, gazeY: 7 }, 400);
    await c.wait(400); await c.stow("measure", "right");
    await c.move({ rx: 441, ry: 366, rightInside: 1 }, 300); c.prop("stamp", "stamp", { anchor: "right", s: .65 });
    await c.move({ lx: 383, ly: 286, rx: 394, ry: 229, gazeY: 6 }, 350);
    await c.move({ ry: 267 }, 180, "commit"); c.sound("wood"); c.prop("denied", "denied", { anchor: "left", x: 0, y: -10, s: .55, r: -4 });
    await c.move({ ry: 233 }, 260); await c.wait(300); await c.stow("stamp", "right");
    await c.off(); await c.move({ lx: 391, ly: 280, tilt: 0 }, 350); await c.wait(400);
  });
  scene(24, "Authority", "The policy has been clearly displayed.", "The bear erects a do-not-disturb sign that tips over as it leaves.", async c => {
    c.prop("notice", "sign", { anchor: "left", s: .72, r: -6 }); await c.open();
    await c.place("notice", 349, 325);
    await c.move({ lx: 344, ly: 289, gazeX: -5}, 320);
    await c.wait(500); await c.off();
    await c.pmove("notice", { r: 80, y: 367 }, 550, "fall"); c.sound("wood", .5); await c.move({ tilt: -16, gazeY: 6 }, 250, "snap");
    await c.wait(350); await c.stow("notice");
  });
  scene(25, "Perfectionism", "A precision solution to an invented problem.", "The bear aligns a stool and its paws before making one calibrated press.", async c => {
    c.motion = "gentle";
    c.prop("stool", "stool", { anchor: "left", s: .6 }); await c.open();
    await c.place("stool", 347, 318);
    await c.atSwitch({ lx: 350, ly: 309, gazeX: -5, gazeY: 7 }, 350);
    await c.pmove("stool", { x: 350 }, 230); await c.beat(250); await c.pmove("stool", { x: 347 }, 230);
    await c.atSwitch({ lx: 347, ly: 308, rx: 446, ry: 287, rise: -12, tilt: 0 }, 400);
    await c.wait(400); await c.off({ ms: 850, hold: 180 });
    await c.move({ rise: 0 }, 350); await c.stow("stool");
  });
  scene(26, "Competitiveness", "A new personal best in accomplishing nothing.", "The bear warms up, switches off quickly, then checks its stopwatch.", async c => {
    c.exitMotion = "snap";
    c.closeSpeed = 280;
    c.wear("headband"); c.prop("watch", "stopwatch", { anchor: "left", s: .6 }); await c.open();
    await c.move({ rx: 478, ry: 231, lx: 372, ly: 272, gazeX: -4, gazeY: 7 }, 400); c.sound("tick");
    await c.beat(300);
    await c.repeat(2, async () => { await c.move({ rise: -7, rx: 476, ry: 252 }, 200); await c.move({ rise: 3, rx: 451, ry: 286 }, 200); });
    await c.beat(500); await c.off({ ms: 100, motion: "snap" }); await c.move({ lx: 391, ly: 268, gazeY: 6, tilt: -12 }, 300);
    c.sound("tick");
    await c.wait(450);
  });
  scene(27, "Pride", "Applause would be excessive. It is waiting anyway.", "The bear celebrates its ordinary achievement and waits for applause.", async c => {
    await c.open(); await c.off(); c.face("smile");
    await c.move({ lx: 334, ly: 200, rx: 480, ry: 200, lr: -18, rr: 18, rise: -12 }, 400);
    await c.wait(950); await c.move({ gazeX: -5 }, 300); await c.move({ gazeX: 5 }, 350);
    await c.move({ lx: 366, ly: 300, rx: 451, ry: 300, eye: .6, rise: 0, gazeX: 0 }, 800, "heavy");
  });
  scene(28, "Vanity", "The reflection has met expectations.", "The bear spots its reflection, tidies its face and straightens an ear.", async c => {
    await c.open(); await c.move({ x: 0, rise: 22, tilt: 14, gazeX: 0, gazeY: 7 }, 400);
    c.prop("glint", "sparkle", { anchor: "world", x: c.toggle.x, y: c.toggle.y - 3, s: .45 });
    await c.wait(300); await c.move({ lx: 367, ly: 243, rx: 450, ry: 243 }, 400);
    await c.move({ rx: 466, ry: 191, ear: -15, tilt: 6 }, 350);
    await c.move({ x: 0, ear: 0, lx: 366, ly: 292, rx: 451, ry: 292 }, 350);
    await c.move({ tilt: -8, gazeY: 7 }, 300); await c.wait(350); c.remove("glint"); await c.off();
  });
  scene(29, "Showmanship", "Behold. The other position.", "A curtain rises; the bear covers the switch and reveals it turned off.", async c => {
    c.prop("curtain", "curtain", { anchor: "left", s: .46 });
    c.prop("cover", "cover", { anchor: "right", s: .75 }); await c.open();
    // Keep the curtain supported by the left paw throughout the reveal.
    await c.atSwitch({ lx: 330, ly: 296 }, 450); await c.place("cover", c.toggle.x, c.toggle.y + 1);
    await c.move({ tilt: 10, eye: .4 }, 300); await c.wait(350);
    await c.off({ ms: 500 }); await c.stow("cover", "right");
    await c.move({ lx: 320, ly: 260, rx: 503, ry: 260, eye: 1, tilt: 0 }, 350, "snap");
    await c.wait(400); await c.stow("curtain");
  });
  scene(30, "Overconfidence", "The conventional approach has some merit.", "The bear tries to reach while looking away, misses, and reconsiders.", async c => {
    await c.open(); await c.move({ tilt: -30, gazeX: -7, x: -15, lx: 349, ly: 252 }, 350);
    await c.atSwitch({ rx: 475, ry: 329 }, 300); await c.atSwitch({ rx: 455, ry: 344 }, 250);
    await c.wait(400); await c.move({ x: 0, tilt: 0, gazeX: 0, gazeY: 7, rx: 451, ry: 285 }, 650);
    await c.beat(350); await c.off();
  });
  scene(31, "Avoidance", "Closing the lid did not resolve the situation.", "The bear attempts to leave, peeks back out, and reluctantly returns.", async c => {
    c.motion = "heavy";
    await c.open(.6, 35); await c.wait(400);
    await c.move({ rise: 260 }, 650); await c.move({ lid: .04 }, 420); await c.wait(500);
    await c.move({ lid: .35, rise: 82, tilt: 9, eye: .6 }, 420);
    await c.wait(400); await c.move({ lid: 1, rise: 0 }, 400); await c.off({ ms: 650 });
  });
  scene(32, "Denial", "For a moment, the paperwork matched reality.", "The bear hides the live switch behind a confidently labelled OFF sign.", async c => {
    c.prop("screen", "screen", { anchor: "left", s: .8 }); await c.open(); await c.place("screen", 420, 322);
    await c.move({ tilt: -6, eye: .3 }, 300); await c.wait(500);
    await c.move({ x: 30, tilt: -19, gazeX: -5, gazeY: 6, eye: 1 }, 350);
    await c.move({ x: 0, tilt: -7, gazeY: 7 }, 350); await c.stow("screen");
    await c.wait(400); await c.off();
  });
  scene(33, "Anxiety", "The rehearsal went well. Eventually.", "The bear makes three aborted approaches, breathes, then commits.", async c => {
    c.exitMotion = "snap";
    await c.open(); c.face("sad");
    await c.repeat(3, async i => { await c.atSwitch({ rx: 468 - i * 13, ry: c.toggle.y - 11, ear: 12 }, 450 + i * 110, "gentle"); await c.beat(240 + i * 160); await c.move({ rx: 453, ry: 286 }, 180, "snap"); });
    await c.move({ rise: -7, eye: .15 }, 650, "gentle"); await c.move({ rise: 2, eye: 1 }, 750, "gentle");
    await c.off({ ms: 140, motion: "snap" }); c.closeSpeed = 250;
  });
  scene(34, "Paranoia", "The disguise remains entirely convincing to the bear.", "A periscope checks the surroundings before a poorly disguised bear emerges.", async c => {
    c.motion = "gentle";
    c.prop("scope", "periscope", { anchor: "inside", x: 388, y: 410, s: .9 });
    // The lower shaft stays inside the opening throughout the inspection.
    await c.open(.35, 260); await c.pmove("scope", { y: 310 }, 600); await c.wait(300);
    await c.pmove("scope", { x: 430, r: 12 }, 550); await c.wait(300);
    await c.pmove("scope", { y: 440, r: 0 }, 450); c.remove("scope"); c.wear("disguise");
    await c.open(1, 0, 650); await c.move({ gazeX: 0, tilt: 6 }, 350); await c.off({ ms: 650 });
  });
  scene(35, "Indecision", "A consensus has been imposed.", "Both paws repeatedly volunteer until one pushes the other toward the switch.", async c => {
    await c.open(); await c.atSwitch({ lx: 420, ly: 292, tilt: -8, gazeX: -4 }, 350); await c.beat(300);
    await c.move({ lx: 366, ly: 313, rx: 465, ry: 310, tilt: 10 }, 300);
    await c.beat(300); await c.move({ rx: 450, ry: 288, tilt: -8, gazeX: 4 }, 300);
    await c.move({ lx: 412, ly: 315, rx: 446, ry: 310, tilt: 0 }, 350);
    await c.off({ ms: 850, motion: "hesitant" });
  });
  scene(36, "Resourcefulness", "The infrastructure was not strictly necessary.", "The bear constructs a small tower that collapses before it reaches normally.", async c => {
    c.prop("tower", "blocks", { anchor: "right", s: .65 }); await c.open(); await c.place("tower", 480, 318);
    await c.atSwitch({ rx: 479, ry: 295, tilt: 10, gazeX: 7 }, 350);
    await c.move({ rise: -22, x: 12 }, 400);
    await c.atSwitch({ lx: 455, ly: 320, rx: 480, ry: 320 }, 450); await c.wait(300);
    await c.pmove("tower", { r: 71, y: 365 }, 350, "fall"); c.sound("wood"); c.face("surprised");
    await c.move({ rise: 0, x: 0, rx: 451, ry: 286 }, 350); await c.wait(400); await c.stow("tower", "right"); await c.off();
  });
  scene(37, "Desperation", "The rope has secured one ear.", "The bear tries a lasso, catches its own ear, and abandons the plan.", async c => {
    await c.open(); c.prop("lasso", "rope", { anchor: "right", s: .7, y: -23 });
    await c.move({ rx: 484, ry: 198, rr: -24 }, 450);
    await c.move({ rx: 449, ry: 290, rr: 60 }, 300);
    await c.move({ rx: 469, ry: 183, rr: -25, ear: 30, tilt: -12 }, 350);
    await c.wait(500); await c.move({ lx: 413, ly: 249, rx: 467, ry: 206, ear: 8 }, 450);
    await c.move({ rx: 451, ry: 271, ear: 0, tilt: 0 }, 500); await c.stow("lasso", "right"); await c.off();
  });
  scene(38, "Panic", "An accidental success. Please do not encourage it.", "The bear loses a spoon and hat while saving a cookie, accidentally pressing off.", async c => {
    c.motion = "snap";
    c.closeSpeed = 220;
    c.wear("hat"); c.prop("snack", "cookie", { anchor: "left", s: .6 });
    c.prop("spoon", "spoon", { anchor: "right", s: .7 }); await c.open();
    await c.move({ rx: 474, ry: 250, lx: 380, ly: 274, tilt: 12 }, 400);
    await c.drop("spoon", { x: 520, y: 462, r: 105 }, 320);
    c.wear(); c.prop("hat", "hat", { anchor: "inside", x: 407, y: 169, s: 1.6, r: 12 });
    c.sound("metal");
    await c.move({ rx: 521, ry: 275, tilt: 17, eye: 1, lx: 394, ly: 266 }, 220);
    await c.drop("hat", { x: 325, y: 347, r: -40 }, 360);
    await c.off({ ms: 120, stay: true }); c.face("surprised"); await c.wait(800);
    await c.pmove("spoon", { opacity: 0 }, 250); await c.pmove("hat", { opacity: 0 }, 250);
  });
  scene(39, "Exhaustion", "One paw is carrying the department.", "The bear slumps over the rim while a single paw slowly crawls to the switch.", async c => {
    c.motion = "heavy";
    c.closeSpeed = 800;
    await c.open(.8, 35, 800); c.face("flat");
    await c.move({ tilt: 27, eye: .3, lx: 364, ly: 265 }, 550);
    await c.atSwitch({ rx: 480, ry: 290 }, 700); await c.wait(500);
    await c.atSwitch({ rx: 465, ry: 279 }, 600, "weary"); await c.atSwitch({ rx: 452, ry: 290 }, 800, "weary"); await c.off({ ms: 900, motion: "weary" });
  });
  scene(40, "Defeat", "The surrender also required some assembly.", "The bear raises a white flag, then turns it sideways to fit through the lid.", async c => {
    c.motion = "heavy";
    c.prop("flag", "flag", { anchor: "left", s: .8, y: -12 }); await c.open(); c.face("sad");
    await c.move({ lx: 344, ly: 251, lr: -13, ear: 20 }, 400); await c.wait(650);
    await c.off(); await c.move({ rise: 60, lid: .6 }, 400); await c.wait(250);
    await c.move({ rise: 5, lid: .9, lx: 408, ly: 267, rx: 420, ry: 263 }, 350);
    await c.pmove("flag", { r: 85, y: 0 }, 650); c.sound("cloth"); await c.beat(300); await c.stow("flag");
  });
  scene(41, "Loneliness", "A small social interaction. Unexpectedly productive.", "The bear offers a paw; you can shake it before it switches off.", async c => {
    await c.open(); await c.move({ lx: 307, ly: 264, lr: -55, tilt: -10 }, 400);
    if (await c.offer("paw")) {
      c.face("smile"); await c.repeat(2, async () => { await c.move({ lx: 310, ly: 257, lr: -18 }, 240); await c.move({ lx: 307, ly: 268, lr: -12 }, 240); });
    } else {
      await c.move({ lx: 393, ly: 282, rx: 414, ry: 282, tilt: 8 }, 450);
      await c.move({ ly: 271, ry: 271 }, 170); await c.move({ ly: 285, ry: 285 }, 170);
    }
    await c.off({ ms: 550 });
  });
  scene(42, "Nostalgia", "A photograph from before all this.", "The bear studies a photograph of its peacefully closed box.", async c => {
    c.motion = "gentle";
    c.prop("album", "album-back", { anchor: "left", s: .8, x: 12 }); await c.open();
    await c.move({ lx: 377, ly: 274, gazeY: 7, tilt: -9 }, 350); await c.wait(650);
    await c.move({ lx: 365, ly: 260, gazeX: 0, gazeY: 0, tilt: 7 }, 400);
    await c.turn("album", "album"); await c.wait(600);
    await c.turn("album", "album-back"); await c.move({ lx: 374, ly: 280, tilt: -6 }, 350); await c.off({ ms: 650 });
  });
  scene(43, "Embarrassment", "The cape has been quietly discontinued.", "The bear tries a heroic pose, catches its cape, and removes it.", async c => {
    c.outfit("cape"); await c.open(1, -18, 300);
    await c.move({ lx: 336, ly: 257, rx: 481, ry: 198, tilt: -8 }, 350);
    await c.move({ lid: .65, x: 16, rise: 4, ear: 20 }, 250); await c.wait(350);
    await c.move({ x: -12, tilt: 11, lid: .9 }, 230); await c.move({ x: 13, tilt: -12 }, 230);
    await c.move({ x: 0, lx: 384, ly: 278, rx: 429, ry: 279, tilt: 0, lid: 1 }, 450);
    c.outfit(); c.prop("cape", "cape", { anchor: "left", s: .65 }); await c.stow("cape");
    await c.move({ eye: .6, gazeY: 7 }, 300); await c.off();
  });
  scene(44, "Existential doubt", "No conclusions have been reached.", "The bear considers the switch, its paws, the sky, and you.", async c => {
    c.motion = "heavy";
    await c.open(); await c.move({ gazeX: 2, gazeY: 7, tilt: 10 }, 350); await c.wait(300);
    await c.move({ lx: 375, ly: 267, rx: 441, ry: 267, lr: -12, rr: 12, gazeX: 0, gazeY: 7 }, 400);
    await c.move({ gazeY: -8, tilt: -8 }, 500); await c.wait(600);
    await c.move({ gazeY: 0, tilt: 0, eye: .7 }, 500); await c.wait(650); await c.off({ ms: 800 });
  });
  scene(45, "Resignation", "If this is a job, it might as well be a seated one.", "The bear brings a chair, sits to switch off, then packs it away.", async c => {
    c.motion = "heavy";
    c.prop("seat", "chair", { anchor: "left", s: .7, depth: "back" }); await c.open();
    await c.place("seat", 445, 327); c.anchor("seat", "inside");
    await c.atSwitch({ x: 38, rise: 15, lx: 347, ly: 299, tilt: 5 }, 600);
    await c.wait(500); await c.off({ ms: 650 });
    await c.move({ rise: -10, x: 0, lx: 466, ly: 288 }, 400);
    await c.stow("seat", "right");
  });
  scene(46, "Mindfulness", "The switch is temporary. Apparently you are not.", "The bear settles on a cushion, breathes slowly, and reaches with eyes closed.", async c => {
    c.motion = "gentle";
    c.closeSpeed = 650;
    c.prop("cushion", "cushion", { anchor: "left", s: .8, depth: "back" }); await c.open();
    await c.place("cushion", 450, 324); c.anchor("cushion", "inside");
    await c.move({ eye: .06, lx: 365, ly: 300, rx: 449, ry: 300 }, 500);
    await c.repeat(2, async () => { await c.move({ rise: -7 }, 800); await c.beat(200); await c.move({ rise: 4 }, 1000); await c.beat(350); });
    await c.off({ ms: 1000 }); await c.move({ rise: -10, eye: .65 }, 450); await c.stow("cushion");
  });
  scene(47, "Compassion", "The switch has had a difficult day too.", "The bear cushions the switch and gently guides it into the off position.", async c => {
    c.motion = "gentle";
    await c.open(); c.face("smile");
    await c.atSwitch({ lx: 383, ly: c.toggle.y + 21, lr: -35, x: 0, tilt: 12 }, 550);
    await c.off({ ms: 800, stay: true });
    await c.atSwitch({ rx: c.toggle.x, ry: c.toggle.y - 14 }, 400); await c.move({ ry: c.toggle.y + 9 }, 450); await c.beat(300);
    await c.move({ lx: 366, ly: 313, x: 0, rx: 451, ry: 314 }, 500);
  });
  scene(48, "Affection", "It is an unhealthy relationship, but a warm one.", "The bear hugs the switch, produces a little plush heart, and waves goodbye.", async c => {
    c.motion = "gentle";
    await c.open(); c.face("smile");
    await c.atSwitch({ x: 0, tilt: 18, rise: 34, lx: 383, ly: c.toggle.y - 23, rx: 444, ry: c.toggle.y - 29, eye: .12 }, 650);
    await c.wait(450);
    await c.move({ x: 0, tilt: 0, rise: 0, eye: 1 }, 500); await c.off();
    await c.move({ lx: 366, ly: 367, leftInside: 1 }, 350);
    c.prop("heart", "heart", { anchor: "left", s: .55 });
    await c.move({ lx: 372, ly: 267, lr: 0 }, 500); await c.wait(450);
    await c.move({ rx: 480, ry: 228, rr: -12 }, 350); await c.move({ rx: 489, ry: 233, rr: 12 }, 300);
  });
  scene(49, "Mischief", "An incident of its own making. It blames you.", "The bear secretly switches back on, pretends surprise, and switches off again.", async c => {
    await c.open(); await c.off(); await c.move({ rise: 90, lid: .35, eye: .65 }, 550);
    await c.move({ gazeX: -6 }, 250); await c.move({ gazeX: 6 }, 300); await c.beat(250);
    await c.atSwitch({ rx: c.toggle.x - 11, ry: c.toggle.y + 9 - 90 }, 650, "heavy"); await c.atSwitch({ rx: c.toggle.x + 11, ry: c.toggle.y - 1 - 90 }, 400, "gentle"); c.on();
    await c.move({ rx: 451, ry: 314 }, 230); await c.wait(400);
    await c.move({ rise: 0, lid: 1, lx: 326, ly: 245, rx: 490, ry: 245, eye: 1.2 }, 250, "snap");
    c.face("surprised"); await c.wait(650); await c.off({ ms: 450 });
  });
  scene(50, "Hopeful retirement", "Retired. Subject to further interruptions.", "The bear switches off and leaves a retirement sign. The next click ends retirement.", async c => {
    c.motion = "gentle";
    c.prop("retirement", "retired", { anchor: "left", s: .85, keep: true });
    await c.open(); c.face("smile"); await c.off({ ms: 700 });
    await c.place("retirement", 420, 365, 650); await c.beat(300);
    await c.move({ lx: 332, ly: 222, lr: -20, eye: .6 }, 350);
    await c.move({ lx: 341, ly: 218, lr: 12 }, 300); await c.move({ lx: 332, ly: 224, lr: -12 }, 300); await c.wait(450);
  });

  if (typeof module !== "undefined" && module.exports) module.exports = scenes;
  else root.BearScenes = scenes;
})(typeof window !== "undefined" ? window : globalThis);
