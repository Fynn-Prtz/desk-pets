import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import qs.Commons
import qs.Commons as Commons

// DeskPlace: where a desk card sits, and the edit mode that moves it.
// Canonical copy: shared/DeskPlace.qml (desk-pets repo) -- copy verbatim into each
// card plugin (like DeskLink). Integration guide: docs/DESKPLACE.md
//
// Position: ~/.config/omarchy/desk-layout/<pluginId>.json
//   { "monitor": "DP-1", "x": 3048, "y": 58, "w": 360, "h": 420 }
// x/y = monitor-local logical px of the card's top-left at scale 1; w/h = the
// card's size when it was placed (optional), so a card that sits nearer the
// bottom/right keeps that edge distance and grows away from it. No file ->
// the card's shell.json corner/margins.
//
// Edit mode: fynnp.desklayout writes $XDG_RUNTIME_DIR/fynnp-desk/edit
// ("1\n<grid>\n" or "0\n"). While it is on, the card's window covers its
// monitor on the overlay layer, the card can be dragged (snaps to the grid,
// screen margins and other cards), arrows nudge it, the chip moves it to the
// next monitor, right-click resets it, Esc leaves edit mode.
//
// Cost outside edit mode: two inotify watches (edit flag, layout file).
// Nothing ticks, nothing polls.
//
// Usage: place it as the LAST child of the card's PanelWindow (it draws the
// edit overlay on top of the card) and bind the window to its outputs -- see
// DESKPLACE.md for the exact diff.
Item {
  id: place

  // ---------- inputs ----------
  property string pluginId: ""
  property string label: ""
  property string defaultMonitor: ""
  property string corner: "top-right"   // [top|bottom|center]-[left|right]
  property int marginX: 32
  property int marginY: 32
  property var homeScreen: null         // screen named by `monitor` (card resolves it)
  property var targetScreen: null       // where the card is shown right now
  property real uiScale: 1              // card scale on targetScreen
  property real cardWidth: 360          // unscaled card size
  property real cardHeight: 200
  // Cards that publish their rect for magnetic snapping.
  property var peerIds: ["fynnp.desksys", "fynnp.deskaudio", "fynnp.deskgames"]

  // ---------- outputs ----------
  readonly property bool editing: editOn && ready
  readonly property string monitor: savedOk ? saved.monitor : defaultMonitor
  readonly property int wlrLayer: editing ? WlrLayer.Overlay : WlrLayer.Bottom
  readonly property int keyboardFocus: editing ? WlrKeyboardFocus.OnDemand : WlrKeyboardFocus.None
  readonly property bool anchorTop: editing || spec.v === "top"
  readonly property bool anchorBottom: editing || spec.v === "bottom"
  readonly property bool anchorLeft: editing || spec.h === "left"
  readonly property bool anchorRight: editing || spec.h === "right"
  readonly property int marginTop: editing ? 0 : shown.mv
  readonly property int marginBottom: editing ? 0 : shown.mv
  readonly property int marginLeft: editing ? 0 : shown.mh
  readonly property int marginRight: editing ? 0 : shown.mh
  // Card item offset inside the window (non-zero only in edit mode).
  readonly property real cardX: editing ? (dragging ? dragX : homeX) : 0
  readonly property real cardY: editing ? (dragging ? dragY : homeY) : 0
  // Global rect of the card on targetScreen, for occlusion checks.
  readonly property var rect: {
    var sc = targetScreen
    if (!sc) return null
    var w = Math.ceil(cardWidth * uiScale), h = Math.ceil(cardHeight * uiScale)
    if (editing) return { x: sc.x + Math.round(cardX), y: sc.y + Math.round(cardY), w: w, h: h }
    var s = shown
    return {
      x: sc.x + (spec.h === "left" ? s.mh : spec.h === "right" ? sc.width - s.mh - w : Math.round((sc.width - w) / 2)),
      y: sc.y + (spec.v === "top" ? s.mv : spec.v === "bottom" ? sc.height - s.mv - h : Math.round((sc.height - h) / 2)),
      w: w, h: h
    }
  }
  // Input masks: the card + its chip in edit mode, nothing otherwise.
  readonly property alias editMask: editRegion
  readonly property alias noInput: emptyRegion

  // ---------- state ----------
  readonly property string runDir: Quickshell.env("XDG_RUNTIME_DIR") + "/fynnp-desk"
  readonly property string layoutDir: Quickshell.env("HOME") + "/.config/omarchy/desk-layout"
  property bool ready: false
  property bool editOn: false
  property int grid: 24
  property var saved: null              // validated layout file, or null
  property var peerRects: ({})
  property bool dragging: false
  property real dragX: 0
  property real dragY: 0
  property real pressX: 0
  property real pressY: 0
  property real startX: 0
  property real startY: 0

  anchors.fill: parent
  z: 100   // above the card, wherever it is declared
  visible: editing

  Region { id: emptyRegion }
  // Input mask in edit mode: the card + chip. Changing a surface's input
  // region while a button is held can make the compositor cancel the press,
  // so the mask is frozen for the whole drag and only moves on release.
  property rect maskRect: Qt.rect(0, 0, 0, 0)
  function syncMask() {
    if (dragging) return
    maskRect = Qt.rect(Math.round(hit.x), Math.round(hit.y), Math.ceil(hit.width), Math.ceil(hit.height))
  }
  onDraggingChanged: syncMask()
  Region {
    id: editRegion
    x: place.maskRect.x
    y: place.maskRect.y
    width: place.maskRect.width
    height: place.maskRect.height
  }

  function screenNamed(n) {
    var s = Quickshell.screens
    for (var i = 0; i < s.length; i++) if (s[i].name === n) return s[i]
    return null
  }
  readonly property bool savedOk: !!saved && !!screenNamed(saved.monitor)
  readonly property bool savedHere: savedOk && !!homeScreen && homeScreen.name === saved.monitor

  // Placement at scale 1 on the home screen, as nearest-edge distances:
  // { h: left|right|center, mh, v: top|bottom|center, mv }
  readonly property var spec: {
    var hs = homeScreen
    if (savedHere && hs) {
      var sw = saved.w > 0 ? saved.w : cardWidth, sh = saved.h > 0 ? saved.h : cardHeight
      var dl = saved.x, dr = hs.width - saved.x - sw
      var dt = saved.y, db = hs.height - saved.y - sh
      return {
        h: dl <= dr ? "left" : "right", mh: Math.max(0, Math.round(dl <= dr ? dl : dr)),
        v: dt <= db ? "top" : "bottom", mv: Math.max(0, Math.round(dt <= db ? dt : db))
      }
    }
    var c = String(corner)
    var v = c.indexOf("top") === 0 ? "top" : c.indexOf("bottom") === 0 ? "bottom" : "center"
    return { h: c.indexOf("left") > 0 ? "left" : "right", mh: marginX, v: v, mv: v === "center" ? 0 : marginY }
  }

  // Margins on targetScreen: the same edge distances scaled by uiScale,
  // clamped so the card stays fully on-screen.
  readonly property var shown: {
    var sc = targetScreen
    if (!sc) return { mh: 0, mv: 0 }
    var w = Math.ceil(cardWidth * uiScale), h = Math.ceil(cardHeight * uiScale)
    return {
      mh: Math.max(0, Math.min(Math.round(spec.mh * uiScale), sc.width - w)),
      mv: Math.max(0, Math.min(Math.round(spec.mv * uiScale), sc.height - h))
    }
  }

  // Top-left on the home screen at scale 1 (edit mode coordinates).
  readonly property real homeX: {
    var hs = homeScreen
    if (!hs) return 0
    var x = spec.h === "left" ? spec.mh : spec.h === "right" ? hs.width - spec.mh - cardWidth : (hs.width - cardWidth) / 2
    return Math.round(Math.max(0, Math.min(x, hs.width - cardWidth)))
  }
  readonly property real homeY: {
    var hs = homeScreen
    if (!hs) return 0
    var y = spec.v === "top" ? spec.mv : spec.v === "bottom" ? hs.height - spec.mv - cardHeight : (hs.height - cardHeight) / 2
    return Math.round(Math.max(0, Math.min(y, hs.height - cardHeight)))
  }

  // ---------- snapping ----------
  readonly property int gap: Math.max(4, Math.round(grid / 2))
  function snapAxis(v, size, extent, margin, peers) {
    var targets = [0, margin, extent - size, extent - size - margin].concat(peers)
    var best = -1, bestD = Math.max(8, grid * 0.5)
    for (var i = 0; i < targets.length; i++) {
      var d = Math.abs(targets[i] - v)
      if (d < bestD) { bestD = d; best = targets[i] }
    }
    var out = best >= 0 ? best : Math.round(v / grid) * grid
    return Math.round(Math.max(0, Math.min(out, extent - size)))
  }
  function peerTargets(axis) {
    var out = []
    var hs = homeScreen
    if (!hs) return out
    var size = axis === "x" ? cardWidth : cardHeight
    for (var id in peerRects) {
      var r = peerRects[id]
      if (!r || r.monitor !== hs.name) continue
      var p = axis === "x" ? r.x : r.y, ps = axis === "x" ? r.w : r.h
      out.push(p, p + ps - size, p + ps + gap, p - size - gap)
    }
    return out
  }
  readonly property point snap: {
    var hs = homeScreen
    if (!hs || !dragging) return Qt.point(homeX, homeY)
    return Qt.point(snapAxis(dragX, cardWidth, hs.width, marginX, peerTargets("x")),
                    snapAxis(dragY, cardHeight, hs.height, marginY, peerTargets("y")))
  }

  // ---------- files ----------
  Process {
    running: true
    command: ["sh", "-c", "mkdir -p \"$1\" \"$2\" && cd \"$1\" && { [ -e edit ] || printf '0\\n' > edit; } && touch \"rect-$3\"",
              "sh", place.runDir, place.layoutDir, place.pluginId || "unknown"]
    onExited: place.ready = true
  }

  function clampNum(v, lo, hi) {
    var n = Number(v)
    return isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : NaN
  }
  function parseLayout(t) {
    var d = null
    try { d = JSON.parse(String(t).slice(0, 4096)) } catch (e) { return null }
    if (!d || typeof d !== "object" || typeof d.monitor !== "string") return null
    var x = clampNum(d.x, -100000, 100000), y = clampNum(d.y, -100000, 100000)
    if (isNaN(x) || isNaN(y)) return null
    var w = clampNum(d.w, 0, 10000), h = clampNum(d.h, 0, 10000)
    return { monitor: d.monitor.slice(0, 64), x: x, y: y, w: isNaN(w) ? 0 : w, h: isNaN(h) ? 0 : h }
  }

  FileView {
    id: layoutFile
    path: place.ready && place.pluginId ? place.layoutDir + "/" + place.pluginId + ".json" : ""
    watchChanges: true
    atomicWrites: true
    printErrors: false
    onLoaded: place.saved = place.parseLayout(text())
    onLoadFailed: place.saved = null
    onFileChanged: reload()
  }

  FileView {
    id: editFile
    path: place.ready ? place.runDir + "/edit" : ""
    watchChanges: true
    atomicWrites: false   // others watch this inode
    printErrors: false
    onLoaded: {
      var lines = text().split("\n")
      place.editOn = lines[0].trim() === "1"
      var g = parseInt(lines[1], 10)
      place.grid = isNaN(g) ? 24 : Math.max(4, Math.min(256, g))
    }
    onFileChanged: reload()
  }

  FileView {
    id: rectFile
    path: place.ready && place.pluginId ? place.runDir + "/rect-" + place.pluginId : ""
    atomicWrites: false
    printErrors: false
  }

  Instantiator {
    model: place.editing ? place.peerIds.filter(function(i) { return i !== place.pluginId }) : []
    delegate: FileView {
      required property string modelData
      path: place.runDir + "/rect-" + modelData
      watchChanges: true
      printErrors: false
      onLoaded: place.setPeer(modelData, text())
      onFileChanged: reload()
      Component.onDestruction: place.setPeer(modelData, "")
    }
  }

  function setPeer(id, t) {
    var r = null
    try { r = JSON.parse(String(t).slice(0, 1024)) } catch (e) { r = null }
    if (r && (typeof r.monitor !== "string" || !isFinite(r.x) || !isFinite(r.y) || !isFinite(r.w) || !isFinite(r.h))) r = null
    var next = ({})
    for (var k in peerRects) next[k] = peerRects[k]
    next[id] = r
    peerRects = next
  }

  function publishRect(x, y) {
    if (!ready || !homeScreen) return
    rectFile.setText(JSON.stringify({ monitor: homeScreen.name, x: Math.round(x), y: Math.round(y),
                                      w: Math.round(cardWidth), h: Math.round(cardHeight) }) + "\n")
  }
  onEditingChanged: {
    dragging = false
    if (editing) publishRect(homeX, homeY)
  }

  // Tell desklayout we are still being edited (restarts its idle timer).
  function touch() { if (editing) editFile.setText("1\n" + grid + "\n") }
  function leave() { editFile.setText("0\n") }

  function save(monitorName, x, y) {
    var obj = { monitor: monitorName, x: Math.round(x), y: Math.round(y),
                w: Math.round(cardWidth), h: Math.round(cardHeight) }
    saved = obj
    layoutFile.setText(JSON.stringify(obj) + "\n")
    publishRect(obj.x, obj.y)
    touch()
  }

  function reset() {
    saved = null
    resetProc.running = true
    touch()
  }
  Process {
    id: resetProc
    command: ["rm", "-f", place.layoutDir + "/" + place.pluginId + ".json"]
    onExited: place.publishRect(place.homeX, place.homeY)
  }

  function nudge(dx, dy) {
    if (dragging) return   // stray key events mid-drag must not fight the pointer
    var hs = homeScreen
    if (!hs) return
    var g = grid
    var x = homeX, y = homeY
    if (dx < 0) x = Math.ceil(x / g) * g - g
    if (dx > 0) x = Math.floor(x / g) * g + g
    if (dy < 0) y = Math.ceil(y / g) * g - g
    if (dy > 0) y = Math.floor(y / g) * g + g
    save(hs.name, Math.max(0, Math.min(x, hs.width - cardWidth)), Math.max(0, Math.min(y, hs.height - cardHeight)))
  }

  readonly property var nextScreen: {
    var s = Quickshell.screens
    if (!homeScreen || s.length < 2) return null
    for (var i = 0; i < s.length; i++)
      if (s[i] === homeScreen) return s[(i + 1) % s.length]
    return s[0]
  }
  // Same nearest-edge distances on the next monitor, clamped on-screen.
  function moveToNext() {
    var n = nextScreen
    if (!n) return
    var mh = Math.min(spec.mh, Math.max(0, n.width - cardWidth))
    var mv = Math.min(spec.mv, Math.max(0, n.height - cardHeight))
    var x = spec.h === "left" ? mh : spec.h === "right" ? n.width - mh - cardWidth : (n.width - cardWidth) / 2
    var y = spec.v === "top" ? mv : spec.v === "bottom" ? n.height - mv - cardHeight : (n.height - cardHeight) / 2
    save(n.name, Math.max(0, x), Math.max(0, y))
  }

  Component.onDestruction: if (ready) rectFile.setText("\n")

  // ---------- edit overlay ----------
  // Ghost at the snap target while dragging.
  Rectangle {
    visible: place.dragging
    x: place.snap.x
    y: place.snap.y
    width: place.cardWidth
    height: place.cardHeight
    radius: Style.cornerRadius
    color: Util.alpha(Commons.Color.accent, 0.10)
    border.width: 1
    border.color: Util.alpha(Commons.Color.accent, 0.7)
  }

  // Outline of the card itself.
  Rectangle {
    x: place.cardX
    y: place.cardY
    width: place.cardWidth
    height: place.cardHeight
    radius: Style.cornerRadius
    color: "transparent"
    border.width: place.activeFocus ? 2 : 1
    border.color: Commons.Color.accent
  }

  // Card + chip: the only input area. Captures everything so the card's
  // own controls do not react while editing.
  // The chip sits above the card, or inside its top edge when there is no
  // room above.
  readonly property bool chipInside: cardY < 26
  Item {
    id: hit
    onXChanged: place.syncMask()
    onYChanged: place.syncMask()
    onWidthChanged: place.syncMask()
    onHeightChanged: place.syncMask()
    x: place.cardX
    y: place.chipInside ? place.cardY : place.cardY - chip.height - 4
    width: place.cardWidth
    height: place.chipInside ? place.cardHeight : place.cardHeight + chip.height + 4

    MouseArea {
      anchors.fill: parent
      hoverEnabled: true
      acceptedButtons: Qt.LeftButton | Qt.RightButton
      cursorShape: place.dragging ? Qt.ClosedHandCursor : Qt.OpenHandCursor
      preventStealing: true
      onWheel: function(wheel) { wheel.accepted = true }
      onPressed: function(mouse) {
        place.forceActiveFocus()
        if (mouse.button === Qt.RightButton) return
        var p = mapToItem(place, mouse.x, mouse.y)
        place.pressX = p.x
        place.pressY = p.y
        place.startX = place.homeX
        place.startY = place.homeY
        place.dragX = place.startX
        place.dragY = place.startY
        place.dragging = true
      }
      onPositionChanged: function(mouse) {
        if (!place.dragging || !place.homeScreen) return
        var p = mapToItem(place, mouse.x, mouse.y)
        var hs = place.homeScreen
        place.dragX = Math.max(0, Math.min(place.startX + p.x - place.pressX, hs.width - place.cardWidth))
        place.dragY = Math.max(0, Math.min(place.startY + p.y - place.pressY, hs.height - place.cardHeight))
      }
      onReleased: function(mouse) {
        if (mouse.button === Qt.RightButton) { place.reset(); return }
        if (!place.dragging) return
        // Copy the numbers first: `place.snap` is a value-type *reference* in
        // Qt 6 and re-reads the property, which flips back to home as soon as
        // dragging becomes false.
        var sx = place.snap.x, sy = place.snap.y
        place.dragging = false
        if (place.homeScreen && (sx !== place.homeX || sy !== place.homeY || !place.savedHere))
          place.save(place.homeScreen.name, sx, sy)
        else
          place.touch()
      }
      onCanceled: place.dragging = false
    }

    // Header chip: card name + move-to-next-monitor button.
    Row {
      id: chip
      x: place.chipInside ? 6 : 0
      y: place.chipInside ? 6 : 0
      height: 22
      spacing: 4

      Rectangle {
        height: parent.height
        width: nameText.implicitWidth + 16
        radius: Style.cornerRadius
        color: Commons.Color.accent
        Text {
          id: nameText
          anchors.centerIn: parent
          textFormat: Text.PlainText
          text: String(place.label || place.pluginId).slice(0, 40)
          font.family: Style.fontFamily
          font.pixelSize: Style.font.caption
          font.bold: true
          color: Commons.Color.background
        }
      }

      Rectangle {
        visible: !!place.nextScreen
        height: parent.height
        width: nextText.implicitWidth + 16
        radius: Style.cornerRadius
        color: nextArea.containsMouse ? Commons.Color.accent : Util.alpha(Commons.Color.popups.background, 0.85)
        border.width: 1
        border.color: Util.alpha(Commons.Color.accent, 0.6)
        Text {
          id: nextText
          anchors.centerIn: parent
          textFormat: Text.PlainText
          text: "→ " + (place.nextScreen ? String(place.nextScreen.name).slice(0, 24) : "")
          font.family: Style.fontFamily
          font.pixelSize: Style.font.caption
          color: nextArea.containsMouse ? Commons.Color.background : Commons.Color.foreground
        }
        MouseArea {
          id: nextArea
          anchors.fill: parent
          hoverEnabled: true
          cursorShape: Qt.PointingHandCursor
          onClicked: place.moveToNext()
        }
      }
    }
  }

  Keys.onPressed: function(event) {
    if (!place.editing) return
    switch (event.key) {
    case Qt.Key_Escape: place.leave(); break
    case Qt.Key_Left: place.nudge(-1, 0); break
    case Qt.Key_Right: place.nudge(1, 0); break
    case Qt.Key_Up: place.nudge(0, -1); break
    case Qt.Key_Down: place.nudge(0, 1); break
    default: return
    }
    event.accepted = true
  }
}
