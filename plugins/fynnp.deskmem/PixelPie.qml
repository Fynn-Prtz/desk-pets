import QtQuick
import qs.Commons
import qs.Commons as Commons

// Pixel-art pie on a square block-cell lattice (same look as CellGrid: square
// cells with a gap, unlit cells fg@0.07), in one Canvas. Cells inside the
// circle take the colour of the slice their angle falls in, clockwise from
// 12 o'clock. `fractions` are slice sizes (0..1, summing to <= 1); `colors`
// holds one colour per slice; the rest of the circle stays unlit ("free").
// Repaints only when the lit pattern or the colours actually change.
Canvas {
  id: pie
  property var fractions: []
  property var colors: []
  property int cells: 24
  property int cell: 3
  property int gap: 1

  property var lit: []
  property string litKey: ""
  property var fills: []
  property string fillKey: ""

  width: cells * cell + (cells - 1) * gap
  height: width
  antialiasing: false
  smooth: false

  function css(c, a) {
    return "rgba(" + Math.round(c.r * 255) + "," + Math.round(c.g * 255) + "," + Math.round(c.b * 255) + "," + (a === undefined ? c.a : a) + ")"
  }

  // The colour list is rebuilt with every sample; repaint only on a real change.
  function recolor() {
    var next = []
    for (var k = 0; k < colors.length; k++) next.push(css(colors[k]))
    var key = next.join(";")
    if (key === fillKey) return
    fills = next
    fillKey = key
    requestPaint()
  }

  // Slice index per cell, row-major: -2 outside the circle, -1 free.
  function recompute() {
    var ends = []
    var acc = 0
    for (var k = 0; k < fractions.length; k++) {
      acc += Math.max(0, Number(fractions[k]) || 0)
      ends.push(acc)
    }
    var next = []
    var r = cells / 2
    for (var y = 0; y < cells; y++) {
      for (var x = 0; x < cells; x++) {
        var dx = x + 0.5 - r
        var dy = y + 0.5 - r
        if (dx * dx + dy * dy > r * r) { next.push(-2); continue }
        // Clockwise from the top: atan2(dx, -dy) in [0, 2π).
        var a = Math.atan2(dx, -dy)
        if (a < 0) a += 2 * Math.PI
        var f = a / (2 * Math.PI)
        var s = -1
        for (var i = 0; i < ends.length; i++) {
          if (f < ends[i]) { s = i; break }
        }
        next.push(s)
      }
    }
    var key = next.join(",")
    if (key === litKey) return
    lit = next
    litKey = key
    requestPaint()
  }

  onFractionsChanged: recompute()
  onCellsChanged: recompute()
  onColorsChanged: recolor()
  onWidthChanged: requestPaint()
  onAvailableChanged: if (available) requestPaint()
  Component.onCompleted: { recolor(); recompute() }

  Connections {
    target: Commons.Color
    function onForegroundChanged() { pie.requestPaint() }
  }

  onPaint: {
    var ctx = getContext("2d")
    ctx.clearRect(0, 0, width, height)
    var off = css(Commons.Color.foreground, 0.07)
    for (var y = 0; y < cells; y++) {
      for (var x = 0; x < cells; x++) {
        var s = lit[y * cells + x]
        if (s === undefined || s === -2) continue
        ctx.fillStyle = s >= 0 && fills[s] ? fills[s] : off
        ctx.fillRect(x * (cell + gap), y * (cell + gap), cell, cell)
      }
    }
  }
}
