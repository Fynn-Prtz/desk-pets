import QtQuick
import QtQuick.Window
import "file://PLUGDIR" as P

// Loaded by tools/pet-settings-check/run.sh with PLUGDIR/PETTYPE/CASES filled in.
Window {
  id: win
  width: 120; height: 100; visible: true
  QtObject {
    id: place
    property bool dragging: false
    property bool editing: false
    property real dragX: 0
  }
  Item {
    id: holder
    width: 120; height: 100
    P.PETTYPE { id: pet; x: 16; y: 18; px: 2; place: place }
  }
  property var cfg: (CASES)
  property var log: []
  property bool failed: false

  // Every running Timer in the pet (incl. its PetTouch); one-shot fidget
  // schedulers count too.
  function timers(o, out) {
    if (!o) return out
    if (o.toString().indexOf("QQmlTimer") === 0 && o.running) out.push(o.interval)
    var kids = [].concat(o.resources ? Array.from(o.resources) : [], o.children ? Array.from(o.children) : [])
    for (var i = 0; i < kids.length; i++) timers(kids[i], out)
    return out
  }
  function extrasOn() {
    var e = []
    if (pet.grooving === true) e.push("grooving")
    if (typeof pet.screenKey === "string" && pet.screenKey !== "") e.push("screen:" + pet.screenKey)
    if (typeof pet.neighbour === "string" && pet.neighbour !== "") e.push("nb:" + pet.neighbour)
    if (pet.bang === true) e.push("bang")                       // frog: gamer launching
    if (pet.bop === true && pet.catMood !== undefined) e.push("bop")   // frog: croaks along to the cat (input-driven bop of the axolotl excluded)
    return e
  }
  function check(cond, msg) { if (!cond) { failed = true; log.push("  FAIL " + msg) } }

  function run() {
    var modes = ["full", "calm", "still"]
    var counts = {}
    for (var c = 0; c < cfg.cases.length; c++) {
      var cs = cfg.cases[c]
      for (var m = 0; m < modes.length; m++) {
        pet.motion = modes[m]
        for (var k in cfg.base) pet[k] = cfg.base[k]
        for (k in cs.props) pet[k] = cs.props[k]
        pet.fidget = ""
        var t = timers(pet, [])
        var ex = extrasOn()
        var mv = pet.moving === true || pet.needsClock === true
        log.push(cfg.type + " " + cs.name + " " + modes[m] + ": timers=" + JSON.stringify(t) + " extras=" + JSON.stringify(ex) + " moving=" + mv)
        counts[cs.name + modes[m]] = t.length
        if (modes[m] === "still") check(t.length === 0, "still must run no timer")
        if (modes[m] !== "full") check(ex.length === 0, modes[m] + " must have no neighbour extras")
      }
      if (cs.fidgets) check(counts[cs.name + "calm"] < counts[cs.name + "full"], cs.name + ": calm must run fewer timers than full (no fidget timer)")
    }
    // reactions / visibility -> mask
    pet.motion = "full"
    pet.touch.window = holder
    pet.touch.syncMask()
    var on = pet.touch.maskRect.width
    pet.reactions = false
    pet.touch.syncMask()
    var off = pet.touch.maskRect.width
    var en = pet.touch.hovered
    pet.reactions = true
    pet.touch.syncMask()
    pet.visible = false
    pet.touch.syncMask()
    var hid = pet.touch.maskRect.width
    pet.visible = true
    pet.touch.syncMask()
    var back = pet.touch.maskRect.width
    log.push(cfg.type + " mask: reactions on=" + on + " off=" + off + " hidden=" + hid + " back=" + back)
    check(on > 0 && off === 0 && hid === 0 && back === on, "maskRect must be empty with reactions off / pet hidden")
    pet.reactions = false
    place.editing = true; place.dragging = true
    check(!pet.touch.dragged, "no drag dangle with reactions off")
    place.dragging = false
    check(pet.touch.landings === 0, "no landing with reactions off")
    console.log(log.join("\n") + "\n" + (failed ? "RESULT FAIL " : "RESULT OK ") + cfg.type)
    Qt.quit()
  }
  Component.onCompleted: Qt.callLater(run)
}
