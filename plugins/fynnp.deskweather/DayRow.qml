import QtQuick
import qs.Commons
import qs.Commons as Commons

// One forecast day, laid out like StatRow: weather glyph, day name, rain
// chance, low / high, then a block-cell range bar (where the day's low..high
// sits within the whole forecast's range).
Column {
  id: row
  property string glyph: ""
  property string label: ""
  property string detail: ""
  property string temps: ""
  property real from: 0          // 0..1
  property real to: 0            // 0..1

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
      color: Commons.Color.accent
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
    }
    DaText {
      anchors.left: name.right
      anchors.leftMargin: 8
      anchors.right: t.left
      anchors.rightMargin: 6
      anchors.verticalCenter: parent.verticalCenter
      horizontalAlignment: Text.AlignRight
      text: row.detail
      font.pixelSize: Style.font.caption
      opacity: 0.6
    }
    DaText {
      id: t
      anchors.right: parent.right
      anchors.rightMargin: 2
      anchors.verticalCenter: parent.verticalCenter
      horizontalAlignment: Text.AlignRight
      text: row.temps
      font.pixelSize: Style.font.bodySmall
      opacity: 0.75
    }
  }

  CellGrid {
    width: parent.width
    cells: 1
    rangeFrom: row.from
    fraction: Math.max(row.to, row.from + 0.03)
  }
}
