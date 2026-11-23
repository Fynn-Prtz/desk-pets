import QtQuick
import qs.Commons
import qs.Commons as Commons

// Block-cell grid on the same 40-column lattice as the audio card's
// visualizer, in one Canvas. `values` (0..1, or -1 for no data) lights each
// column bottom-up; with `cells: 1` and `fraction` it is a horizontal meter.
// Repaints only when the lit pattern actually changes.
Canvas {
  id: grid
  property var values: []
  property real fraction: -1
  property int columns: 40
  property int cells: 5
  property int gap: 2
  property color onColor: Commons.Color.accent
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
    if (fraction >= 0) {
      var n = Math.round(Math.max(0, Math.min(1, fraction)) * columns)
      for (var i = 0; i < columns; i++) next.push(i < n ? 1 : 0)
      if (n > 1) next[n - 1] = 2 // bright head cell, like the visualizer's cap
    } else {
      var pad = columns - values.length
      for (var j = 0; j < columns; j++) {
        var v = j < pad ? -1 : values[j - pad]
        next.push(v < 0 ? 0 : Math.max(1, Math.round(cells * Math.min(1, v))))
      }
    }
    var key = next.join(",")
    if (key === litKey) return
    lit = next
    litKey = key
    requestPaint()
  }

  onValuesChanged: recompute()
  onFractionChanged: recompute()
  onOnColorChanged: requestPaint()
  onWidthChanged: requestPaint()
  onHeightChanged: requestPaint()
  onAvailableChanged: if (available) requestPaint()
  Component.onCompleted: recompute()

  Connections {
    target: Commons.Color
    function onAccentChanged() { grid.requestPaint() }
    function onForegroundChanged() { grid.requestPaint() }
  }

  onPaint: {
    var ctx = getContext("2d")
    ctx.clearRect(0, 0, width, height)
    var off = css(Commons.Color.foreground, 0.07)
    var on = css(grid.onColor)
    var top = css(Commons.Color.foreground)
    for (var i = 0; i < columns; i++) {
      var n = lit[i] || 0
      var x = offsetX + i * (cell + gap)
      if (cells === 1) {
        ctx.fillStyle = n === 2 ? top : n === 1 ? on : off
        ctx.fillRect(x, 0, cell, cell)
        continue
      }
      for (var r = 0; r < cells; r++) {
        var fromBottom = cells - 1 - r
        ctx.fillStyle = fromBottom < n ? (fromBottom === n - 1 && n > 1 ? top : on) : off
        ctx.fillRect(x, r * (cell + gap), cell, cell)
      }
    }
  }
}
