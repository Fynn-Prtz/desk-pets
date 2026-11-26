import QtQuick
// Test stub of Quickshell.Io.Process: "exits" right away (exit code 0).
QtObject {
  id: pr
  property bool running: false
  property var command: []
  signal exited(int code)
  onRunningChanged: if (running) Qt.callLater(function() { pr.running = false; pr.exited(0) })
  Component.onCompleted: if (running) Qt.callLater(function() { pr.running = false; pr.exited(0) })
}
