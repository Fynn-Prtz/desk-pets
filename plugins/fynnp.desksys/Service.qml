import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import Quickshell.Hyprland
import qs.Commons
import qs.Commons as Commons
import qs.Ui

// Desk System: the audio card's sibling. CPU / GPU / memory load, temperatures
// and power draw on the desktop layer, with a pixel computer that reacts.
//
// Sensors come from ~/.local/bin/desksys-feed (Rust, source in helpers/desksys-feed of the desk-pets repo):
// it blocks on stdin and answers one JSON line per request, so it costs nothing
// between polls. Polling stops entirely while the card is covered.
//
// Settings live inline on this plugin's entry in ~/.config/omarchy/shell.json:
//   { "id": "fynnp.desksys", "monitor": "DP-1", "corner": "top-right",
//     "marginX": 32, "marginY": 58, "opacity": 0.5, "interval": 1000 }
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
  property string corner: "top-right"
  property int marginX: 32
  property int marginY: 58
  property real cardOpacity: 0.5
  property real borderOpacity: 0.08
  property int interval: 1000

  function applySettings(raw) {
    var cfg = null
    try { cfg = JSON.parse(raw) } catch (e) { return }
    var list = cfg && Array.isArray(cfg.plugins) ? cfg.plugins : []
    var entry = {}
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === "fynnp.desksys") { entry = list[i]; break }
    }
    monitorName = typeof entry.monitor === "string" ? entry.monitor.slice(0, 64) : ""
    fallbackMonitor = typeof entry.fallbackMonitor === "string" ? entry.fallbackMonitor.slice(0, 64) : ""
    var as = parseFloat(entry.awayScale)
    awayScale = isNaN(as) ? 0 : Math.max(0.4, Math.min(1.5, as))
    var c = String(entry.corner || "top-right")
    corner = ["top-left", "top-right", "bottom-left", "bottom-right"].indexOf(c) >= 0 ? c : "top-right"
    marginX = clampInt(entry.marginX, 0, 2000, 32)
    marginY = clampInt(entry.marginY, 0, 2000, 58)
    var op = parseFloat(entry.opacity)
    cardOpacity = isNaN(op) ? 0.5 : Math.max(0.15, Math.min(1, op))
    var bo = parseFloat(entry.borderOpacity)
    borderOpacity = isNaN(bo) ? 0.08 : Math.max(0, Math.min(1, bo))
    interval = clampInt(entry.interval, 500, 10000, 1000)
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

  // ---------- occlusion (same rules as the audio card) ----------
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

  // ---------- sensor feed ----------
  property bool ready: false
  property real cpu: 0
  property real cpuTemp: -1
  property real cpuWatts: -1
  property real gpu: -1
  property real gpuTemp: -1
  property real gpuWatts: -1
  property real memUsed: 0
  property real memTotal: 0
  property real vramUsed: -1
  property real vramTotal: -1
  property string cpuName: ""
  property string gpuName: ""
  property var history: []
  readonly property int historyLength: 40

  function num(v) {
    var n = Number(v)
    return v === null || v === undefined || !isFinite(n) ? -1 : n
  }

  function ingest(line) {
    var d = null
    try { d = JSON.parse(line) } catch (e) { return }
    if (!d || typeof d !== "object") return
    cpu = Math.max(0, Math.min(100, num(d.cpu)))
    cpuTemp = num(d.ct)
    cpuWatts = num(d.cw)
    gpu = Math.min(100, num(d.gpu))
    gpuTemp = num(d.gt)
    gpuWatts = num(d.gw)
    memUsed = Math.max(0, num(d.mu))
    memTotal = Math.max(0, num(d.mt))
    vramUsed = num(d.vu)
    vramTotal = num(d.vt)
    if (typeof d.cn === "string") cpuName = d.cn.slice(0, 40)
    if (typeof d.gn === "string") gpuName = d.gn.slice(0, 40)
    var h = history.slice(-(historyLength - 1))
    h.push(load / 100)
    history = h
    ready = true
  }

  Process {
    id: feed
    command: [root.home + "/.local/bin/desksys-feed"]
    running: true
    stdinEnabled: true
    stdout: SplitParser { onRead: function(line) { root.ingest(line) } }
    onExited: feedRestart.restart()
  }
  Timer {
    id: feedRestart
    interval: 5000
    onTriggered: feed.running = true
  }

  Timer {
    interval: root.interval
    repeat: true
    triggeredOnStart: true
    running: root.active && feed.running
    onTriggered: feed.write("\n")
  }

  // ---------- derived ----------
  readonly property bool hasGpu: gpu >= 0
  readonly property real load: Math.max(cpu, hasGpu ? gpu : 0)
  readonly property bool cpuHot: cpuTemp >= 90
  readonly property bool gpuHot: gpuTemp >= 85
  readonly property string mood: !ready ? "idle"
    : (cpuHot || gpuHot) ? "hot"
    : load < 8 ? "idle"
    : load < 35 ? "chill"
    : load < 65 ? "work"
    : load < 90 ? "load"
    : "maxed"
  readonly property string moodText: !ready ? strings.t("waiting", "Waking up…")
    : ({ idle: strings.t("idle", "Idle"), chill: strings.t("chilling", "Chilling"),
         work: strings.t("working", "Working"), load: strings.t("underLoad", "Under load"),
         maxed: strings.t("maxed", "Maxed out"), hot: strings.t("hot", "Running hot") })[mood]
  readonly property real totalWatts: Math.max(0, cpuWatts) + Math.max(0, gpuWatts)
  readonly property bool hasWatts: cpuWatts >= 0 || gpuWatts >= 0

  function fmt(v, d) { return Commons.I18n.formatNumber(v, d) }
  function deg(v) { return v >= 0 ? fmt(Math.round(v), 0) + "°C" : "" }
  function watts(v) { return v >= 0 ? fmt(Math.round(v), 0) + " W" : "" }
  function join(a, b) { return a && b ? a + "  ·  " + b : (a || b) }

  // Pixel buddy clock (seconds): only ticks while visible and something is
  // animating; 4 fps, 8 fps while a touch reaction / drag / landing plays.
  property real clock: 0
  Timer {
    interval: buddy.fast ? 125 : 250
    repeat: true
    running: root.active && (root.mood !== "chill" || buddy.moving)
    onTriggered: root.clock += interval / 1000
  }

  // Mood bus to the other desk cards. While covered the feed is paused and
  // the reading would go stale, so publish "" (unknown) instead.
  DeskLink { id: link; name: "buddy"; mood: root.active && root.ready ? root.mood : "" }

  // ---------- look ----------
  readonly property int cardWidth: 360
  readonly property int pad: Style.space(14)

  // Welcome back: the pet greets once when the user returns (shared/PetGreet.qml).
  PetGreet { id: greet; pluginId: "fynnp.desksys"; rect: place.rect; active: root.active && !place.editing }

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

    WlrLayershell.namespace: "fynnp-desksys"
    WlrLayershell.layer: place.wlrLayer
    WlrLayershell.keyboardFocus: place.keyboardFocus
    exclusionMode: ExclusionMode.Ignore
    // Only the pet takes input (petting); the rest falls through to the desktop.
    mask: place.editing ? place.editMask : petRegion
    Region {
      id: petRegion
      x: buddy.touch.maskRect.x
      y: buddy.touch.maskRect.y
      width: buddy.touch.maskRect.width
      height: buddy.touch.maskRect.height
    }

    // Placement + edit mode; see docs/DESKPLACE.md in the desk-pets repo.
    DeskPlace {
      id: place
      pluginId: "fynnp.desksys"
      label: root.manifest && root.manifest.name ? String(root.manifest.name) : "Desk System"
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

        // ---- pixel buddy + status ----
        Item {
          width: parent.width
          height: buddy.height

          PixelBuddy {
            id: buddy
            greetSerial: greet.serial
            px: 2
            mood: root.mood
            clock: root.clock
            active: root.active
            place: place
            window: win.contentItem
            catMood: link.peers.cat || ""
            gamerMood: link.peers.gamer || ""
          }

          Column {
            anchors.left: buddy.right
            anchors.leftMargin: Style.space(10)
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            spacing: 2

            DaText {
              width: parent.width
              text: root.moodText
              color: root.mood === "hot" ? Commons.Color.urgent : Commons.Color.foreground
              font.pixelSize: Style.font.subtitle
              font.bold: true
            }
            DaText {
              width: parent.width
              text: root.join(root.cpuName, root.gpuName)
              font.pixelSize: Style.font.caption
              opacity: 0.6
            }
            Row {
              spacing: 6
              visible: root.hasWatts
              DaText {
                anchors.verticalCenter: parent.verticalCenter
                text: "󱐋"
                color: Commons.Color.accent
                font.pixelSize: Style.font.title
              }
              DaText {
                anchors.verticalCenter: parent.verticalCenter
                text: root.watts(root.totalWatts)
                font.pixelSize: Style.font.body
                font.bold: true
              }
              DaText {
                anchors.verticalCenter: parent.verticalCenter
                visible: root.cpuWatts < 0
                text: strings.t("gpuOnly", "GPU only")
                font.pixelSize: Style.font.caption
                opacity: 0.5
              }
            }
          }
        }

        // ---- load history on the visualizer lattice ----
        CellGrid {
          width: parent.width
          values: root.history
        }

        PanelSeparator { width: parent.width }

        StatRow {
          glyph: "󰻠"
          label: strings.t("cpu", "CPU")
          detail: root.join(root.deg(root.cpuTemp), root.watts(root.cpuWatts))
          warn: root.cpuHot
          fraction: root.cpu / 100
        }

        StatRow {
          glyph: "󰢮"
          label: strings.t("gpu", "GPU")
          available: root.hasGpu
          detail: root.hasGpu ? root.join(root.deg(root.gpuTemp), root.watts(root.gpuWatts)) : strings.t("noGpu", "No GPU stats")
          warn: root.gpuHot
          fraction: root.hasGpu ? root.gpu / 100 : -1
        }

        PanelSeparator { width: parent.width }

        StatRow {
          glyph: "󰍛"
          label: strings.t("memory", "Memory")
          detail: root.fmt(root.memUsed, 1) + " / " + root.fmt(root.memTotal, 0) + " GB"
          fraction: root.memTotal > 0 ? root.memUsed / root.memTotal : 0
        }

        StatRow {
          visible: root.vramTotal > 0
          glyph: "󰘚"
          label: strings.t("vram", "VRAM")
          detail: root.fmt(Math.max(0, root.vramUsed), 1) + " / " + root.fmt(root.vramTotal, 0) + " GB"
          fraction: root.vramTotal > 0 ? Math.max(0, root.vramUsed) / root.vramTotal : 0
        }
      }
    }
  }
}
