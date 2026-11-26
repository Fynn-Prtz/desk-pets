pragma Singleton
import QtQuick
QtObject {
  readonly property string fontFamily: "monospace"
  readonly property int cornerRadius: 12
  readonly property QtObject font: QtObject {
    readonly property int subtitle: 15; readonly property int title: 17; readonly property int body: 13
    readonly property int bodySmall: 12; readonly property int caption: 11
  }
  function space(v) { return v }
  function duration(v) { return v }
}
