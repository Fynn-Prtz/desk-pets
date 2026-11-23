import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import qs.Commons
import qs.Commons as Commons
import qs.Ui

// Desk Layout: edit mode for the desk cards.
//
//   omarchy-shell desklayout toggle | enter | leave | status
//
// The edit flag lives in $XDG_RUNTIME_DIR/fynnp-desk/edit ("1\n<grid>\n" or
// "0\n"); every card's DeskPlace watches it with inotify and does the actual
// moving, so this plugin only flips the flag, dims the desktop with a dotted
// grid on every monitor, and leaves edit mode after 2 minutes without any
// interaction (cards rewrite the flag on every drop/nudge, which restarts the
// idle timer). While not editing, nothing exists but one inotify watch.
//
// Settings on this plugin's entry in ~/.config/omarchy/shell.json:
//   { "id": "fynnp.desklayout", "grid": 24 }
Item {
  id: root

  property var shell: null
  property var manifest: null
  readonly property string home: Quickshell.env("HOME")
  readonly property string runDir: Quickshell.env("XDG_RUNTIME_DIR") + "/fynnp-desk"

  Commons.Translations { id: strings; directory: Qt.resolvedUrl("i18n") }

  // ---------- settings ----------
  property int grid: 24

  function applySettings(raw) {
    var cfg = null
    try { cfg = JSON.parse(raw) } catch (e) { return }
    var list = cfg && Array.isArray(cfg.plugins) ? cfg.plugins : []
    var entry = {}
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === "fynnp.desklayout") { entry = list[i]; break }
    }
    var g = parseInt(entry.grid, 10)
    grid = isNaN(g) ? 24 : Math.max(8, Math.min(128, g))
  }

  FileView {
    path: root.home + "/.config/omarchy/shell.json"
    watchChanges: true
    printErrors: false
    onLoaded: root.applySettings(text())
    onFileChanged: reload()
  }

  // ---------- edit flag ----------
  property bool ready: false
  property bool editing: false

  // A shell (re)start always begins outside edit mode.
  Process {
    running: true
    command: ["sh", "-c", "mkdir -p \"$1\" && printf '0\\n' > \"$1/edit\"", "sh", root.runDir]
    onExited: root.ready = true
  }

  FileView {
    id: editFile
    path: root.ready ? root.runDir + "/edit" : ""
    watchChanges: true
    atomicWrites: false   // the cards watch this inode
    printErrors: false
    onLoaded: {
      var on = text().split("\n")[0].trim() === "1"
      if (on && root.editing) idle.restart()   // a card was touched
      root.editing = on
    }
    onFileChanged: reload()
  }

  function setEditing(on) {
    if (!ready) return
    editing = on
    editFile.setText(on ? "1\n" + grid + "\n" : "0\n")
  }
  onGridChanged: if (editing) setEditing(true)

  Timer {
    id: idle
    interval: 120000
    running: root.editing
    onTriggered: root.setEditing(false)
  }

  ShellIpc {
    target: "desklayout"

    function toggle(): string {
      root.setEditing(!root.editing)
      return root.editing ? "editing" : "off"
    }
    function enter(): string {
      root.setEditing(true)
      return "editing"
    }
    function leave(): string {
      root.setEditing(false)
      return "off"
    }
    function status(): string {
      return root.editing ? "editing" : "off"
    }
  }

  // ---------- backdrop: dim + dotted grid on every monitor ----------
  Variants {
    model: root.editing ? Quickshell.screens : []

    PanelWindow {
      id: back
      required property var modelData
      screen: modelData
      color: "transparent"
      anchors { top: true; bottom: true; left: true; right: true }
      exclusionMode: ExclusionMode.Ignore
      WlrLayershell.namespace: "fynnp-desklayout"
      WlrLayershell.layer: WlrLayer.Top
      WlrLayershell.keyboardFocus: WlrKeyboardFocus.OnDemand

      Item {
        anchors.fill: parent
        focus: true
        Keys.onPressed: function(event) {
          if (event.key === Qt.Key_Escape) { root.setEditing(false); event.accepted = true }
        }

        Rectangle {
          anchors.fill: parent
          color: Util.alpha(Commons.Color.background, 0.45)
        }

        // Dots on the grid lattice (monitor-local origin, same as the cards'
        // snapping). Painted once per size/grid change.
        Canvas {
          id: dots
          anchors.fill: parent
          antialiasing: false
          readonly property int step: root.grid
          readonly property color dot: Util.alpha(Commons.Color.foreground, 0.22)
          onStepChanged: requestPaint()
          onDotChanged: requestPaint()
          onWidthChanged: requestPaint()
          onHeightChanged: requestPaint()
          onAvailableChanged: if (available) requestPaint()
          onPaint: {
            var ctx = getContext("2d")
            ctx.clearRect(0, 0, width, height)
            ctx.fillStyle = Qt.rgba(dot.r, dot.g, dot.b, dot.a)
            for (var x = step; x < width; x += step)
              for (var y = step; y < height; y += step)
                ctx.fillRect(x - 1, y - 1, 2, 2)
          }
        }

        MouseArea {
          anchors.fill: parent
          onPressed: parent.forceActiveFocus()
        }

        // Hint chip, top centre.
        Rectangle {
          anchors.horizontalCenter: parent.horizontalCenter
          y: 48
          width: hintRow.implicitWidth + Style.space(14) * 2
          height: hintRow.implicitHeight + Style.space(10) * 2
          radius: Style.cornerRadius
          color: Util.alpha(Color.popups.background, 0.9)
          border.width: 1
          border.color: Util.alpha(Commons.Color.accent, 0.6)

          Row {
            id: hintRow
            anchors.centerIn: parent
            spacing: Style.space(10)

            Text {
              anchors.verticalCenter: parent.verticalCenter
              textFormat: Text.PlainText
              text: "󰕰"
              font.family: Style.fontFamily
              font.pixelSize: Style.font.title
              color: Commons.Color.accent
            }
            Column {
              anchors.verticalCenter: parent.verticalCenter
              spacing: 2
              Text {
                textFormat: Text.PlainText
                text: strings.t("title", "Arrange desk cards")
                font.family: Style.fontFamily
                font.pixelSize: Style.font.subtitle
                font.bold: true
                color: Commons.Color.foreground
              }
              Text {
                textFormat: Text.PlainText
                text: strings.t("hint", "Drag to move · click a card, then ←↑↓→ to nudge · right-click resets · Esc when done")
                font.family: Style.fontFamily
                font.pixelSize: Style.font.caption
                color: Commons.Color.foreground
                opacity: 0.6
              }
            }
            Rectangle {
              anchors.verticalCenter: parent.verticalCenter
              width: doneText.implicitWidth + 20
              height: doneText.implicitHeight + 10
              radius: Style.cornerRadius
              color: doneArea.containsMouse ? Commons.Color.accent : Util.alpha(Commons.Color.accent, 0.2)
              Text {
                id: doneText
                anchors.centerIn: parent
                textFormat: Text.PlainText
                text: strings.t("done", "Done")
                font.family: Style.fontFamily
                font.pixelSize: Style.font.body
                font.bold: true
                color: doneArea.containsMouse ? Commons.Color.background : Commons.Color.foreground
              }
              MouseArea {
                id: doneArea
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onClicked: root.setEditing(false)
              }
            }
          }
        }
      }
    }
  }
}
