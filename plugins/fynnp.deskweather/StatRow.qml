import QtQuick
import qs.Commons
import qs.Commons as Commons

// One component row, laid out like the audio card's app rows: glyph, label,
// detail, percentage, then a block-cell meter on the shared lattice.
Column {
  id: row
  property string glyph: ""
  property string label: ""
  property string detail: ""
  property bool warn: false
  property real fraction: 0      // 0..1, or -1 when unknown
  property bool available: true

  width: parent ? parent.width : 300
  spacing: 4

  Item {
    width: parent.width
    height: 22

    DaText {
      id: g
      anchors.left: parent.left
      anchors.leftMargin: 4
      anchors.verticalCenter: parent.verticalCenter
      width: 18
      text: row.glyph
      color: row.available ? Commons.Color.accent : Util.alpha(Commons.Color.foreground, 0.4)
      font.pixelSize: Style.font.title
    }
    DaText {
      id: name
      anchors.left: g.right
      anchors.leftMargin: 8
      anchors.verticalCenter: parent.verticalCenter
      text: row.label
      font.pixelSize: Style.font.body
      elide: Text.ElideNone
      opacity: row.available ? 1 : 0.5
    }
    DaText {
      anchors.left: name.right
      anchors.leftMargin: 8
      anchors.right: pct.left
      anchors.rightMargin: 6
      anchors.verticalCenter: parent.verticalCenter
      horizontalAlignment: Text.AlignRight
      text: row.detail
      color: row.warn ? Commons.Color.urgent : Commons.Color.foreground
      font.pixelSize: Style.font.caption
      opacity: row.warn ? 1 : 0.6
    }
    DaText {
      id: pct
      anchors.right: parent.right
      anchors.rightMargin: 2
      anchors.verticalCenter: parent.verticalCenter
      width: 38
      horizontalAlignment: Text.AlignRight
      text: row.available && row.fraction >= 0 ? Math.round(row.fraction * 100) + "%" : "—"
      font.pixelSize: Style.font.bodySmall
      opacity: 0.75
    }
  }

  CellGrid {
    width: parent.width
    cells: 1
    fraction: row.available ? Math.max(0, row.fraction) : 0
    onColor: row.warn ? Commons.Color.urgent : Commons.Color.accent
  }
}
