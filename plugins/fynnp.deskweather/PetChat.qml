import QtQuick
import Quickshell
import Quickshell.Io
import "PetFx.js" as PetFx

// PetChat: neighbour moments between desk pets (pet-chat). Canonical copy:
// shared/PetChat.qml -- copy verbatim into each pet card plugin, next to
// PetTouch/PixelSprite/PetFx.js. Guide: docs/PETS.md "Pet chat".
//
// Every few minutes a calm pet looks toward a neighbouring card and sends a
// little thing in character (penguin: paper plane, hamster: sunflower seed,
// cat: music note, dachshund: bone, pigeon: envelope, axolotl: bubble, owl:
// feather, frog: lily pad). It
// flies off the pet's side; a moment later it flies in on the other card from
// the sender's side, the receiver looks back (a sleeping one opens its eyes)
// and the gift pops into a little heart. Everything stays inside each card.
//
// Bus (tmpfs, inotify, no polling), in $XDG_RUNTIME_DIR/fynnp-desk:
//   chat-<name>  this pet's availability: {"s":"calm"|"sleep","m":monitor,
//                "x","y","w","h"} (global card rect) or "" -- written only
//                when it changes
//   msg-<name>   inbox: {"f":from,"k":item,"t":ms} written by a sender
// Cost: one single-shot Timer (4-9 min) while the pet is calm, visible and a
// neighbour is available; the pet's clock runs only during a ~3 s moment (via
// touch.gazing -> touch.busy). Nothing at all while covered or unavailable.
//
//   PetChat { id: chat; name: "buddy"; item: "plane"; status: …; place: pet.place
//             clock: pet.clock; px: pet.px; from: Qt.point(10, 3) }
//   PetTouch { …; gazing: chat.looking; gazeX: chat.lookX; gazeY: chat.lookY }
// `status`: "calm" (awake, relaxed: may send and receive), "sleep" (may receive:
// wakes up to look), "" (busy, struggling, hidden, motion not "full", covered).
Item {
  id: chat

  // ---------- inputs ----------
  property string name: ""
  property string item: "heart"
  property string status: ""
  property var place: null
  property real clock: 0
  property int px: 2
  property point from: Qt.point(20, 4)    // cell above the pet's head: launch / landing spot

  // ---------- outputs ----------
  property string phase: ""                // "" | "send" | "wait" | "receive"
  readonly property bool looking: phase === "send" || phase === "receive"
  property int lookX: 0
  property int lookY: 0

  readonly property var names: ["buddy", "hamster", "cat", "dog", "pigeon", "gamer", "owl", "frog"]
  readonly property string dir: Quickshell.env("XDG_RUNTIME_DIR") + "/fynnp-desk"
  property bool ready: false
  property var peers: ({})                  // name -> {s, m, x, y, w, h}
  property real start: 0
  property string shown: ""                 // item kind in flight
  property int dirX: 0
  property int dirY: 0

  visible: phase !== ""
  width: 0
  height: 0

  // ---------- availability ----------
  readonly property var rect: place ? place.rect : null
  readonly property string monitor: place && place.targetScreen ? String(place.targetScreen.name) : ""
  readonly property string avail: {
    if (!ready || name === "" || (status !== "calm" && status !== "sleep") || !rect || !place || place.editing) return ""
    return JSON.stringify({ s: status, m: monitor, x: rect.x, y: rect.y, w: rect.w, h: rect.h })
  }
  property string written: "-"
  onAvailChanged: publish()
  function publish() {
    // writer.path may still be "" while `ready` notifies (binding order): wait for onExited's call
    if (!ready || name === "" || avail === written || writer.path === "") return
    written = avail
    writer.setText(avail + "\n")
  }

  Process {
    running: true
    command: ["sh", "-c", "mkdir -p \"$1\" && cd \"$1\" && for n in buddy hamster cat dog pigeon gamer owl frog; do touch \"chat-$n\" \"msg-$n\"; done", "sh", chat.dir]
    onExited: { chat.ready = true; chat.publish() }
  }
  FileView {
    id: writer
    path: chat.ready && chat.name ? chat.dir + "/chat-" + chat.name : ""
    atomicWrites: false   // keep the inode: the other cards watch it
    printErrors: false
  }

  function parse(t) {
    var d = null
    try { d = JSON.parse(String(t).slice(0, 512)) } catch (e) { return null }
    if (!d || (d.s !== "calm" && d.s !== "sleep") || typeof d.m !== "string") return null
    if (!isFinite(d.x) || !isFinite(d.y) || !isFinite(d.w) || !isFinite(d.h)) return null
    return d
  }
  function setPeer(n, t) {
    var next = ({})
    for (var k in peers) next[k] = peers[k]
    next[n] = parse(t)
    peers = next
  }
  Instantiator {
    model: chat.ready && chat.name ? chat.names.filter(function(n) { return n !== chat.name }) : []
    delegate: FileView {
      required property string modelData
      path: chat.dir + "/chat-" + modelData
      watchChanges: true
      printErrors: false
      onLoaded: chat.setPeer(modelData, text())
      onFileChanged: reload()
    }
  }

  // Neighbours on the same monitor that are available right now.
  readonly property var partners: {
    var out = []
    for (var k in peers) {
      var p = peers[k]
      if (p && p.m === monitor) out.push(k)
    }
    return out
  }

  // Direction from this card to another card's centre: [dx, dy], one axis.
  function towards(p) {
    if (!rect || !p) return [1, 0]
    var ax = rect.x + rect.w / 2, ay = rect.y + rect.h / 2
    var bx = p.x + p.w / 2, by = p.y + p.h / 2
    if (Math.abs(by - ay) > Math.abs(bx - ax) * 1.2) return [0, by < ay ? -1 : 1]
    return [bx < ax ? -1 : 1, 0]
  }

  // ---------- sending ----------
  Timer {
    id: nextChat
    interval: 240000 + Math.floor(Math.random() * 300000)
    running: chat.status === "calm" && chat.avail !== "" && chat.partners.length > 0 && chat.phase === ""
    onTriggered: {
      interval = 240000 + Math.floor(Math.random() * 300000)
      chat.send()
    }
  }
  function send() {
    var list = partners
    if (!list.length) return
    // prefer an awake neighbour; a sleeping one only now and then
    var awake = list.filter(function(n) { return peers[n].s === "calm" })
    var pool = awake.length && Math.random() < 0.75 ? awake : list
    var to = pool[Math.floor(Math.random() * pool.length)]
    var d = towards(peers[to])
    begin("send", d, item)
    Quickshell.execDetached(["sh", "-c", "printf '%s\\n' \"$2\" > \"$1\"", "sh", dir + "/msg-" + to,
      JSON.stringify({ f: name, k: item, t: Date.now() })])
  }

  // ---------- receiving ----------
  readonly property var items: ["plane", "seed", "note", "bone", "envelope", "bubble", "feather", "lily", "heart"]
  property bool inboxPrimed: false
  FileView {
    path: chat.ready && chat.name ? chat.dir + "/msg-" + chat.name : ""
    watchChanges: true
    printErrors: false
    onLoaded: {
      // the first load is whatever was left from an earlier session
      if (!chat.inboxPrimed) { chat.inboxPrimed = true; return }
      chat.receive(text())
    }
    onFileChanged: reload()
  }
  function receive(t) {
    var d = null
    try { d = JSON.parse(String(t).slice(0, 256)) } catch (e) { return }
    if (!d || typeof d.f !== "string" || Math.abs(Date.now() - Number(d.t)) > 15000) return
    if (phase !== "" || (status !== "calm" && status !== "sleep")) return
    var k = items.indexOf(d.k) >= 0 ? d.k : "heart"
    begin("wait", towards(peers[d.f]), k)
    waitEnd.restart()
  }
  // The gift is still flying off the sender's card: arrive a bit later.
  Timer { id: waitEnd; interval: 1300; onTriggered: if (chat.phase === "wait") chat.begin("receive", [chat.dirX, chat.dirY], chat.shown) }

  function begin(ph, d, k) {
    dirX = d[0]; dirY = d[1]
    lookX = dirX; lookY = dirY
    shown = k
    start = clock
    phase = ph
    if (ph !== "wait") phaseEnd.restart()
  }
  Timer { id: phaseEnd; interval: 3000; onTriggered: chat.phase = "" }
  onStatusChanged: if (status === "" && phase === "wait") { phase = ""; waitEnd.stop() }

  // ---------- the flying gift ----------
  // Sender: hops up from `from`, then flies 40 cells toward the neighbour and
  // fades. Receiver: enters from the neighbour's side, glides to `from`, pops
  // into a heart. Whole cells, at the pet's clock rate (8 fps while gazing).
  readonly property real t: clock - start
  readonly property var pos: {
    var tt = t, fx = from.x, fy = from.y
    if (phase === "send") {
      if (tt < 0.5) return { x: fx, y: fy - Math.round(tt * 4), op: 1, pop: false }
      var p = Math.min(1, (tt - 0.5) / 1.6)
      return { x: Math.round(fx + dirX * p * 40), y: Math.round(fy - 2 + dirY * p * 34 - Math.sin(p * Math.PI) * (dirY ? 0 : 3)),
               op: p < 0.7 ? 1 : Math.max(0, 1 - (p - 0.7) / 0.3), pop: false }
    }
    if (phase === "receive") {
      var q = Math.min(1, tt / 1.2)
      if (tt < 1.2) return { x: Math.round(fx + dirX * (1 - q) * 30), y: Math.round(fy + dirY * (1 - q) * 24 - Math.sin(q * Math.PI) * (dirY ? 0 : 3)),
                             op: q < 0.2 ? q / 0.2 : 1, pop: false }
      return { x: fx, y: fy - Math.round((tt - 1.2) * 3), op: tt < 2.4 ? 1 : Math.max(0, 1 - (tt - 2.4) / 0.6), pop: true }
    }
    return { x: fx, y: fy, op: 0, pop: false }
  }

  readonly property var sprites: ({
    plane: ["oo......", "ohoo....", ".ohhoo..", ".ohhhhoo", "..oooo.."],
    seed: [".oo.", "ohho", "oheo", "ohho", "oeho", ".oo."],
    note: PetFx.note,
    bone: ["oo.....oo", "ohoooooho", "ohhhhhhho", "ohoooooho", "oo.....oo"],
    envelope: ["ooooooo", "oohhhoo", "ohohoho", "ohhohho", "ooooooo"],
    bubble: [".ooo.", "oh..o", "o...o", "o...o", ".ooo."],
    feather: ["....oo", "...oho", "..ohho", ".ohho.", ".oho..", "o....."],
    lily: ["..ohoo.", ".ohhhho", "ohh.hho", "ohhhhho", ".ooooo."],
    heart: PetFx.heartSmall
  })
  PetColors { id: colors }
  readonly property var tones: ({
    plane: colors.fx(colors.fg), seed: colors.fx(colors.base.d), note: colors.fx(colors.fg),
    bone: colors.fx(colors.base.l), envelope: colors.fx(colors.base.l), bubble: colors.fx(colors.base.h),
    feather: colors.fx(colors.base.w), lily: colors.fx(colors.base.n),
    heart: colors.fx(colors.urgent)
  })
  readonly property var rows: {
    if (shown === "") return []
    if (pos.pop) return PetFx.heartSmall
    var r = sprites[shown] || sprites.heart
    // face the direction of travel (sender: away, receiver: coming in)
    var goesLeft = phase === "send" ? dirX < 0 : dirX > 0
    return goesLeft && shown !== "note" && shown !== "bubble" && shown !== "seed" && shown !== "lily" ? PetFx.mirror(r) : r
  }

  PixelSprite {
    visible: chat.looking && chat.pos.op > 0
    px: chat.px
    x: (chat.pos.x - Math.floor((chat.rows.length ? chat.rows[0].length : 0) / 2)) * chat.px
    y: chat.pos.y * chat.px
    opacity: chat.pos.op
    palette: chat.pos.pop ? chat.tones.heart : (chat.tones[chat.shown] || chat.tones.heart)
    rows: chat.rows
  }
}
