import QtQuick
import qs.Commons
import qs.Commons as Commons
import qs.Ui

// One app in the mixer. An app can own several streams (Spotify opens two);
// they move together. `nodes` is resolved live from ids by the service.
Column {
  id: app
  property string label: ""
  property string glyph: "󰝚"
  property var nodes: []
  readonly property var lead: nodes.length > 0 ? nodes[0] : null
  readonly property real volume: lead && lead.audio ? lead.audio.volume : 0
  readonly property bool muted: lead && lead.audio ? lead.audio.muted : false

  function setVolume(v) {
    for (var i = 0; i < nodes.length; i++)
      if (nodes[i] && nodes[i].audio) nodes[i].audio.volume = Math.max(0, Math.min(1.5, v))
  }
  function toggleMute() {
    var m = !muted
    for (var i = 0; i < nodes.length; i++)
      if (nodes[i] && nodes[i].audio) nodes[i].audio.muted = m
  }

  width: parent ? parent.width : 300
  spacing: 2

  Item {
    width: parent.width
    height: 22

    DaText {
      id: g
      anchors.left: parent.left
      anchors.leftMargin: 4
      anchors.verticalCenter: parent.verticalCenter
      width: 18
      text: app.glyph
      color: app.muted ? Util.alpha(Commons.Color.foreground, 0.4) : Commons.Color.accent
      font.pixelSize: Style.font.title
    }
    DaText {
      anchors.left: g.right
      anchors.leftMargin: 8
      anchors.right: pct.left
      anchors.rightMargin: 6
      anchors.verticalCenter: parent.verticalCenter
      text: app.label
      font.pixelSize: Style.font.body
      opacity: app.muted ? 0.5 : 1
    }
    DaText {
      id: pct
      anchors.right: mute.left
      anchors.rightMargin: 4
      anchors.verticalCenter: parent.verticalCenter
      width: 38
      horizontalAlignment: Text.AlignRight
      text: app.muted ? "—" : Math.round(app.volume * 100) + "%"
      font.pixelSize: Style.font.bodySmall
      opacity: 0.75
    }
    IconButton {
      id: mute
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      size: 22
      glyph: app.muted ? "󰝟" : "󰕾"
      tint: app.muted ? Commons.Color.urgent : Commons.Color.foreground
      active: app.muted
      onClicked: app.toggleMute()
    }
  }

  PanelSlider {
    width: parent.width
    value: app.volume
    minimum: 0
    maximum: 1.5
    step: 0.02
    tickCount: 0
    fillColor: app.muted ? Util.alpha(Commons.Color.foreground, 0.3) : Commons.Color.accent
    knobColor: Commons.Color.foreground
    trackColor: Util.alpha(Commons.Color.foreground, 0.12)
    opacity: app.muted ? 0.6 : 1
    onMoved: function(v) { app.setVolume(v) }
    onRightClicked: app.toggleMute()
  }
}
