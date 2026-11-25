// pet-preview: render desk-pet sprites to PNG contact sheets and animated GIFs
// with the live Omarchy theme, so sprite work can be judged without touching
// the desktop. Needs node + ImageMagick (`magick`).
//
//   const P = require("/home/fynnp/src/desk-pets/tools/pet-preview.js")
//   const S = P.load("plugins/fynnp.desksys/Sprites.js")   // a .pragma library file
//   const FX = P.load("shared/PetFx.js")
//   const frame = { label: "idle", layers: [
//     { rows: S.buddy("open", "flat"), x: 4, y: 8 },                 // cells, pet palette
//     { rows: FX.heart, x: 30, y: 0, palette: P.fx("p") } ] }        // fx in a palette key's colour
//   P.sheet([frame, …], "/tmp/x.png", { w: 44, h: 38, scale: 4 })    // labelled grid
//   P.gif([frame, …], "/tmp/x.gif", { w: 44, h: 38, scale: 4, delay: 25 })  // delay in 1/100 s
//
// A layer's `palette` maps sprite keys to colours: "#rrggbb", a PetColors key
// ("b", "p", "r" …) or [r,g,b,a]. Unknown keys and "." are transparent.
// Cells are drawn at `scale` screen px each (the real pet uses px 2; scale 4 = 2x zoom).
// The background is the card glass over a dark wallpaper, close to the real look.

const fs = require("fs")
const os = require("os")
const path = require("path")
const { execFileSync } = require("child_process")

function hex(h) {
  h = h.replace("#", "")
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1]
}

function readTheme() {
  const t = { accent: "#7aa2f7", background: "#1a1b26", foreground: "#a9b1d6", urgent: "#a55555" }
  try {
    const txt = fs.readFileSync(path.join(os.homedir(), ".local/state/omarchy/current/theme/colors.toml"), "utf8")
    for (const line of txt.split("\n")) {
      const m = /^\s*(accent|background|foreground|urgent)\s*=\s*"(#[0-9a-fA-F]{6})"/.exec(line)
      if (m) t[m[1]] = m[2]
    }
  } catch (e) {}
  return t
}

const theme = readTheme()
const FG = hex(theme.foreground), BG = hex(theme.background), AC = hex(theme.accent), UR = hex(theme.urgent)

// Qt.tint(base, alpha(over, a)) = base*(1-a) + over*a
function tint(base, over, a) { return [0, 1, 2].map(i => Math.round(base[i] * (1 - a) + over[i] * a)).concat([1]) }

// Mirrors shared/PetColors.qml.
const COLORS = {
  o: FG, b: AC,
  h: tint(AC, FG, 0.45), n: tint(AC, BG, 0.2), d: tint(AC, BG, 0.45),
  w: tint(AC, FG, 0.7), l: tint(AC, FG, 0.85), p: tint(AC, UR, 0.55),
  e: BG, x: FG, s: BG, g: tint(BG, AC, 0.18), f: FG,
  r: UR, k: tint(UR, BG, 0.35), t: FG.slice(0, 3).concat([0.08])
}

function color(v) {
  if (Array.isArray(v)) return v.length === 3 ? v.concat([1]) : v
  if (typeof v === "string" && v[0] === "#") return hex(v)
  if (typeof v === "string" && COLORS[v]) return COLORS[v]
  return null
}

// Same as PetColors.fx(c): "o" = c, "h" = c lightened toward fg, "e" = ink.
function fx(key) {
  const c = color(key)
  return { o: c, h: tint(c, FG, 0.6), e: BG }
}

// Load a QML `.pragma library` JS file and return its top-level vars/functions.
function load(file) {
  const src = fs.readFileSync(path.resolve(file), "utf8").replace(/^\s*\.pragma library\s*$/m, "")
  const names = new Set()
  for (const m of src.matchAll(/^(?:var|function)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1])
  const body = src + "\nreturn {" + [...names].map(n => n + ": typeof " + n + " === 'undefined' ? undefined : " + n).join(",") + "}"
  return new Function("Qt", body)({})
}

// Glass card over a dark scene, like the real card (popups bg @ 0.5).
const BACK = tint(tint([40, 28, 60, 1], BG, 0.5), FG, 0.0)

function render(frame, w, h, scale) {
  const W = w * scale, H = h * scale
  const px = new Float32Array(W * H * 3)
  for (let i = 0; i < W * H; i++) { px[i * 3] = BACK[0]; px[i * 3 + 1] = BACK[1]; px[i * 3 + 2] = BACK[2] }
  for (const L of frame.layers || []) {
    const rows = L.rows || []
    const pal = {}
    const src = L.palette || {}
    for (const k of Object.keys(COLORS)) pal[k] = COLORS[k]
    for (const k of Object.keys(src)) pal[k] = color(src[k])
    const op = L.opacity === undefined ? 1 : L.opacity
    const ox = L.x || 0, oy = L.y || 0
    // L.px: the layer's cell size in pet cells (1 = same grid; 0.5 for 1-px fx is not supported).
    const lp = L.px || 1
    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < rows[r].length; c++) {
        const col = pal[rows[r][c]]
        if (!col || rows[r][c] === ".") continue
        const a = col[3] * op
        for (let yy = 0; yy < lp * scale; yy++) {
          for (let xx = 0; xx < lp * scale; xx++) {
            const X = Math.round((ox + c * lp) * scale) + xx, Y = Math.round((oy + r * lp) * scale) + yy
            if (X < 0 || Y < 0 || X >= W || Y >= H) continue
            const i = (Y * W + X) * 3
            px[i] = px[i] * (1 - a) + col[0] * a
            px[i + 1] = px[i + 1] * (1 - a) + col[1] * a
            px[i + 2] = px[i + 2] * (1 - a) + col[2] * a
          }
        }
      }
    }
  }
  const buf = Buffer.alloc(W * H * 3)
  for (let i = 0; i < buf.length; i++) buf[i] = Math.max(0, Math.min(255, Math.round(px[i])))
  return Buffer.concat([Buffer.from(`P6 ${W} ${H} 255\n`), buf])
}

function tmpdir() { return fs.mkdtempSync(path.join(os.tmpdir(), "pet-preview-")) }

// Labelled grid of frames.
function sheet(frames, out, opt) {
  opt = Object.assign({ w: 44, h: 38, scale: 4, cols: 6 }, opt || {})
  const dir = tmpdir()
  const files = frames.map((f, i) => {
    const p = path.join(dir, `f${String(i).padStart(3, "0")}.ppm`)
    fs.writeFileSync(p, render(f, opt.w, opt.h, opt.scale))
    return p
  })
  const args = ["montage"]
  frames.forEach((f, i) => args.push("-label", f.label || String(i), files[i]))
  args.push("-tile", `${opt.cols}x`, "-geometry", "+6+6", "-background", "#111118", "-fill", "#dddddd", "-pointsize", "14", out)
  execFileSync("magick", args)
  fs.rmSync(dir, { recursive: true, force: true })
  return out
}

// Animated GIF; frame.delay (1/100 s) overrides opt.delay.
function gif(frames, out, opt) {
  opt = Object.assign({ w: 44, h: 38, scale: 4, delay: 25 }, opt || {})
  const dir = tmpdir()
  const args = ["-loop", "0"]
  frames.forEach((f, i) => {
    const p = path.join(dir, `f${String(i).padStart(3, "0")}.ppm`)
    fs.writeFileSync(p, render(f, opt.w, opt.h, opt.scale))
    args.push("-delay", String(f.delay || opt.delay), p)
  })
  args.push(out)
  execFileSync("magick", args)
  fs.rmSync(dir, { recursive: true, force: true })
  return out
}

module.exports = { load, sheet, gif, fx, theme, COLORS }
