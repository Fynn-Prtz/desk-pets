import QtQuick
import QtQuick.Window
// A real offscreen Window so the card renders and can be grabbed.
Window {
  property var screen
  property var mask
  property int exclusionMode
  property AnchorsStub anchors: AnchorsStub {}
  property MarginsStub margins: MarginsStub {}
  width: Math.max(1, implicitWidth)
  height: Math.max(1, implicitHeight)
  property real implicitWidth: 0
  property real implicitHeight: 0
}
