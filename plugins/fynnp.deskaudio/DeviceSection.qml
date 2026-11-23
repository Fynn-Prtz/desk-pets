import QtQuick
import qs.Commons
import qs.Commons as Commons
import qs.Ui

// Header pill that unfolds into the device list, plus a volume slider and a
// mute toggle. Rows are primitives ({ id, name, label, glyph }), never nodes.
Column {
  id: sec
  property string title: ""
  property string glyph: ""
  property string current: ""
  property real volume: 0
  property bool muted: false
  property bool isInput: false
  property var rows: []
  property var activeNode: null
  property bool open: false
  signal pick(var row)
  signal setVolume(real v)
  signal toggleMute()

  readonly property color fg: Commons.Color.foreground
  readonly property color accent: Commons.Color.accent

  width: parent ? parent.width : 300
  spacing: 6

  Item {
    width: parent.width
    height: 30

    Rectangle {
      id: pill
      anchors.left: parent.left
      anchors.right: pct.left
      anchors.rightMargin: 8
      height: parent.height
      radius: Style.cornerRadius
      color: pillMa.containsMouse || sec.open ? Util.alpha(sec.fg, 0.1) : Util.alpha(sec.fg, 0.05)
      Behavior on color { ColorAnimation { duration: Style.duration(140) } }

      DaText {
        id: pillGlyph
        anchors.left: parent.left
        anchors.leftMargin: 10
        anchors.verticalCenter: parent.verticalCenter
        text: sec.glyph
        color: sec.accent
        font.pixelSize: Style.font.title
      }
      DaText {
        id: pillTitle
        anchors.left: pillGlyph.right
        anchors.leftMargin: 8
        anchors.verticalCenter: parent.verticalCenter
        text: sec.title
        opacity: 0.55
        font.pixelSize: Style.font.caption
      }
      DaText {
        anchors.left: pillTitle.right
        anchors.leftMargin: 8
        anchors.right: chevron.left
        anchors.rightMargin: 6
        anchors.verticalCenter: parent.verticalCenter
        text: sec.current
        font.pixelSize: Style.font.body
      }
      DaText {
        id: chevron
        anchors.right: parent.right
        anchors.rightMargin: 10
        anchors.verticalCenter: parent.verticalCenter
        text: "󰅀"
        opacity: 0.6
        rotation: sec.open ? 180 : 0
        Behavior on rotation { NumberAnimation { duration: Style.duration(200); easing.type: Easing.OutCubic } }
      }
      MouseArea {
        id: pillMa
        anchors.fill: parent
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        onClicked: sec.open = !sec.open
      }
    }

    DaText {
      id: pct
      anchors.right: muteBtn.left
      anchors.rightMargin: 4
      anchors.verticalCenter: parent.verticalCenter
      width: 38
      horizontalAlignment: Text.AlignRight
      text: sec.muted ? "—" : Math.round(sec.volume * 100) + "%"
      font.pixelSize: Style.font.bodySmall
      opacity: 0.75
    }

    IconButton {
      id: muteBtn
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      size: 28
      glyph: sec.muted ? (sec.isInput ? "󰍭" : "󰖁") : sec.glyph
      tint: sec.muted ? Commons.Color.urgent : sec.fg
      active: sec.muted
      onClicked: sec.toggleMute()
    }
  }

  PanelSlider {
    width: parent.width
    value: sec.volume
    minimum: 0
    maximum: 1
    step: 0.02
    fillColor: sec.muted ? Util.alpha(sec.fg, 0.3) : sec.accent
    knobColor: sec.fg
    trackColor: Util.alpha(sec.fg, 0.12)
    opacity: sec.muted ? 0.6 : 1
    onMoved: function(v) { sec.setVolume(v) }
    onRightClicked: sec.toggleMute()
  }

  Item {
    width: parent.width
    height: sec.open ? Math.min(listCol.implicitHeight, 180) : 0
    clip: true
    opacity: sec.open ? 1 : 0
    visible: height > 0
    Behavior on height { NumberAnimation { duration: Style.duration(sec.open ? 220 : 150); easing.type: Easing.OutCubic } }
    Behavior on opacity { NumberAnimation { duration: Style.duration(sec.open ? 180 : 120) } }

    Flickable {
      anchors.fill: parent
      contentHeight: listCol.implicitHeight
      boundsBehavior: Flickable.StopAtBounds
      interactive: contentHeight > height

      Column {
        id: listCol
        width: parent.width
        spacing: 2

        Repeater {
          model: sec.rows
          delegate: Rectangle {
            id: row
            required property var modelData
            readonly property bool isCurrent: !!sec.activeNode && sec.activeNode.id === modelData.id
            width: listCol.width
            height: 28
            radius: Style.cornerRadius
            color: isCurrent ? Util.alpha(sec.accent, 0.18) : (rowMa.containsMouse ? Util.alpha(sec.fg, 0.07) : "transparent")
            Behavior on color { ColorAnimation { duration: Style.duration(120) } }

            DaText {
              id: rowGlyph
              anchors.left: parent.left
              anchors.leftMargin: 10
              anchors.verticalCenter: parent.verticalCenter
              text: row.modelData.glyph
              color: row.isCurrent ? sec.accent : sec.fg
              opacity: row.isCurrent ? 1 : 0.6
            }
            DaText {
              anchors.left: rowGlyph.right
              anchors.leftMargin: 10
              anchors.right: dot.left
              anchors.rightMargin: 8
              anchors.verticalCenter: parent.verticalCenter
              text: row.modelData.label
              font.pixelSize: Style.font.bodySmall
              opacity: row.isCurrent ? 1 : 0.8
            }
            Rectangle {
              id: dot
              anchors.right: parent.right
              anchors.rightMargin: 12
              anchors.verticalCenter: parent.verticalCenter
              width: 6; height: 6
              color: sec.accent
              scale: row.isCurrent ? 1 : 0
              Behavior on scale { NumberAnimation { duration: Style.duration(200); easing.type: Easing.OutCubic } }
            }
            MouseArea {
              id: rowMa
              anchors.fill: parent
              hoverEnabled: true
              cursorShape: Qt.PointingHandCursor
              onClicked: sec.pick(row.modelData)
            }
          }
        }
      }
    }
  }
}
