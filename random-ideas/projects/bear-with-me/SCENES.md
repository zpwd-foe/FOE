# Performance notes

Every scene preserves an intentional pause, a physical switch contact, and a complete retreat before the lid closes. Paws and held props use the same articulated arm positions. Props on the ledge are placed and retrieved; their size stays fixed except for the album's edge-on turn. The interface keeps these emotional labels hidden.

Normal-motion timing combines duration with the intent of each gesture. The ordinary 400 ms baseline remains, but longer actions stretch further and emotional styles add distinct acceleration and rest phases. Standalone gestures stay at least 80 ms, switch contact at least 60 ms, and any single gesture at most 5.2 seconds. Blinks, deliberate pauses and optional interaction windows retain their independent timing; reduced motion keeps static story beats.

| Motion | Rhythm and use |
|---|---|
| Heavy | Slow to get moving, then settles into place. Sleepiness, comfort-seeking, exhaustion and resignation use it for the body and retreat; eye-only movements remain responsive. |
| Hesitant | Approaches, rests halfway along the path, then continues. Reluctance takes about 4.3 seconds to approach, followed by a decisive 120 ms tap and a quicker withdrawal. Also used for shyness and indecision. |
| Weary | Two small efforts separated by complete rests of the paw, its reaching arc and its wrist. Exhaustion's final approach lasts about 3.6 seconds. |
| Gentle | Continuous, soft acceleration for careful handling and affection. Mindfulness breathes in for about 2.1 seconds and out for 3.3 seconds, with small holds between breaths. |
| Snap / commit | Immediate startled reactions, or a short accelerating action toward contact. Anxiety creeps closer and waits longer on each attempt, flinches back quickly, then commits. |
| Fall | Released props accelerate toward the ground using their own duration, independent of the bear's mood. |

Scene code can set `c.motion` for its body language and `c.exitMotion` for its retreat, or pass a motion name to an individual move/open/prop action and the `motion` option to `off`. Reaching, switch contact and recovery can have different rhythms while retaining their original safe paths and layer transitions.

The 48 active scenes keep their original IDs so saved discoveries remain valid. Caution (4) and Anger (19) have been removed.

| ID | Reaction | Staging |
|---|---|---|
| 01 | Sleepiness | Wakes gradually, misses beside the lever, looks down, then reaches accurately. |
| 02 | Shyness | Peeks slowly and hides its face with the free paw while the other reaches. |
| 03 | Curiosity | Inspects from either side, then recoils at its own click. |
| 05 | Confusion | Examines the paw from two angles using a limited wrist turn and forearm motion. |
| 06 | Politeness | Waves with the forearm, lowers the paw, switches off gently, then bows. |
| 07 | Distraction | Reads with pages toward itself, misses twice, checks the switch, and returns to reading. |
| 08 | Comfort-seeking | Holds the blanket, reluctantly releases one paw, then tucks it back in. |
| 09 | Reluctance | Rests on the rim, gathers itself for the reach, and slumps again afterwards. |
| 10 | Mild irritation | Stares at the visitor, looks down for a deliberate press, then returns the stare. |
| 11 | Suspicion | Disappears fully before moving across the box for a second suspicious peek. |
| 12 | Disbelief | Closes almost completely, reopens, and studies the now-off switch. |
| 13 | Annoyance | Tries three restrained seating poses before finally attending to the switch. |
| 14 | Accusation | Points to the actual switch, points toward the visitor, then folds its arms. |
| 15 | Passive aggression | Wipes the real switch with controlled strokes, inspects it, and puts the cloth away. |
| 16 | Contempt | Leans aside and touches with a restrained wrist angle rather than spinning the paw. |
| 17 | Exasperation | Rubs its face, folds one ear slightly, straightens it, and gives up. |
| 18 | Defiance | Keeps a protective paw planted over the off switch while checking the visitor. |
| 20 | Outrage | Plants both paws on the rim and shifts its body between them while getting unstuck. |
| 21 | Bargaining | Offers a cookie; accepting removes it immediately, while leaving the offer unanswered lets the bear keep it. |
| 22 | Appeasement | Presents a flower, switches off quietly, and retrieves its offering. |
| 23 | Bureaucratic detachment | Measures, puts the ruler away, stamps the held form, then shows the marked paperwork. |
| 24 | Authority | Places its sign by hand, watches it tip, and retrieves it through the opening. |
| 25 | Perfectionism | Places a small platform, makes tiny alignment corrections, uses it as a brace, and packs it away. |
| 26 | Competitiveness | Checks the stopwatch, warms up, presses quickly, and checks its time. |
| 27 | Pride | Celebrates within its arm range, looks for applause, and slowly lowers its paws. |
| 28 | Vanity | Notices a glint in the switch, tidies its face and ear, then checks the result. |
| 29 | Showmanship | Holds a small curtain in one paw, places the cover, switches off behind it, then clears the props by hand. |
| 30 | Overconfidence | Misses while looking away, stops, looks properly, then reaches successfully. |
| 31 | Avoidance | Retreats completely, cracks the lid, and returns after the switch remains on. |
| 32 | Denial | Places an OFF sign over the switch, notices the problem, removes the sign, and deals with it. |
| 33 | Anxiety | Makes three increasingly close approaches, pauses between them, breathes, and commits. |
| 34 | Paranoia | Raises only the periscope first, keeping its lower shaft inside the opening; the disguised bear emerges after the inspection. |
| 35 | Indecision | Alternates volunteering paws before one nudges the other into doing the job. |
| 36 | Resourcefulness | Places a block tower, tries to brace on it, watches it fall, and puts it away. |
| 37 | Desperation | Swings a lasso, catches an ear, unhooks it with a reachable gesture, and stows it. |
| 38 | Panic | Starts holding the spoon and cookie with a hat on; loses the spoon and hat while saving the cookie. |
| 39 | Exhaustion | Rests on the rim while the active paw advances in small lifted steps. |
| 40 | Defeat | Tries to withdraw with its flag, returns, turns the flag sideways, and puts it away. |
| 41 | Loneliness | Offers a paw; acceptance gives two small shakes, while silence earns a self-handshake. |
| 42 | Nostalgia | Reads the album with its cover toward us, turns it to show the photograph and `#iamsway` on the left inside page, then turns it back. |
| 43 | Embarrassment | Snags the cape under the lid, frees itself, removes the cape by hand, and puts it away. |
| 44 | Existential doubt | Looks at the switch, examines its paws, looks upward, and finally looks at the visitor. |
| 45 | Resignation | Places a chair inside the opening, sits, leans far enough to reach, then retrieves the chair. |
| 46 | Mindfulness | Places a cushion inside the opening, takes two slow breaths, switches off, and packs it away. |
| 47 | Compassion | Cradles the switch, guides it gently, then gives it a slow reassuring pat. |
| 48 | Affection | Hugs the switch, retrieves a small plush heart from inside the box, and waves with its free paw. |
| 49 | Mischief | Checks both directions before switching on again from a reachable peek, then pretends surprise. |
| 50 | Hopeful retirement | Carries the retirement sign out, places it on the front, and waves; the next interruption retrieves it. |
