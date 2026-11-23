import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import Quickshell.Hyprland
import qs.Commons
import qs.Commons as Commons
import qs.Ui

// Desk Disk: the system card's sibling. Every real filesystem with a usage
// meter, read/write rates with a 40 s history, and a pixel floppy that dozes,
// spins up when the disks work hard and sweats when one is nearly full.
//
// Data comes from ~/.local/bin/deskdisk-feed (Rust, source in helpers/deskdisk-feed of the desk-pets repo):
// it blocks on stdin and answers one JSON line per request, so it costs nothing
// between polls. Filesystem usage rides along about every 30 s. Polling stops
// entirely while the card is covered.
//
// Settings live inline on this plugin's entry in ~/.config/omarchy/shell.json:
//   { "id": "fynnp.deskdisk", "monitor": "DP-1", "corner": "top-left",
//     "marginX": 32, "marginY": 58, "opacity": 0.5, "interval": 1000,
//     "rows": 4, "hide": ["/boot"] }
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
  property string corner: "top-left"
  property int marginX: 32
  property int marginY: 58
  property real cardOpacity: 0.5
  property real borderOpacity: 0.08
  property int interval: 1000
  property int maxRows: 4
  property var hidden: []

  function applySettings(raw) {
    var cfg = null
    try { cfg = JSON.parse(raw) } catch (e) { return }
    var list = cfg && Array.isArray(cfg.plugins) ? cfg.plugins : []
    var entry = {}
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === "fynnp.deskdisk") { entry = list[i]; break }
    }
    monitorName = typeof entry.monitor === "string" ? entry.monitor.slice(0, 64) : ""
    fallbackMonitor = typeof entry.fallbackMonitor === "string" ? entry.fallbackMonitor.slice(0, 64) : ""
    var as = parseFloat(entry.awayScale)
    awayScale = isNaN(as) ? 0 : Math.max(0.4, Math.min(1.5, as))
    var c = String(entry.corner || "top-left")
    corner = ["top-left", "top-right", "bottom-left", "bottom-right", "center-left", "center-right"].indexOf(c) >= 0 ? c : "top-left"
    marginX = clampInt(entry.marginX, 0, 2000, 32)
    marginY = clampInt(entry.marginY, 0, 2000, 58)
    var op = parseFloat(entry.opacity)
    cardOpacity = isNaN(op) ? 0.5 : Math.max(0.15, Math.min(1, op))
    var bo = parseFloat(entry.borderOpacity)
    borderOpacity = isNaN(bo) ? 0.08 : Math.max(0, Math.min(1, bo))
    interval = clampInt(entry.interval, 500, 10000, 1000)
    maxRows = clampInt(entry.rows, 1, 8, 4)
    var hide = []
    if (Array.isArray(entry.hide))
      for (var h = 0; h < entry.hide.length && h < 32; h++)
        if (typeof entry.hide[h] === "string") hide.push(entry.hide[h].slice(0, 256))
    hidden = hide
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


  // ---------- disk feed ----------
  property bool ready: false
  property real readRate: 0      // bytes/s, whole disks
  property real writeRate: 0
  property real util: 0          // % busy, busiest disk
  property var filesystems: []   // [{ mount, name, glyph, used, avail, total, frac }]
  property var readHistory: []
  property var writeHistory: []
  readonly property int historyLength: 40

  function num(v) {
    var n = Number(v)
    return v === null || v === undefined || !isFinite(n) ? -1 : n
  }

  // Strip control characters and bound the length: mount points are untrusted text.
  function clean(s, n) { return String(s).replace(/[\u0000-\u001f\u007f]/g, "").slice(0, n) }

  // Removable media mounted by udisks show their volume name, the rest their path.
  function mountName(m) {
    var r = /^\/(run\/)?media\/[^\/]+\/(.+)$/.exec(m)
    return r ? r[2] : m
  }

  function readFs(list) {
    var out = []
    for (var i = 0; i < list.length && i < 64; i++) {
      var f = list[i]
      if (!f || typeof f.mnt !== "string") continue
      var mount = clean(f.mnt, 256)
      var used = Math.max(0, num(f.used))
      var avail = Math.max(0, num(f.avail))
      var total = Math.max(0, num(f.total))
      if (total <= 0) continue
      out.push({
        mount: mount,
        name: clean(mountName(mount), 24),
        glyph: /^\/(run\/)?media\//.test(mount) ? "󰕓" : "󰋊",
        used: used,
        avail: avail,
        total: total,
        // Like df: share of the space users can have that is taken.
        frac: used + avail > 0 ? used / (used + avail) : 0
      })
    }
    return out
  }

  // Log scale, so a 2 MB/s trickle and a 2 GB/s copy both show: anything
  // below ~16 kB/s stays dark, one cell from there, the third near 560 MB/s.
  function level(bytes) {
    var mb = bytes / 1e6
    return mb < 0.016 ? -1 : Math.min(1, Math.log(1 + mb) / Math.log(2001))
  }

  function ingest(line) {
    var d = null
    try { d = JSON.parse(line) } catch (e) { return }
    if (!d || typeof d !== "object") return
    readRate = Math.max(0, num(d.rd))
    writeRate = Math.max(0, num(d.wr))
    util = Math.max(0, Math.min(100, num(d.util)))
    if (Array.isArray(d.fs)) filesystems = readFs(d.fs)
    var r = readHistory.slice(-(historyLength - 1))
    r.push(level(readRate))
    readHistory = r
    var w = writeHistory.slice(-(historyLength - 1))
    w.push(level(writeRate))
    writeHistory = w
    ready = true
  }

  Process {
    id: feed
    command: [root.home + "/.local/bin/deskdisk-feed"]
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
  readonly property var shown: {
    var out = []
    for (var i = 0; i < filesystems.length; i++)
      if (hidden.indexOf(filesystems[i].mount) < 0) out.push(filesystems[i])
    return out
  }
  readonly property var rows: shown.slice(0, maxRows)
  readonly property var rootFs: {
    for (var i = 0; i < filesystems.length; i++)
      if (filesystems[i].mount === "/") return filesystems[i]
    return filesystems.length > 0 ? filesystems[0] : null
  }
  readonly property real fullAt: 0.9
  readonly property bool anyFull: {
    for (var i = 0; i < shown.length; i++)
      if (shown[i].frac > fullAt) return true
    return false
  }
  readonly property real ioRate: readRate + writeRate
  readonly property bool heavy: util >= 50 || ioRate >= 50e6
  readonly property string mood: !ready ? "idle"
    : anyFull ? "full"
    : heavy ? "busy"
    : ioRate >= 0.5e6 ? "light"
    : "idle"

  function fmt(v, d) { return Commons.I18n.formatNumber(v, d) }
  // Decimal units, like the sizes printed on the box.
  function gb(b) {
    var g = b / 1e9
    if (g >= 10000) return fmt(g / 1000, 1) + " TB"
    return fmt(g, g < 10 ? 1 : 0) + " GB"
  }
  function usageText(fs) {
    if (!fs) return strings.t("waiting", "Spinning up…")
    var used = fs.used / 1e9, total = fs.total / 1e9
    if (total >= 10000) return fmt(used / 1000, 1) + " / " + fmt(total / 1000, 1) + " TB"
    return fmt(used, used < 10 ? 1 : 0) + " / " + fmt(total, total < 10 ? 1 : 0) + " GB"
  }
  function rate(b) {
    if (b >= 1e9) return fmt(b / 1e9, 2) + " GB/s"
    if (b >= 1e6) return fmt(b / 1e6, b >= 100e6 ? 0 : 1) + " MB/s"
    return fmt(Math.round(b / 1e3), 0) + " kB/s"
  }

  // Pixel buddy clock: only ticks while visible and something is animating
  // (a lightly used disk just blinks on its own timer).
  property real clock: 0
  Timer {
    interval: 250
    repeat: true
    running: root.active && (root.mood !== "light" || buddy.moving)
    onTriggered: root.clock += 0.25
  }

  // Read-only view of the mood bus (no name = publishes nothing), so the
  // floppy can bob along when the audio card's cat dances.
  DeskLink { id: link }

  // ---------- look ----------
  readonly property int cardWidth: 360
  readonly property int pad: Style.space(14)

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

    WlrLayershell.namespace: "fynnp-deskdisk"
    WlrLayershell.layer: place.wlrLayer
    WlrLayershell.keyboardFocus: place.keyboardFocus
    exclusionMode: ExclusionMode.Ignore
    // Nothing to click: let the pointer fall through to the desktop.
    mask: place.editing ? place.editMask : place.noInput

    // Placement + edit mode; see docs/DESKPLACE.md in the desk-pets repo.
    DeskPlace {
      id: place
      pluginId: "fynnp.deskdisk"
      label: root.manifest && root.manifest.name ? String(root.manifest.name) : "Desk Disk"
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

        // ---- pixel floppy + root usage and rates ----
        Item {
          width: parent.width
          height: buddy.height

          PixelDisk {
            id: buddy
            px: 4
            mood: root.mood
            clock: root.clock
            active: root.active
            catMood: link.peers.cat || ""
          }

          Column {
            anchors.left: buddy.right
            anchors.leftMargin: Style.space(10)
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            spacing: 2

            DaText {
              width: parent.width
              text: root.usageText(root.rootFs)
              color: root.rootFs && root.rootFs.frac > root.fullAt ? Commons.Color.urgent : Commons.Color.foreground
              font.pixelSize: Style.font.subtitle
              font.bold: true
            }
            DaText {
              width: parent.width
              text: strings.t("read", "Read") + "  " + root.rate(root.readRate)
              font.pixelSize: Style.font.caption
              opacity: 0.6
            }
            DaText {
              width: parent.width
              text: strings.t("write", "Write") + "  " + root.rate(root.writeRate)
              font.pixelSize: Style.font.caption
              opacity: 0.6
            }
          }
        }

        // ---- 40 s I/O history: reads grow up, writes grow down ----
        Column {
          width: parent.width
          spacing: 2

          CellGrid {
            width: parent.width
            cells: 3
            values: root.readHistory
          }
          CellGrid {
            width: parent.width
            cells: 3
            down: true
            values: root.writeHistory
          }
        }

        PanelSeparator {
          width: parent.width
          visible: root.rows.length > 0
        }

        Repeater {
          model: root.rows
          StatRow {
            required property var modelData
            glyph: modelData.glyph
            label: modelData.name
            detail: root.gb(modelData.avail) + " " + strings.t("free", "free")
            warn: modelData.frac > root.fullAt
            fraction: modelData.frac
          }
        }
      }
    }
  }
}
