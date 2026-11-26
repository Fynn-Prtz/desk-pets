import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import Quickshell.Hyprland
import qs.Commons
import qs.Commons as Commons
import qs.Ui

// Desk Memory: the system card's sibling. A pixel hamster that hoards RAM in
// its cheeks, and what's eating the RAM per app as a pixel-art pie with a
// legend, on the desktop layer.
//
// Data comes from ~/.local/bin/deskmem-feed (Rust, source in helpers/deskmem-feed of the desk-pets repo):
// it blocks on stdin and answers one JSON line per request, so it costs nothing
// between polls. Polling stops entirely while the card is covered.
//
// Settings live inline on this plugin's entry in ~/.config/omarchy/shell.json:
//   { "id": "fynnp.deskmem", "monitor": "DP-1", "corner": "top-left",
//     "marginX": 32, "marginY": 58, "opacity": 0.5, "interval": 3000 }
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
  property int interval: 3000

  // Pet settings (README): pet false hides the hamster (the card stays),
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
      if (list[i] && list[i].id === "fynnp.deskmem") { entry = list[i]; break }
    }
    showPet = entry.pet !== false
    petReactions = entry.petReactions !== false
    petMotion = ["full", "calm", "still"].indexOf(entry.petMotion) >= 0 ? entry.petMotion : "full"
    monitorName = typeof entry.monitor === "string" ? entry.monitor.slice(0, 64) : ""
    fallbackMonitor = typeof entry.fallbackMonitor === "string" ? entry.fallbackMonitor.slice(0, 64) : ""
    var as = parseFloat(entry.awayScale)
    awayScale = isNaN(as) ? 0 : Math.max(0.4, Math.min(1.5, as))
    var c = String(entry.corner || "top-left")
    corner = ["top-left", "top-right", "bottom-left", "bottom-right"].indexOf(c) >= 0 ? c : "top-left"
    marginX = clampInt(entry.marginX, 0, 2000, 32)
    marginY = clampInt(entry.marginY, 0, 2000, 58)
    var op = parseFloat(entry.opacity)
    cardOpacity = isNaN(op) ? 0.5 : Math.max(0.15, Math.min(1, op))
    var bo = parseFloat(entry.borderOpacity)
    borderOpacity = isNaN(bo) ? 0.08 : Math.max(0, Math.min(1, bo))
    interval = clampInt(entry.interval, 1000, 60000, 3000)
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

  // ---------- memory feed ----------
  // Sizes in MiB. apps = [{ name, mib }] biggest first (at most 6).
  property bool ready: false
  property real memTotal: 0
  property real memUsed: 0
  property real memFree: 0
  property real memOther: 0
  property var apps: []
  property bool growing: false

  function num(v) {
    var n = Number(v)
    return v === null || v === undefined || !isFinite(n) ? 0 : Math.max(0, n)
  }

  function ingest(line) {
    var d = null
    try { d = JSON.parse(line) } catch (e) { return }
    if (!d || typeof d !== "object") return
    var list = []
    var a = Array.isArray(d.a) ? d.a : []
    for (var i = 0; i < a.length && list.length < 6; i++) {
      if (!a[i] || typeof a[i].n !== "string") continue
      var n = a[i].n.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 24)
      list.push({ name: n || "?", mib: num(a[i].m) })
    }
    memTotal = num(d.t)
    var prevUsed = memUsed
    memUsed = Math.min(memTotal, num(d.u))
    // Growing: more than 1 % of RAM gone since the last sample.
    growing = ready && memTotal > 0 && memUsed - prevUsed > memTotal * 0.01
    memFree = Math.min(memTotal, num(d.f))
    memOther = num(d.o)
    // Only hand the views a new list when something they show changed.
    if (JSON.stringify(list) !== JSON.stringify(apps)) apps = list
    ready = true
  }

  Process {
    id: feed
    command: [root.home + "/.local/bin/deskmem-feed"]
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
  readonly property real usedFraction: memTotal > 0 ? memUsed / memTotal : 0
  readonly property bool critical: usedFraction > 0.9

  // Hamster ladder. Growing memory wakes it / gets it stuffing early.
  readonly property string petMood: {
    var u = usedFraction
    if (!ready) return "sleep"
    if (u < 0.35) return growing ? "calm" : "sleep"
    if (u < 0.6) return growing ? "busy" : "calm"
    if (u < 0.8) return "busy"
    if (u < 0.9) return "strain"
    return "critical"
  }

  // Pet clock: only ticks while visible and something animates (a calm
  // hamster just blinks on its own timer). 8 fps only during reactions.
  property real clock: 0
  Timer {
    interval: hamster.touch.busy ? 125 : 250
    repeat: true
    running: root.active && root.showPet && root.petMotion !== "still" && (root.petMood !== "calm" || hamster.moving)
    onTriggered: root.clock += interval / 1000
  }

  // Read-only view of the mood bus (no name = publishes nothing), so the
  // hamster can groove when the audio card's cat dances.
  DeskLink { id: link }

  // Slice colours, all from the theme: accent first, then tints of
  // accent / foreground / urgent; "other" is a quiet foreground; "free" is
  // the unlit cell colour (fg@0.07), as on CellGrid.
  readonly property var appColors: [
    Commons.Color.accent,
    Qt.tint(Commons.Color.accent, Util.alpha(Commons.Color.urgent, 0.55)),
    Qt.tint(Commons.Color.foreground, Util.alpha(Commons.Color.accent, 0.25)),
    Qt.tint(Commons.Color.accent, Util.alpha(Commons.Color.background, 0.45)),
    Qt.tint(Commons.Color.urgent, Util.alpha(Commons.Color.foreground, 0.35)),
    Qt.tint(Commons.Color.accent, Util.alpha(Commons.Color.foreground, 0.55))
  ]
  readonly property color otherColor: Util.alpha(Commons.Color.foreground, 0.35)

  // Pie slices: apps, then "other"; whatever is left of the circle is free.
  readonly property var pieFractions: {
    var f = []
    if (memTotal <= 0) return f
    for (var i = 0; i < apps.length; i++) f.push(apps[i].mib / memTotal)
    f.push(memOther / memTotal)
    return f
  }
  readonly property var pieColors: {
    var c = []
    for (var i = 0; i < apps.length; i++) c.push(appColors[i % appColors.length])
    c.push(otherColor)
    return c
  }

  function fmt(v, d) { return Commons.I18n.formatNumber(v, d) }
  function sub(s, a) { return String(s).replace("%1", a) }
  function gb(mib) { return fmt(mib / 1024, 1) }
  // Below 1 GB in MB, above in GB with one decimal.
  function size(mib) { return mib < 1024 ? fmt(Math.round(mib), 0) + " MB" : gb(mib) + " GB" }
  function frac(mib) { return memTotal > 0 ? mib / memTotal : 0 }

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

    WlrLayershell.namespace: "fynnp-deskmem"
    WlrLayershell.layer: place.wlrLayer
    WlrLayershell.keyboardFocus: place.keyboardFocus
    exclusionMode: ExclusionMode.Ignore
    // Only the hamster takes input; the rest falls through to the desktop.
    mask: place.editing ? place.editMask : petRegion
    Region {
      id: petRegion
      x: hamster.touch.maskRect.x
      y: hamster.touch.maskRect.y
      width: hamster.touch.maskRect.width
      height: hamster.touch.maskRect.height
    }

    // Placement + edit mode; see docs/DESKPLACE.md in the desk-pets repo.
    DeskPlace {
      id: place
      pluginId: "fynnp.deskmem"
      label: root.manifest && root.manifest.name ? String(root.manifest.name) : "Desk Memory"
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

        // ---- hamster + status ----
        Item {
          width: parent.width
          height: root.showPet ? hamster.height : hamsterStatus.implicitHeight

          PixelHamster {
            id: hamster
            px: 2
            visible: root.showPet
            width: root.showPet ? 44 * px : 0
            motion: root.petMotion
            reactions: root.petReactions
            mood: root.petMood
            fill: root.usedFraction
            clock: root.clock
            active: root.active && root.showPet
            catMood: link.peers.cat || ""
            place: place
            window: win.contentItem
          }

          Column {
            id: hamsterStatus
            anchors.left: hamster.right
            anchors.leftMargin: root.showPet ? Style.space(10) : 0

            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            spacing: 2

            DaText {
              width: parent.width
              text: !root.ready ? strings.t("waiting", "Waking up…")
                : strings.t("ram", "RAM") + " " + root.gb(root.memUsed) + " / " + root.fmt(Math.round(root.memTotal / 1024), 0) + " GB"
              color: root.critical ? Commons.Color.urgent : Commons.Color.foreground
              font.pixelSize: Style.font.subtitle
              font.bold: true
            }
            DaText {
              width: parent.width
              visible: root.apps.length > 0
              text: root.apps.length > 0
                ? root.sub(strings.t("biggest", "Biggest: %1"), root.apps[0].name + "  ·  " + root.size(root.apps[0].mib)) : ""
              font.pixelSize: Style.font.caption
              opacity: 0.6
            }
            Row {
              spacing: 6
              visible: root.ready
              DaText {
                anchors.verticalCenter: parent.verticalCenter
                text: "󰍛"
                color: root.critical ? Commons.Color.urgent : Commons.Color.accent
                font.pixelSize: Style.font.title
              }
              DaText {
                anchors.verticalCenter: parent.verticalCenter
                text: root.sub(strings.t("used", "%1% used"), Math.round(root.usedFraction * 100))
                color: root.critical ? Commons.Color.urgent : Commons.Color.foreground
                font.pixelSize: Style.font.body
                font.bold: true
              }
            }
          }
        }

        PanelSeparator { width: parent.width; visible: root.ready }

        // ---- the pie (the showpiece) with its legend beside it ----
        Item {
          width: parent.width
          height: Math.max(pie.height, legend.implicitHeight)
          visible: root.ready

          PixelPie {
            id: pie
            anchors.verticalCenter: parent.verticalCenter
            cells: 32
            fractions: root.pieFractions
            colors: root.pieColors
          }

          Column {
            id: legend
            anchors.left: pie.right
            anchors.leftMargin: Style.space(12)
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter

            Repeater {
              model: root.apps
              LegendRow {
                required property var modelData
                required property int index
                width: parent.width
                swatch: root.appColors[index % root.appColors.length]
                label: modelData.name
                detail: root.size(modelData.mib)
                fraction: root.frac(modelData.mib)
              }
            }

            // Quiet break between the apps and the rest.
            Item {
              width: parent.width
              height: 7
              PanelSeparator { anchors.verticalCenter: parent.verticalCenter; width: parent.width }
            }

            LegendRow {
              width: parent.width
              swatch: root.otherColor
              label: strings.t("other", "Other")
              detail: root.size(root.memOther)
              fraction: root.frac(root.memOther)
              dim: true
            }
            LegendRow {
              width: parent.width
              // The pie's free cells (fg@0.07) would vanish as a lone swatch; a bit stronger.
              swatch: Util.alpha(Commons.Color.foreground, 0.15)
              label: strings.t("free", "Free")
              detail: root.size(root.memFree)
              fraction: root.frac(root.memFree)
              dim: true
            }
          }
        }
      }
    }
  }
}
