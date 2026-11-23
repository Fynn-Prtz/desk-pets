import QtQuick
import qs.Commons
import qs.Commons as Commons

Item {
  id: ib
  property string glyph: ""
  property int size: 28
  property bool active: false
  property color tint: Commons.Color.foreground
  signal clicked()
  implicitWidth: size
  implicitHeight: size

  Rectangle {
    anchors.fill: parent
    radius: Style.cornerRadius
    color: ib.active ? Util.alpha(Commons.Color.accent, 0.22)
      : (ma.containsMouse ? Util.alpha(Commons.Color.foreground, 0.1) : "transparent")
    Behavior on color { ColorAnimation { duration: Style.duration(140) } }
  }
  DaText {
    anchors.centerIn: parent
    text: ib.glyph
    color: ib.tint
    font.pixelSize: Math.round(ib.size * 0.55)
    scale: ma.pressed ? 0.88 : 1
    Behavior on scale { NumberAnimation { duration: Style.duration(120); easing.type: Easing.OutCubic } }
  }
  MouseArea {
    id: ma
    anchors.fill: parent
    hoverEnabled: true
    cursorShape: Qt.PointingHandCursor
    onClicked: ib.clicked()
  }
}
