import QtQuick
import qs.Commons
import qs.Commons as Commons

// One pie slice in the legend beside the pie: a compact StatRow-style row
// (20 px, narrower glyph slot and percentage column so names keep room):
// colour swatch, name, size, percentage.
Item {
  id: row
  property color swatch: Commons.Color.accent
  property string label: ""
  property string detail: ""
  property real fraction: 0      // 0..1
  property bool dim: false       // "other" / "free": quieter name

  width: parent ? parent.width : 300
  height: 20

  // Square block cell, centred in the 18 px glyph column.
  Item {
    id: g
    anchors.left: parent.left
    anchors.leftMargin: 1
    anchors.verticalCenter: parent.verticalCenter
    width: 14
    height: 18
    Rectangle {
      anchors.centerIn: parent
      width: 10
      height: 10
      color: row.swatch
      antialiasing: false
    }
  }
  DaText {
    id: name
    anchors.left: g.right
    anchors.leftMargin: 6
    anchors.right: amount.left
    anchors.rightMargin: 8
    anchors.verticalCenter: parent.verticalCenter
    text: row.label
    font.pixelSize: Style.font.body
    opacity: row.dim ? 0.6 : 1
  }
  DaText {
    id: amount
    anchors.right: pct.left
    anchors.rightMargin: 6
    anchors.verticalCenter: parent.verticalCenter
    horizontalAlignment: Text.AlignRight
    elide: Text.ElideNone
    width: implicitWidth
    text: row.detail
    font.pixelSize: Style.font.caption
    opacity: 0.6
  }
  DaText {
    id: pct
    anchors.right: parent.right
    anchors.rightMargin: 2
    anchors.verticalCenter: parent.verticalCenter
    width: 32
    horizontalAlignment: Text.AlignRight
    text: Math.round(Math.max(0, row.fraction) * 100) + "%"
    font.pixelSize: Style.font.bodySmall
    opacity: 0.75
  }
}
