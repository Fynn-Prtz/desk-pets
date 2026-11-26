// season-preview: node contact sheets of every pet in every season
// (shared/PetSeason.js), straight from each card's Sprites.js, so seasonal
// outfits can be judged without the desktop. Also asserts that frames
// without a season contain no season palette keys and that every frame is
// 44 x 38 (body grids 44 x 36 + shadow where the pet has one).
//
//   node tools/season-preview.js <outdir> [pet ...]     pets: penguin hamster cat dog pigeon axolotl
//
// Writes <outdir>/<pet>-seasons.png (rows = seasons "" xmas spooky party,
// columns = states) and <outdir>/<pet>-party-pet.gif (petting confetti).
const path = require("path")
const fs = require("fs")
const P = require("./pet-preview.js")
const root = path.resolve(__dirname, "..")
const L = (f) => P.load(path.join(root, f))
const FX = L("shared/PetFx.js")
const SEASON = L("shared/PetSeason.js")

const PAL = Object.assign({}, SEASON.COLORS, { L: "b", "1": "x", "2": "e", "3": "p", "4": "e" })
const SEASONS = ["", "xmas", "spooky", "party"]
const out = process.argv[2] || "/tmp/season-preview"
fs.mkdirSync(out, { recursive: true })
const want = process.argv.slice(3)
let problems = 0

function check(pet, label, rows, season, h) {
  if (!rows || rows.length !== h || rows.some(r => r.length !== 44)) { console.log(`${pet} ${label}: bad size ${rows && rows.length}x${rows && rows[0] && rows[0].length}`); problems++ }
  if (!season && rows.some(r => /[RMWVGJOUQZYTCAFI]/.test(r))) { console.log(`${pet} ${label}: season key without a season`); problems++ }
}

// ---- scene()-style pets (penguin, axolotl): rows + x/y + shadow + fx
function scenePet(pet, file, shadowY, states) {
  const S = L(file)
  const frames = []
  for (const season of SEASONS) for (const st0 of states) {
    const st = Object.assign({ t: 0, wall: 0, blink: false, fidget: "", fidgetT: 0, reaction: "", reactT: 0, hovered: false,
      lookX: 0, lookY: 0, dragged: false, lean: 0, landT: -1, grooving: false, beat: 0, screenKey: "", season, motion: "full" }, st0)
    const sc = S.scene(st, FX, SEASON)
    check(pet, (season || "none") + "/" + st0.label, sc.rows, season, 36)
    const layers = [{ rows: sc.shadow, x: 2, y: shadowY }, { rows: sc.rows, x: sc.x, y: sc.y, palette: PAL }]
    for (const f of sc.fx) layers.push({ rows: f.rows, x: f.x, y: f.y, opacity: f.op, palette: P.fx(f.c === "o" ? "o" : f.c) })
    frames.push({ label: (season || "-") + " " + st0.label, layers })
  }
  P.sheet(process.env.ONLY ? frames.filter(f => f.label.includes(process.env.ONLY)) : frames, path.join(out, pet + "-seasons" + (process.env.ONLY ? "-zoom" : "") + ".png"), { cols: process.env.ONLY ? 4 : states.length, scale: +(process.env.SCALE || 4) })
  const g = []
  for (let i = 0; i < 18; i++) {
    const st = { t: i / 8, wall: i / 8, mood: "chill", reaction: "pet", reactT: i / 8, season: "party", motion: "full", landT: -1, lookX: 0, lookY: 0 }
    const sc = S.scene(st, FX, SEASON)
    const layers = [{ rows: sc.shadow, x: 2, y: shadowY }, { rows: sc.rows, x: sc.x, y: sc.y, palette: PAL }]
    for (const f of sc.fx) layers.push({ rows: f.rows, x: f.x, y: f.y, opacity: f.op, palette: P.fx(f.c) })
    g.push({ layers })
  }
  P.gif(g, path.join(out, pet + "-party-pet.gif"), { delay: 12 })
}

// ---- key-style pets: a list of states, each (season) -> { rows, x, y, layers? }
function keyPet(pet, states, gifState) {
  const frames = []
  for (const season of SEASONS) for (const st of states) {
    const f = st.make(season, -1)
    check(pet, (season || "none") + "/" + st.label, f.rows, season, f.h || 38)
    frames.push({ label: (season || "-") + " " + st.label, layers: (f.under || []).concat([{ rows: f.rows, x: f.x || 0, y: f.y || 0, palette: PAL }]).concat(f.over || []) })
  }
  P.sheet(process.env.ONLY ? frames.filter(f => f.label.includes(process.env.ONLY)) : frames, path.join(out, pet + "-seasons" + (process.env.ONLY ? "-zoom" : "") + ".png"), { cols: process.env.ONLY ? 4 : states.length, scale: +(process.env.SCALE || 4) })
  const g = []
  for (let i = 0; i < 18; i++) {
    const f = gifState.make("party", i < 16 ? i / 16 : -1, i)
    g.push({ layers: (f.under || []).concat([{ rows: f.rows, x: f.x || 0, y: f.y || 0, palette: PAL }]).concat(f.over || []) })
  }
  P.gif(g, path.join(out, pet + "-party-pet.gif"), { delay: 12 })
}

const pets = {
  axolotl: () => scenePet("axolotl", "plugins/fynnp.deskgames/Sprites.js", 35, [
    { label: "idle", mood: "idle" }, { label: "ready", mood: "ready" }, { label: "launch", mood: "launching", t: 1 },
    { label: "play", mood: "playing", t: 1 }, { label: "strain", mood: "playing", strain: 2, t: 1 }, { label: "report", mood: "report" },
    { label: "drag", mood: "ready", dragged: true, lean: 1 }, { label: "pet", mood: "ready", reaction: "pet", reactT: 0.5 }]),
  pigeon: () => {
    const S = L("plugins/fynnp.desknet/Sprites.js")
    // p fields as PixelRouter.qml: e lx ly b w f pf sq ln bl hx hy bag h
    const B = (o, pile, hop) => (season, conf) => {
      const p = Object.assign({ e: "open", lx: 0, ly: 0, b: "closed", w: "fold", f: "stand", pf: 0, sq: 0, ln: 0, bl: 1, hx: 0, hy: 0, bag: 0, h: "" }, o)
      const key = [p.e, p.lx, p.ly, p.b, p.w, p.f, p.pf, p.sq, p.ln, p.bl, p.hx, p.hy, p.bag, p.h, season, conf >= 0 ? String(conf) : ""].join("|")
      return { rows: S.pigeon(key, SEASON), y: hop || 0, under: [{ rows: S.ground("1|0|" + season, SEASON), palette: PAL }],
        over: pile ? [{ rows: S.front(pile), palette: PAL }] : [] }
    }
    keyPet("pigeon", [
      { label: "sleep", make: B({ e: "sleep", b: "tuck", pf: 1, bl: 0 }) }, { label: "calm", make: B({}) },
      { label: "coo", make: B({ e: "happy", b: "coo", bag: 1 }) }, { label: "fly", make: B({ w: "up", f: "tuck", bag: 3 }, 0, -3) },
      { label: "heavy", make: B({ e: "strain", b: "open", bag: 3, bl: 2 }, 1) }, { label: "offline", make: B({ e: "worried", w: "hold", h: "map" }) },
      { label: "dangle", make: B({ e: "wide", b: "open", f: "dangle", w: "mid", ln: 1 }) }, { label: "squish", make: B({ sq: 3, e: "happy" }) }],
      { make: B({ e: "happy", b: "coo" }) })
  },
  dog: () => {
    const S = L("plugins/fynnp.deskdisk/Sprites.js")
    // p fields as PixelDisk.qml pose(): e lx ly m p g ea t c sq ln bl hx hy | sh ho mo pi
    const D = (o, gr) => (season, conf) => {
      const p = Object.assign({ e: "open", lx: 0, ly: 0, m: "smile", p: "stand", g: "stand", ea: "flop", t: "up", c: "", sq: 0, ln: 0, bl: 1, hx: 0, hy: 0, hop: 0 }, o)
      const key = [p.e, p.lx, p.ly, p.m, p.p, p.g, p.ea, p.t, p.c, p.sq, p.ln, p.bl, p.hx, p.hy, season, conf >= 0 ? String(conf) : ""].join("|")
      const gk = (gr || [1, 0, 0, 0]).concat([season]).join("|")
      return { rows: S.dog(key, SEASON), y: p.hop, under: [{ rows: S.ground(gk, SEASON), x: 0, y: 0, palette: PAL }],
        over: [{ rows: S.front(gk), x: 0, y: 0, palette: PAL }] }
    }
    keyPet("dog", [
      { label: "sleep", make: D({ p: "curl", e: "sleep", m: "none", t: "curl", bl: 0 }, [0, 0, 4, 0]) },
      { label: "calm", make: D({}) }, { label: "wag", make: D({ e: "happy", m: "open", t: "wag1", ea: "perk" }) },
      { label: "dig", make: D({ p: "dig", g: "dig1", ly: 1, m: "open", t: "wag2" }, [1, 1, 2, 0]) },
      { label: "bone", make: D({ c: "bone", e: "happy", g: "walk1", ea: "perk" }, [1, 1, 3, 0]) },
      { label: "frantic", make: D({ p: "dig", g: "dig1", e: "strain", m: "pant", ea: "flap1", bl: 2 }, [1, 1, 5, 0]) },
      { label: "dangle", make: D({ p: "dangle", e: "wide", m: "wobble", ea: "down", ln: 1, g: "shake1" }, [2, 0, 0, 0]) },
      { label: "squish", make: D({ sq: 3, e: "happy", m: "omega" }) }],
      { make: D({ e: "happy", m: "open", t: "wag1", ea: "perk" }) })
  },
  cat: () => {
    const S = L("plugins/fynnp.deskaudio/Sprites.js")
    const C = (st0) => (season, conf, i) => {
      const st = Object.assign({ mode: "idle", t: 0, tier: 0, amp: 0, blink: false, hov: false, lx: 0, ly: 0, fid: "", ft: 0, rea: "", rt: 0,
        drag: false, lean: 0, lt: -1, nb: "", zp: 0, season, motion: "full" }, st0)
      if (conf >= 0) { st.rea = "pet"; st.rt = i; st.t = i }
      const sc = S.scene(st)
      return { rows: S.rows(sc.key, SEASON), x: sc.dx }
    }
    keyPet("cat", [
      { label: "sleep", make: C({ mode: "sleep" }) }, { label: "idle", make: C({}) }, { label: "dance", make: C({ mode: "dance", t: 6, tier: 1, amp: 1 }) },
      { label: "bang", make: C({ mode: "dance", t: 10, tier: 4, amp: 3 }) }, { label: "huff", make: C({ rea: "annoyed", rt: 10 }) },
      { label: "squish", make: C({ rea: "squish", rt: 2 }) }, { label: "dangle", make: C({ drag: true, lean: 1 }) }, { label: "pet", make: C({ rea: "pet", rt: 3 }) }],
      { make: C({}) })
  },
  hamster: () => {
    const S = L("plugins/fynnp.deskmem/Sprites.js")
    const H = (o, x, y) => (season, conf) => ({ rows: S.hamster(Object.assign({ acc: season, conf }, o), SEASON), x: x || 0, y: y || 0 })
    const states = [
      { label: "sleep", make: H({ pose: "ball", breath: 1 }) },
      { label: "calm", make: H({}) },
      { label: "nibble", make: H({ paws: "hold", item: "seed", mouth: "chew" }) },
      { label: "busy", make: H({ cheek: 2, item: "chip" }) },
      { label: "strain", make: H({ cheek: 4, pile: 3, paws: "cheeks", eyes: "strain", mouth: "teeth" }) },
      { label: "squish", make: H({ pose: "squish", eyes: "happy" }) },
      { label: "dangle", make: H({ pose: "dangle", eyes: "wide", paws: "cheeks", cheek: 1, lean: 1 }, 0, -2) },
      { label: "pet", make: H({ pose: "wiggle", eyes: "squint", mouth: "open" }) }]
    keyPet("hamster", states, { make: (season, conf) => ({ rows: S.hamster({ acc: season, conf, eyes: "squint", mouth: "open" }, SEASON) }) })
  },
  penguin: () => scenePet("penguin", "plugins/fynnp.desksys/Sprites.js", 35, [
    { label: "idle", mood: "idle" }, { label: "chill", mood: "chill" }, { label: "work", mood: "work", t: 1 },
    { label: "load", mood: "load", t: 1 }, { label: "hot", mood: "hot", t: 6 }, { label: "pet", mood: "chill", reaction: "pet", reactT: 0.5 },
    { label: "drag", mood: "chill", dragged: true, lean: 1 }, { label: "groove", mood: "chill", grooving: true, beat: 0 }]),
}
for (const k of Object.keys(pets)) if (!want.length || want.includes(k)) { pets[k](); console.log("ok", k) }
console.log(problems ? problems + " problem(s)" : "no problems", "->", out)
process.exit(problems ? 1 : 0)
