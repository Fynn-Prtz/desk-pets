// dog-preview: node sheets of the deskdisk dachshund straight from Sprites.js.
//
//   node tools/dog-preview.js <outdir> [scale]
//
// Writes into <outdir>:
//   dog-sheet.png / dog-sheet-1x.png   every mood + reaction pose (same keys PixelDisk.qml builds)
//   compare.png / compare-1x.png       old dog (git: $OLD_REF, default night/base) | new dog | penguin |
//                                      hamster | cat | axolotl, all at the same scale; second row = asleep
//   zoom.png                           a few key poses at 8x
// Also checks that every frame is 44 x 38 and only uses known palette keys.
const fs = require("fs")
const os = require("os")
const path = require("path")
const { execFileSync } = require("child_process")
const P = require("./pet-preview.js")
const root = path.resolve(__dirname, "..")
const L = (f) => P.load(path.join(root, f))
const out = process.argv[2] || "/tmp/dog-preview"
const scale = +(process.argv[3] || 4)
fs.mkdirSync(out, { recursive: true })

const S = L("plugins/fynnp.deskdisk/Sprites.js")
const FX = L("shared/PetFx.js")

function K(o) {
  const d = Object.assign({ e: "open", lx: 0, ly: 0, m: "smile", p: "stand", g: "stand", ea: "flop", t: "up", c: "", sq: 0, ln: 0, bl: 1, hx: 0, hy: 0 }, o)
  return [d.e, d.lx, d.ly, d.m, d.p, d.g, d.ea, d.t, d.c, d.sq, d.ln, d.bl, d.hx, d.hy].join("|")
}
function G(o) { const d = Object.assign({ sh: 1, ho: 0, mo: 0, pi: 0 }, o || {}); return [d.sh, d.ho, d.mo, d.pi].join("|") }

let problems = 0
function check(label, rows) {
  if (rows.length !== 38 || rows.some(r => r.length !== 44)) { console.log(label + ": bad size"); problems++ }
  if (rows.some(r => /[^.obhndwlpexrkt]/.test(r))) { console.log(label + ": unknown palette key"); problems++ }
}
// one frame from a dog pose (+ ground, + fx layers [rows, x, y, paletteKey, opacity])
function dogFrame(lib, label, o, gr, fx) {
  o = o || {}
  const rows = lib.dog(K(o)), grows = lib.ground(G(gr)), front = lib.front(G(gr))
  check(label, rows); check(label + " ground", grows); check(label + " front", front)
  const layers = [{ rows: grows }, { rows, x: o.dx || 0, y: o.hop || 0 }]
  if (gr && gr.pi) layers.push({ rows: front })
  for (const f of fx || []) layers.push({ rows: f[0], x: f[1], y: f[2], palette: f[3] === "pet" ? undefined : P.fx(f[3] || "o"), opacity: f[4] })
  return { label, layers }
}

// every state of PixelDisk.pose(), in ladder order, then the reactions
const STATES = [
  ["idle: sleep", { e: "sleep", m: "none", p: "curl", t: "curl", bl: 0 }, { mo: 4, sh: 0 }, [[FX.zed, 28, 8, "o", 0.75], [FX.zedSmall, 33, 3, "o", 0.75]]],
  ["idle: breathe", { e: "sleep", m: "none", p: "curl", t: "curl", bl: 0, sq: 1 }, { mo: 4, sh: 0 }],
  ["light: calm", {}],
  ["light: blink", { e: "blink" }],
  ["hover look", { lx: 1, ly: -1, ea: "perk" }],
  ["fidget look", { lx: -1 }],
  ["fidget sniff", { hy: 2, ly: 1, m: "sniff", hx: -1 }, null, [[FX.puff[0], 4, 26, "o", 0.7]]],
  ["fidget wag", { e: "happy", m: "open", t: "wag1", ea: "perk", hop: -1 }],
  ["fidget scratch", { e: "happy", m: "omega", g: "scratch1", hx: 1, ea: "perk", ln: 1 }],
  ["fidget yawn", { e: "sleep", m: "o", ea: "down" }],
  ["groove", { e: "happy", m: "open", t: "wag2", g: "tap", ea: "perk" }, null, [[FX.note, 34, 6, "o"]]],
  ["busy read: dig", { p: "dig", g: "dig1", ly: 1, m: "open", t: "wag1" }, { ho: 1, mo: 2 }, [[S.clods[0], 30, 16, "pet"], [S.clods[1], 36, 22, "pet"]]],
  ["busy read: bone!", { c: "bone", e: "happy", g: "walk1", t: "wag1", ea: "perk", hop: -2 }, { ho: 1, mo: 3 }, [[FX.sparkle[0], 28, 11, "o"]]],
  ["busy write: block", { c: "block", g: "walk2", t: "wag2", hop: -1 }, { ho: 1, mo: 1 }],
  ["busy write: drop", { p: "dig", e: "happy", ly: 1, m: "omega" }, { ho: 2, mo: 1 }],
  ["busy write: bury", { p: "dig", g: "dig2", ly: 1, m: "open", t: "wag2" }, { ho: 3, mo: 1 }, [[S.clods[2], 29, 18, "pet"]]],
  ["heavy: frantic", { p: "dig", g: "dig1", e: "strain", m: "pant", ea: "flap1", t: "wag1" }, { ho: 1, mo: 5 }, [[S.clods[1], 30, 12, "pet"], [S.clods[0], 36, 18, "pet"], [FX.sweat, 29, 14, "w"], [FX.effort, 39, 9, "o"]]],
  ["very heavy", { p: "dig", g: "dig2", e: "strain", m: "pant", ea: "flop", t: "wag2", bl: 2, dx: 1 }, { ho: 1, mo: 5 }, [[S.clods[1], 32, 9, "pet"], [S.clods[2], 37, 20, "pet"], [FX.sweat, 29, 15, "w"], [FX.puff[1], 13, 5, "o", 0.7]]],
  ["full", { e: "worried", m: "wobble", ea: "down", t: "up", bl: 2 }, { pi: 1 }, [[S.boneSmall, 34, 12, "pet"], [FX.sweat, 29, 10, "w"]]],
  ["full + heavy", { e: "dizzy", m: "wobble", ea: "down", bl: 2, ln: 1 }, { pi: 1 }, [[FX.spiral[0], 28, 0, "o"]]],
  ["pet", { e: "squint", m: "omega", t: "wag1", ea: "perk", hop: -1 }, null, [[FX.heart, 29, 3, "r"], [FX.heartSmall, 1, 1, "r"]]],
  ["pet 2", { e: "happy", m: "omega", t: "wag2", ea: "perk" }, null, [[FX.heart, 29, 1, "r"]]],
  ["annoyed", { e: "angry", m: "pout", bl: 2, lx: -1, t: "down", g: "stomp", ea: "perk" }, null, [[FX.anger, 28, 1, "r"], [S.bark, 0, 2, "o"]]],
  ["annoyed woof", { e: "angry", m: "o", bl: 2, lx: -1, t: "down", ea: "perk" }, null, [[FX.anger, 28, 1, "r"]]],
  ["squish", { e: "happy", m: "omega", sq: 3, t: "wag1", ea: "perk" }],
  ["squish 2", { e: "happy", m: "omega", sq: 2, t: "wag2", ea: "perk" }],
  ["drag", { p: "dangle", e: "wide", m: "o", ea: "flap1", t: "down", g: "shake1", bl: 0, ln: 1 }, { sh: 2 }, [[FX.bang, 34, 1, "r"]]],
  ["drag 2", { p: "dangle", e: "wide", m: "o", ea: "flap2", t: "down", g: "shake2", bl: 0, ln: -1 }, { sh: 2 }, [[FX.bang, 34, 2, "r"]]],
  ["land", { e: "squint", m: "o", sq: 3, ea: "perk" }, null, [[FX.dust[0], 6, 32, "o", 0.6]]],
  ["land dizzy", { e: "dizzy", m: "wobble", ln: 1, ea: "down" }, null, [[FX.spiral[0], 28, 0, "o"]]],
]

const frames = STATES.map(s => dogFrame(S, s[0], s[1], s[2], s[3]))
P.sheet(frames, path.join(out, "dog-sheet.png"), { scale, cols: 6 })
P.sheet(frames, path.join(out, "dog-sheet-1x.png"), { scale: 2, cols: 6 })
const zoomPick = ["light: calm", "idle: sleep", "busy read: dig", "busy read: bone!", "heavy: frantic", "full", "pet", "drag"]
P.sheet(frames.filter(f => zoomPick.includes(f.label)), path.join(out, "zoom.png"), { scale: 8, cols: 4 })
if (process.env.ALLZOOM) P.sheet(frames, path.join(out, "zoom-all.png"), { scale: 6, cols: 5 })

// ---- comparison: old dog | new dog | penguin | hamster | cat | axolotl ----
function oldLib() {
  const ref = process.env.OLD_REF || "night/base"
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "dog-old-")), "Sprites.js")
  fs.writeFileSync(tmp, execFileSync("git", ["-C", root, "show", ref + ":plugins/fynnp.deskdisk/Sprites.js"]))
  return P.load(tmp)
}
const OLD = oldLib()
function sceneFrame(label, file, st0) {
  const lib = L(file)
  const st = Object.assign({ t: 0, wall: 0, blink: false, fidget: "", fidgetT: 0, reaction: "", reactT: 0, hovered: false,
    lookX: 0, lookY: 0, dragged: false, lean: 0, landT: -1, grooving: false, beat: 0, screenKey: "", motion: "full" }, st0)
  const sc = lib.scene(st, FX)
  const layers = [{ rows: sc.shadow, x: 2, y: 35 }, { rows: sc.rows, x: sc.x, y: sc.y, palette: { L: "b" } }]
  for (const f of sc.fx) layers.push({ rows: f.rows, x: f.x, y: f.y, opacity: f.op, palette: P.fx(f.c) })
  return { label, layers }
}
const HAM = L("plugins/fynnp.deskmem/Sprites.js")
const CAT = L("plugins/fynnp.deskaudio/Sprites.js")
const catFrame = (label, over) => ({ label, layers: [{ rows: CAT.rows(CAT.keyOf(CAT.pose(over))) }] })
const sleepO = { e: "sleep", m: "none", p: "curl", t: "curl", bl: 0 }
const petO = { e: "squint", m: "omega", t: "wag1", ea: "perk" }
const cmp = [
  dogFrame(OLD, "old dog", {}), dogFrame(S, "NEW dog", {}),
  sceneFrame("penguin", "plugins/fynnp.desksys/Sprites.js", { mood: "chill" }),
  { label: "hamster", layers: [{ rows: HAM.hamster({}) }] },
  catFrame("cat", {}),
  sceneFrame("axolotl", "plugins/fynnp.deskgames/Sprites.js", { mood: "ready" }),
  dogFrame(OLD, "old asleep", sleepO, { mo: 4, sh: 0 }), dogFrame(S, "NEW asleep", sleepO, { mo: 4, sh: 0 }),
  sceneFrame("penguin asleep", "plugins/fynnp.desksys/Sprites.js", { mood: "idle" }),
  { label: "hamster asleep", layers: [{ rows: HAM.hamster({ pose: "ball" }) }] },
  catFrame("cat asleep", { body: "loaf", paws: "tuck", tail: "wrap", eyes: "sleep" }),
  sceneFrame("axolotl asleep", "plugins/fynnp.deskgames/Sprites.js", { mood: "idle" }),
  dogFrame(OLD, "old petted", petO), dogFrame(S, "NEW petted", petO),
  sceneFrame("penguin petted", "plugins/fynnp.desksys/Sprites.js", { mood: "chill", reaction: "pet", reactT: 0.6, t: 0.6 }),
  { label: "hamster petted", layers: [{ rows: HAM.hamster({ eyes: "squint", mouth: "open", pose: "wiggle" }) }] },
  catFrame("cat petted", { eyes: "happy", mouth: "smile", blush: 1 }),
  sceneFrame("axolotl petted", "plugins/fynnp.deskgames/Sprites.js", { mood: "ready", reaction: "pet", reactT: 0.6, t: 0.6 }),
]
P.sheet(cmp, path.join(out, "compare.png"), { scale, cols: 6 })
P.sheet(cmp, path.join(out, "compare-1x.png"), { scale: 2, cols: 6 })
console.log(problems ? "RESULT FAIL (" + problems + " problems)" : "RESULT OK", "->", out)
process.exit(problems ? 1 : 0)
