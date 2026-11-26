import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import Quickshell.Hyprland
import qs.Commons
import qs.Commons as Commons
import qs.Ui
import "Weather.js" as Weather

// Desk Weather: current weather, the next 40 hours and three days ahead on the
// desktop layer, with a pixel frog that dresses for it (umbrella, sunglasses,
// scarf) and jumps in puddles when it rains.
//
// Data: Open-Meteo (no API key) fetched with curl in a one-shot Process, at most
// every `refresh` minutes (>= 30) and ONLY while the card is visible. Nothing is
// fetched until latitude/longitude are set: the card shows a setup hint. The
// response is cached in ~/.cache/fynnp-desk/weather-<lat>_<lon>.json, so a shell
// restart reuses it instead of fetching again.
//
// Settings live inline on this plugin's entry in ~/.config/omarchy/shell.json:
//   { "id": "fynnp.deskweather", "latitude": 52.52, "longitude": 13.405,
//     "place": "Berlin", "units": "metric", "refresh": 30, "corner": "top-left" }
Item {
  id: root

  property var shell: null
  property var manifest: null
  readonly property string home: Quickshell.env("HOME")

  Commons.Translations { id: strings; directory: Qt.resolvedUrl("i18n") }

  // ---------- seasonal outfit (season-hats): date -> PetSeason key ----------
  // "seasons" / "birthday" / "dayNight" live on the fynnp.desklayout entry (PetCalendar.qml).
  PetCalendar { id: seasonCal; active: root.active }

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
  property real latitude: NaN
  property real longitude: NaN
  property string placeName: ""
  property bool imperial: false
  property int refreshMinutes: 30
  // Pet settings (README): pet false hides the frog (the card stays),
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
      if (list[i] && list[i].id === "fynnp.deskweather") { entry = list[i]; break }
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
    var lat = parseFloat(entry.latitude), lon = parseFloat(entry.longitude)
    latitude = isNaN(lat) ? NaN : lat
    longitude = isNaN(lon) ? NaN : lon
    placeName = typeof entry.place === "string" ? entry.place.replace(/[\x00-\x1f\x7f]/g, "").slice(0, 32) : ""
    imperial = entry.units === "imperial"
    refreshMinutes = clampInt(entry.refresh, 30, 1440, 30)
    showPet = entry.pet !== false
    petReactions = entry.petReactions !== false
    var pm = String(entry.petMotion || "full")
    petMotion = ["full", "calm", "still"].indexOf(pm) >= 0 ? pm : "full"
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

  // ---------- weather feed ----------
  // One curl per refresh, only while visible, never before a location is set.
  readonly property bool configured: Weather.validCoord(latitude, longitude)
  readonly property string cacheDir: (Quickshell.env("XDG_CACHE_HOME") || root.home + "/.cache") + "/fynnp-desk"
  readonly property string cachePath: configured
    ? cacheDir + "/weather-" + Weather.coordText(latitude) + "_" + Weather.coordText(longitude) + ".json" : ""
  readonly property real periodMs: refreshMinutes * 60000

  property var model: null           // Weather.parse() result
  property real fetchedAt: 0         // unix s of the shown data
  property real nextTry: 0           // ms: earliest retry after a failure
  property real lastOk: 0            // ms: last fetch that exited 0 (even if its data was unusable)
  property int failures: 0
  property bool started: false       // the cache had its chance to load first
  property real nowSec: Date.now() / 1000

  onCachePathChanged: { model = null; fetchedAt = 0; nextTry = 0; lastOk = 0; failures = 0; schedule() }
  onActiveChanged: schedule()
  onPeriodMsChanged: schedule()

  function ingest(text) {
    var m = Weather.parse(text)
    if (!m) return
    model = m
    fetchedAt = m.fetched
    nowSec = Date.now() / 1000
  }

  function schedule() {
    refetch.stop()
    if (!started || !active || !configured || fetchProc.running) return
    var now = Date.now()
    // never more than once per period, even if a response turned out unusable
    var due = Math.max(fetchedAt * 1000 + periodMs, lastOk + periodMs, nextTry)
    if (now >= due) fetchProc.running = true
    else { refetch.interval = Math.max(1000, Math.min(due - now, 86400000)); refetch.start() }
  }

  FileView {
    id: cacheFile
    path: root.cachePath
    printErrors: false
    onLoaded: { root.ingest(text()); root.schedule() }
    onLoadFailed: root.schedule()
  }

  Timer { id: refetch; onTriggered: root.schedule() }
  // Give the cache a moment to load before the first fetch decision.
  Timer { interval: 1500; running: true; onTriggered: { root.started = true; root.schedule() } }

  Process {
    id: fetchProc
    // $1 dir, $2 cache file, $3 url. The response is wrapped with the fetch
    // time and swapped in atomically; a failed fetch leaves the old cache.
    command: ["sh", "-c",
      "mkdir -p \"$1\" && d=$(curl -fsS --compressed --max-time 20 \"$3\") && [ -n \"$d\" ]"
      + " && printf '{\"fetched\":%s,\"data\":%s}\\n' \"$(date +%s)\" \"$d\" > \"$2.tmp\" && mv \"$2.tmp\" \"$2\"",
      "sh", root.cacheDir, root.cachePath, root.configured ? Weather.url(root.latitude, root.longitude) : ""]
    onExited: function(code) {
      if (code === 0) {
        root.failures = 0
        root.nextTry = 0
        root.lastOk = Date.now()
        cacheFile.reload()
      } else {
        root.failures++
        // 2, 4, 8 ... minutes, at most the refresh period
        root.nextTry = Date.now() + Math.min(root.periodMs, Math.pow(2, Math.min(root.failures, 5)) * 60000)
      }
      root.schedule()
    }
  }

  // Re-reads the wall clock now and then while visible (night / sleep switch).
  Timer {
    interval: 15 * 60000
    repeat: true
    running: root.active && !!root.model
    onTriggered: root.nowSec = Date.now() / 1000
  }
  onModelChanged: nowSec = Date.now() / 1000

  // ---------- derived ----------
  readonly property bool hasData: !!model
  readonly property int localHour: hasData ? Weather.hourOf(nowSec, model.offset) : 12
  readonly property var frogState: demoMood !== "" ? { mood: demoMood, cold: demoMood === "snow" || demoMood === "cold", heavy: false }
    : liveFrogState
  readonly property var liveFrogState: !configured ? { mood: "setup", cold: false, heavy: false }
    : !hasData ? { mood: failures > 0 ? "offline" : "waiting", cold: false, heavy: false }
    : Weather.mood(model, localHour)
  readonly property var info: hasData ? Weather.info(model.code) : null
  readonly property bool stale: hasData && nowSec - fetchedAt > 3 * 3600

  function temp(c) {
    if (!isFinite(c)) return "–"
    var v = imperial ? c * 9 / 5 + 32 : c
    return Commons.I18n.formatNumber(Math.round(v), 0) + "°"
  }
  function windText(kmh) {
    return imperial ? Math.round(kmh / 1.609) + " mph" : Math.round(kmh) + " km/h"
  }
  function join(a, b) { return a && b ? a + "  ·  " + b : (a || b) }
  function dayName(t) {
    var d = Weather.weekday(t, model.offset)
    return strings.t("day" + d, ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d])
  }

  readonly property string title: !configured ? strings.t("setupTitle", "Where's your pond?")
    : !hasData ? (failures > 0 ? strings.t("offline", "No weather") : strings.t("waiting", "Checking the sky…"))
    : strings.t(info.key, info.label)
  readonly property string subtitle: {
    if (!configured) return strings.t("setupHint", "Set latitude and longitude in shell.json")
    if (!hasData) return failures > 0 ? strings.t("offlineHint", "Can't reach Open-Meteo, retrying") : root.placeName
    var parts = root.join(root.placeName, strings.t("feels", "feels") + " " + root.temp(model.feels))
    parts = root.join(parts, root.windText(model.wind))
    if (stale) parts = root.join(parts, strings.t("updated", "updated") + " " + Weather.hhmm(fetchedAt, model.offset))
    return parts
  }
  readonly property string rainText: {
    if (!hasData) return ""
    if (model.hourRain.length && model.hourRain[0] >= 50)
      return Weather.info(model.code).kind === "snow" ? strings.t("snowNow", "Snowy for now") : strings.t("rainNow", "Wet for now")
    var r = Weather.nextRain(model)
    if (!r) return strings.t("dryAhead", "Dry for 40 h")
    var c = Weather.info(model.hourCode[r.index]).kind
    return (c === "snow" ? strings.t("snowFrom", "Snow from") : strings.t("rainFrom", "Rain from")) + " " + Weather.hhmm(r.time, model.offset)
  }
  readonly property var curve: hasData ? Weather.tempCurve(model) : []
  // Days 1..3 and the overall low / high across them (range bars).
  readonly property var days: {
    if (!hasData) return []
    var out = []
    for (var i = 1; i < model.dayTime.length; i++) out.push(i)
    return out
  }
  readonly property real rangeLo: {
    if (!hasData) return 0
    var lo = 1e9
    for (var i = 0; i < model.dayMin.length; i++) if (isFinite(model.dayMin[i])) lo = Math.min(lo, model.dayMin[i])
    return lo
  }
  readonly property real rangeHi: {
    if (!hasData) return 1
    var hi = -1e9
    for (var i = 0; i < model.dayMax.length; i++) if (isFinite(model.dayMax[i])) hi = Math.max(hi, model.dayMax[i])
    return Math.max(hi, rangeLo + 1)
  }
  function rangePos(v) { return isFinite(v) ? (v - rangeLo) / (rangeHi - rangeLo) : 0 }

  // Pixel frog clock (seconds): only while visible and something animates;
  // 4 fps, 8 fps during a touch reaction / drag / landing. Never with petMotion still.
  property real clock: 0
  Timer {
    interval: frog.fast ? 125 : 250
    repeat: true
    running: root.active && root.showPet && root.petMotion !== "still" && (frog.animated || frog.moving)
    onTriggered: root.clock += interval / 1000
  }

  // Demo / test hook for tools/pet-demo: override the frog's weather mood ("" = live data) and play
  // touch reactions (pet | annoyed | squish | land). Does nothing until called.
  property string demoMood: ""
  IpcHandler {
    target: "deskweather"
    function demo(mood: string): void { root.demoMood = mood }
    // outfits: "" (back to the date) | xmas | party | spooky; night: nightcap when asleep, morning: coffee on wake
    function season(key: string): void { seasonCal.demoSeason = key }
    function night(on: bool): void { seasonCal.demoNight = on ? 1 : -1 }
    function morning(on: bool): void { seasonCal.demoMorning = on ? 1 : -1 }
    function react(kind: string): void {
      if (kind === "land") frog.touch.landings++
      else frog.touch.react(kind === "none" ? "" : kind, kind === "annoyed" ? 2600 : kind === "squish" ? 2200 : 1800)
    }
  }
  // Welcome back: the frog greets once when the user returns (shared/PetGreet.qml).
  PetGreet { id: greet; pluginId: "fynnp.deskweather"; rect: place.rect; active: root.active && root.showPet && !place.editing }
  // Affection: counts pets, level 1..5 (shared/PetMemory.qml).
  PetMemory { id: memory; pluginId: "fynnp.deskweather"; touch: frog.touch }

  // Listens to the other cards (cat dancing, gamer launching); publishes nothing.
  DeskLink { id: link; name: "" }

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

    WlrLayershell.namespace: "fynnp-deskweather"
    WlrLayershell.layer: place.wlrLayer
    WlrLayershell.keyboardFocus: place.keyboardFocus
    exclusionMode: ExclusionMode.Ignore
    // Only the frog takes input (petting); the rest falls through to the desktop.
    mask: place.editing ? place.editMask : petRegion
    Region {
      id: petRegion
      x: frog.touch.maskRect.x
      y: frog.touch.maskRect.y
      width: frog.touch.maskRect.width
      height: frog.touch.maskRect.height
    }

    // Placement + edit mode; see docs/DESKPLACE.md in the desk-pets repo.
    DeskPlace {
      id: place
      pluginId: "fynnp.deskweather"
      label: root.manifest && root.manifest.name ? String(root.manifest.name) : "Desk Weather"
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

        // ---- pixel frog + now ----
        Item {
          width: parent.width
          height: root.showPet ? frog.height : frogStatus.implicitHeight

          PixelFrog {
            id: frog
            px: 2
            visible: root.showPet
            width: root.showPet ? 44 * px : 0
            motion: root.petMotion
            reactions: root.petReactions
            season: seasonCal.season
            night: seasonCal.night
            morning: seasonCal.morning
            greetSerial: greet.serial
            affection: memory.level
            affectionUp: memory.fresh
            mood: root.frogState.mood
            cold: root.frogState.cold
            heavy: root.frogState.heavy
            clock: root.clock
            active: root.active && root.showPet
            place: place
            window: win.contentItem
            catMood: link.peers.cat || ""
            gamerMood: link.peers.gamer || ""
          }

          Column {
            id: frogStatus
            anchors.left: frog.right
            anchors.leftMargin: root.showPet ? Style.space(10) : 0
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            spacing: 2

            DaText {
              width: parent.width
              text: root.title
              font.pixelSize: Style.font.subtitle
              font.bold: true
            }
            DaText {
              width: parent.width
              visible: text !== ""
              text: root.subtitle
              font.pixelSize: Style.font.caption
              wrapMode: root.configured ? Text.NoWrap : Text.WordWrap
              maximumLineCount: 2
              opacity: 0.6
            }
            Row {
              spacing: 6
              visible: root.hasData
              DaText {
                anchors.verticalCenter: parent.verticalCenter
                text: root.hasData ? Weather.glyph(root.model.code, root.model.isDay) : ""
                color: Commons.Color.accent
                font.pixelSize: Style.font.title
              }
              DaText {
                anchors.verticalCenter: parent.verticalCenter
                text: root.hasData ? root.temp(root.model.temp) : ""
                font.pixelSize: Style.font.body
                font.bold: true
              }
              DaText {
                anchors.verticalCenter: parent.verticalCenter
                text: root.hasData && root.model.dayMax.length
                  ? root.temp(root.model.dayMin[0]) + " / " + root.temp(root.model.dayMax[0]) : ""
                font.pixelSize: Style.font.caption
                opacity: 0.6
              }
            }
          }
        }

        // ---- next 40 hours: temperature on the lattice ----
        CellGrid {
          visible: root.hasData
          width: parent.width
          values: root.curve
        }
        Item {
          visible: root.hasData
          width: parent.width
          height: nextLabel.implicitHeight
          DaText {
            id: nextLabel
            anchors.left: parent.left
            text: strings.t("next40", "Next 40 h")
            font.pixelSize: Style.font.caption
            opacity: 0.6
          }
          DaText {
            anchors.right: parent.right
            text: root.rainText
            font.pixelSize: Style.font.caption
            opacity: 0.6
          }
        }

        PanelSeparator { visible: root.hasData; width: parent.width }

        Repeater {
          model: root.days
          DayRow {
            required property int modelData
            glyph: Weather.glyph(root.model.dayCode[modelData], true)
            label: root.dayName(root.model.dayTime[modelData])
            detail: root.model.dayRain[modelData] >= 0
              ? strings.t(Weather.info(root.model.dayCode[modelData]).key, Weather.info(root.model.dayCode[modelData]).label)
                + "  ·  " + root.model.dayRain[modelData] + " %"
              : strings.t(Weather.info(root.model.dayCode[modelData]).key, Weather.info(root.model.dayCode[modelData]).label)
            temps: root.temp(root.model.dayMin[modelData]) + " / " + root.temp(root.model.dayMax[modelData])
            from: root.rangePos(root.model.dayMin[modelData])
            to: root.rangePos(root.model.dayMax[modelData])
          }
        }
      }
    }
  }
}
