import QtQuick
import QtQuick.Effects
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import Quickshell.Hyprland
import Quickshell.Services.Mpris
import Quickshell.Services.Pipewire
import qs.Commons
import qs.Commons as Commons
import qs.Ui

// Desk Audio: an always-on audio card that lives on the desktop layer, under
// your windows and above the wallpaper. Now playing, a level-driven visualizer,
// output/input device pickers with volume, and a small cat that dances along.
//
// Settings live inline on this plugin's entry in ~/.config/omarchy/shell.json:
//   { "id": "fynnp.deskaudio", "monitor": "DP-1", "corner": "bottom-right",
//     "marginX": 32, "marginY": 32 }
Item {
  id: root

  property var shell: null
  property var manifest: null
  readonly property string home: Quickshell.env("HOME")

  Commons.Translations { id: strings; directory: Qt.resolvedUrl("i18n") }

  // ---------- settings ----------
  property string monitorName: ""
  property string fallbackMonitor: ""
  // Size on the fallback monitor. 0 = auto: keep the same physical size as on
  // the home monitor (undo the extra scaling of a HiDPI-scaled second screen).
  property real awayScale: 0
  property string corner: "bottom-right"
  property int marginX: 32
  property int marginY: 32
  // Card background opacity; the blur rule in hypr/looknfeel.lua frosts what shows through.
  property real cardOpacity: 0.5
  // Edge visibility: 0 hides it, ~0.1 is a faint hairline.
  property real borderOpacity: 0.08

  function applySettings(raw) {
    var cfg = null
    try { cfg = JSON.parse(raw) } catch (e) { return }
    var list = cfg && Array.isArray(cfg.plugins) ? cfg.plugins : []
    var entry = {}
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === "fynnp.deskaudio") { entry = list[i]; break }
    }
    monitorName = typeof entry.monitor === "string" ? entry.monitor.slice(0, 64) : ""
    fallbackMonitor = typeof entry.fallbackMonitor === "string" ? entry.fallbackMonitor.slice(0, 64) : ""
    var as = parseFloat(entry.awayScale)
    awayScale = isNaN(as) ? 0 : Math.max(0.4, Math.min(1.5, as))
    var c = String(entry.corner || "bottom-right")
    corner = ["top-left", "top-right", "bottom-left", "bottom-right"].indexOf(c) >= 0 ? c : "bottom-right"
    marginX = clampInt(entry.marginX, 0, 2000, 32)
    marginY = clampInt(entry.marginY, 0, 2000, 32)
    var op = parseFloat(entry.opacity)
    cardOpacity = isNaN(op) ? 0.5 : Math.max(0.15, Math.min(1, op))
    var bo = parseFloat(entry.borderOpacity)
    borderOpacity = isNaN(bo) ? 0.08 : Math.max(0, Math.min(1, bo))
  }

  function clampInt(v, lo, hi, dflt) {
    var n = parseInt(v, 10)
    if (isNaN(n)) return dflt
    return Math.max(lo, Math.min(hi, n))
  }

  FileView {
    path: root.home + "/.config/omarchy/shell.json"
    watchChanges: true
    printErrors: false
    onLoaded: root.applySettings(text())
    onFileChanged: reload()
  }

  readonly property var homeScreen: {
    var screens = Quickshell.screens
    for (var i = 0; i < screens.length; i++)
      if (screens[i].name === place.monitor) return screens[i]
    return screens.length > 0 ? screens[0] : null
  }

  // ---------- fullscreen escape ----------
  // When the home monitor shows a fullscreen window and the other monitor's
  // active workspace is empty, the card moves there; it returns as soon as
  // either stops being true. "fallbackMonitor" picks the monitor, else the
  // first other one.
  readonly property var awayScreen: {
    var screens = Quickshell.screens
    var other = null
    for (var i = 0; i < screens.length; i++) {
      if (screens[i] === homeScreen) continue
      if (screens[i].name === root.fallbackMonitor) return screens[i]
      if (!other) other = screens[i]
    }
    return other
  }

  function activeWs(screen) {
    var m = screen ? Hyprland.monitorFor(screen) : null
    return m ? m.activeWorkspace : null
  }

  readonly property bool homeFullscreen: {
    var rev = hyprRevision
    var ws = activeWs(homeScreen)
    return !!ws && ws.hasFullscreen
  }

  readonly property bool awayEmpty: {
    var rev = hyprRevision
    var ws = activeWs(awayScreen)
    return !!ws && (!ws.toplevels || ws.toplevels.values.length === 0)
  }

  readonly property var targetScreen: !place.editing && homeFullscreen && awayScreen && awayEmpty ? awayScreen : homeScreen
  readonly property bool isAway: !!targetScreen && targetScreen !== homeScreen

  readonly property real uiScale: {
    if (!isAway) return 1
    if (awayScale > 0) return awayScale
    // Hyprland's own (fractional) scale; Qt rounds 1.25 up to a dpr of 2.
    var hm = homeScreen ? Hyprland.monitorFor(homeScreen) : null
    var am = Hyprland.monitorFor(targetScreen)
    var h = hm && hm.scale > 0 ? hm.scale : 1
    var a = am && am.scale > 0 ? am.scale : 1
    return Math.max(0.4, Math.min(1, h / a))
  }
  readonly property int mx: Math.round(marginX * uiScale)
  readonly property int my: Math.round(marginY * uiScale)

  // ---------- pipewire ----------
  readonly property var sink: Pipewire.defaultAudioSink
  readonly property var source: Pipewire.defaultAudioSource
  readonly property var nodes: Pipewire.nodes ? Pipewire.nodes.values : []

  readonly property var sinkNodes: {
    var list = []
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i]
      if (!n || !n.isSink || n.isStream || !n.audio) continue
      list.push(n)
    }
    return list
  }

  readonly property var sourceNodes: {
    var list = []
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i]
      if (!n || n.isSink || n.isStream || !n.audio) continue
      var name = String(n.name || "")
      if (name === "quickshell" || name.indexOf(".monitor") >= 0) continue
      list.push(n)
    }
    return list
  }

  PwObjectTracker { objects: root.sinkNodes }
  PwObjectTracker { objects: root.sourceNodes }

  // Repeaters get primitive rows, never PwNode objects: PipeWire deletes nodes
  // outright and a delegate holding a dead QObject can take the shell down.
  property var sinkRows: []
  property var sourceRows: []

  function snapshot(list) {
    var rows = []
    for (var i = 0; i < list.length; i++) {
      var n = list[i]
      if (!n || n.id === undefined) continue
      rows.push({ id: n.id, name: String(n.name || ""), label: nodeLabel(n), glyph: n.isSink ? sinkGlyph(n) : sourceGlyph(n) })
    }
    return rows
  }

  onSinkNodesChanged: rowsTimer.restart()
  onSourceNodesChanged: rowsTimer.restart()
  Timer {
    id: rowsTimer
    interval: 120
    onTriggered: {
      root.sinkRows = root.snapshot(root.sinkNodes)
      root.sourceRows = root.snapshot(root.sourceNodes)
      root.appRows = root.snapshotApps()
    }
  }

  function nodeFor(row) {
    if (!row) return null
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i]
      if (n && n.id === row.id && String(n.name || "") === row.name) return n
    }
    return null
  }

  function props(n) { return n && n.ready && n.properties ? n.properties : {} }

  function nodeLabel(n) {
    if (!n) return strings.t("noDevice", "No device")
    var p = props(n)
    var label = String(n.nickname || p["node.nick"] || n.description || p["node.description"] || n.name || "")
    label = label.replace(/\s+(Analog|Digital) (Stereo|Mono)/i, "").replace(/\s+Output$/i, "").replace(/\s+Input$/i, "")
    return label.trim().slice(0, 60) || strings.t("noDevice", "No device")
  }

  function blob(n) {
    var p = props(n)
    return String([n.name, n.description, n.nickname, p["device.icon-name"] || "", p["device.product.name"] || ""].join(" ")).toLowerCase()
  }

  function sinkGlyph(n) {
    if (!n) return "󰓃"
    var b = blob(n)
    if (/headphone|headset|earbud|airpod/.test(b)) return "󰋋"
    if (b.indexOf("bluetooth") >= 0) return "󰂯"
    if (b.indexOf("hdmi") >= 0 || b.indexOf("display") >= 0) return "󰍹"
    return "󰓃"
  }

  function sourceGlyph(n) {
    if (!n) return "󰍬"
    var b = blob(n)
    if (/headset/.test(b)) return "󰋋"
    if (/webcam|camera/.test(b)) return "󰄀"
    return "󰍬"
  }

  // A DSP or loopback sink can sit in front of the real output; follow it the
  // same way the bar's volume keys do so the slider moves the real speakers.
  property string volumeSinkName: ""
  readonly property var volumeSink: {
    if (!sink || volumeSinkName === "" || volumeSinkName === String(sink.name)) return sink
    for (var i = 0; i < sinkNodes.length; i++)
      if (String(sinkNodes[i].name) === volumeSinkName) return sinkNodes[i]
    return sink
  }
  onSinkChanged: if (!volumeSinkProc.running) volumeSinkProc.running = true
  Process {
    id: volumeSinkProc
    command: ["omarchy-audio-output-sink"]
    stdout: StdioCollector { waitForEnd: true; onStreamFinished: root.volumeSinkName = String(text).trim() }
  }

  readonly property real outVol: volumeSink && volumeSink.audio ? volumeSink.audio.volume : 0
  readonly property bool outMuted: volumeSink && volumeSink.audio ? volumeSink.audio.muted : false
  readonly property real inVol: source && source.audio ? source.audio.volume : 0
  readonly property bool inMuted: source && source.audio ? source.audio.muted : false

  function setDefaultSink(row) {
    var n = nodeFor(row)
    if (!n) return
    Pipewire.preferredDefaultAudioSink = n
    Quickshell.execDetached(["omarchy-audio-output-set-default", String(n.id), String(n.name)])
  }

  function setDefaultSource(row) {
    var n = nodeFor(row)
    if (!n) return
    Pipewire.preferredDefaultAudioSource = n
    Quickshell.execDetached(["omarchy-audio-input-set-default", String(n.id), String(n.name)])
  }

  // ---------- occlusion ----------
  // Under a tiled window the card cannot be seen, so everything that ticks --
  // the animation clock and PipeWire's level capture -- stops while any window
  // on that monitor's workspace fully covers the card.
  readonly property var hyprMonitor: targetScreen ? Hyprland.monitorFor(targetScreen) : null
  property int hyprRevision: 0

  readonly property var cardRect: place.rect

  readonly property bool covered: {
    var rev = hyprRevision
    var r = cardRect
    var ws = hyprMonitor ? hyprMonitor.activeWorkspace : null
    if (!r || !ws || !ws.toplevels) return false
    var wins = ws.toplevels.values
    for (var i = 0; i < wins.length; i++) {
      var ipc = wins[i].lastIpcObject
      if (!ipc || !ipc.at || !ipc.size || ipc.hidden) continue
      if (ipc.at[0] <= r.x && ipc.at[1] <= r.y
          && ipc.at[0] + ipc.size[0] >= r.x + r.w && ipc.at[1] + ipc.size[1] >= r.y + r.h)
        return true
    }
    return false
  }

  readonly property bool active: win.visible && (place.editing || !covered)

  Connections {
    target: Hyprland
    function onRawEvent(event) {
      switch (event.name) {
      case "openwindow": case "closewindow": case "movewindowv2": case "workspacev2":
      case "focusedmonv2": case "changefloatingmode": case "fullscreen": case "activewindowv2":
      case "moveworkspacev2": case "minimized":
        hyprRefresh.restart()
      }
    }
  }
  Timer {
    id: hyprRefresh
    interval: 100
    onTriggered: { Hyprland.refreshMonitors(); Hyprland.refreshWorkspaces(); Hyprland.refreshToplevels(); hyprSettle.restart() }
  }
  Timer {
    id: hyprSettle
    interval: 150
    onTriggered: root.hyprRevision++
  }
  Component.onCompleted: hyprRefresh.restart()

  // Level capture only while the card is visible and some app has a stream.
  readonly property bool peakOn: active && !!sink && (appRows.length > 0 || playing)
  PwNodePeakMonitor {
    id: peak
    node: root.sink
    enabled: root.peakOn
  }

  // ---------- media ----------
  readonly property var players: Mpris.players ? Mpris.players.values : []
  readonly property var player: {
    for (var i = 0; i < players.length; i++)
      if (players[i] && players[i].isPlaying) return players[i]
    return players.length > 0 ? players[0] : null
  }
  readonly property bool playing: !!player && player.isPlaying
  readonly property string trackTitle: player && player.trackTitle ? String(player.trackTitle).slice(0, 200) : ""
  readonly property string trackArtist: player && player.trackArtist ? String(player.trackArtist).slice(0, 200) : ""
  readonly property string trackArt: player && player.trackArtUrl ? String(player.trackArtUrl) : ""

  // Smoothed level drives the cat and the bars. Fast attack, slow release.
  property real level: 0
  readonly property bool lively: level > 0.02
  property real clock: 0

  // Slow tick (4 fps) so the cat keeps living with no audio frames; 8 fps
  // only while a touch reaction, drag or landing plays. Adds seconds.
  Timer {
    interval: cat.touch.busy || cat.greeting ? 125 : 250
    repeat: true
    running: root.active && !frames.running
    onTriggered: root.clock += interval / 1000
  }

  // Mood bus to the other desk cards (see DeskLink.qml).
  readonly property string catMood: playing ? "dance" : lively ? "idle" : "sleep"
  DeskLink { id: link; name: "cat"; mood: root.catMood }

  // 30 fps is plenty for pixel art and keeps a 165 Hz monitor from redrawing
  // the card every refresh. Smoothing is tuned per 33 ms step.
  Timer {
    id: frames
    interval: 33
    repeat: true
    running: root.active && (root.lively || (root.peakOn && peak.peak > 0.01))
    onTriggered: {
      var target = root.outMuted || !root.peakOn ? 0 : Math.min(1, Math.sqrt(Math.max(0, peak.peak)) * 1.15)
      var k = target > root.level ? 0.7 : 0.2
      var next = root.level + (target - root.level) * k
      // Snap the tail to zero so a fading level stops producing updates.
      root.level = Math.abs(next - target) < 0.004 ? target : next
      root.clock += 0.033
    }
  }


  // ---------- app streams ----------
  readonly property var streamCandidates: {
    var list = []
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i]
      if (n && n.isStream && n.isSink) list.push(n)
    }
    return list
  }
  PwObjectTracker { objects: root.streamCandidates }

  readonly property var appStreams: {
    var list = []
    for (var i = 0; i < streamCandidates.length; i++) {
      var n = streamCandidates[i]
      if (!n.audio) continue
      var cls = String(props(n)["media.class"] || "")
      if (cls !== "Stream/Output/Audio") continue
      if (String(n.name || "").indexOf("omarchy_speaker_tuning") === 0) continue
      list.push(n)
    }
    return list
  }

  function appLabel(n) {
    var p = props(n)
    var app = String(p["application.name"] || "")
    var bin = String(p["application.process.binary"] || "")
    var generic = app === "" || /webrtc|voiceengine|audio-src|playstream/i.test(app)
    var label = generic && bin ? bin : (app || n.description || n.name || "")
    label = String(label).trim().slice(0, 40)
    return label.charAt(0).toUpperCase() + label.slice(1)
  }

  function appGlyph(label) {
    var l = label.toLowerCase()
    if (l.indexOf("spotify") >= 0) return "󰓇"
    if (l.indexOf("discord") >= 0 || l.indexOf("vesktop") >= 0) return "󰙯"
    if (l.indexOf("chrom") >= 0) return "󰊯"
    if (l.indexOf("firefox") >= 0) return "󰈹"
    if (l.indexOf("steam") >= 0) return "󰓓"
    if (l.indexOf("mpv") >= 0 || l.indexOf("vlc") >= 0) return "󰕼"
    return "󰝚"
  }

  // One row per app; streams of the same app are grouped and move together.
  property var appRows: []
  onAppStreamsChanged: rowsTimer.restart()

  function snapshotApps() {
    var byLabel = {}
    var order = []
    for (var i = 0; i < appStreams.length; i++) {
      var n = appStreams[i]
      var label = appLabel(n)
      if (!byLabel[label]) { byLabel[label] = { label: label, glyph: appGlyph(label), ids: [] }; order.push(label) }
      byLabel[label].ids.push({ id: n.id, name: String(n.name || "") })
    }
    return order.map(function(l) { return byLabel[l] })
  }

  function nodesFor(ids) {
    var out = []
    for (var i = 0; i < ids.length; i++) {
      var n = nodeFor(ids[i])
      if (n) out.push(n)
    }
    return out
  }

  // ---------- look ----------
  readonly property int cardWidth: 360
  readonly property int pad: Style.space(14)

  // ---------- the desktop window ----------
  // Welcome back: the pet greets once when the user returns (shared/PetGreet.qml).
  PetGreet { id: greet; pluginId: "fynnp.deskaudio"; rect: place.rect; active: root.active && !place.editing }
  // Affection: counts pets, level 1..5 (shared/PetMemory.qml).
  PetMemory { id: memory; pluginId: "fynnp.deskaudio"; touch: cat.touch }

  PanelWindow {
    id: win
    screen: root.targetScreen
    visible: !!root.targetScreen
    color: "transparent"
    implicitWidth: Math.ceil(root.cardWidth * root.uiScale)
    implicitHeight: Math.ceil(card.height * root.uiScale)

    // Position, layer and input come from DeskPlace (layout file + edit mode).
    anchors {
      top: place.anchorTop
      bottom: place.anchorBottom
      left: place.anchorLeft
      right: place.anchorRight
    }
    margins {
      top: place.marginTop
      bottom: place.marginBottom
      left: place.marginLeft
      right: place.marginRight
    }

    WlrLayershell.namespace: "fynnp-deskaudio"
    WlrLayershell.layer: place.wlrLayer
    WlrLayershell.keyboardFocus: place.keyboardFocus
    exclusionMode: ExclusionMode.Ignore
    mask: place.editing ? place.editMask : null

    // Placement + edit mode; see docs/DESKPLACE.md in the desk-pets repo.
    DeskPlace {
      id: place
      pluginId: "fynnp.deskaudio"
      label: root.manifest && root.manifest.name ? String(root.manifest.name) : "Desk Audio"
      defaultMonitor: root.monitorName
      corner: root.corner
      marginX: root.marginX
      marginY: root.marginY
      homeScreen: root.homeScreen
      targetScreen: root.targetScreen
      uiScale: root.uiScale
      cardWidth: root.cardWidth
      cardHeight: card.height
    }

    BorderSurface {
      id: card
      x: place.cardX
      y: place.cardY
      width: root.cardWidth
      height: card.borderTop + root.pad + content.implicitHeight + root.pad + card.borderBottom
      color: Qt.rgba(Color.popups.background.r, Color.popups.background.g, Color.popups.background.b, root.cardOpacity)
      Behavior on color { ColorAnimation { duration: Style.duration(250); easing.type: Easing.OutCubic } }
      borderSpec: root.borderOpacity > 0 ? Border.flat(Util.alpha(Color.foreground, root.borderOpacity), 1) : Border.none()
      radius: Style.cornerRadius
      // Shrink as a whole on the fallback monitor; layout stays identical.
      scale: root.uiScale
      transformOrigin: Item.TopLeft

      Column {
        id: content
        x: card.borderLeft + root.pad
        y: card.borderTop + root.pad
        width: card.width - card.borderLeft - card.borderRight - root.pad * 2
        spacing: Style.space(10)

        // ---- pixel cat + now playing ----
        Item {
          width: parent.width
          height: cat.height

          PixelCat {
            id: cat
            greetSerial: greet.serial
            affection: memory.level
            affectionUp: memory.fresh
            px: 2
            place: place
            level: root.level
            playing: root.playing
            clock: root.clock
            active: root.active
            buddyMood: link.peers.buddy || ""
            gamerMood: link.peers.gamer || ""
          }

          Item {
            id: artFrame
            anchors.left: cat.right
            anchors.leftMargin: Style.space(4)
            anchors.verticalCenter: parent.verticalCenter
            width: root.trackArt ? 52 : 0
            height: 52
            visible: width > 0

            Image {
              id: art
              anchors.fill: parent
              source: root.trackArt
              sourceSize.width: 104
              sourceSize.height: 104
              fillMode: Image.PreserveAspectCrop
              asynchronous: true
              visible: Style.cornerRadius === 0
            }
            Rectangle {
              id: artMask
              anchors.fill: parent
              radius: Style.cornerRadius
              visible: false
              layer.enabled: Style.cornerRadius > 0
            }
            MultiEffect {
              anchors.fill: parent
              source: art
              maskEnabled: true
              maskSource: artMask
              visible: Style.cornerRadius > 0 && art.status === Image.Ready
            }
          }

          Column {
            anchors.left: artFrame.visible ? artFrame.right : cat.right
            anchors.leftMargin: Style.space(10)
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            spacing: 2

            DaText {
              width: parent.width
              text: root.trackTitle || strings.t("nothingPlaying", "Nothing playing")
              font.pixelSize: Style.font.subtitle
              font.bold: true
            }
            DaText {
              width: parent.width
              text: root.trackArtist || (root.player ? String(root.player.identity || "").slice(0, 60) : strings.t("vibing", "the cat is waiting for a song"))
              font.pixelSize: Style.font.caption
              opacity: 0.6
            }
            Row {
              spacing: 2
              visible: !!root.player
              IconButton {
                glyph: "󰒮"; size: 24
                onClicked: if (root.player && root.player.canGoPrevious) root.player.previous()
              }
              IconButton {
                glyph: root.playing ? "󰏤" : "󰐊"; size: 24; active: root.playing
                onClicked: if (root.player && root.player.canTogglePlaying) root.player.togglePlaying()
              }
              IconButton {
                glyph: "󰒭"; size: 24
                onClicked: if (root.player && root.player.canGoNext) root.player.next()
              }
            }
          }
        }

        PixelBars {
          width: parent.width
          level: root.level
          clock: root.clock
        }

        PanelSeparator { width: parent.width }

        DeviceSection {
          id: outSec
          title: strings.t("output", "Output")
          glyph: root.sinkGlyph(root.sink)
          current: root.nodeLabel(root.sink)
          volume: root.outVol
          muted: root.outMuted
          rows: root.sinkRows
          activeNode: root.sink
          onOpenChanged: if (open) inSec.open = false
          onPick: function(row) { root.setDefaultSink(row) }
          onSetVolume: function(v) { if (root.volumeSink && root.volumeSink.audio) root.volumeSink.audio.volume = v }
          onToggleMute: if (root.volumeSink && root.volumeSink.audio) root.volumeSink.audio.muted = !root.volumeSink.audio.muted
        }

        DeviceSection {
          id: inSec
          isInput: true
          title: strings.t("input", "Input")
          glyph: root.sourceGlyph(root.source)
          current: root.nodeLabel(root.source)
          volume: root.inVol
          muted: root.inMuted
          rows: root.sourceRows
          activeNode: root.source
          onOpenChanged: if (open) outSec.open = false
          onPick: function(row) { root.setDefaultSource(row) }
          onSetVolume: function(v) { if (root.source && root.source.audio) root.source.audio.volume = v }
          onToggleMute: if (root.source && root.source.audio) root.source.audio.muted = !root.source.audio.muted
        }

        PanelSeparator { width: parent.width }

        PanelSectionHeader { text: strings.t("apps", "Apps") }

        DaText {
          visible: root.appRows.length === 0
          text: strings.t("noApps", "No apps playing")
          font.pixelSize: Style.font.caption
          opacity: 0.5
        }

        Column {
          width: parent.width
          spacing: Style.space(6)
          visible: root.appRows.length > 0
          Repeater {
            model: root.appRows
            AppRow {
              required property var modelData
              width: parent.width
              label: modelData.label
              glyph: modelData.glyph
              nodes: root.nodesFor(modelData.ids)
            }
          }
        }
      }
    }
  }
}
