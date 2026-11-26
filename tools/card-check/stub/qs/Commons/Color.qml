pragma Singleton
import QtQuick
// Tokyo Night, like tools/pet-preview.js.
QtObject {
  property color foreground: "#a9b1d6"
  property color background: "#1a1b26"
  property color accent: "#7aa2f7"
  property color urgent: "#a55555"
  readonly property QtObject popups: QtObject { property color background: "#1a1b26" }
}
