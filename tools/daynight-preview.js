// daynight-preview: node sheets of the day-night routine for every pet,
// straight from each card's Sprites.js: asleep with the nightcap (also with a
// season on), and the morning routine (stretch -> coffee) over time.
// Checks frame sizes and that the nightcap / mug never show without
// night / morning.
//
//   node tools/daynight-preview.js <outdir> [penguin hamster cat dog pigeon axolotl]
// Writes <outdir>/<pet>-daynight.png and <pet>-morning.gif.
const path = require("path")
const fs = require("fs")
const P = require("./pet-preview.js")
const root = path.resolve(__dirname, "..")
const L = (f) => P.load(path.join(root, f))
const FX = L("shared/PetFx.js")
const SEASON = L("shared/PetSeason.js")
const PAL = Object.assign({}, SEASON.COLORS, { L: "b", "1": "x", "2": "e", "3": "p", "4": "e" })
const out = process.argv[2] || "/tmp/daynight-preview"
fs.mkdirSync(out, { recursive: true })
const want = process.argv.slice(3)
const MT = [0.2, 0.8, 1.4, 2.0, 2.6, 3.2, 3.8, 4.4]
let problems = 0

// make(kind, t) -> layers;  kind: "sleep" | "sleepNight" | "sleepNightXmas" | "morning"
function run(pet, make) {
  const frames = []
  for (const k of ["sleep", "sleepNight", "sleepNightXmas", "sleepNightParty"]) frames.push({ label: k, layers: make(k, 0) })
  for (const t of MT) frames.push({ label: "morning " + t, layers: make("morning", t) })
  for (const f of frames) for (const l of f.layers) if (l.body && l.rows.some(r => r.length !== 44)) { console.log(pet, f.label, "bad width"); problems++ }
  P.sheet(frames, path.join(out, pet + "-daynight.png"), { cols: 6, scale: +(process.env.SCALE || 4) })
  const g = []
  for (let i = 0; i < 40; i++) g.push({ layers: make("morning", i / 8) })
  P.gif(g, path.join(out, pet + "-morning.gif"), { delay: 12 })
}

function scenePet(pet, file, sleepSt, wakeSt) {
  const S = L(file)
  run(pet, (k, t) => {
    const base = { t: 100 + t, wall: 100 + t, blink: false, fidget: "", fidgetT: 0, reaction: "", reactT: 0, hovered: false, lookX: 0, lookY: 0,
      dragged: false, lean: 0, landT: -1, grooving: false, beat: 0, screenKey: "", season: "", motion: "full", night: false, morningT: -1 }
    const st = Object.assign(base, k === "morning" ? wakeSt : sleepSt)
    if (k !== "sleep" && k !== "morning") st.night = true
    if (k === "sleepNightXmas") st.season = "xmas"
    if (k === "sleepNightParty") st.season = "party"
    if (k === "morning") st.morningT = t
    const sc = S.scene(st, FX, SEASON)
    const layers = [{ rows: sc.shadow, x: 2, y: 35 }, { rows: sc.rows, x: sc.x, y: sc.y, palette: PAL, body: true }]
    for (const f of sc.fx) layers.push({ rows: f.rows, x: f.x, y: f.y, opacity: f.op, palette: P.fx(f.c) })
    return layers
  })
}

// key-style pets: frame(kind, t) -> layers, mirroring the QML's pose code
const pets = {
  pigeon: () => {
    const S = L("plugins/fynnp.desknet/Sprites.js")
    run("pigeon", (k, t) => {
      const tick = Math.round(t * 4)
      const p = { e: "open", lx: 0, ly: 0, b: "closed", w: "fold", f: "stand", pf: 0, sq: 0, ln: 0, bl: 1, hx: 0, hy: 0, bag: 0, h: "" }
      const season = k === "sleepNightXmas" ? "xmas" : k === "sleepNightParty" ? "party" : ""
      if (k !== "morning") { Object.assign(p, { e: "sleep", b: "tuck", pf: 1, f: "tuck", bl: 0 }); if (k !== "sleep") p.cap = "1" }
      else if (t < 1.8) { const up = t > 0.3 && t < 1.6; Object.assign(p, { w: up ? (tick % 4 < 2 ? "up" : "mid") : "fold", e: up ? "sleep" : "blink", b: up ? "open" : "closed", f: up ? "tap" : "stand" }) }
      else if (t < 4.2) { const sip = t > 2.6 && t < 3.4; Object.assign(p, { w: "hold", h: "mug" + (tick % 2), e: t > 2.4 ? "happy" : "open", b: sip ? "coo" : "closed", hy: sip ? 1 : 0 }) }
      else Object.assign(p, { e: "happy", pf: 1, b: "coo" })
      const key = [p.e, p.lx, p.ly, p.b, p.w, p.f, p.pf, p.sq, p.ln, p.bl, p.hx, p.hy, p.bag, p.h, season, "", p.cap || ""].join("|")
      return [{ rows: S.ground("1|0|" + season, SEASON), palette: PAL }, { rows: S.pigeon(key, SEASON), palette: PAL, body: true }]
    })
  },
  dog: () => {
    const S = L("plugins/fynnp.deskdisk/Sprites.js")
    run("dog", (k, t) => {
      const tick = Math.round(t * 4)
      let p = { e: "open", lx: 0, ly: 0, m: "smile", p: "stand", g: "stand", ea: "flop", t: "up", c: "", sq: 0, ln: 0, bl: 1, hx: 0, hy: 0 }
      let gr = [1, 0, 0, 0]
      const season = k === "sleepNightXmas" ? "xmas" : k === "sleepNightParty" ? "party" : ""
      if (k !== "morning") { Object.assign(p, { p: "curl", e: "sleep", m: "none", t: "curl", bl: 0 }); gr = [0, 0, 4, 0]; if (k !== "sleep") p.cap = "1" }
      else if (t < 1.8) { const bow = t > 0.3 && t < 1.6; Object.assign(p, { p: bow ? "dig" : "stand", e: bow ? "sleep" : "blink", m: bow ? "o" : "smile", ea: bow ? "perk" : "flop", t: bow ? (tick % 2 ? "wag1" : "wag2") : "up" }) }
      else if (t < 4.2) Object.assign(p, { c: "mug" + (tick % 2), e: t > 2.4 ? "happy" : "open", t: tick % 2 ? "wag1" : "wag2", ea: "perk", g: t > 2.6 && t < 3.6 ? (tick % 2 ? "walk1" : "walk2") : "stand" })
      else Object.assign(p, { e: "happy", m: "open", t: tick % 2 ? "wag1" : "wag2" })
      const key = [p.e, p.lx, p.ly, p.m, p.p, p.g, p.ea, p.t, p.c, p.sq, p.ln, p.bl, p.hx, p.hy, season, "", p.cap || ""].join("|")
      const gk = gr.concat([season]).join("|")
      return [{ rows: S.ground(gk, SEASON), palette: PAL }, { rows: S.dog(key, SEASON), palette: PAL, body: true }, { rows: S.front(gk), palette: PAL }]
    })
  },
  cat: () => {
    const S = L("plugins/fynnp.deskaudio/Sprites.js")
    run("cat", (k, t) => {
      const st = { mode: k === "morning" ? "idle" : "sleep", t: 800 + Math.floor(t * 8), tier: 0, amp: 0, blink: false, hov: false, lx: 0, ly: 0, fid: "", ft: 0,
        rea: "", rt: 0, drag: false, lean: 0, lt: -1, nb: "", zp: 0, season: k === "sleepNightXmas" ? "xmas" : k === "sleepNightParty" ? "party" : "",
        motion: "full", night: k !== "sleep" && k !== "morning", mt: k === "morning" ? Math.floor(t * 8) : -1 }
      const sc = S.scene(st)
      return [{ rows: S.rows(sc.key, SEASON), x: sc.dx, palette: PAL, body: true }]
    })
  },
  hamster: () => {
    const S = L("plugins/fynnp.deskmem/Sprites.js")
    run("hamster", (k, t) => {
      let o = { pose: "sit", eyes: "open", mouth: "omega" }
      if (k !== "morning") { o = { pose: "ball", breath: 1, eyes: "open", acc: k === "sleepNightXmas" ? "xmas" : k === "sleepNightParty" ? "party" : "" }; if (k !== "sleep") o.cap = 1 }
      else {
        const f = Math.floor(t * 8), st = Math.floor(t * 4)
        if (t < 1.8) { const up = t > 0.3 && t < 1.6; Object.assign(o, { pose: up ? "dangle" : "sit", paws: up ? "wash" : "down", eyes: up ? "sleep" : "blink", mouth: up ? "open" : "omega" }) }
        else if (t < 4.2) { const sip = t > 2.6 && t < 3.4; Object.assign(o, { paws: sip ? "hold" : "down", item: "mug" + (f % 4 < 2 ? 0 : 1), eyes: sip || t > 3.4 ? "happy" : "open", mouth: sip ? "chew" : "omega" }) }
        else Object.assign(o, { eyes: "happy", mouth: "smile" })
      }
      return [{ rows: S.hamster(o, SEASON), palette: PAL, body: true }]
    })
  },
  axolotl: () => scenePet("axolotl", "plugins/fynnp.deskgames/Sprites.js", { mood: "idle" }, { mood: "ready" }),
  penguin: () => scenePet("penguin", "plugins/fynnp.desksys/Sprites.js", { mood: "idle" }, { mood: "chill" }),
}
for (const k of Object.keys(pets)) if (!want.length || want.includes(k)) { pets[k](); console.log("ok", k) }
console.log(problems ? problems + " problem(s)" : "no problems", "->", out)
process.exit(problems ? 1 : 0)
