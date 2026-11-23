import QtQuick
import qs.Commons
import qs.Commons as Commons
import qs.Ui

// One recently played game: cover, name, "2h ago", total playtime. Hover
// highlight like the audio card's device rows; click launches it.
Rectangle {
  id: row
  property var game: ({})
  property string ago: ""
  property string playtime: ""
  property bool running: false
  property bool launching: false
  readonly property alias hovered: ma.containsMouse
  signal launch()

  readonly property color fg: Commons.Color.foreground
  readonly property color accent: Commons.Color.accent

  width: parent ? parent.width : 300
  height: 44
  radius: Style.cornerRadius
  color: running || launching ? Util.alpha(accent, 0.18) : (ma.containsMouse ? Util.alpha(fg, 0.07) : "transparent")
  Behavior on color { ColorAnimation { duration: Style.duration(120) } }

  Rectangle {
    id: coverBox
    anchors.left: parent.left
    anchors.leftMargin: 2
    anchors.verticalCenter: parent.verticalCenter
    width: 86
    height: 40
    radius: Math.min(4, Style.cornerRadius)
    color: Util.alpha(row.fg, 0.06)
    clip: true

    SizedImage {
      anchors.fill: parent
      crop: true
      url: row.game.cover ? "file://" + row.game.cover : ""
      opacity: status === Image.Ready ? 1 : 0
    }
    DaText {
      anchors.centerIn: parent
      visible: !row.game.cover
      text: "󰊴"
      color: row.accent
      opacity: 0.6
      font.pixelSize: Style.font.title
    }
  }

  Column {
    anchors.left: coverBox.right
    anchors.leftMargin: 10
    anchors.right: tail.left
    anchors.rightMargin: 6
    anchors.verticalCenter: parent.verticalCenter
    spacing: 1

    DaText {
      width: parent.width
      text: row.game.name || ""
      font.pixelSize: Style.font.body
      color: row.running || row.launching ? row.accent : row.fg
    }
    DaText {
      width: parent.width
      text: row.ago
      font.pixelSize: Style.font.caption
      opacity: 0.6
    }
  }

  Item {
    id: tail
    anchors.right: parent.right
    anchors.rightMargin: 8
    anchors.verticalCenter: parent.verticalCenter
    width: Math.max(play.implicitWidth, time.implicitWidth)
    height: parent.height

    DaText {
      id: time
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      text: row.playtime
      font.pixelSize: Style.font.bodySmall
      opacity: ma.containsMouse && !row.running ? 0 : 0.75
    }
    DaText {
      id: play
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      text: row.running ? "" : "󰐊"
      color: row.accent
      font.pixelSize: Style.font.title
      opacity: ma.containsMouse && !row.running ? 1 : 0
      scale: ma.pressed ? 0.88 : 1
      Behavior on scale { NumberAnimation { duration: Style.duration(120); easing.type: Easing.OutCubic } }
    }
  }

  MouseArea {
    id: ma
    anchors.fill: parent
    hoverEnabled: true
    cursorShape: row.running ? Qt.ArrowCursor : Qt.PointingHandCursor
    onClicked: if (!row.running) row.launch()
  }
}
