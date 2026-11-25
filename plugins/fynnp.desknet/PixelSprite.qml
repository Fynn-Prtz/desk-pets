import QtQuick

// Sprite from rows of characters, one px-sized square per character. Drawn
// into a single Canvas texture and repainted only when the frame or palette
// actually changes, so a still cat costs nothing per frame.
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

  onRowsChanged: requestPaint()
  onPaletteChanged: requestPaint()
  onWidthChanged: requestPaint()
  onHeightChanged: requestPaint()
  onAvailableChanged: if (available) requestPaint()
  onPaint: {
    var ctx = getContext("2d")
    ctx.clearRect(0, 0, width, height)
    var fills = {}
    for (var k in palette) fills[k] = css(palette[k])
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r]
      if (!row) continue
      for (var c = 0; c < row.length; c++) {
        var f = fills[row.charAt(c)]
        if (!f) continue
        ctx.fillStyle = f
        ctx.fillRect(c * px, r * px, px, px)
      }
    }
  }
}
