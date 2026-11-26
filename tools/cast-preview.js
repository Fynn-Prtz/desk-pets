// cast-preview: node sheets of the owl (deskclock) and the frog (deskweather)
// wearing the cast features straight from their Sprites.scene(): seasons x
// states, asleep with the nightcap, the morning routine, the welcome-back
// greeting; checks frame sizes and that no season palette key leaks without
// a season. (Affection rows / pet chat live in QML: use the harness checks.)
//
//   node tools/cast-preview.js <outdir> [owl frog]      SCALE=8 for zoom
// Writes <pet>-seasons.png, <pet>-night.png, <pet>-morning.png/.gif,
// <pet>-greet.png/.gif, <pet>-party-pet.gif; prints RESULT OK|FAIL.
const path = require("path")
const fs = require("fs")
const P = require("./pet-preview.js")
const root = path.resolve(__dirname, "..")
const L = (f) => P.load(path.join(root, f))
const FX = L("shared/PetFx.js")
const SEASON = L("shared/PetSeason.js")
const PAL = Object.assign({}, SEASON.COLORS)
const out = process.argv[2] || "/tmp/cast-preview"
fs.mkdirSync(out, { recursive: true })
const want = process.argv.slice(3).length ? process.argv.slice(3) : ["owl", "frog"]
const scale = +(process.env.SCALE || 4)
let problems = 0

const PETS = {
  owl: {
    file: "plugins/fynnp.deskclock/Sprites.js", h: 38,
    base: { mood: "awake", hoot: -1, hootT: 0, hh: 21, mm: 2, still: false },
    states: [{ label: "awake" }, { label: "drowsy", mood: "drowsy" }, { label: "hover", hovered: true, lookX: 1, lookY: -1 },
      { label: "swivel", fidget: "swivel", fidgetT: 1.0 }, { label: "pet", reaction: "pet", reactT: 0.6 },
      { label: "squish", reaction: "squish", reactT: 0.1 }, { label: "drag", dragged: true }, { label: "sleep", mood: "sleep" }],
    sleep: { mood: "sleep" }, awake: { mood: "awake" }, asleepGreet: { mood: "sleep" }
  },
  frog: {
    file: "plugins/fynnp.deskweather/Sprites.js", h: 36, shadowY: 35,
    base: { mood: "cloudy", cold: false, heavy: false, still: false, bop: false, bang: false, beat: 0 },
    states: [{ label: "cloudy" }, { label: "sun", mood: "sun" }, { label: "cold", mood: "cold" }, { label: "rain", mood: "rain", t: 100.5 },
      { label: "snow", mood: "snow" }, { label: "hop", fidget: "hop", fidgetT: 0.5 }, { label: "pet", reaction: "pet", reactT: 0.6 },
      { label: "sleep", mood: "sleep" }],
    sleep: { mood: "sleep" }, awake: { mood: "cloudy" }, asleepGreet: { mood: "sleep" }
  }
}

function render(pet, cfg, S, st0, label) {
  const st = Object.assign({ t: 100, wall: 100, blink: false, fidget: "", fidgetT: 0, reaction: "", reactT: 0, hovered: false,
    lookX: 0, lookY: 0, dragged: false, lean: 0, landT: -1, season: "", motion: "full", night: false, morningT: -1, greetT: -1 }, cfg.base, st0)
  const sc = S.scene(st, FX, SEASON)
  if (!sc.rows || sc.rows.length !== cfg.h || sc.rows.some(r => r.length !== 44)) { console.log(`${pet} ${label}: bad size`); problems++ }
  if (!st.season && sc.rows.some(r => /[RMWVGJOUQZYTCAFI]/.test(r))) { console.log(`${pet} ${label}: season key without a season`); problems++ }
  const layers = []
  if (sc.prop) layers.push({ rows: sc.prop, x: 0, y: 0 })
  if (sc.shadow) layers.push({ rows: sc.shadow, x: 2, y: cfg.shadowY })
  layers.push({ rows: sc.rows, x: sc.x, y: sc.y, palette: PAL })
  for (const f of sc.fx) layers.push({ rows: f.rows, x: f.x, y: f.y, opacity: f.op, palette: P.fx(f.c) })
  if (sc.sky) layers.push({ rows: sc.sky, x: 0, y: 0, opacity: sc.skyOp })
  return { label, layers }
}

for (const pet of want) {
  const cfg = PETS[pet], S = L(cfg.file)
  const R = (st, label) => render(pet, cfg, S, st, label)
  // seasons x states
  const fr = []
  for (const season of ["", "xmas", "spooky", "party"]) for (const s of cfg.states) fr.push(R(Object.assign({ season }, s), (season || "-") + " " + s.label))
  P.sheet(fr, path.join(out, pet + "-seasons.png"), { cols: cfg.states.length, scale })
  // night: asleep by day / with the nightcap / nightcap + xmas / still
  P.sheet([R(cfg.sleep, "sleep day"), R(Object.assign({ night: true }, cfg.sleep), "night cap"),
    R(Object.assign({ night: true, season: "xmas" }, cfg.sleep), "cap+xmas"), R(Object.assign({ night: true, still: true }, cfg.sleep), "cap still"),
    R(Object.assign({ night: true, wall: 102 }, cfg.sleep), "cap breath"), R(Object.assign({ night: true, hovered: true, lookX: 1 }, cfg.sleep), "cap hover")],
    path.join(out, pet + "-night.png"), { cols: 6, scale })
  // morning, greeting (asleep + calm), party petting
  const seq = (n, step, fn) => { const a = []; for (let i = 0; i < n; i++) a.push(fn(i * step, i)); return a }
  const morning = seq(19, 0.25, (t) => R(Object.assign({ morningT: t, t: 100 + t }, cfg.awake), "m " + t.toFixed(2)))
  P.sheet(morning, path.join(out, pet + "-morning.png"), { cols: 7, scale: 3 })
  P.gif(morning, path.join(out, pet + "-morning.gif"), { scale, delay: 25 })
  const greet = seq(22, 0.125, (t) => R(Object.assign({ greetT: t, t: 100 + t }, cfg.asleepGreet), "g " + t.toFixed(2)))
    .concat(seq(22, 0.125, (t) => R(Object.assign({ greetT: t, t: 100 + t }, cfg.awake), "g " + t.toFixed(2))))
  P.sheet(greet.filter((f, i) => i % 2 === 0), path.join(out, pet + "-greet.png"), { cols: 11, scale: 3 })
  P.gif(greet, path.join(out, pet + "-greet.gif"), { scale, delay: 12 })
  const party = seq(18, 0.125, (t) => R(Object.assign({ season: "party", reaction: "pet", reactT: t, t: 100 + t }, cfg.awake), ""))
  P.gif(party, path.join(out, pet + "-party-pet.gif"), { scale, delay: 12 })
  // frog extra: rain with each season (hat must yield to the umbrella)
  if (pet === "frog") {
    const rr = []
    for (const season of ["", "xmas", "spooky", "party"]) for (const m of ["drizzle", "rain", "storm", "hot", "wind", "fog"])
      rr.push(R({ season, mood: m, night: false }, (season || "-") + " " + m))
    P.sheet(rr, path.join(out, "frog-weather-seasons.png"), { cols: 6, scale: 3 })
  }
}
console.log(problems ? "RESULT FAIL " + problems : "RESULT OK", "->", out)
