import QtQuick
import qs.Commons
import qs.Commons as Commons

// Block-cell visualizer in one Canvas. Each tick works out how many cells
// every column lights, and only repaints when that pattern changed.
Canvas {
  id: viz
  property real level: 0
  property real clock: 0
  property int columns: 40
  property int cells: 5
  property int gap: 2
  readonly property int cell: Math.max(2, Math.floor((width - (columns - 1) * gap) / columns))
  readonly property int offsetX: Math.floor((width - (columns * cell + (columns - 1) * gap)) / 2)

  property var lit: []
  property string litKey: ""

  height: cells * cell + (cells - 1) * gap
  antialiasing: false
  smooth: false

  function css(c, a) {
    return "rgba(" + Math.round(c.r * 255) + "," + Math.round(c.g * 255) + "," + Math.round(c.b * 255) + "," + (a === undefined ? c.a : a) + ")"
  }

  function recompute() {
    var next = []
    for (var i = 0; i < columns; i++) {
      var seed = (i * 0.6180339) % 1
      var shape = 0.55 + 0.45 * Math.sin(i / columns * Math.PI)
      var wobble = 0.35 + 0.65 * Math.abs(Math.sin(clock * (4 + seed * 7) + seed * 12))
      next.push(Math.max(1, Math.round(cells * Math.min(1, level * shape * wobble * 1.5))))
    }
    var key = next.join("")
    if (key === litKey) return
    lit = next
    litKey = key
    requestPaint()
  }

  onClockChanged: recompute()
  onLevelChanged: if (level === 0) recompute()
  onWidthChanged: requestPaint()
  onHeightChanged: requestPaint()
  onAvailableChanged: if (available) requestPaint()
  Component.onCompleted: recompute()

  Connections {
    target: Commons.Color
    function onAccentChanged() { viz.requestPaint() }
    function onForegroundChanged() { viz.requestPaint() }
  }

  onPaint: {
    var ctx = getContext("2d")
    ctx.clearRect(0, 0, width, height)
    var off = css(Commons.Color.foreground, 0.07)
    var on = css(Commons.Color.accent)
    var top = css(Commons.Color.foreground)
    for (var i = 0; i < columns; i++) {
      var n = lit[i] || 1
      var x = offsetX + i * (cell + gap)
      for (var r = 0; r < cells; r++) {
        var fromBottom = cells - 1 - r
        ctx.fillStyle = fromBottom < n ? (fromBottom === n - 1 && n > 1 ? top : on) : off
        ctx.fillRect(x, r * (cell + gap), cell, cell)
      }
    }
  }
}
