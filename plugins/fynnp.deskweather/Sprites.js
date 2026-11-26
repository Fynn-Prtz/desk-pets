.pragma library

// Desk Weather pet: a little tree frog that dresses for the weather. Squat
// round body with a pale belly, a wide head with two eye domes on top, a big
// frog smile, a throat sac that puffs up when it croaks, folded haunches and
// splayed toes. Accessories follow the forecast: an umbrella held over the
// shoulder (rain, storm; it flips inside out in a storm), sunglasses (sun,
// heat) and a striped scarf (cold, snow, wind). In rain it jumps in a puddle.
// Drawn at px 2 on the shared 44x38 pet canvas (docs/PETS.md), built from
// shapes with top-lit shading and memoised per pose key like the other pets.
//
// Palette keys (PetColors): o outline, b body, h highlight, n shade, d dark
// (spots, umbrella ribs), w belly / chin, l lightest (throat sac, glints),
// p blush / tongue / umbrella, k umbrella shade, e ink, x glint / lens shine,
// r scarf, g puddle water, t shadow.
//
// scene(state, PetFx) -> body rows + offset + floor shadow + up to six
//   effects + `sky` (a full-canvas weather layer: rain, snow or fog, memoised
//   per phase, already masked by the umbrella).
//
// Head anchor (for hats): head ellipse cx 21.5, cy 19.5 (+2*squash - lift),
//   rx 12.5 ry 6.5 -> head top y13 between the eyes; the eye domes (centres
//   x15.5 / x27.5, y14.5, r4.4) rise to y10, x11..32. A hat brim rests on the
//   dome tops at y10 (centre x21.5); the umbrella canopy sits above (y1..12).

var W = 44
var H = 36
var FX_SLOTS = 6

// ---------------------------------------------------------------- shapes

function grid() {
  var g = []
  for (var y = 0; y < H; y++) {
    var r = []
    for (var x = 0; x < W; x++) r.push(".")
    g.push(r)
  }
  return g
}

function inDisc(x, y, cx, cy, r) {
  var dx = x + 0.5 - cx, dy = y + 0.5 - cy
  return dx * dx + dy * dy <= r * r
}

function inEllipse(x, y, cx, cy, rx, ry) {
  var dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry
  return dx * dx + dy * dy <= 1
}

// Distance from the cell centre to a polyline (array of [x, y]).
function segDist(pts, x, y) {
  var px = x + 0.5, py = y + 0.5, best = 1e9
  for (var i = 0; i + 1 < pts.length; i++) {
    var a = pts[i], b = pts[i + 1]
    var vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy
    var t = l2 > 0 ? Math.max(0, Math.min(1, ((px - a[0]) * vx + (py - a[1]) * vy) / l2)) : 0
    var ex = a[0] + vx * t - px, ey = a[1] + vy * t - py
    best = Math.min(best, ex * ex + ey * ey)
  }
  return Math.sqrt(best)
}

// Fill a mask and ring it with outline cells (8-neighbourhood), back to front.
function layer(g, mask, fill) {
  var inside = []
  for (var y = 0; y < H; y++) {
    var r = []
    for (var x = 0; x < W; x++) r.push(mask(x, y))
    inside.push(r)
  }
  for (var y2 = 0; y2 < H; y2++) {
    for (var x2 = 0; x2 < W; x2++) {
      if (inside[y2][x2]) { g[y2][x2] = typeof fill === "function" ? fill(x2, y2, inside) : fill; continue }
      var edge = false
      for (var dy = -1; dy <= 1 && !edge; dy++)
        for (var dx = -1; dx <= 1 && !edge; dx++) {
          var yy = y2 + dy, xx = x2 + dx
          if (yy >= 0 && yy < H && xx >= 0 && xx < W && inside[yy][xx]) edge = true
        }
      if (edge) g[y2][x2] = "o"
    }
  }
  return inside
}

function IN(inside, x, y) { return y >= 0 && y < H && x >= 0 && x < W && inside[y][x] }

function put(g, x, y, c) { if (y >= 0 && y < H && x >= 0 && x < W) g[y][x] = c }
function putIf(g, x, y, c, only) { if (y >= 0 && y < H && x >= 0 && x < W && only.indexOf(g[y][x]) >= 0) g[y][x] = c }

function stamp(g, x, y, rows, map) {
  for (var r = 0; r < rows.length; r++)
    for (var c = 0; c < rows[r].length; c++) {
      var ch = rows[r].charAt(c)
      if (ch === ".") continue
      put(g, x + c, y + r, map && map[ch] ? map[ch] : ch)
    }
}

function mirrorRows(rows) {
  var out = []
  for (var i = 0; i < rows.length; i++) out.push(rows[i].split("").reverse().join(""))
  return out
}

function topLit(x, y, inside) {
  if (!IN(inside, x, y - 1)) return "h"
  if (!IN(inside, x, y + 1)) return "n"
  return "b"
}

// ---------------------------------------------------------------- face
//
// Eyes sit in the two domes ("E" ink, "X" glint, "W" white of a wide eye).
// Names ending in L are drawn as is on the left eye and mirrored on the right.

var EYES = {
  open:    [".EEE.", "EXEEE", "EEEEE", "EEEEE", ".EEE."],
  half:    [".....", "EEEEE", "EXEEE", ".EEE.", "....."],
  blink:   [".....", ".....", "EEEEE", ".....", "....."],
  sleep:   [".....", ".....", "E...E", ".EEE.", "....."],
  happy:   [".....", ".EEE.", "E...E", ".....", "....."],
  squintL: ["E....", ".EE..", "...E.", ".EE..", "E...."],
  strainL: ["EE...", ".EEE.", "...EE", ".EEE.", "EE..."],
  wide:    [".WWW.", "WWEWW", "WEEEW", "WWEWW", ".WWW."],
  worry:   [".....", ".EEE.", "EXEEE", "EEEEE", ".EEE."],
  angryL:  ["E....", "EEE..", "EXEEE", "EEEEE", ".EEE."],
  up:      [".EEE.", "EEXEE", "EEEEE", ".EEE.", "....."],
  sparkle: [".EEE.", "EXEEE", "EEEEE", "EEEXE", ".EEE."],
  dizzy:   [".EEE.", "E...E", "E.E.E", "E...E", ".EEE."],
  dizzyB:  [".EEE.", "E.E.E", "E...E", "E...E", ".EEE."]
}

var BROWS = {
  angry: ["EE...", "..EEE"],
  worry: ["..EEE", "EE..."],
  focus: [".....", "EEEE."]
}

// Mouths, centred under the eyes. The frog's signature is the wide smile.
var MOUTHS = {
  smile:  ["E.............E", ".EEEEEEEEEEEEE."],
  grin:   ["E.............E", ".EEEEEEEEEEEEE.", "....EPPPPPE...."],
  flat:   ["EEEEEEEEE"],
  o:      [".EE.", "E..E", ".EE."],
  yawn:   [".EEEE.", "EPPPPE", "EPPPPE", ".EEEE."],
  omega:  ["E....E.E....E", ".EEEE...EEEE."],
  wobble: [".E..E..E..E.", "E.EE.EE.EE.E"],
  grit:   ["EEEEEEEEE", "EXEXEXEXE", "EEEEEEEEE"],
  pout:   [".EEE.", "E...E"],
  chew:   ["E.EEEEE.E", ".E.....E."],
  pant:   ["E..........E", ".EEEEEEEEEE.", "....EPPE....", ".....PP....."],
  smug:   ["..............E", "EEEEEEEEEEEEEE."],
  tiny:   ["EEE"]
}

function drawFace(g, cx, eyeY, mouthY, face, dome) {
  var map = { "E": "e", "X": "x", "W": "x", "P": "p" }
  var eyes = face.eyes || "open", lx = face.lookX || 0, ly = face.lookY || 0
  var e = EYES[eyes] || EYES.open, eR = /L$/.test(eyes) ? mirrorRows(e) : e
  var ex = [Math.round(dome[0]) - 2 + lx, Math.round(dome[1]) - 2 + lx]
  if (!face.shades) {
    stamp(g, ex[0], eyeY + ly, e, map)
    stamp(g, ex[1], eyeY + ly, eR, map)
    if (face.brows && BROWS[face.brows]) {
      var b = BROWS[face.brows]
      stamp(g, ex[0], eyeY - 2, b, map)
      stamp(g, ex[1], eyeY - 2, mirrorRows(b), map)
    }
  }
  if (face.blush !== false) {
    stamp(g, Math.round(cx) - 11, mouthY, ["PPP"], map)
    stamp(g, Math.round(cx) + 8, mouthY, ["PPP"], map)
  }
  var m = MOUTHS[face.mouth || "smile"] || MOUTHS.smile
  stamp(g, Math.round(cx) - Math.floor(m[0].length / 2) - 1, mouthY, m, map)
}

// ---------------------------------------------------------------- accessories

// Umbrella canopy, rotated by `a` (radians, + = top leans left) around its
// rim centre (cx, cy): a half ellipse with a scalloped rim, panels and ribs.
// "flip" is blown inside out: a cup that opens upwards.
var UMB = {
  //      hand [x, y]        tilt    shaft  rx    ry
  up:    { hand: [23.0, 28.5], a: 0.00, len: 20.5, rx: 16.5, ry: 7.5 },
  tiltL: { hand: [23.0, 28.5], a: 0.10, len: 20.5, rx: 16.5, ry: 7.5 },
  tiltR: { hand: [23.0, 28.5], a: -0.10, len: 20.5, rx: 16.5, ry: 7.5 },
  tug:   { hand: [24.0, 27.5], a: -0.26, len: 20.5, rx: 15.5, ry: 7.0 },
  flip:  { hand: [24.0, 27.5], a: 0.08, len: 20.0, rx: 14.0, ry: 6.0, inv: true }
}

// Rim centre: from the hand up the shaft.
function umbAt(name, lift) {
  var u = UMB[name]
  var hx = u.hand[0], hy = u.hand[1] - (lift || 0)
  return { hand: [hx, hy], rim: [hx - Math.sin(u.a) * u.len, hy - Math.cos(u.a) * u.len], a: u.a, rx: u.rx, ry: u.ry, inv: u.inv }
}

function umbLocal(u, x, y) {
  var ca = Math.cos(u.a), sa = Math.sin(u.a)
  var dx = x + 0.5 - u.rim[0], dy = y + 0.5 - u.rim[1]
  // b along the rim (left -> right), a up the shaft
  return { b: dx * ca - dy * sa, a: -(dx * sa + dy * ca) }
}

function inCanopy(u, x, y) {
  var p = umbLocal(u, x, y)
  var nb = p.b / u.rx
  if (nb < -1 || nb > 1) return false
  if (u.inv) {
    // inside-out: a shallow cup, deepest at the tips
    var cup = u.ry * nb * nb
    return p.a >= -0.6 && p.a <= cup + 0.4
  }
  // scallops: the rim bulges down between the rib tips
  var scal = -0.9 * Math.abs(Math.sin(nb * Math.PI * 2.5))
  return p.a >= scal && nb * nb + (p.a / u.ry) * (p.a / u.ry) <= 1
}

function drawCanopy(g, u) {
  layer(g, function(x, y) { return inCanopy(u, x, y) }, function(x, y, inside) {
    var p = umbLocal(u, x, y)
    // panels between ribs that curve up to the tip (b normalised by the
    // canopy's half width at that height)
    var hw = u.inv ? 1 : Math.sqrt(Math.max(0.04, 1 - (p.a / u.ry) * (p.a / u.ry)))
    var q = (p.b / u.rx / hw + 1) * 2.5
    var panel = Math.max(0, Math.min(4, Math.floor(q)))
    var rib = Math.abs(q - Math.round(q)) < 0.22 && Math.round(q) > 0 && Math.round(q) < 5
    if (!IN(inside, x, y + 1)) return "k"
    if (rib && !u.inv) return "o"
    if (!IN(inside, x, y - 1) && !u.inv) return panel % 2 === 0 ? "l" : "x"
    return panel % 2 === 0 ? "p" : "l"
  })
  // ferrule on top
  var ca = Math.cos(u.a), sa = Math.sin(u.a)
  var tipA = u.inv ? 0.5 : u.ry + 1.0
  var tx = u.rim[0] - sa * tipA, ty = u.rim[1] - ca * tipA
  put(g, Math.floor(tx), Math.floor(ty), "o")
}

// Shaft from the rim centre down to the hand, with a J hook below the hand.
function drawShaft(g, u) {
  var pts = [[u.rim[0], u.rim[1] + 0.3], [u.hand[0], u.hand[1]]]
  for (var y = 0; y < H; y++)
    for (var x = 0; x < W; x++)
      if (segDist(pts, x, y) < 0.55 && g[y][x] !== "x") g[y][x] = "o"
}

// J hook of the handle, below the gripping hand.
function drawHook(g, u) {
  var hx = Math.round(u.hand[0]), hy = Math.round(u.hand[1])
  stamp(g, hx - 1, hy + 1, ["o", "o..o", ".oo."])
}

// Lowest canopy row per column (after the frame offset): rain stops there.
var rimCache = {}
function canopyRim(name) {
  if (rimCache[name]) return rimCache[name]
  var u = umbAt(name, 0), out = []
  for (var x = 0; x < W; x++) {
    var low = -99
    for (var y = 0; y < H; y++) if (inCanopy(u, x, y)) low = y
    out.push(low)
  }
  rimCache[name] = out
  return out
}

var GLASSES = [
  ".ooooooo.....ooooooo.",
  "ooxeeeeoooooooxeeeeoo",
  ".oexeeeo.....oexeeeo.",
  ".oeeeeeo.....oeeeeeo.",
  "..ooooo.......ooooo.."
]

// ---------------------------------------------------------------- body
//
// o: lift, sq (squash 0..2), legs (sit | jump | dangleA | dangleB | stompL |
//   stompR | flat), arms (rest | umb | wave | up | hips | out | flailA |
//   flailB | fanA | fanB | tuck), umb ("" | up | tiltL | tiltR | high | flip),
//   glasses (0 | 1 on | 2 pushed up), scarf ("" | hang | flapA | flapB),
//   puddle (0 none | 1 calm | 2 ripple | 3 splash), sac (0..2), tongue ("" |
//   side | up | pant), snow (snow on the domes), lean (-1/0/1), face.

var HANDS = {
  rest:   [[17.0, 33.0], [26.0, 33.0]],
  umb:    [[20.0, 29.5], [23.0, 28.5]],
  wave:   [[7.5, 21.0], [26.0, 33.0]],
  waveB:  [[6.0, 24.0], [26.0, 33.0]],
  up:     [[7.0, 21.0], [36.0, 21.0]],
  hips:   [[10.5, 29.0], [32.5, 29.0]],
  out:    [[6.5, 29.0], [36.5, 29.0]],
  flailA: [[5.5, 21.0], [37.5, 27.0]],
  flailB: [[5.5, 27.0], [37.5, 21.0]],
  fanA:   [[8.0, 20.5], [26.0, 33.0]],
  fanB:   [[9.5, 23.5], [26.0, 33.0]],
  tuck:   [[18.0, 31.0], [25.0, 31.0]]
}

function build(o) {
  var g = grid()
  var sq = o.sq || 0, lift = o.lift || 0
  var hcx = 21.5, hcy = 19.5 - lift + sq * 2, hrx = 12.5 + sq * 0.9, hry = 6.5 - sq * 0.7
  var domeY = hcy - 5 + sq * 0.5, dr = 4.4 - sq * 0.3
  var dome = [15.5 - sq * 0.5, 27.5 + sq * 0.5]
  var bcx = 21.5, bcy = 29.0 + sq * 0.5, brx = 10.0 + sq * 1.2, bry = 5.5 - sq * 0.5
  var legs = o.legs || "sit"
  var umbName = o.umb || ""
  var u = umbName ? umbAt(umbName, lift - sq) : null

  // Puddle (behind everything): dark water with a light rim and ripples.
  if (o.puddle) {
    var pr = o.puddle === 3 ? 21.0 : 19.5
    for (var py = 31; py < H; py++)
      for (var px = 0; px < W; px++) {
        if (!inEllipse(px, py, 21.5, 34.8, pr, 1.9)) continue
        g[py][px] = inEllipse(px, py, 21.5, 34.6, pr - 2.5, 1.4) ? "g" : "w"
      }
    var rip = o.puddle === 2 ? [[2, 35], [38, 35]] : o.puddle === 3 ? [[0, 34], [41, 34]] : [[4, 35], [36, 35]]
    for (var ri = 0; ri < rip.length; ri++) stamp(g, rip[ri][0], rip[ri][1], ["ll"])
  }

  // Umbrella behind the head: canopy, then the shaft (hidden where it passes
  // behind the head; the hand holds it out at the side).
  if (u) drawCanopy(g, u)

  // Haunches and long back feet.
  var thighs = [[12.0, 30.0], [31.0, 30.0]]
  var feet = [[7.5, 33.6], [35.5, 33.6]]
  if (legs === "stompL") { thighs[0][1] -= 1.5; feet[0] = [8.0, 32.0] }
  if (legs === "stompR") { thighs[1][1] -= 1.5; feet[1] = [35.0, 32.0] }
  if (legs === "flat") { thighs = [[10.5, 31.0], [32.5, 31.0]]; feet = [[5.0, 33.8], [38.0, 33.8]] }
  var jumping = legs === "jump" || legs === "dangleA" || legs === "dangleB"
  if (jumping) {
    // legs stretched out below the body
    var la = legs === "dangleA" ? 1 : legs === "dangleB" ? -1 : 0
    var lL = [[15.0, 30.0], [11.5, 32.5 + la], [13.0, 35.0 + la * 0.5]]
    var lR = [[28.0, 30.0], [31.5, 32.5 - la], [30.0, 35.0 - la * 0.5]]
    layer(g, function(x, y) { return segDist(lL, x, y) < 1.5 || segDist(lR, x, y) < 1.5 }, topLit)
    layer(g, function(x, y) {
      return inEllipse(x, y, 12.0, 35.2 + la * 0.5, 3.0, 1.0) || inEllipse(x, y, 31.0, 35.2 - la * 0.5, 3.0, 1.0)
    }, "n")
  }

  // Body with a pale belly.
  layer(g, function(x, y) { return inEllipse(x, y, bcx, bcy, brx, bry) }, function(x, y, inside) {
    if (inEllipse(x, y, bcx, bcy + 1.2, brx * 0.6, bry * 0.75)) return !IN(inside, x, y + 1) ? "n" : "w"
    if (!IN(inside, x, y - 1)) return "h"
    if (!IN(inside, x, y + 1)) return "n"
    if (!IN(inside, x + 1, y)) return "n"
    return "b"
  })

  if (!jumping) {
    layer(g, function(x, y) {
      return inEllipse(x, y, feet[0][0], feet[0][1], 4.2, 1.2) || inEllipse(x, y, feet[1][0], feet[1][1], 4.2, 1.2)
    }, function(x, y, inside) { return !IN(inside, x, y - 1) ? "b" : "n" })
    // splayed toe tips
    putIf(g, Math.round(feet[0][0] - 4.5), Math.round(feet[0][1]) - 1, "o", ".")
    putIf(g, Math.round(feet[1][0] + 4.0), Math.round(feet[1][1]) - 1, "o", ".")
    var thRx = legs === "flat" ? 5.8 : 5.0, thRy = legs === "flat" ? 3.0 : 3.8
    layer(g, function(x, y) {
      return inEllipse(x, y, thighs[0][0], thighs[0][1], thRx, thRy) || inEllipse(x, y, thighs[1][0], thighs[1][1], thRx, thRy)
    }, topLit)
    // stripes on the thighs
    putIf(g, Math.round(thighs[0][0]) - 2, Math.round(thighs[0][1]) - 1, "d", "b")
    putIf(g, Math.round(thighs[0][0]) - 1, Math.round(thighs[0][1]) - 1, "d", "b")
    putIf(g, Math.round(thighs[1][0]) + 1, Math.round(thighs[1][1]) - 1, "d", "b")
    putIf(g, Math.round(thighs[1][0]), Math.round(thighs[1][1]) - 1, "d", "b")
  }

  // Umbrella shaft: in front of the body, behind the head and the hand.
  if (u) drawShaft(g, u)

  // Front arms (thin) with round toe-pad hands.
  var armName = o.arms || "rest"
  if (sq > 1 && armName === "rest") armName = "out"
  var hands = HANDS[armName] || HANDS.rest
  if (u) hands = [hands[0], u.hand]
  var sh = [[16.0, 27.0 + sq], [27.0, 27.0 + sq]]
  layer(g, function(x, y) {
    for (var i = 0; i < 2; i++) {
      var hnd = hands[i]
      if (segDist([sh[i], hnd], x, y) < 0.95) return true
      if (inEllipse(x, y, hnd[0], hnd[1], 1.9, 1.3)) return true
    }
    return false
  }, topLit)
  for (var t = 0; t < 2; t++) {
    var hd = hands[t]
    if (hd[1] > 31) {
      putIf(g, Math.round(hd[0]) - 2, Math.round(hd[1]), "h", "bn")
      putIf(g, Math.round(hd[0]) + 1, Math.round(hd[1]), "h", "bn")
    }
  }

  // Head with eye domes (one silhouette), pale chin, a few spots.
  layer(g, function(x, y) {
    return inEllipse(x, y, hcx, hcy, hrx, hry) || inDisc(x, y, dome[0], domeY, dr) || inDisc(x, y, dome[1], domeY, dr)
  }, function(x, y, inside) {
    if (!IN(inside, x, y - 1)) return "h"
    if (inEllipse(x, y, hcx, hcy + 4.2, hrx * 0.62, 2.8) && y > hcy + 2) return !IN(inside, x, y + 1) ? "n" : "w"
    if (!IN(inside, x, y + 1)) return "n"
    if (!IN(inside, x + 1, y) || !IN(inside, x + 2, y)) return "n"
    return "b"
  })
  var top = Math.round(hcy - hry)
  putIf(g, 20, top + 1, "n", "b"); putIf(g, 23, top + 2, "n", "b")
  // dome shine
  putIf(g, Math.round(dome[0]) - 3, Math.round(domeY) - 2, "l", "bh")
  putIf(g, Math.round(dome[1]) - 3, Math.round(domeY) - 2, "l", "bh")
  if (o.snow) {
    stamp(g, Math.round(dome[0]) - 2, Math.round(domeY - dr) - 1, [".ll.", "llll"])
    stamp(g, Math.round(dome[1]) - 2, Math.round(domeY - dr) - 1, [".ll.", "llll"])
  }

  // Throat sac below the chin.
  var sac = o.sac || 0
  if (sac > 0) {
    var srx = sac === 1 ? 3.6 : 6.0, sry = sac === 1 ? 1.6 : 3.6
    var scy = hcy + hry + (sac === 2 ? 1.6 : -0.2)
    layer(g, function(x, y) { return inEllipse(x, y, hcx, scy, srx, sry) }, function(x, y, inside) {
      if (sac === 1) return !IN(inside, x, y + 1) ? "w" : "l"
      return !IN(inside, x, y + 1) ? "k" : "p"
    })
    if (sac === 2) { put(g, Math.round(hcx) - 3, Math.round(scy) - 1, "l"); put(g, Math.round(hcx) - 2, Math.round(scy) - 2, "l") }
  }

  // Face
  var face = o.face || {}
  var eyeY = Math.round(domeY) - 2
  var mouthY = Math.round(hcy) + 2 - (sq > 1 ? 1 : 0)
  face.shades = o.glasses === 1
  drawFace(g, hcx, eyeY, mouthY, face, dome)

  // Tongue: out to the side (fly), up (snowflake) or panting.
  if (o.tongue === "side" || o.tongue === "up") {
    var tip = o.tongue === "side" ? [40.0, 17.0] : [4.5, 8.5]
    var tg = [[o.tongue === "side" ? hcx + 4 : hcx - 5, mouthY + 0.5], tip]
    for (var ty = 0; ty < H; ty++)
      for (var tx = 0; tx < W; tx++)
        if (segDist(tg, tx, ty) < 0.6) g[ty][tx] = "p"
    layer(g, function(x, y) { return inDisc(x, y, tip[0], tip[1], 1.3) }, "p")
  }

  // Sunglasses across both domes.
  if (o.glasses) {
    var gy = o.glasses === 2 ? Math.round(domeY - dr) - 2 : eyeY - 1
    var gx = Math.round(dome[0]) - 5
    stamp(g, gx, gy, GLASSES)
  }

  // Scarf round the neck: red with light stripes, one end hanging or flapping.
  var scarf = o.scarf || ""
  if (scarf) {
    var ny = hcy + hry - 0.2
    var end = scarf === "flapA" ? [[14.0, ny + 0.5], [8.0, ny - 0.5], [3.0, ny + 0.5]]
      : scarf === "flapB" ? [[14.0, ny + 0.5], [8.5, ny + 1.5], [3.5, ny]]
      : [[27.0, ny + 0.5], [28.0, ny + 3.5], [28.5, ny + 6.5]]
    layer(g, function(x, y) {
      return inEllipse(x, y, hcx, ny, 9.6 + sq, 1.8) || segDist(end, x, y) < 1.3
    }, function(x, y, inside) {
      if (x % 3 === 0) return "w"
      return !IN(inside, x, y + 1) ? "k" : "r"
    })
    var e2 = end[2]
    stamp(g, Math.round(e2[0]) - 1, Math.round(e2[1]) + 1, scarf === "hang" ? ["r.r"] : ["r", ".", "r"])
  }

  if (u) drawHook(g, u)

  if (o.lean) {
    for (var y5 = 0; y5 < H; y5++) {
      var s = o.lean * Math.floor(Math.max(0, 30 - y5) / 10)
      if (!s) continue
      var row = g[y5], out = []
      for (var x5 = 0; x5 < W; x5++) { var src = x5 - s; out.push(src >= 0 && src < W ? row[src] : ".") }
      g[y5] = out
    }
  }

  var rows = []
  for (var y6 = 0; y6 < H; y6++) rows.push(g[y6].join(""))
  return rows
}

var cache = {}
var cacheSize = 0
function frame(o) {
  var f = o.face || {}
  var key = [o.lift || 0, o.sq || 0, o.legs || "", o.arms || "", o.umb || "", o.glasses || 0, o.scarf || "",
    o.puddle || 0, o.sac || 0, o.tongue || "", o.snow ? 1 : 0, o.lean || 0,
    [f.eyes, f.mouth, f.brows || "", f.blush === false ? 0 : 1, f.lookX || 0, f.lookY || 0].join(",")].join("|")
  var hit = cache[key]
  if (hit) return hit
  if (cacheSize > 500) { cache = {}; cacheSize = 0 }
  var rows = build(o)
  cache[key] = rows
  cacheSize++
  return rows
}

var shadow = [
  ["......tttttttttttttttttttttttttttttt....", ".........tttttttttttttttttttttttt......."],
  [".........tttttttttttttttttttttttt.......", "............tttttttttttttttttt.........."],
  ["............tttttttttttttttttt..........", "........................................"],
  ["........................................", "........................................"]
]

// ---------------------------------------------------------------- sky layer
//
// Full-canvas weather in front of the frog: rain streaks (slanted in a
// storm), snowflakes or drifting fog bands. Built per phase and memoised;
// rain stops at the umbrella (rim = lowest canopy row per column).

function hash(i) { var x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x) }

var skyCache = {}
var skySize = 0
function sky(kind, phase, level, umbName, ox, oy) {
  var key = [kind, phase, level, umbName || "", ox, oy].join("|")
  var hit = skyCache[key]
  if (hit) return hit
  if (skySize > 200) { skyCache = {}; skySize = 0 }
  var g = []
  for (var y = 0; y < 38; y++) { var r = []; for (var x = 0; x < W; x++) r.push("."); g.push(r) }
  var rim = umbName ? canopyRim(umbName) : null
  function blocked(x, y) {
    if (!rim) return false
    var cx = x - ox
    if (cx < 0 || cx >= W) return false
    var low = rim[cx]
    return low > -99 && y - oy >= low - 6 && y - oy <= 36
  }
  function set(x, y, c) { if (x >= 0 && x < W && y >= 0 && y < 38 && !blocked(x, y)) g[y][x] = c }
  if (kind === "rain" || kind === "storm") {
    var n = kind === "storm" ? 16 : level >= 2 ? 13 : level === 0 ? 5 : 9
    var slant = kind === "storm" ? 1 : 0
    var len = kind === "storm" ? 3 : level === 0 ? 1 : 2
    for (var i = 0; i < n; i++) {
      var x0 = Math.floor(hash(i) * W), speed = 9
      var y0 = Math.floor(hash(i + 50) * 38 + phase * speed) % 38
      for (var k = 0; k < len; k++) set(x0 - slant * Math.floor((y0 + k) / 2) % W + (slant ? 20 : 0), y0 + k, k === len - 1 ? "l" : "w")
    }
  } else if (kind === "snow") {
    var m = level >= 2 ? 12 : 8
    for (var j = 0; j < m; j++) {
      var sx = Math.floor(hash(j + 7) * W)
      var sy = Math.floor(hash(j + 90) * 38 + phase * 1.5) % 38
      var wob = Math.round(Math.sin((sy + j * 3) * 0.6))
      var big = j % 3 === 0
      set(sx + wob, sy, "o")
      if (big) { set(sx + wob - 1, sy, "l"); set(sx + wob + 1, sy, "l"); set(sx + wob, sy - 1, "l"); set(sx + wob, sy + 1, "l") }
    }
  } else if (kind === "fog") {
    var bands = [[9, 18, 0], [20, 22, 13], [29, 14, 27]]
    for (var b = 0; b < bands.length; b++) {
      var by = bands[b][0], bl = bands[b][1], bx = (bands[b][2] + phase) % (W + bl) - bl
      for (var q = 0; q < bl; q++) {
        set(bx + q, by, "o")
        if (q > 2 && q < bl - 3) set(bx + q + 1, by + 1, "o")
      }
    }
  }
  var rows = []
  for (var y2 = 0; y2 < 38; y2++) rows.push(g[y2].join(""))
  skyCache[key] = rows
  skySize++
  return rows
}

// ---------------------------------------------------------------- scene
//
// st: { mood, heavy, cold, t, wall, blink, fidget, fidgetT, reaction, reactT,
//       hovered, lookX, lookY, dragged, lean, landT, still, bop, beat, bang }
// mood: setup | offline | waiting | sleep | night | sun | hot | cloudy | fog |
//       wind | drizzle | rain | storm | snow | cold
// cold: wear the scarf (temperature below ~5 °C); heavy: heavy rain / snow.

var FX = null
var dustR = null, effortR = null
var FLY = [["o.o", ".o."], [".o.", "o.o"]]
function init(fx) {
  if (FX === fx) return
  FX = fx
  dustR = mirrorRows(fx.dust[1])
  effortR = mirrorRows(fx.effort)
}

function scene(st, fx0) {
  if (fx0) init(fx0)
  var t = st.t, tick = Math.floor(t * 4), mood = st.mood
  var still = !!st.still
  if (still) tick = 0
  var o = { arms: "rest", legs: "sit" }
  var face = { eyes: st.blink ? "blink" : "open", mouth: "smile" }
  var dx = 0, dy = 0, fx = []
  var skyKind = "", skyLevel = 1, skyPhase = still ? 0 : tick
  var scarfOn = !!st.cold || mood === "snow" || mood === "cold"
  var fd = st.fidget || "", ft = st.fidgetT || 0, step = Math.floor(ft * 4)
  var awake = st.hovered

  if (mood === "sleep" && !awake) {
    // asleep on its haunches, sac breathing, z's
    var br = Math.floor(st.wall) % 3 === 0
    o.sac = br ? 1 : 0; o.lift = br ? 0 : 0; o.arms = "tuck"
    o.sq = 1
    face = { eyes: "sleep", mouth: "tiny" }
    if (!still) for (var z = 0; z < 2; z++) {
      var ph = ((st.wall * 0.35 + z * 0.5) % 1 + 1) % 1
      if (ph < 0.85) fx.push({ rows: z === 0 ? FX.zed : FX.zedSmall, x: 36 + Math.round(Math.sin(ph * 6.28)) - z * 3, y: 15 - Math.round(ph * 13), c: "o", op: 0.7 })
    }
  } else if (mood === "setup" || mood === "offline") {
    // no location yet / no data: looks around, puzzled
    face = mood === "setup" ? { eyes: "up", mouth: "o", lookX: -1 } : { eyes: "worry", brows: "worry", mouth: "wobble" }
    o.arms = mood === "setup" ? "wave" : "rest"
    if (fd === "look") face.lookX = ft < 1 ? -1 : 1
    fx.push({ rows: FX.question, x: 37, y: 2, c: "o", op: 1 })
  } else if (mood === "sun" || mood === "cloudy" || mood === "night" || mood === "waiting") {
    if (mood === "sun") { o.glasses = 1; face.mouth = "smug" }
    if (mood === "night") { face.eyes = st.blink ? "blink" : "up"; face.lookX = 0 }
    calmFidget(o, face, fx, fd, ft, step, mood)
    if (o.dy) dy = o.dy
    if (st.hovered && !fd) face.mouth = mood === "sun" ? "grin" : "grin"
  } else if (mood === "hot") {
    // flattened by the heat, panting under its shades, sweating
    o.glasses = 1; o.legs = "flat"; o.sq = tick % 4 < 2 ? 1 : 2
    o.arms = still ? "rest" : tick % 2 === 0 ? "fanA" : "fanB"
    face = { eyes: "half", mouth: "pant" }
    if (!still) { sweat(fx, t, 2); if (tick % 8 < 4) fx.push({ rows: FX.sparkle[tick % 2], x: 9, y: 7, c: "o", op: 1 }) }
  } else if (mood === "cold") {
    // shivers in its scarf, teeth chattering, breath puffs
    var burst = !still && tick % 12 < 5
    dx = burst ? (tick % 2 === 0 ? -1 : 1) * (tick % 4 < 2 ? 1 : 0) : 0
    o.arms = "tuck"
    face = { eyes: burst ? "worry" : "half", mouth: burst ? "grit" : "wobble", brows: burst ? "worry" : "" }
    var bp = still ? -1 : tick % 12
    if (bp >= 6 && bp < 11) fx.push({ rows: FX.puff[Math.min(2, Math.floor((bp - 6) / 2))], x: 31 + (bp - 6), y: 18 - Math.floor((bp - 6) / 2), c: "w", op: bp < 9 ? 0.8 : 0.4 })
    if (fd === "look") face.lookX = ft < 1 ? -1 : 1
  } else if (mood === "wind") {
    // braces against the wind, scarf flapping, leaves blowing past
    scarfOn = true
    o.lean = 1
    o.scarfFlap = true
    face = { eyes: "squintL", mouth: "flat" }
    var lf = still ? 0 : (tick * 3) % 56
    fx.push({ rows: [".oo", "oo."], x: 44 - lf, y: 6 + Math.round(Math.sin(lf * 0.4) * 2), c: "n", op: 1 })
    if (!still) fx.push({ rows: ["oo", ".o"], x: 44 - (lf + 25) % 56, y: 26 + Math.round(Math.cos(lf * 0.3) * 2), c: "n", op: 1 })
    if (!still && tick % 6 < 2) fx.push({ rows: FX.effort, x: 0, y: 16, c: "o", op: 0.6 })
  } else if (mood === "fog") {
    // peers into the fog, looking for something
    var lk = still ? 0 : Math.floor(t / 1.5) % 4
    face = { eyes: "half", mouth: "flat", lookX: [-1, 0, 1, 0][lk] }
    skyKind = "fog"; skyPhase = still ? 0 : Math.floor(t * 2)
    if (!still && lk === 3 && tick % 6 < 4) fx.push({ rows: FX.question, x: 37, y: 3, c: "o", op: 0.8 })
  } else if (mood === "drizzle" || mood === "rain") {
    o.umb = "up"; o.arms = "umb"; o.puddle = 1
    skyKind = "rain"; skyLevel = mood === "drizzle" ? 0 : st.heavy ? 2 : 1
    if (mood === "drizzle") {
      // strolls under its umbrella, sways, a small hop now and then
      var sw = still ? 0 : Math.floor(t / 1.5) % 4
      o.umb = ["up", "tiltL", "up", "tiltR"][sw]
      dx = [0, -1, 0, 1][sw]
      face.mouth = "smile"
      if (!still && tick % 24 >= 20) { dy = tick % 24 < 22 ? -2 : 0; o.puddle = 2 }
    } else {
      jumpCycle(o, face, fx, still ? 0 : tick, st)
      dy = o.dy; dx = o.dx
    }
  } else if (mood === "storm") {
    // hangs on to an umbrella the wind keeps grabbing; inside out now and then
    o.arms = "umb"; o.puddle = 2
    skyKind = "storm"; skyLevel = 2
    var c = still ? 1 : tick % 16
    if (c < 9) {
      o.umb = c % 2 === 0 ? "tiltL" : "tug"
      face = { eyes: "strainL", mouth: "grit" }
      dx = still ? 0 : (c % 2 === 0 ? -1 : 0)
      o.legs = c % 4 < 2 ? "stompL" : "stompR"
    } else {
      o.umb = "flip"; dy = -1
      face = { eyes: "wide", mouth: "o", brows: "worry" }
      o.legs = "jump"
      if (c % 2 === 0) fx.push({ rows: FX.bang, x: 3, y: 4, c: "r", op: 1 })
    }
    if (!still) {
      if (tick % 20 < 2) fx.push({ rows: FX.bolt, x: 38, y: 13, c: "o", op: 1 })
      if (tick % 4 < 2) fx.push({ rows: FX.effort, x: 0, y: 20, c: "o", op: 1 })
      sweat(fx, t, 1)
    }
  } else if (mood === "snow") {
    // catches snowflakes on its tongue, snow piling on its eye domes
    o.snow = true
    skyKind = "snow"; skyLevel = st.heavy ? 2 : 1; skyPhase = still ? 0 : tick
    var sc = still ? 0 : tick % 20
    if (sc >= 12 && sc < 14) { face = { eyes: "up", mouth: "o", lookX: -1 }; }
    else if (sc >= 14 && sc < 16) { o.tongue = "up"; face = { eyes: "squintL", mouth: "o" } }
    else if (sc >= 16 && sc < 19) { face = { eyes: "happy", mouth: "chew" }; o.sac = 1 }
    else face = { eyes: st.blink ? "blink" : "open", mouth: "smile", lookY: -1 }
  }

  // Cat dancing next door: croak along to the beat (calm moods only).
  if (st.bop && !still && !st.reaction && (mood === "cloudy" || mood === "sun" || mood === "night" || mood === "waiting") && !fd) {
    var gb = st.beat
    o.sac = gb % 2 === 0 ? 2 : 0
    dy = gb % 4 === 0 ? -1 : 0
    face.eyes = o.glasses ? face.eyes : "happy"
    face.mouth = gb % 2 === 0 ? "o" : "smile"
    var np = ((t * 0.7) % 1 + 1) % 1
    if (np < 0.8) fx.push({ rows: FX.note, x: 35 + Math.round(Math.sin(np * 6.28)), y: 16 - Math.round(np * 12), c: "o", op: 1 })
  }
  if (st.bang && !still && !st.reaction && mood !== "storm" && tick % 4 < 3) {
    fx.push({ rows: FX.bang, x: 40, y: 2, c: "o", op: 1 })
    if (face.eyes !== "sleep") face.eyes = o.glasses ? face.eyes : "wide"
  }

  // ---- touch reactions ----
  var struggling = mood === "storm" || mood === "hot"
  var keepUmb = o.umb ? (o.umb === "flip" ? "tug" : o.umb) : ""
  var keepArms = keepUmb ? "umb" : null
  var keep = { umb: keepUmb, glasses: o.glasses ? 2 : 0, snow: o.snow, puddle: o.puddle ? 1 : 0 }
  if (st.dragged) {
    // dangles; with an umbrella it floats down like a parachutist
    var dt = still ? 0 : tick
    o = { legs: dt % 2 === 0 ? "dangleA" : "dangleB", arms: keepArms || (dt % 2 === 0 ? "flailA" : "flailB"),
          umb: keepUmb ? "tug" : "", glasses: keep.glasses, snow: keep.snow, lean: st.lean || 0 }
    face = { eyes: "wide", mouth: "wobble", brows: "worry" }
    dy = -2; dx = 0
    fx = []
    if (dt % 4 < 3) fx.push({ rows: FX.bang, x: 41, y: 1, c: "r", op: 1 })
    sweat(fx, t, 1)
  } else if (st.landT >= 0) {
    var lt = st.landT
    o = { arms: keepArms || "out", legs: "sit", umb: keepUmb, glasses: keep.glasses, snow: keep.snow, puddle: keep.puddle }
    fx = []; dx = 0; dy = 0
    if (lt < 0.3) {
      o.sq = 2
      face = { eyes: "squintL", mouth: "o" }
      if (keep.puddle) splash(fx, 0)
      else {
        fx.push({ rows: FX.dust[0], x: 1, y: 31, c: "o", op: 0.6 })
        fx.push({ rows: FX.dust[1], x: 37, y: 31, c: "o", op: 0.6 })
      }
    } else if (lt < 0.5) {
      dy = -1
      face = { eyes: "wide", mouth: "o" }
      if (keep.puddle) splash(fx, 1)
      else {
        fx.push({ rows: FX.dust[1], x: 0, y: 30, c: "o", op: 0.35 })
        fx.push({ rows: dustR, x: 38, y: 30, c: "o", op: 0.35 })
      }
    } else {
      var lk2 = Math.floor(lt * 4)
      face = { eyes: lk2 % 2 === 0 ? "dizzy" : "dizzyB", mouth: "wobble" }
      dx = lk2 % 2 === 0 ? -1 : 1
      fx.push({ rows: FX.spiral[lk2 % 2], x: 37, y: 2, c: "o", op: 1 })
    }
  } else if (st.reaction === "squish") {
    o = { arms: keepArms || "out", legs: "flat", umb: keepUmb, glasses: keep.glasses, snow: keep.snow, puddle: keep.puddle,
          sq: 2, sac: tick % 2 === 0 ? 1 : 2 }
    face = { eyes: "happy", mouth: tick % 2 === 0 ? "grin" : "omega" }
    dx = still ? 0 : (tick % 2 === 0 ? 0 : 1); dy = 0
    fx = struggling ? keepSweat(t) : []
    if (!still && tick % 4 < 2) fx.push({ rows: FX.sparkle[tick % 2], x: 38, y: 12, c: "o", op: 1 })
  } else if (st.reaction === "pet") {
    // happy croak: the throat sac puffs up, eyes squint, hearts and a note
    var rt = still ? 0.6 : st.reactT, rk = Math.floor(rt * 4)
    o = { arms: keepArms || "rest", legs: "sit", umb: keepUmb, glasses: keep.glasses, snow: keep.snow, puddle: keep.puddle,
          sac: rk % 4 < 2 ? 2 : 1 }
    face = struggling ? { eyes: "strainL", mouth: "smile" } : { eyes: "squintL", mouth: "omega" }
    dy = rt < 0.25 ? -1 : 0; dx = 0
    fx = struggling ? keepSweat(t) : []
    var hp = Math.min(1, rt / 1.6)
    fx.push({ rows: FX.heart, x: 36 + rk % 2, y: 12 - Math.round(hp * 11), c: "r", op: hp < 0.9 ? 1 : 0.5 })
    if (rt > 0.5) {
      var hp2 = Math.min(1, (rt - 0.5) / 1.3)
      fx.push({ rows: FX.heartSmall, x: 2 - rk % 2, y: 12 - Math.round(hp2 * 10), c: "r", op: hp2 < 0.9 ? 1 : 0.5 })
    }
    if (rt > 0.2 && rt < 1.2) fx.push({ rows: FX.note, x: 31, y: 20 - Math.round((rt - 0.2) * 8), c: "o", op: 1 })
  } else if (st.reaction === "annoyed") {
    // puffs itself up (big angry throat sac), stomps, turns its nose up
    o = { arms: keepArms || "hips", legs: tick % 2 === 0 ? "stompL" : "stompR", umb: keepUmb, glasses: keep.glasses,
          snow: keep.snow, puddle: keep.puddle, sac: 2 }
    face = { eyes: "angryL", brows: "angry", mouth: "pout" }
    dx = still ? 0 : (tick % 2 === 0 ? -1 : 0); dy = 0
    fx = struggling ? keepSweat(t) : []
    fx.push({ rows: FX.anger, x: 36, y: tick % 2 === 0 ? 4 : 5, c: "r", op: 1 })
    if (!still && tick % 3 === 0) fx.push({ rows: FX.puff[0], x: 1, y: 22, c: "o", op: 0.5 })
  }

  // hover: perks up, eyes follow the pointer
  if (st.hovered && !st.reaction && !st.dragged && st.landT < 0
      && (face.eyes === "open" || face.eyes === "half" || face.eyes === "blink" || face.eyes === "sleep" || face.eyes === "up")) {
    face.eyes = face.eyes === "blink" ? "blink" : "open"
    face.lookX = st.lookX; face.lookY = st.lookY
    if (face.mouth === "tiny") face.mouth = "smile"
  }

  o.scarf = !scarfOn ? "" : o.scarfFlap ? (tick % 2 === 0 ? "flapA" : "flapB") : "hang"
  delete o.scarfFlap
  delete o.dy; delete o.dx
  o.face = face
  if (fx.length > FX_SLOTS) fx = fx.slice(0, FX_SLOTS)
  var air = Math.max(0, -dy)
  var skyRows = skyKind ? sky(skyKind, skyPhase % 38, skyLevel, o.umb || "", dx, dy) : null
  return {
    rows: frame(o), x: dx, y: dy,
    shadow: o.puddle ? shadow[3] : shadow[Math.min(2, air)],
    fx: fx, sky: skyRows, skyOp: skyKind === "fog" ? 0.35 : 1
  }
}

// Calm moods (cloudy, sun, night, waiting): fidgets picked by the QML.
//   look, fly (tongue snaps a passing fly), croak, hop, yawn, glint (sun),
//   shades (pushes the sunglasses up), stars (night: gazes up, twinkles).
function calmFidget(o, face, fx, fd, ft, step, mood) {
  if (fd === "look") {
    face.lookX = ft < 0.9 ? -1 : ft < 1.9 ? 1 : 0
    face.lookY = ft > 1.9 && ft < 2.5 ? -1 : 0
    face.mouth = "flat"
  } else if (fd === "fly") {
    // a fly buzzes in, the tongue snaps, munch munch
    if (ft < 1.2) {
      var fxp = 42 - step, fyp = 14 + (step % 2)
      fx.push({ rows: FLY[step % 2], x: fxp, y: fyp, c: "o", op: 1 })
      face.lookX = 1; face.lookY = -1; face.mouth = "flat"
      if (o.glasses) face.mouth = "smug"
    } else if (ft < 1.5) {
      o.tongue = "side"; face.eyes = o.glasses ? face.eyes : "squintL"; face.mouth = "o"
    } else if (ft < 2.6) {
      face.eyes = o.glasses ? face.eyes : "happy"; face.mouth = step % 2 === 0 ? "chew" : "smile"; o.sac = step % 2 === 0 ? 1 : 0
    }
  } else if (fd === "croak") {
    // the throat sac swells twice, a note pops out
    var big = step % 4 < 2
    o.sac = big ? 2 : 1
    face.mouth = "smile"
    face.eyes = o.glasses ? face.eyes : (big ? "happy" : face.eyes)
    if (big) fx.push({ rows: FX.note, x: 33, y: 18 - (step % 8), c: "o", op: 1 })
  } else if (fd === "hop") {
    var hs = step % 6
    o.dy = hs === 1 ? -2 : hs === 2 ? -3 : hs === 3 ? -1 : 0
    o.legs = hs >= 1 && hs <= 3 ? "jump" : "sit"
    o.sq = hs === 0 || hs === 4 ? 1 : 0
    face.eyes = o.glasses ? face.eyes : (hs >= 1 && hs <= 3 ? "happy" : face.eyes)
    face.mouth = hs >= 1 && hs <= 3 ? "grin" : "smile"
  } else if (fd === "yawn") {
    var y = ft > 0.4 && ft < 1.8
    face.mouth = y ? "yawn" : "smile"
    face.eyes = y ? "happy" : face.eyes
    o.arms = y ? "up" : "rest"
  } else if (fd === "glint") {
    // a sparkle runs across the shades
    fx.push({ rows: FX.sparkle[step % 2], x: step < 4 ? 10 : 24, y: 9, c: "o", op: 1 })
    face.mouth = "smug"
  } else if (fd === "shades") {
    var upG = ft > 0.4 && ft < 2.2
    o.glasses = upG ? 2 : 1
    o.arms = ft > 0.2 && ft < 0.6 ? "wave" : "rest"
    if (upG) { face.eyes = "open"; face.lookY = -1; face.mouth = "o"; face.shades = false }
  } else if (fd === "stars") {
    face.eyes = "up"; face.lookY = 0; face.mouth = "smile"
    fx.push({ rows: FX.sparkle[step % 2], x: 4 + (step % 3) * 13, y: 1 + (step % 2) * 3, c: "o", op: 1 })
    if (step % 3 === 1) fx.push({ rows: FX.sparkle[0], x: 33, y: 4, c: "o", op: 0.7 })
  }
}

// Rain: puddle jumping, eight ticks per jump, alternating left / right.
function jumpCycle(o, face, fx, tick, st) {
  var c = tick % 10, side = Math.floor(tick / 10) % 2 === 0 ? 1 : -1
  o.dx = 0; o.dy = 0
  if (c === 0) { o.sq = 1; face.eyes = "happy"; face.mouth = "smile" }
  else if (c === 1) { o.legs = "jump"; o.dy = -2; o.dx = side; face.eyes = "happy"; face.mouth = "grin" }
  else if (c === 2) { o.legs = "jump"; o.dy = -3; o.dx = side; face.eyes = "sparkle"; face.mouth = "grin" }
  else if (c === 3) { o.legs = "jump"; o.dy = -1; o.dx = side; face.eyes = "happy"; face.mouth = "grin" }
  else if (c === 4) { o.sq = 2; o.puddle = 3; face.eyes = "squintL"; face.mouth = "grin"; splash(fx, 0) }
  else if (c === 5) { o.sq = 1; o.puddle = 2; face.eyes = "happy"; face.mouth = "omega"; splash(fx, 1) }
  else if (c === 6) { o.puddle = 2; face.eyes = "happy"; face.mouth = "smile" }
  else { o.puddle = 1; face.eyes = st.blink ? "blink" : "open"; face.mouth = "smile"; o.umb = c === 8 ? "tiltL" : "up" }
}

var SPLASH = [
  [["o..o.", ".o..o", "..o.."], [".o..o", "o..o.", "..o.."]],
  [["o....o", "......", ".o..o."], ["o....o", "......", ".o..o."]]
]
function splash(fx, f) {
  fx.push({ rows: SPLASH[f][0], x: 3 - f * 2, y: 28 - f * 2, c: "w", op: f ? 0.6 : 1 })
  fx.push({ rows: SPLASH[f][1], x: 36 + f * 2, y: 28 - f * 2, c: "w", op: f ? 0.6 : 1 })
}

function sweat(fx, t, n) {
  for (var i = 0; i < n; i++) {
    var p = ((t * 1.1 + i / n) % 1 + 1) % 1
    var side = i % 2 === 0
    if (p < 0.85) fx.push({ rows: FX.sweat, x: side ? 36 : 3, y: 10 + Math.round(p * 9) + i, c: "l", op: 1 })
  }
}

function keepSweat(t) { var fx = []; sweat(fx, t, 1); return fx }
