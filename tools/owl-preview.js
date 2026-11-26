// owl-preview: node render of the deskclock owl straight from Sprites.scene()
// (no QML). Sheet of every state + one GIF per animated state, and a frame-size check.
//
//   node tools/owl-preview.js [outdir] [scale]       (default outdir: ./owl-preview, scale 4)
//   ONLY=hoot,drag node tools/owl-preview.js out     (only states whose name contains one of these)
const path = require("path")
const fs = require("fs")
const P = require("./pet-preview.js")
const ROOT = path.join(__dirname, "..")
const S = P.load(path.join(ROOT, "plugins/fynnp.deskclock/Sprites.js"))
const FX = P.load(path.join(ROOT, "shared/PetFx.js"))
const out = process.argv[2] || "owl-preview"
const scale = +(process.argv[3] || 4)
fs.mkdirSync(out, { recursive: true })

const FXPAL = { o: P.fx("o"), r: P.fx("r"), l: P.fx("l") }
function base(o) {
  return Object.assign({ mood: "awake", t: 100, wall: 100, blink: false, fidget: "", fidgetT: 0, hoot: -1, hootT: 0,
    hh: 14 * 2 + 1, mm: 7, reaction: "", reactT: 0, hovered: false, lookX: 0, lookY: 0, dragged: false, lean: 0, landT: -1,
    still: false }, o)
}
function frameOf(label, st) {
  const sc = S.scene(base(st), FX)
  let bad = sc.rows.length !== 38 || sc.rows.some(r => r.length !== 44) || sc.prop.length !== 38 || sc.prop.some(r => r.length !== 44)
  if (bad) console.log("BAD SIZE", label)
  const layers = [{ rows: sc.prop, x: 0, y: 0 }, { rows: sc.rows, x: sc.x, y: sc.y }]
  for (const f of sc.fx) layers.push({ rows: f.rows, x: f.x, y: f.y, palette: FXPAL[f.c], opacity: f.op })
  return { label, layers }
}
// name, frames, step, (i, t) -> state
const STATES = [
  ["awake", 1, 0.25, () => ({})],
  ["blink", 1, 0.25, () => ({ blink: true })],
  ["drowsy", 1, 0.25, () => ({ mood: "drowsy" })],
  ["sleep", 8, 0.5, (i, t) => ({ mood: "sleep", wall: t })],
  ["sleep-peek", 1, 0.25, () => ({ mood: "sleep", hovered: true, lookX: 1 })],
  ["hover-L", 1, 0.25, () => ({ hovered: true, lookX: -1, lookY: -1 })],
  ["hover-R", 1, 0.25, () => ({ hovered: true, lookX: 1, lookY: 1 })],
  ["hoot", 24, 0.25, (i, t) => ({ hoot: 0, hootT: t - 100 })],
  ["swivel", 13, 0.25, (i, t) => ({ fidget: "swivel", fidgetT: t - 100 })],
  ["preen", 13, 0.25, (i, t) => ({ fidget: "preen", fidgetT: t - 100 })],
  ["watch", 13, 0.25, (i, t) => ({ fidget: "watch", fidgetT: t - 100 })],
  ["ruffle", 9, 0.25, (i, t) => ({ fidget: "ruffle", fidgetT: t - 100 })],
  ["tilt", 10, 0.25, (i, t) => ({ fidget: "tilt", fidgetT: t - 100 })],
  ["stretch", 11, 0.25, (i, t) => ({ fidget: "stretch", fidgetT: t - 100 })],
  ["yawn", 8, 0.25, (i, t) => ({ mood: "drowsy", fidget: "yawn", fidgetT: t - 100 })],
  ["pet", 14, 0.125, (i, t) => ({ reaction: "pet", reactT: t - 100 })],
  ["pet-asleep", 14, 0.125, (i, t) => ({ mood: "sleep", reaction: "pet", reactT: t - 100 })],
  ["annoyed", 8, 0.125, (i, t) => ({ reaction: "annoyed", reactT: t - 100 })],
  ["squish", 6, 0.125, (i, t) => ({ reaction: "squish", reactT: t - 100 })],
  ["drag", 8, 0.125, (i, t) => ({ dragged: true, lean: i % 6 < 3 ? 1 : -1 })],
  ["landing", 12, 0.125, (i, t) => ({ landT: t - 100 })],
  ["times", 6, 1, (i) => ({ hh: [0, 6, 12, 18, 7, 21][i], mm: [0, 3, 6, 9, 11, 2][i] })]
]
const only = process.env.ONLY ? process.env.ONLY.split(",") : null
const sheetFrames = []
for (const [name, n, step, fn] of STATES) {
  if (only && !only.some(o => name.includes(o))) continue
  const frames = []
  for (let i = 0; i < n; i++) { const t = 100 + i * step; frames.push(frameOf(name + (n > 1 ? " " + i : ""), Object.assign({ t }, fn(i, t)))) }
  sheetFrames.push(frames[Math.min(frames.length - 1, Math.floor(n / 2))])
  if (n > 1) {
    P.gif(frames, path.join(out, name + ".gif"), { w: 44, h: 38, scale, delay: Math.round(step * 100) })
    P.sheet(frames, path.join(out, "strip-" + name + ".png"), { w: 44, h: 38, scale: 3 })
  }
}
P.sheet(sheetFrames, path.join(out, "owl-sheet.png"), { w: 44, h: 38, scale })
console.log("ok ->", out)
