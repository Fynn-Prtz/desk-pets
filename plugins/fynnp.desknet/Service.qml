import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import Quickshell.Hyprland
import qs.Commons
import qs.Commons as Commons
import qs.Ui

// Desk Net: the system card's sibling. Default-route interface and address,
// live down / up rates, a 40 s throughput history and totals since the card
// started, with a carrier pigeon that dozes on its wire, flies your packets
// in and out, gets buried in letters and gets lost when offline.
//
// Data comes from ~/.local/bin/desknet-feed (Rust, source in helpers/desknet-feed of the desk-pets repo):
// it blocks on stdin and answers one JSON line per request (rates computed
// there), so it costs nothing between polls. Polling stops entirely while the
// card is covered.
//
// Settings live inline on this plugin's entry in ~/.config/omarchy/shell.json:
//   { "id": "fynnp.desknet", "monitor": "DP-1", "corner": "bottom-left",
//     "marginX": 32, "marginY": 32, "opacity": 0.5, "interval": 1000 }
Item {
  id: root

  property var shell: null
  property var manifest: null
  readonly property string home: Quickshell.env("HOME")

  Commons.Translations { id: strings; directory: Qt.resolvedUrl("i18n") }

  // ---------- seasonal outfit (season-hats): date -> PetSeason key ----------
  // "seasons" / "birthday" live on the fynnp.desklayout entry (PetCalendar.qml).
  PetCalendar { id: seasonCal; active: root.active }

  // ---------- settings ----------
  property string monitorName: ""
  property string fallbackMonitor: ""
  // Size on the fallback monitor. 0 = auto: keep the same physical size as on
  // the home monitor (undo the extra scaling of a HiDPI-scaled second screen).
  property real awayScale: 0
  property string corner: "bottom-left"
  property int marginX: 32
  property int marginY: 32
  property real cardOpacity: 0.5
  property real borderOpacity: 0.08
  property int interval: 1000

  // Pet settings (README): pet false hides the pigeon (the card stays),
  // petReactions false turns touch off (no petting, hover or drag dangle),
  // petMotion full | calm (no fidgets/extras) | still (mood frames only, no clock).
  property bool showPet: true
  property bool petReactions: true
  property string petMotion: "full"

  function applySettings(raw) {
    var cfg = null
    try { cfg = JSON.parse(raw) } catch (e) { return }
    var list = cfg && Array.isArray(cfg.plugins) ? cfg.plugins : []
    var entry = {}
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === "fynnp.desknet") { entry = list[i]; break }
    }
    showPet = entry.pet !== false
    petReactions = entry.petReactions !== false
    petMotion = ["full", "calm", "still"].indexOf(entry.petMotion) >= 0 ? entry.petMotion : "full"
    monitorName = typeof entry.monitor === "string" ? entry.monitor.slice(0, 64) : ""
    fallbackMonitor = typeof entry.fallbackMonitor === "string" ? entry.fallbackMonitor.slice(0, 64) : ""
    var as = parseFloat(entry.awayScale)
    awayScale = isNaN(as) ? 0 : Math.max(0.4, Math.min(1.5, as))
    var c = String(entry.corner || "bottom-left")
    corner = ["top-left", "top-right", "bottom-left", "bottom-right", "center-left", "center-right"].indexOf(c) >= 0 ? c : "bottom-left"
    marginX = clampInt(entry.marginX, 0, 2000, 32)
    marginY = clampInt(entry.marginY, 0, 2000, 32)
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
    if (isAway && awayScale > 0) return awayScale
    // Same physical size on every monitor (relative to the default monitor;
    // Hyprland's fractional scale, see DeskPlace.scaleFor).
    return place.scaleFor(targetScreen)
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

  // ---------- network feed ----------
  property bool ready: false
  property string iface: ""
  property string ip: ""
  property bool wifi: false
  property real rx: 0            // bytes/s
  property real tx: 0
  property real totalRx: 0       // bytes since the card started
  property real totalTx: 0
  property var rxHistory: []
  property var txHistory: []
  readonly property int historyLength: 40

  function num(v) {
    var n = Number(v)
    return v === null || v === undefined || !isFinite(n) ? 0 : Math.max(0, n)
  }

  function ingest(line) {
    var d = null
    try { d = JSON.parse(line) } catch (e) { return }
    if (!d || typeof d !== "object") return
    iface = typeof d["if"] === "string" ? d["if"].replace(/[\x00-\x1f\x7f]/g, "").slice(0, 24) : ""
    ip = typeof d.ip === "string" ? d.ip.replace(/[^0-9.]/g, "").slice(0, 15) : ""
    wifi = d.wifi === true
    rx = num(d.rx)
    tx = num(d.tx)
    totalRx = num(d.trx)
    totalTx = num(d.ttx)
    var hr = rxHistory.slice(-(historyLength - 1))
    hr.push(rx)
    rxHistory = hr
    var ht = txHistory.slice(-(historyLength - 1))
    ht.push(tx)
    txHistory = ht
    ready = true
  }

  Process {
    id: feed
    command: [root.home + "/.local/bin/desknet-feed"]
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
  readonly property bool online: iface !== ""
  // Shared scale for both history halves: the window's peak, but never below
  // ~1 Mbit/s so background chatter stays a flat baseline.
  readonly property real historyScale: {
    var m = 125000
    for (var i = 0; i < rxHistory.length; i++) m = Math.max(m, rxHistory[i])
    for (var j = 0; j < txHistory.length; j++) m = Math.max(m, txHistory[j])
    return m
  }
  function scaled(list) {
    var out = []
    for (var i = 0; i < list.length; i++) out.push(list[i] / historyScale)
    return out
  }
  // Mood from the busiest of the last 3 samples, so it doesn't flap per second.
  readonly property real recent: {
    var m = 0
    var n = Math.min(rxHistory.length, txHistory.length)
    for (var i = Math.max(0, n - 3); i < n; i++) m = Math.max(m, rxHistory[i] + txHistory[i])
    return m
  }
  readonly property string mood: demoMood !== "" ? demoMood : liveMood
  readonly property string liveMood: !ready ? "idle"
    : !online ? "offline"
    : recent < 24000 ? "idle"
    : recent < 500000 ? "light"
    : "busy"

  function fmt(v, d) { return Commons.I18n.formatNumber(v, d) }
  // Decimal units, like file managers and download dialogs.
  function bytes(v) {
    if (v < 999.5) return fmt(Math.round(v), 0) + " B"
    var units = ["KB", "MB", "GB", "TB"]
    var u = -1
    while (v >= 999.5 && u < units.length - 1) { v /= 1000; u++ }
    return fmt(v, v < 100 ? 1 : 0) + " " + units[u]
  }
  function rate(v) { return bytes(v) + "/s" }
  readonly property real totalBoth: totalRx + totalTx

  // Pet clock (seconds): ticks only while visible and the pigeon animates
  // (a calm pigeon just blinks on its own timer); 8 fps only while it reacts
  // to a touch or a drag.
  property real clock: 0
  Timer {
    interval: buddy.touch.busy ? 125 : 250
    repeat: true
    running: root.active && root.showPet && root.petMotion !== "still" && buddy.needsClock
    onTriggered: root.clock += interval / 1000
  }

  // Mood bus, read-only: the pigeon reacts to the cat but doesn't publish a
  // mood of its own (no name = nothing written).
  DeskLink { id: link }

  // ---------- look ----------
  readonly property int cardWidth: 360
  readonly property int pad: Style.space(14)

  // Demo / test hook for tools/pet-demo: override the pet's mood ("" = live data) and play
  // touch reactions (pet | annoyed | squish | land). Does nothing until called.
  property string demoMood: ""
  IpcHandler {
    target: "desknet"
    function demo(mood: string): void { root.demoMood = mood }
    // outfits: "" (back to the date) | xmas | party | spooky; night: nightcap when asleep, morning: coffee on wake
    function season(key: string): void { seasonCal.demoSeason = key }
    function night(on: bool): void { seasonCal.demoNight = on ? 1 : -1 }
    function morning(on: bool): void { seasonCal.demoMorning = on ? 1 : -1 }
    function react(kind: string): void {
      if (kind === "land") buddy.touch.landings++
      else buddy.touch.react(kind === "none" ? "" : kind, kind === "annoyed" ? 2600 : kind === "squish" ? 2200 : 1800)
    }
  }

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

    WlrLayershell.namespace: "fynnp-desknet"
    WlrLayershell.layer: place.wlrLayer
    WlrLayershell.keyboardFocus: place.keyboardFocus
    exclusionMode: ExclusionMode.Ignore
    // Only the pet takes the pointer; the rest falls through to the desktop.
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
      pluginId: "fynnp.desknet"
      label: root.manifest && root.manifest.name ? String(root.manifest.name) : "Desk Net"
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

        // ---- pixel pigeon + interface / down / up ----
        Item {
          width: parent.width
          height: root.showPet ? buddy.height : buddyStatus.implicitHeight

          PixelRouter {
            id: buddy
            season: seasonCal.season
            night: seasonCal.night
            morning: seasonCal.morning
            px: 2
            visible: root.showPet
            width: root.showPet ? 44 * px : 0
            motion: root.petMotion
            reactions: root.petReactions
            mood: root.mood
            clock: root.clock
            active: root.active && root.showPet
            rx: root.rx
            tx: root.tx
            catMood: link.peers.cat || ""
            place: place
            window: win.contentItem
          }

          Column {
            id: buddyStatus
            anchors.left: buddy.right
            anchors.leftMargin: root.showPet ? Style.space(10) : 0
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            spacing: 2

            // interface + address (or the state while there is none)
            Item {
              width: parent.width
              height: ifName.implicitHeight

              DaText {
                id: ifGlyph
                anchors.verticalCenter: parent.verticalCenter
                width: 18
                text: !root.ready || root.online ? (root.wifi ? "󰖩" : "󰈀") : "󰲛"
                color: root.ready && !root.online ? Commons.Color.urgent : Commons.Color.accent
                font.pixelSize: Style.font.title
              }
              DaText {
                id: ifName
                anchors.left: ifGlyph.right
                anchors.leftMargin: 6
                anchors.verticalCenter: parent.verticalCenter
                width: Math.min(implicitWidth, parent.width - ifGlyph.width - 6)
                text: !root.ready ? strings.t("waiting", "Waking up…")
                  : root.online ? root.iface : strings.t("offline", "Offline")
                color: root.ready && !root.online ? Commons.Color.urgent : Commons.Color.foreground
                font.pixelSize: Style.font.subtitle
                font.bold: true
              }
              DaText {
                anchors.left: ifName.right
                anchors.leftMargin: 8
                anchors.right: parent.right
                anchors.baseline: ifName.baseline
                visible: root.ready && root.online
                text: root.ip || strings.t("noAddress", "no IPv4")
                font.pixelSize: Style.font.caption
                opacity: 0.6
              }
            }

            // down / up rates
            Row {
              spacing: 6
              DaText {
                anchors.verticalCenter: parent.verticalCenter
                width: 18
                text: "󰇚"
                color: Commons.Color.accent
                font.pixelSize: Style.font.title
              }
              DaText {
                anchors.verticalCenter: parent.verticalCenter
                text: root.rate(root.rx)
                font.pixelSize: Style.font.body
                font.bold: true
                opacity: root.online ? 1 : 0.5
              }
            }
            Row {
              spacing: 6
              DaText {
                anchors.verticalCenter: parent.verticalCenter
                width: 18
                text: "󰕒"
                color: Commons.Color.accent
                font.pixelSize: Style.font.title
              }
              DaText {
                anchors.verticalCenter: parent.verticalCenter
                text: root.rate(root.tx)
                font.pixelSize: Style.font.body
                font.bold: true
                opacity: root.online ? 1 : 0.5
              }
            }
          }
        }

        // ---- 40 s throughput history: down grows up, up mirrors below ----
        Column {
          width: parent.width
          spacing: 2   // the lattice gap, so both halves read as one grid

          CellGrid {
            width: parent.width
            cells: 3
            values: root.scaled(root.rxHistory)
          }
          CellGrid {
            id: upGrid
            width: parent.width
            cells: 3
            values: root.scaled(root.txHistory)
            transform: Scale { origin.y: upGrid.height / 2; yScale: -1 }
          }
        }

        PanelSeparator { width: parent.width }

        PanelSectionHeader { text: strings.t("sinceStart", "Since start") }

        StatRow {
          glyph: "󰇚"
          label: strings.t("downloaded", "Downloaded")
          detail: root.bytes(root.totalRx)
          fraction: root.totalBoth > 0 ? root.totalRx / root.totalBoth : 0
        }

        StatRow {
          glyph: "󰕒"
          label: strings.t("uploaded", "Uploaded")
          detail: root.bytes(root.totalTx)
          fraction: root.totalBoth > 0 ? root.totalTx / root.totalBoth : 0
        }
      }
    }
  }
}
