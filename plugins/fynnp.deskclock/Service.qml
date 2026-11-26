import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import Quickshell.Hyprland
import qs.Commons
import qs.Commons as Commons
import qs.Ui

// Desk Clock: time, date, how far through the day / week / year, and uptime,
// with a pixel owl that keeps time next to its pocket watch, hoots on the
// hour (visual only) and sleeps at night.
//
// No helper and no polling: one Timer fires on each minute boundary, only
// while the card is visible; uptime is read from /proc/uptime once at start
// (and hourly) and counted on from there.
//
// Settings live inline on this plugin's entry in ~/.config/omarchy/shell.json:
//   { "id": "fynnp.deskclock", "corner": "top-right", "marginX": 408, "marginY": 58,
//     "clock24": true, "hoot": "count", "nightFrom": 23, "nightTo": 7 }
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
  property int marginX: 408
  property int marginY: 58
  property real cardOpacity: 0.5
  property real borderOpacity: 0.08
  property bool clock24: true
  property string hootMode: "count"     // count | once | off
  property int nightFrom: 23            // the owl sleeps from this hour ...
  property int nightTo: 7               // ... until this hour
  property string petMotion: "full"     // full | calm | still

  function applySettings(raw) {
    var cfg = null
    try { cfg = JSON.parse(raw) } catch (e) { return }
    var list = cfg && Array.isArray(cfg.plugins) ? cfg.plugins : []
    var entry = {}
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === "fynnp.deskclock") { entry = list[i]; break }
    }
    monitorName = typeof entry.monitor === "string" ? entry.monitor.slice(0, 64) : ""
    fallbackMonitor = typeof entry.fallbackMonitor === "string" ? entry.fallbackMonitor.slice(0, 64) : ""
    var as = parseFloat(entry.awayScale)
    awayScale = isNaN(as) ? 0 : Math.max(0.4, Math.min(1.5, as))
    var c = String(entry.corner || "top-right")
    corner = ["top-left", "top-right", "bottom-left", "bottom-right"].indexOf(c) >= 0 ? c : "top-right"
    marginX = clampInt(entry.marginX, 0, 4000, 408)
    marginY = clampInt(entry.marginY, 0, 2000, 58)
    var op = parseFloat(entry.opacity)
    cardOpacity = isNaN(op) ? 0.5 : Math.max(0.15, Math.min(1, op))
    var bo = parseFloat(entry.borderOpacity)
    borderOpacity = isNaN(bo) ? 0.08 : Math.max(0, Math.min(1, bo))
    clock24 = entry.clock24 !== false
    var hm = String(entry.hoot === false ? "off" : entry.hoot === true ? "count" : (entry.hoot || "count"))
    hootMode = ["count", "once", "off"].indexOf(hm) >= 0 ? hm : "count"
    nightFrom = clampInt(entry.nightFrom, 0, 23, 23)
    nightTo = clampInt(entry.nightTo, 0, 23, 7)
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

  // ---------- time ----------
  // One tick per minute boundary, only while visible. Coming back from
  // covered refreshes at once.
  property var now: new Date()
  property int lastHootHour: new Date().getHours()

  function refresh() {
    now = new Date()
    var h = now.getHours(), m = now.getMinutes()
    // hoot on the hour (or the minute after, if the tick came late);
    // a card that was covered at the full hour stays quiet
    if (m <= 1 && h !== lastHootHour) {
      lastHootHour = h
      if (hootMode !== "off") owl.hoot(hootMode === "once" ? 1 : (h % 12 === 0 ? 12 : h % 12))
      uptimeProc.running = true
    } else if (m > 1) lastHootHour = h
  }

  Timer {
    id: minuteTimer
    running: root.active
    repeat: true
    interval: 60000
    onRunningChanged: if (running) { root.refresh(); interval = root.untilNextMinute() }
    onTriggered: { root.refresh(); interval = root.untilNextMinute() }
  }
  function untilNextMinute() {
    var d = new Date()
    return 60000 - (d.getSeconds() * 1000 + d.getMilliseconds()) + 50
  }

  // ---------- uptime ----------
  property real bootMs: -1
  Process {
    id: uptimeProc
    command: ["cat", "/proc/uptime"]
    running: true
    stdout: SplitParser {
      onRead: function(line) {
        var up = parseFloat(String(line).split(" ")[0])
        if (isFinite(up) && up >= 0) root.bootMs = Date.now() - up * 1000
      }
    }
  }

  // ---------- derived ----------
  readonly property int hour: now.getHours()
  readonly property int minute: now.getMinutes()
  function inNight(h) {
    if (nightFrom === nightTo) return false
    return nightFrom < nightTo ? (h >= nightFrom && h < nightTo) : (h >= nightFrom || h < nightTo)
  }
  readonly property string mood: inNight(hour) ? "sleep" : inNight((hour + 1) % 24) ? "drowsy" : "awake"

  function pad(n) { return n < 10 ? "0" + n : String(n) }
  function hm(h, m) {
    if (clock24) return pad(h) + ":" + pad(m)
    return ((h % 12) || 12) + ":" + pad(m)
  }
  readonly property string timeText: hm(hour, minute)
  readonly property string ampm: clock24 ? "" : (hour < 12 ? "AM" : "PM")
  readonly property var weekdays: [strings.t("sun", "Sunday"), strings.t("mon", "Monday"), strings.t("tue", "Tuesday"),
    strings.t("wed", "Wednesday"), strings.t("thu", "Thursday"), strings.t("fri", "Friday"), strings.t("sat", "Saturday")]
  readonly property var months: [strings.t("jan", "January"), strings.t("feb", "February"), strings.t("mar", "March"),
    strings.t("apr", "April"), strings.t("may", "May"), strings.t("jun", "June"), strings.t("jul", "July"),
    strings.t("aug", "August"), strings.t("sep", "September"), strings.t("oct", "October"),
    strings.t("nov", "November"), strings.t("dec", "December")]
  readonly property string dateText: strings.t("dateFormat", "{weekday}, {day} {month}")
    .replace("{weekday}", weekdays[now.getDay()]).replace("{day}", now.getDate()).replace("{month}", months[now.getMonth()])

  // ISO 8601 week number and Monday-first weekday
  readonly property int isoDay: (now.getDay() + 6) % 7
  readonly property int isoWeek: {
    var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - isoDay + 3)   // Thursday of this week
    var jan4 = new Date(d.getFullYear(), 0, 4)
    return 1 + Math.round(((d - jan4) / 86400000 - 3 + (jan4.getDay() + 6) % 7) / 7)
  }
  readonly property real dayFrac: (hour * 60 + minute) / 1440
  readonly property real weekFrac: (isoDay + dayFrac) / 7
  readonly property int yearLen: (new Date(now.getFullYear(), 1, 29).getMonth() === 1) ? 366 : 365
  readonly property int yearDay: Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(now.getFullYear(), 0, 1)) / 86400000) + 1
  readonly property real yearFrac: (yearDay - 1 + dayFrac) / yearLen

  function dur(mins) {
    mins = Math.max(0, Math.floor(mins))
    var d = Math.floor(mins / 1440), h = Math.floor(mins % 1440 / 60), m = mins % 60
    if (d > 0) return d + " " + strings.t("d", "d") + " " + h + " " + strings.t("h", "h")
    if (h > 0) return h + " " + strings.t("h", "h") + " " + m + " " + strings.t("min", "min")
    return m + " " + strings.t("min", "min")
  }
  readonly property string uptimeText: bootMs > 0 ? dur((now.getTime() - bootMs) / 60000) : "—"
  readonly property string bootText: {
    if (bootMs <= 0) return ""
    var b = new Date(bootMs)
    return strings.t("since", "since {when}").replace("{when}",
      strings.t("short", "Sun,Mon,Tue,Wed,Thu,Fri,Sat").split(",")[b.getDay()] + " " + hm(b.getHours(), b.getMinutes()))
  }

  readonly property string moodText: owl.hooting
    ? strings.t("hooting", "Hoo! It's {time}").replace("{time}", hm(hour, 0))
    : mood === "sleep" ? strings.t("asleep", "Asleep until {time}").replace("{time}", hm(nightTo, 0))
    : mood === "drowsy" ? strings.t("drowsy", "Getting sleepy")
    : strings.t("awake", "Next hoot at {time}").replace("{time}", hm((hour + 1) % 24, 0))

  // Owl clock (seconds): ticks only while visible and something moves; 4 fps,
  // 8 fps while a touch reaction / drag / landing plays. Never with still.
  property real clock: 0
  Timer {
    interval: owl.fast ? 125 : 250
    repeat: true
    running: root.active && owl.moving
    onTriggered: root.clock += interval / 1000
  }

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

    WlrLayershell.namespace: "fynnp-deskclock"
    WlrLayershell.layer: place.wlrLayer
    WlrLayershell.keyboardFocus: place.keyboardFocus
    exclusionMode: ExclusionMode.Ignore
    // Only the pet takes input (petting); the rest falls through to the desktop.
    mask: place.editing ? place.editMask : petRegion
    Region {
      id: petRegion
      x: owl.touch.maskRect.x
      y: owl.touch.maskRect.y
      width: owl.touch.maskRect.width
      height: owl.touch.maskRect.height
    }

    // Placement + edit mode; see docs/DESKPLACE.md in the desk-pets repo.
    DeskPlace {
      id: place
      pluginId: "fynnp.deskclock"
      label: root.manifest && root.manifest.name ? String(root.manifest.name) : "Desk Clock"
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

        // ---- owl + time ----
        Item {
          width: parent.width
          height: owl.height

          PixelOwl {
            id: owl
            px: 2
            motion: root.petMotion
            mood: root.mood
            clock: root.clock
            active: root.active
            place: place
            window: win.contentItem
            hourStep: (root.hour % 12) * 2 + (root.minute >= 30 ? 1 : 0)
            minuteStep: Math.floor(root.minute / 5)
          }

          Column {
            anchors.left: owl.right
            anchors.leftMargin: Style.space(10)
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            spacing: 2

            Row {
              spacing: 6
              DaText {
                id: timeLabel
                text: root.timeText
                font.pixelSize: Math.round(Style.font.title * 2.2)
                font.bold: true
              }
              DaText {
                anchors.baseline: timeLabel.baseline
                visible: root.ampm !== ""
                text: root.ampm
                font.pixelSize: Style.font.caption
                opacity: 0.6
              }
            }
            DaText {
              width: parent.width
              text: root.dateText
              font.pixelSize: Style.font.body
            }
            DaText {
              width: parent.width
              text: root.moodText
              color: owl.hooting ? Commons.Color.accent : Commons.Color.foreground
              font.pixelSize: Style.font.caption
              opacity: owl.hooting ? 1 : 0.6
            }
          }
        }

        PanelSeparator { width: parent.width }

        StatRow {
          glyph: "󰖨"
          label: strings.t("day", "Day")
          detail: strings.t("left", "{time} left").replace("{time}", root.dur(1440 - root.hour * 60 - root.minute))
          fraction: root.dayFrac
        }

        StatRow {
          glyph: "󰃭"
          label: strings.t("week", "Week {n}").replace("{n}", root.isoWeek)
          detail: strings.t("dayOf", "day {n} of {total}").replace("{n}", root.isoDay + 1).replace("{total}", 7)
          fraction: root.weekFrac
        }

        StatRow {
          glyph: "󰸗"
          label: String(root.now.getFullYear())
          detail: strings.t("dayOf", "day {n} of {total}").replace("{n}", root.yearDay).replace("{total}", root.yearLen)
          fraction: root.yearFrac
        }

        PanelSeparator { width: parent.width }

        StatRow {
          glyph: "󰔟"
          label: strings.t("uptime", "Uptime")
          detail: root.bootText
          value: root.uptimeText
          meter: false
        }
      }
    }
  }
}
