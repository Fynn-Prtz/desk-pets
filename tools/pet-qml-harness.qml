// Offscreen harness for tools/pet-qml-check.sh (the placeholders in caps are filled in by it).
// Scenario: { name, props, frames, step, setup(pet, place), each(pet, place, f) }; pet.clock = 100 + f * step.
import QtQuick
import QtQuick.Window
import "file://PLUGIN" as P

Window {
  id: win
  width: 120; height: 100; visible: true
  color: "#211d30"
  property var scenarios: SCENARIOS
  property int si: 0
  property int fi: 0
  QtObject {
    id: place
    property bool dragging: false
    property bool editing: false
    property real dragX: 0
  }
  Rectangle {
    id: stage
    width: 120; height: 100; color: "#211d30"
    P.PETTYPE {
      id: pet
      x: 16; y: 18
      px: 2
      place: place
    }
  }
  function apply(s, f) {
    for (var k in s.props) pet[k] = s.props[k]
    pet.clock = 100 + f * s.step
    if (s.setup && f === 0) s.setup(pet, place)
    if (s.each) s.each(pet, place, f)
  }
  Timer {
    id: stepper
    interval: 30; repeat: false
    onTriggered: {
      var s = win.scenarios[win.si]
      stage.grabToImage(function(r) {
        r.saveToFile("OUTDIR/" + s.name + "-" + String(win.fi).padStart(3, "0") + ".png")
        win.fi++
        if (win.fi >= s.frames) { win.si++; win.fi = 0 }
        if (win.si >= win.scenarios.length) { Qt.quit(); return }
        win.apply(win.scenarios[win.si], win.fi)
        stepper.restart()
      })
    }
  }
  Component.onCompleted: { apply(scenarios[0], 0); stepper.start() }
}
