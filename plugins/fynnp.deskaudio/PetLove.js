.pragma library
// PetLove: the tiny affection rows the pets show after petting (level 1..5
// from shared/PetMemory.qml). Each pet brings its own icons and placement;
// this only lays slots out and memoises the rows. Copy verbatim into each plugin.

var memo = {}
var size = 0
function blank(n) { var s = ""; for (var i = 0; i < n; i++) s += "."; return s }
function keep(k, rows) { if (size > 200) { memo = {}; size = 0 } memo[k] = rows; size++; return rows }

// n slots of the `full` / `empty` icon (rows of equal size), the first
// `filled` full, only the first `shown` drawn, `gap` cells apart.
function row(full, empty, n, filled, shown, gap) {
  var k = ["r", full.join("/"), empty.join("/"), n, filled, shown, gap].join("|")
  if (memo[k]) return memo[k]
  var w = full[0].length, out = []
  for (var y = 0; y < full.length; y++) {
    var s = ""
    for (var i = 0; i < n; i++) {
      s += i >= shown ? blank(w) : (i < filled ? full : empty)[y]
      if (i < n - 1) s += blank(gap)
    }
    out.push(s)
  }
  return keep(k, out)
}

// VU-meter bars: bar i is i+1 cells tall, one cell wide, one apart; the first
// `filled` in `on`, the rest in `off`; only the first `shown` bars drawn.
function bars(n, filled, shown, on, off) {
  var k = ["b", n, filled, shown, on, off].join("|")
  if (memo[k]) return memo[k]
  var out = []
  for (var y = 0; y < n; y++) {
    var s = ""
    for (var i = 0; i < n; i++) {
      s += i < shown && n - y <= i + 1 ? (i < filled ? on : off) : "."
      if (i < n - 1) s += "."
    }
    out.push(s)
  }
  return keep(k, out)
}
