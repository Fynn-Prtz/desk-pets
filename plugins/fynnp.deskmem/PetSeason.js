.pragma library

// PetSeason: date -> seasonal accessory key, plus the shared accessory shapes
// (hats, confetti) and colours every desk pet draws its seasonal outfit with.
// Canonical copy: shared/PetSeason.js -- copy verbatim into each plugin.
//
//   accessory(date, birthday) -> "xmas"   Dec 1-26
//                                "party"  Dec 31, Jan 1 and the birthday
//                                "spooky" October
//                                ""       otherwise
//   config(raw shell.json text) -> { on, birthday }   ("seasons" and
//                                "birthday" on the fynnp.desklayout entry)
//   palette(bg, Qt.rgba) -> extra palette keys (uppercase, see COLORS)
//   hat(kind, w, h, tilt) -> { rows, ax, ay }  hat sprite, anchor = brim centre
//                                (ax) on its bottom row (ay); stamp it so the
//                                anchor lands on the pet's head top.
//   confetti(seed, n, x0, y0, x1, y1, fall) -> [[x, y, key], ...]
//
// Each pet decides what to wear in character (CAST.md); this file only holds
// what several pets share. Pure JS: the cards (via PetCalendar.qml), the pets
// and the node previews all call the same functions.

// ---------------------------------------------------------------- dates

function pad2(n) { return (n < 10 ? "0" : "") + n }

// "MM-DD" (also accepts "M-D", "MM/DD", "--MM-DD") -> "MM-DD" or "".
function parseBirthday(s) {
  if (typeof s !== "string") return ""
  var m = /^-*\s*(\d{1,2})[-\/.](\d{1,2})\s*$/.exec(s)
  if (!m) return ""
  var mo = parseInt(m[1], 10), d = parseInt(m[2], 10)
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return ""
  return pad2(mo) + "-" + pad2(d)
}

function accessory(date, birthday) {
  var mo = date.getMonth() + 1, d = date.getDate()
  var md = pad2(mo) + "-" + pad2(d)
  if (birthday && md === birthday) return "party"
  if ((mo === 12 && d === 31) || (mo === 1 && d === 1)) return "party"
  if (mo === 12 && d <= 26) return "xmas"
  if (mo === 10) return "spooky"
  return ""
}

// Reads the switch and the birthday from the fynnp.desklayout entry.
function config(raw) {
  var cfg = null
  try { cfg = JSON.parse(raw) } catch (e) { return null }
  var list = cfg && Array.isArray(cfg.plugins) ? cfg.plugins : []
  var entry = {}
  for (var i = 0; i < list.length; i++)
    if (list[i] && list[i].id === "fynnp.desklayout") { entry = list[i]; break }
  return { on: entry.seasons !== false, birthday: parseBirthday(entry.birthday) }
}

// ---------------------------------------------------------------- colours
//
// Seasons need colours a theme doesn't have (Santa red, holly green, pumpkin
// orange), so they are fixed and only nudged 12 % toward the theme background
// to sit in it. Light key / shade key pairs:
//   R/M red · W/V white fur · G/J green · O/U orange · Q/Z witch purple
//   Y/T gold (glow, star, buckle) · C/A party cyan · F/I party pink

var COLORS = {
  "R": "#d9463e", "M": "#9a2b2b",
  "W": "#f3f0ea", "V": "#c4c3cf",
  "G": "#3f9d55", "J": "#286b3b",
  "O": "#ef8c2d", "U": "#b2581c",
  "Q": "#7550b0", "Z": "#47307a",
  "Y": "#f7d058", "T": "#c7962c",
  "C": "#4cc6dc", "A": "#2f8ea6",
  "F": "#f070b0", "I": "#b84a83"
}
var SHADE = { "R": "M", "W": "V", "G": "J", "O": "U", "Q": "Z", "Y": "T", "C": "A", "F": "I" }

function palette(bg, rgba) {
  var out = {}
  var br = bg ? bg.r : 0, bgG = bg ? bg.g : 0, bb = bg ? bg.b : 0
  for (var k in COLORS) {
    var h = COLORS[k]
    var r = parseInt(h.substr(1, 2), 16) / 255, g = parseInt(h.substr(3, 2), 16) / 255, b = parseInt(h.substr(5, 2), 16) / 255
    out[k] = rgba(r * 0.88 + br * 0.12, g * 0.88 + bgG * 0.12, b * 0.88 + bb * 0.12, 1)
  }
  return out
}

// ---------------------------------------------------------------- shapes

function segDist(pts, px, py) {
  var best = 1e9, total = 0, acc = 0, at = 0
  for (var i = 0; i + 1 < pts.length; i++) total += Math.sqrt(Math.pow(pts[i + 1][0] - pts[i][0], 2) + Math.pow(pts[i + 1][1] - pts[i][1], 2))
  for (var j = 0; j + 1 < pts.length; j++) {
    var a = pts[j], b = pts[j + 1]
    var vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy
    var t = l2 > 0 ? Math.max(0, Math.min(1, ((px - a[0]) * vx + (py - a[1]) * vy) / l2)) : 0
    var ex = a[0] + vx * t - px, ey = a[1] + vy * t - py
    var d = ex * ex + ey * ey
    if (d < best) { best = d; at = acc + Math.sqrt(l2) * t }
    acc += Math.sqrt(l2)
  }
  return [Math.sqrt(best), total > 0 ? at / total : 0]
}

// A hat is built on a scratch grid from parts (back to front), each part a
// mask + fill, every part ringed with outline "o"; then cropped.
var GW = 30, GH = 22

function scratch() {
  var g = []
  for (var y = 0; y < GH; y++) { var r = []; for (var x = 0; x < GW; x++) r.push("."); g.push(r) }
  return g
}

function part(g, mask, fill) {
  var inside = []
  for (var y = 0; y < GH; y++) { var r = []; for (var x = 0; x < GW; x++) r.push(!!mask(x + 0.5, y + 0.5)); inside.push(r) }
  function IN(x, y) { return y >= 0 && y < GH && x >= 0 && x < GW && inside[y][x] }
  for (var y2 = 0; y2 < GH; y2++)
    for (var x2 = 0; x2 < GW; x2++) {
      if (inside[y2][x2]) { g[y2][x2] = fill(x2, y2, IN); continue }
      for (var dy = -1; dy <= 1; dy++)
        for (var dx = -1; dx <= 1; dx++)
          if (IN(x2 + dx, y2 + dy)) { g[y2][x2] = "o"; dy = 2; break }
    }
}

// Top-lit two-tone fill: shade key on the bottom / right rim.
function lit(key) {
  return function(x, y, IN) {
    if (!IN(x, y + 1) || !IN(x + 1, y)) return SHADE[key] || key
    return key
  }
}

function crop(g, bx, by) {
  var x0 = GW, x1 = -1, y0 = GH, y1 = -1
  for (var y = 0; y < GH; y++) for (var x = 0; x < GW; x++) if (g[y][x] !== ".") {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y)
  }
  var rows = []
  for (var y2 = y0; y2 <= y1; y2++) rows.push(g[y2].slice(x0, x1 + 1).join(""))
  return { rows: rows, ax: bx - x0, ay: by - y0 }
}

// kind: "santa" (floppy, white brim + pompom), "party" (striped cone),
//       "witch" (wide brim, bent tip, gold buckle), "night" (floppy theme-
//       coloured nightcap: b/h/n stripes, l pompom; used by day-night)
// w: brim width in cells (5..15); h: rows above the brim (3..9; the canvas
// is only 38 rows, so floppy hats spread sideways instead of up); tilt -1 /
// 0 / 1: where the tip leans or flops. Memoised.
var hatCache = {}
function hat(kind, w, h, tilt) {
  var key = kind + "|" + w + "|" + h + "|" + tilt
  if (hatCache[key]) return hatCache[key]
  var g = scratch()
  var bx = GW / 2, by = GH - 3        // brim bottom row (cells), centre column
  var hw = w / 2
  var brimTop = by - 1                // brim = rows by-1 .. by
  var res
  if (kind === "santa" || kind === "night") {
    var flop = tilt === 0 ? 1 : tilt
    var ct = brimTop - h + 0.5        // crown top
    var tip = [bx + flop * (hw + 1.2), brimTop + 1.6]
    var spine = [[bx - flop * 0.6, brimTop - 0.3], [bx + flop * hw * 0.35, ct + 0.6], [bx + flop * (hw + 0.2), ct + h * 0.55], tip]
    part(g, function(x, y) {
      var s = segDist(spine, x, y)
      if (y > brimTop && flop * (x - bx) < hw + 0.3) return false   // no crown under the brim
      return s[0] < (hw - 0.5) * Math.pow(1 - s[1], 0.7) + 0.5
    }, kind === "santa" ? lit("R") : function(x, y, IN) {
      if (!IN(x, y + 1) || !IN(x + 1, y)) return "n"
      return (Math.floor((x - y) / 2) % 2 === 0) ? "b" : "h"
    })
    var fur = kind === "santa" ? "W" : "l", furD = kind === "santa" ? "V" : "w"
    part(g, function(x, y) { return y > brimTop && y < by + 1 && Math.abs(x - bx) < hw + 0.5 },
      function(x, y, IN) { return !IN(x, y + 1) ? furD : fur })
    part(g, function(x, y) { var dx = x - tip[0], dy = y - tip[1]; return dx * dx + dy * dy <= 1.7 },
      function(x, y, IN) { return !IN(x, y + 1) || !IN(x + 1, y) ? furD : fur })
    res = crop(g, bx, by)
  } else if (kind === "party") {
    var top = [bx + tilt * 1.2, by - h - 0.2]
    part(g, function(x, y) {
      if (y > by + 0.9 || y < top[1] + 0.6) return false
      var f = (by + 1 - y) / (by + 1 - top[1])
      var cx = bx + (top[0] - bx) * f
      return Math.abs(x - cx) < hw * (1 - f) + 0.3
    }, function(x, y, IN) {
      var k = ((Math.floor((y * 2 - x + 60) / 3)) % 2 === 0) ? "F" : "C"
      return (!IN(x + 1, y) || !IN(x, y + 1)) ? SHADE[k] : k
    })
    part(g, function(x, y) { var dx = x - top[0], dy = y - top[1]; return dx * dx + dy * dy <= 1.3 },
      function(x, y, IN) { return !IN(x, y + 1) ? "T" : "Y" })
    res = crop(g, bx, by)
  } else if (kind === "witch") {
    var wt = tilt === 0 ? 1 : tilt
    var ctop = brimTop - h - 0.4
    part(g, function(x, y) {
      if (y > brimTop || y < ctop + 0.5) return false
      var f = (brimTop - y) / (brimTop - ctop)          // 0 at the brim .. 1 at the tip
      var cx = bx + wt * (f > 0.55 ? Math.pow((f - 0.55) / 0.45, 1.5) * 2.6 : 0)
      return Math.abs(x - cx) < hw * 0.72 * (1 - f) + 0.55
    }, lit("Q"))
    for (var bxx = 0; bxx < GW; bxx++) {
      var byy = brimTop - 2
      if (g[byy][bxx] === "Q" || g[byy][bxx] === "Z") g[byy][bxx] = Math.abs(bxx + 0.5 - bx) < 1.1 ? "Y" : "O"
    }
    part(g, function(x, y) { var dx = (x - bx) / (hw + 2.2), dy = (y - by) / 1.05; return dx * dx + dy * dy <= 1 },
      function(x, y, IN) { return !IN(x, y + 1) ? "Z" : "Q" })
    res = crop(g, bx, by)
  } else {
    res = { rows: [], ax: 0, ay: 0 }
  }
  hatCache[key] = res
  return res
}

// Stamp a hat into a pet grid through the pet's own put(x, y, c), anchor on
// (x, y); skips "." cells. The hat is pushed down (onto the head) rather
// than cut off by the canvas top. Returns the row the anchor landed on.
function stampHat(put, h, x, y) {
  y = Math.max(y, h.ay)
  for (var r = 0; r < h.rows.length; r++) {
    var row = h.rows[r]
    for (var c = 0; c < row.length; c++) {
      var ch = row.charAt(c)
      if (ch !== ".") put(x - h.ax + c, y - h.ay + r, ch)
    }
  }
  return y
}

// ---------------------------------------------------------------- confetti
//
// n pieces in the box x0..x1, y0..y1. fall < 0: lying still (floor
// specks); fall 0..1: a burst drifting down through the box (0 = top).
// Deterministic from seed, so frames memoise.
var CONF = ["F", "Y", "C", "G", "R", "W"]
function rnd(i) { var s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s) }
function confetti(seed, n, x0, y0, x1, y1, fall) {
  var out = []
  for (var i = 0; i < n; i++) {
    var rx = rnd(seed * 31 + i), ry = rnd(seed * 17 + i * 7), rk = rnd(seed + i * 13)
    var x = x0 + Math.floor(rx * (x1 - x0 + 1))
    var y
    if (fall < 0) y = y0 + Math.floor(ry * (y1 - y0 + 1))
    else {
      var p = (fall * 1.3 + ry * 0.6) - 0.3
      if (p < 0 || p > 1) continue
      y = y0 + Math.floor(p * (y1 - y0))
      x += Math.round(Math.sin((p + rx) * 9) * 1.2)
    }
    out.push([x, y, CONF[Math.floor(rk * CONF.length)]])
  }
  return out
}
