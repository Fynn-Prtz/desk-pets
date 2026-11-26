import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import Quickshell.Hyprland
import qs.Commons
import qs.Commons as Commons
import qs.Ui

// Desk Games: the system and audio cards' sibling. A pixel gamepad buddy, the
// recently played Steam games (click to launch) and the last game session's
// numbers, on the desktop layer.
//
// Library data comes from bin/deskgames-feed (Rust, source in helper/): it
// sleeps on inotify and prints one JSON line when Steam's manifests or
// localconfig.vdf, or the session report, actually change. "Playing" comes
// from Hyprland toplevels (steam_app_<appid>), the same events the occlusion
// check already listens to. Nothing ticks while the card is covered.
//
// Settings live inline on this plugin's entry in ~/.config/omarchy/shell.json:
//   { "id": "fynnp.deskgames", "monitor": "DP-1", "corner": "center-right",
//     "marginX": 32, "marginY": 0, "opacity": 0.5, "borderOpacity": 0.08,
//     "fpsTarget": 165, "rows": 4 }
// corner: top-left | top-right | bottom-left | bottom-right | center-left | center-right
Item {
  id: root

  property var shell: null
  property var manifest: null
  readonly property string home: Quickshell.env("HOME")
  readonly property string pluginDir: String(Qt.resolvedUrl(".")).replace(/^file:\/\//, "").replace(/\/+$/, "")

  Commons.Translations { id: strings; directory: Qt.resolvedUrl("i18n") }

  // ---------- seasonal outfit (season-hats): date -> PetSeason key ----------
  // "seasons" / "birthday" live on the fynnp.desklayout entry (PetCalendar.qml).
  PetCalendar { id: seasonCal; active: root.active }

  // ---------- settings ----------
  property string monitorName: ""
  property string corner: "center-right"
  property int marginX: 32
  property int marginY: 0
  property real cardOpacity: 0.5
  property real borderOpacity: 0.08
  property int fpsTarget: 165
  property int maxRows: 4

  // Pet settings (README): pet false hides the axolotl (the card stays),
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
      if (list[i] && list[i].id === "fynnp.deskgames") { entry = list[i]; break }
    }
    showPet = entry.pet !== false
    petReactions = entry.petReactions !== false
    petMotion = ["full", "calm", "still"].indexOf(entry.petMotion) >= 0 ? entry.petMotion : "full"
    monitorName = typeof entry.monitor === "string" ? entry.monitor.slice(0, 64) : ""
    var c = String(entry.corner || "center-right")
    corner = ["top-left", "top-right", "bottom-left", "bottom-right", "center-left", "center-right"].indexOf(c) >= 0 ? c : "center-right"
    marginX = clampInt(entry.marginX, 0, 2000, 32)
    marginY = clampInt(entry.marginY, 0, 2000, 0)
    var op = parseFloat(entry.opacity)
    cardOpacity = isNaN(op) ? 0.5 : Math.max(0.15, Math.min(1, op))
    var bo = parseFloat(entry.borderOpacity)
    borderOpacity = isNaN(bo) ? 0.08 : Math.max(0, Math.min(1, bo))
    fpsTarget = clampInt(entry.fpsTarget, 30, 1000, 165)
    maxRows = clampInt(entry.rows, 1, 6, 4)
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

  // No fullscreen fallback on purpose: a launcher is pointless while a game
  // is fullscreen, so the card just pauses while covered.
  // Home screen = the monitor the layout file names (DeskPlace), else the
  // shell.json `monitor` setting.
  readonly property var homeScreen: {
    var screens = Quickshell.screens
    for (var i = 0; i < screens.length; i++)
      if (screens[i].name === place.monitor) return screens[i]
    return screens.length > 0 ? screens[0] : null
  }
  readonly property var targetScreen: homeScreen
  readonly property real uiScale: 1

  // ---------- occlusion (same rules as the audio / system cards) ----------
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

  // ---------- library feed ----------
  property bool steamFound: true
  property var games: []
  property int totalMinutes: 0
  property int installedCount: 0

  function num(v) {
    var n = Number(v)
    return v === null || v === undefined || v === "" || !isFinite(n) ? -1 : n
  }
  function str(v, max) { return typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, max) : "" }

  function ingestLibrary(d) {
    steamFound = d.steam !== false
    totalMinutes = Math.max(0, num(d.total_min))
    installedCount = Math.max(0, num(d.installed))
    var out = []
    var list = Array.isArray(d.games) ? d.games : []
    for (var i = 0; i < list.length && out.length < 12; i++) {
      var g = list[i]
      if (!g || typeof g !== "object") continue
      var id = Math.floor(num(g.appid))
      if (id <= 0) continue
      var cover = str(g.cover, 512)
      out.push({
        appid: id,
        name: str(g.name, 80) || ("App " + id),
        dir: str(g.dir, 80).toLowerCase(),
        last: Math.max(0, num(g.last)),
        min: Math.max(0, num(g.min)),
        cover: /^\/[^\u0000]*\.(jpg|jpeg|png)$/i.test(cover) ? cover : ""
      })
    }
    games = out
    root.now = Date.now() / 1000
  }

  function ingest(line) {
    if (line.length > 65536) return
    var d = null
    try { d = JSON.parse(line) } catch (e) { return }
    if (!d || typeof d !== "object") return
    if (d.t === "lib") ingestLibrary(d)
    else if (d.t === "session") sessionFile.reload()
  }

  property int feedFailures: 0
  Process {
    id: feed
    command: [root.pluginDir + "/bin/deskgames-feed"]
    running: true
    stdinEnabled: true
    stdout: SplitParser { onRead: function(line) { root.ingest(line) } }
    onExited: function(code) {
      // Give up after a few crashes instead of restarting forever.
      if (++root.feedFailures <= 3) feedRestart.restart()
      else console.warn("fynnp.deskgames: deskgames-feed keeps exiting (code " + code + ")")
    }
  }
  Timer {
    id: feedRestart
    interval: 5000
    onTriggered: feed.running = true
  }

  // ---------- last session report (written by helpers/desk-session (desk-pets repo)) ----------
  // Reloaded only when the feed reports that latest.json changed.
  property var report: null
  FileView {
    id: sessionFile
    path: root.home + "/.local/state/fynnp-desk/sessions/latest.json"
    printErrors: false
    onLoaded: root.ingestReport(text())
    onLoadFailed: root.report = null
  }

  function ingestReport(raw) {
    if (!raw || raw.length > 65536) { report = null; return }
    var d = null
    try { d = JSON.parse(raw) } catch (e) { report = null; return }
    if (!d || typeof d !== "object") { report = null; return }
    var r = {
      appid: Math.max(0, Math.floor(num(d.appid))),
      game: str(d.game, 80),
      end: num(d.end),
      duration: num(d.duration_s),
      fps: num(d.fps_avg),
      low1: num(d.fps_1pct_low),
      low01: num(d.fps_0_1pct_low),
      cpuTemp: num(d.cpu_temp_max),
      gpuTemp: num(d.gpu_temp_max),
      kwh: num(d.energy_kwh)
    }
    if (r.end < 0 && num(d.start) >= 0 && r.duration >= 0) r.end = num(d.start) + r.duration
    if (!r.game && r.appid > 0) r.game = nameFor(r.appid)
    report = r
    root.now = Date.now() / 1000
  }

  // ---------- what is running ----------
  function nameFor(appid) {
    for (var i = 0; i < games.length; i++)
      if (games[i].appid === appid) return games[i].name
    return ""
  }

  // First toplevel that is a Steam game: steam_app_<appid> (Proton and most
  // native titles), or a native game whose class matches its install dir.
  readonly property var runningGame: {
    var rev = hyprRevision
    var list = Hyprland.toplevels ? Hyprland.toplevels.values : []
    for (var i = 0; i < list.length; i++) {
      var ipc = list[i].lastIpcObject
      if (!ipc || typeof ipc.class !== "string") continue
      var cls = ipc.class
      var m = /^steam_app_(\d{1,10})$/.exec(cls)
      var id = m ? parseInt(m[1], 10) : 0
      if (!id) {
        var lc = cls.toLowerCase()
        for (var j = 0; j < games.length; j++) {
          var dir = games[j].dir
          if (dir && (lc === dir || lc === dir.replace(/[^a-z0-9]/g, ""))) { id = games[j].appid; break }
        }
      }
      if (id > 0) {
        return {
          appid: id,
          name: nameFor(id) || str(ipc.title, 60) || ("App " + id),
          pid: Math.floor(num(ipc.pid))
        }
      }
    }
    return null
  }
  readonly property int runningAppid: runningGame ? runningGame.appid : 0
  readonly property bool playing: runningAppid > 0

  // Session start = the game process's age, asked once per new game.
  property real playStart: 0
  onRunningAppidChanged: {
    if (runningAppid <= 0) { playStart = 0; return }
    if (launchAppid > 0) launchAppid = 0
    playStart = Date.now() / 1000
    now = playStart
    var pid = runningGame.pid
    if (pid > 0) {
      ageProc.command = ["ps", "-o", "etimes=", "-p", String(pid)]
      ageProc.running = true
    }
  }
  Process {
    id: ageProc
    stdout: StdioCollector {
      onStreamFinished: {
        var s = parseInt(String(text).trim(), 10)
        if (!isNaN(s) && s >= 0 && s < 86400 * 7) root.playStart = Date.now() / 1000 - s
      }
    }
  }

  // ---------- launching ----------
  property int launchAppid: 0
  readonly property bool launching: launchAppid > 0 && !playing
  function launch(game) {
    if (!game || !(game.appid > 0) || playing) return
    launchAppid = game.appid
    launchTimeout.restart()
    Quickshell.execDetached(["steam", "steam://rungameid/" + game.appid])
  }
  Timer {
    id: launchTimeout
    interval: 90000
    onTriggered: root.launchAppid = 0
  }

  // ---------- time ----------
  // Relative times ("2h ago", the play clock) refresh once a minute -- every
  // 15 s while a game runs so the h:mm clock stays honest -- and only while
  // the card can be seen.
  property real now: Date.now() / 1000
  onActiveChanged: if (active) now = Date.now() / 1000
  Timer {
    interval: root.playing ? 15000 : 60000
    repeat: true
    running: root.active
    onTriggered: root.now = Date.now() / 1000
  }

  // ---------- mood ----------
  property bool hovering: false
  readonly property var lastGame: games.length > 0 && games[0].last > 0 ? games[0] : null
  readonly property bool freshReport: !!report && report.end > 0 && now - report.end < 1800 && now - report.end > -60
  readonly property bool recent: !!lastGame && now - lastGame.last < 3600
  readonly property string mood: demoMood !== "" ? demoMood : liveMood
  readonly property string liveMood: launching ? "launching"
    : playing ? "playing"
    : freshReport ? "report"
    : (hovering || recent) ? "ready"
    : "idle"

  DeskLink {
    id: link
    name: "gamer"
    mood: root.mood
  }
  // The system buddy's load makes the player struggle: 1 under load, 2 maxed / hot.
  readonly property int peerStrain: link.peers.buddy === "load" ? 1
    : (link.peers.buddy === "maxed" || link.peers.buddy === "hot") ? 2 : 0
  // Dancing along with the cat is an idle extra: petMotion full only.
  readonly property bool peerBop: link.peers.cat === "dance" && petMotion === "full"

  // Pet clock (seconds): 4 fps while visible and something moves, 8 fps
  // while a touch reaction / drag / landing plays. Ready and report rest.
  property real clock: 0
  Timer {
    interval: gamer.fast ? 125 : 250
    repeat: true
    running: root.active && root.showPet && root.petMotion !== "still"
      && (root.mood === "idle" || root.mood === "launching" || root.mood === "playing" || gamer.moving)
    onTriggered: root.clock += interval / 1000
  }

  // ---------- text ----------
  function fmt(v, d) { return Commons.I18n.formatNumber(v, d) }
  function sub(s, a) { return String(s).replace("%1", a) }
  function hours(min) {
    if (min < 60) return sub(strings.t("minutes", "%1 min"), fmt(Math.max(0, Math.round(min)), 0))
    return sub(strings.t("hours", "%1 h"), fmt(Math.round(min / 60 * (min < 600 ? 10 : 1)) / (min < 600 ? 10 : 1), min < 600 ? 1 : 0))
  }
  function ago(ts) {
    if (!(ts > 0)) return strings.t("never", "Not played yet")
    var s = Math.max(0, now - ts)
    if (s < 60) return strings.t("justNow", "just now")
    if (s < 3600) return sub(strings.t("minutesAgo", "%1m ago"), Math.floor(s / 60))
    if (s < 172800) return sub(strings.t("hoursAgo", "%1h ago"), Math.floor(s / 3600))
    if (s < 86400 * 60) return sub(strings.t("daysAgo", "%1d ago"), Math.floor(s / 86400))
    return sub(strings.t("monthsAgo", "%1mo ago"), Math.floor(s / (86400 * 30)))
  }
  function clockText(sec) {
    var m = Math.max(0, Math.floor(sec / 60))
    var mm = m % 60
    return Math.floor(m / 60) + ":" + (mm < 10 ? "0" : "") + mm
  }
  function duration(sec) {
    if (!(sec >= 0)) return ""
    var m = Math.round(sec / 60)
    if (m < 60) return sub(strings.t("minutes", "%1 min"), m)
    return strings.t("hoursMinutes", "%1 h %2 min").replace("%1", Math.floor(m / 60)).replace("%2", m % 60)
  }
  function deg(v) { return v >= 0 ? fmt(Math.round(v), 0) + "°C" : "" }
  function join(a, b) { return a && b ? a + "  ·  " + b : (a || b) }

  readonly property string launchName: launchAppid > 0 ? (nameFor(launchAppid) || ("App " + launchAppid)) : ""
  readonly property string title: launching ? sub(strings.t("launching", "Launching %1…"), launchName)
    : playing ? sub(strings.t("playing", "Playing %1"), runningGame.name) + " · " + clockText(now - playStart)
    : hovering || !lastGame ? strings.t("ready", "Ready to play")
    : sub(strings.t("last", "Last: %1"), lastGame.name)
  readonly property string detail: !steamFound ? strings.t("noSteam", "Steam library not found")
    : launching ? strings.t("starting", "Steam is starting the game")
    : playing ? strings.t("haveFun", "Have fun!")
    : freshReport ? strings.t("gg", "GG! Session report below")
    : lastGame ? ago(lastGame.last)
    : sub(strings.t("installed", "%1 games installed"), installedCount)

  readonly property var rows: games.slice(0, maxRows)

  // ---------- look ----------
  readonly property int cardWidth: 360
  readonly property int pad: Style.space(14)

  // Demo / test hook for tools/pet-demo: override the pet's mood ("" = live data) and play
  // touch reactions (pet | annoyed | squish | land). Does nothing until called.
  property string demoMood: ""
  IpcHandler {
    target: "deskgames"
    function demo(mood: string): void { root.demoMood = mood }
    function react(kind: string): void {
      if (kind === "land") gamer.touch.landings++
      else gamer.touch.react(kind === "none" ? "" : kind, kind === "annoyed" ? 2600 : kind === "squish" ? 2200 : 1800)
    }
  }

  PanelWindow {
    id: win
    screen: root.targetScreen
    visible: !!root.targetScreen
    color: "transparent"
    implicitWidth: root.cardWidth
    implicitHeight: Math.ceil(card.height)

    // Position, layer and input come from DeskPlace (layout file + edit mode).
    // center-*: one side anchored only; layer-shell centers it vertically.
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

    WlrLayershell.namespace: "fynnp-deskgames"
    WlrLayershell.layer: place.wlrLayer
    WlrLayershell.keyboardFocus: place.keyboardFocus
    exclusionMode: ExclusionMode.Ignore
    // Interactive: rows launch games, so no mask outside edit mode.
    mask: place.editing ? place.editMask : null

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

      HoverHandler {
        onHoveredChanged: root.hovering = hovered
      }

      Column {
        id: content
        x: card.borderLeft + root.pad
        y: card.borderTop + root.pad
        width: card.width - card.borderLeft - card.borderRight - root.pad * 2
        spacing: Style.space(10)

        // ---- pixel gamer + status ----
        Item {
          width: parent.width
          height: root.showPet ? gamer.height : gamerStatus.implicitHeight

          PixelGamer {
            id: gamer
            season: seasonCal.season
            night: seasonCal.night
            morning: seasonCal.morning
            px: 2
            visible: root.showPet
            width: root.showPet ? 44 * px : 0
            motion: root.petMotion
            reactions: root.petReactions
            mood: root.mood
            strain: root.peerStrain
            bop: root.peerBop
            clock: root.clock
            active: root.active && root.showPet
            place: place
            window: win.contentItem
          }

          Column {
            id: gamerStatus
            anchors.left: gamer.right
            anchors.leftMargin: root.showPet ? Style.space(10) : 0

            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            spacing: 2

            DaText {
              width: parent.width
              text: root.title
              color: root.playing || root.launching ? Commons.Color.accent : Commons.Color.foreground
              font.pixelSize: Style.font.subtitle
              font.bold: true
            }
            DaText {
              width: parent.width
              text: root.detail
              font.pixelSize: Style.font.caption
              opacity: 0.6
            }
            Row {
              spacing: 6
              visible: root.steamFound && root.totalMinutes > 0
              DaText {
                anchors.verticalCenter: parent.verticalCenter
                text: "󰊴"
                color: Commons.Color.accent
                font.pixelSize: Style.font.title
              }
              DaText {
                anchors.verticalCenter: parent.verticalCenter
                text: root.hours(root.totalMinutes)
                font.pixelSize: Style.font.body
                font.bold: true
              }
              DaText {
                anchors.verticalCenter: parent.verticalCenter
                text: strings.t("played", "played")
                font.pixelSize: Style.font.caption
                opacity: 0.5
              }
            }
          }
        }

        // ---- recently played ----
        Column {
          width: parent.width
          spacing: 2
          visible: root.rows.length > 0

          DaText {
            leftPadding: 4
            bottomPadding: 2
            text: strings.t("recent", "Recently played")
            font.pixelSize: Style.font.caption
            opacity: 0.55
          }

          Repeater {
            model: root.rows
            delegate: GameRow {
              required property var modelData
              width: parent.width
              game: modelData
              ago: root.ago(modelData.last)
              playtime: root.hours(modelData.min)
              running: root.runningAppid === modelData.appid
              launching: root.launching && root.launchAppid === modelData.appid
              onLaunch: root.launch(modelData)
            }
          }
        }

        // ---- last session ----
        PanelSeparator {
          width: parent.width
          visible: !!root.report
        }

        Column {
          width: parent.width
          spacing: 4
          visible: !!root.report

          Item {
            width: parent.width
            height: 22

            DaText {
              id: sGlyph
              anchors.left: parent.left
              anchors.leftMargin: 4
              anchors.verticalCenter: parent.verticalCenter
              width: 18
              text: "󰔸"
              color: root.freshReport ? Commons.Color.accent : Util.alpha(Commons.Color.foreground, 0.6)
              font.pixelSize: Style.font.title
            }
            DaText {
              id: sTitle
              anchors.left: sGlyph.right
              anchors.leftMargin: 8
              anchors.right: sDur.left
              anchors.rightMargin: 8
              anchors.verticalCenter: parent.verticalCenter
              text: root.report ? (root.report.game || strings.t("lastSession", "Last session")) : ""
              font.pixelSize: Style.font.body
            }
            DaText {
              id: sDur
              anchors.right: parent.right
              anchors.rightMargin: 2
              anchors.verticalCenter: parent.verticalCenter
              elide: Text.ElideNone
              text: root.report ? root.join(root.duration(root.report.duration), root.report.end > 0 ? root.ago(root.report.end) : "") : ""
              font.pixelSize: Style.font.caption
              opacity: 0.6
            }
          }

          // FPS: avg (big) / 1% low, meter vs the monitor's refresh target.
          Item {
            width: parent.width
            height: 18
            visible: !!root.report && root.report.fps >= 0

            DaText {
              id: fpsGlyph
              anchors.left: parent.left
              anchors.leftMargin: 4
              anchors.verticalCenter: parent.verticalCenter
              width: 18
              text: "󰓅"
              color: Commons.Color.accent
              font.pixelSize: Style.font.title
            }
            DaText {
              id: fpsVal
              anchors.left: fpsGlyph.right
              anchors.leftMargin: 8
              anchors.verticalCenter: parent.verticalCenter
              elide: Text.ElideNone
              text: root.report && root.report.fps >= 0 ? root.sub(strings.t("fps", "%1 fps"), root.fmt(Math.round(root.report.fps), 0)) : ""
              font.pixelSize: Style.font.body
              font.bold: true
            }
            DaText {
              anchors.left: fpsVal.right
              anchors.leftMargin: 8
              anchors.right: parent.right
              anchors.rightMargin: 2
              anchors.verticalCenter: parent.verticalCenter
              horizontalAlignment: Text.AlignRight
              text: !root.report ? "" : root.join(
                root.report.low1 >= 0 ? root.sub(strings.t("low1", "1% low %1"), root.fmt(Math.round(root.report.low1), 0)) : "",
                root.sub(strings.t("target", "of %1"), root.fpsTarget))
              font.pixelSize: Style.font.caption
              opacity: 0.6
            }
          }

          CellGrid {
            width: parent.width
            visible: !!root.report && root.report.fps >= 0
            cells: 1
            fraction: root.report && root.report.fps >= 0 ? Math.min(1, root.report.fps / root.fpsTarget) : 0
          }

          DaText {
            width: parent.width
            leftPadding: 4
            visible: text !== ""
            text: !root.report ? "" : root.join(root.join(
              root.report.cpuTemp >= 0 ? strings.t("cpu", "CPU") + " " + root.deg(root.report.cpuTemp) : "",
              root.report.gpuTemp >= 0 ? strings.t("gpu", "GPU") + " " + root.deg(root.report.gpuTemp) : ""),
              root.report.kwh >= 0 ? root.fmt(root.report.kwh, 2) + " kWh" : "")
            font.pixelSize: Style.font.caption
            opacity: 0.6
          }
        }
      }
    }

    // Placement + edit mode; see docs/DESKPLACE.md in the desk-pets repo.
    DeskPlace {
      id: place
      pluginId: "fynnp.deskgames"
      label: root.manifest && root.manifest.name ? String(root.manifest.name) : "Desk Games"
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
  }
}
