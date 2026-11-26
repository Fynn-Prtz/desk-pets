import QtQuick
Rectangle {
  property int borderTop: 1; property int borderBottom: 1; property int borderLeft: 1; property int borderRight: 1
  property var borderSpec
  border.width: 1
  border.color: Qt.rgba(1, 1, 1, 0.08)
}
