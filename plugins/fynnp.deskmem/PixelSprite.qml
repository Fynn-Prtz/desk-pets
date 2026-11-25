import QtQuick

// Sprite from rows of characters, one px-sized square per character. Drawn
// into a single Canvas texture and repainted only when the frame or palette
// actually changes. Horizontal runs of one colour are merged into a single
// fillRect, so a detailed 44x38 pet stays at a few dozen rects per repaint.
// Canonical copy: shared/PixelSprite.qml (desk-pets repo) -- copy verbatim.
Canvas {
  id: sprite
  property var rows: []
  property var palette: ({})
  property int px: 4
  readonly property int cols: rows.length > 0 && rows[0] ? rows[0].length : 0

  width: cols * px
  height: rows.length * px
  antialiasing: false
  smooth: false

  function css(c) {
    return "rgba(" + Math.round(c.r * 255) + "," + Math.round(c.g * 255) + "," + Math.round(c.b * 255) + "," + c.a + ")"
  }

  // Hidden sprites (visible false or opacity 0, e.g. an effect that isn't
  // playing) never repaint; a change while hidden is painted when shown.
  readonly property bool shown: visible && opacity > 0
  property bool dirty: true
  function refresh() { if (shown && available) { dirty = false; requestPaint() } else dirty = true }
  onRowsChanged: refresh()
  onPaletteChanged: refresh()
  onWidthChanged: refresh()
  onHeightChanged: refresh()
  onAvailableChanged: if (dirty) refresh()
  onShownChanged: if (dirty) refresh()
  onPaint: {
    var ctx = getContext("2d")
    ctx.clearRect(0, 0, width, height)
    var fills = {}
    for (var k in palette) fills[k] = css(palette[k])
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r]
      if (!row) continue
      var c = 0
      while (c < row.length) {
        var ch = row.charAt(c)
        var run = 1
        while (c + run < row.length && row.charAt(c + run) === ch) run++
        var f = fills[ch]
        if (f) {
          ctx.fillStyle = f
          ctx.fillRect(c * px, r * px, run * px, px)
        }
        c += run
      }
    }
  }
}
