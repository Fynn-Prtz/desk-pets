import QtQuick

// PetTouch: makes a desk pet pettable and tells it what to react to.
// Canonical copy: shared/PetTouch.qml (desk-pets repo) -- copy verbatim into
// each card plugin, like DeskPlace/DeskLink. Guide: docs/PETS.md
//
// Put it inside the pet item over the pet's body (anchors.fill: parent is fine).
// It only reports state; the pet decides how each reaction looks.
//
//   click             -> reaction "pet"     (~1.8 s; hearts, purr, happy squint)
//   4+ clicks quickly -> reaction "annoyed" (~2.6 s; anger mark, puffed cheeks)
//   press and hold    -> reaction "squish"  (while held; squashed, giggling)
//   hover             -> hovered + look (-1/0/1 per axis): eyes follow the cursor
//   card dragged in layout mode -> dragged + lean (-1/0/1, against the motion)
//   drop after a drag -> landing (~0.7 s bounce + dust), landings++
//
// Cost: nothing while the pointer is elsewhere. Timers run only during a
// reaction. `busy` is true while anything here wants frames: the card keeps
// its clock ticking for it (|| pet.moving).
//
// Click-through cards need an input region over the pet: bind the card
// window's mask to `maskRect` (window coordinates, kept in sync here):
//   Region { id: petRegion; x: pet.touch.maskRect.x; y: …; width: …; height: … }
//   mask: place.editing ? place.editMask : petRegion
Item {
  id: touch

  // ---------- inputs ----------
  property bool active: true        // card visible (root.active)
  property var place: null          // the card's DeskPlace, for drag reactions
  property Item window: null        // win.contentItem, for maskRect

  // ---------- outputs ----------
  property string reaction: ""      // "" | "pet" | "annoyed" | "squish"
  property int serial: 0            // bumps on every new reaction (restart one-shot anims)
  readonly property bool hovered: active && mouse.containsMouse
  property int lookX: 0             // -1 left, 0 centre, 1 right (only while hovered)
  property int lookY: 0             // -1 up, 0 centre, 1 down
  readonly property bool dragged: !!place && place.dragging
  readonly property bool editing: !!place && place.editing
  property int lean: 0              // -1/0/1 while dragged: tilt against the motion
  property int landings: 0
  readonly property bool landing: landTimer.running
  readonly property bool busy: active && (reaction !== "" || hovered || dragged || landing)
  property rect maskRect: Qt.rect(0, 0, 0, 0)

  // ---------- clicks ----------
  property var clickTimes: []

  function react(kind, ms) {
    reaction = kind
    serial++
    reactionEnd.interval = ms
    if (ms > 0) reactionEnd.restart(); else reactionEnd.stop()
  }

  MouseArea {
    id: mouse
    anchors.fill: parent
    enabled: touch.active && !touch.editing
    hoverEnabled: enabled
    acceptedButtons: Qt.LeftButton
    cursorShape: Qt.PointingHandCursor
    pressAndHoldInterval: 380

    onPositionChanged: function(m) {
      var nx = (m.x - width / 2) / Math.max(1, width / 2)
      var ny = (m.y - height / 2) / Math.max(1, height / 2)
      touch.lookX = nx < -0.33 ? -1 : nx > 0.33 ? 1 : 0
      touch.lookY = ny < -0.4 ? -1 : ny > 0.4 ? 1 : 0
    }
    onExited: { touch.lookX = 0; touch.lookY = 0 }
    onPressAndHold: touch.react("squish", 0)
    onReleased: {
      if (touch.reaction === "squish") touch.react("pet", 1400)
    }
    onCanceled: if (touch.reaction === "squish") touch.react("", 0)
    onClicked: {
      if (touch.reaction === "squish") return
      var now = Date.now()
      var recent = touch.clickTimes.filter(function(t) { return now - t < 2200 })
      recent.push(now)
      touch.clickTimes = recent.slice(-6)
      if (recent.length >= 4) touch.react("annoyed", 2600)
      else if (touch.reaction !== "annoyed") touch.react("pet", 1800)
    }
  }

  Timer {
    id: reactionEnd
    onTriggered: touch.reaction = ""
  }

  // Leaving the screen (covered, hidden) drops whatever was playing.
  onActiveChanged: if (!active) { reaction = ""; reactionEnd.stop(); lean = 0 }

  // ---------- layout-mode drag ----------
  property real lastDragX: 0
  Connections {
    target: touch.place
    enabled: !!touch.place
    function onDraggingChanged() {
      if (touch.place.dragging) {
        touch.lastDragX = touch.place.dragX
      } else {
        touch.lean = 0
        if (touch.place.editing && touch.active) { touch.landings++; landTimer.restart() }
      }
    }
    function onDragXChanged() {
      if (!touch.place.dragging) return
      var dx = touch.place.dragX - touch.lastDragX
      touch.lastDragX = touch.place.dragX
      if (Math.abs(dx) < 1) return
      touch.lean = dx > 0 ? -1 : 1
      leanReset.restart()
    }
    function onEditingChanged() { touch.syncMask() }
  }
  Timer { id: leanReset; interval: 180; onTriggered: touch.lean = 0 }
  Timer { id: landTimer; interval: 700 }

  // ---------- input mask ----------
  function syncMask() {
    if (!window || !visible) return
    var p = mapToItem(window, 0, 0)
    var q = mapToItem(window, width, height)
    maskRect = Qt.rect(Math.floor(p.x), Math.floor(p.y), Math.ceil(q.x - p.x), Math.ceil(q.y - p.y))
  }
  onWidthChanged: Qt.callLater(syncMask)
  onHeightChanged: Qt.callLater(syncMask)
  onWindowChanged: Qt.callLater(syncMask)
  onVisibleChanged: Qt.callLater(syncMask)
  Connections {
    target: touch.window
    enabled: !!touch.window
    function onWidthChanged() { Qt.callLater(touch.syncMask) }
    function onHeightChanged() { Qt.callLater(touch.syncMask) }
  }
  Component.onCompleted: Qt.callLater(syncMask)
}
