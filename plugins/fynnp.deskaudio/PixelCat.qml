import QtQuick
import "Sprites.js" as Sprites
import "PetSeason.js" as PetSeason
import "PetFx.js" as PetFx
import "PetLove.js" as PetLove

// Pixel cat (v2): a sitting tabby on a 44x38 cell grid at px 2. All the
// choreography lives in Sprites.scene(): this item only turns the card's data
// and PetTouch input into a small state object, quantised to ticks, and shows
// the memoised frame for the resulting pose key. Guide: docs/PETS.md.
//
//   silence             -> sleeps as a loaf: breathing, z's, ear twitches
//   just paused         -> sits awake ~30 s, then drowsy nods, then sleeps
//   sound, no player    -> idle: blinks, tail sway, fidgets (lick, yawn, look, stretch, pounce)
//   music               -> dances; a new move every two bars, height/singing follow the level
//   loud for a while    -> headbanging with sweat and sparkles; maxed out -> dizzy spells
//   buddy load/maxed/hot -> looks up worried, ears flat (sweat when maxed/hot)
//   gamer launching     -> ears perk, wide eyes, "!"
//   touch: pet (purr, hearts) · annoyed (hiss, turns away) · squish (giggling loaf)
//          hover (eyes/ears follow; a sleeping cat opens one eye)
//          layout drag (dangles by the scruff) · drop (lands on its feet, proud)
//
// Cost: the sprite repaints only when the pose key changes (≤ 4/s, 8/s while
// a touch reaction plays). Effects are a few tiny sprites that mostly just move.
Item {
  id: cat
  property string motion: "full"   // full | calm | still (petMotion setting, wired by pet-settings)
  property bool reactions: true    // petReactions setting: false = no touch
  // full: everything · calm: no fidgets, no neighbour moments (worried, "!")
  // · still: mood frames only (one pose per mode, no blinks, no landing
  // play); the card stops its slow clock and hands the cat a frozen one.
  readonly property bool extras: motion === "full"
  readonly property bool still: motion === "still"
  property string season: ""   // "" | xmas | party | spooky (PetSeason.js via the card's PetCalendar)
  property real level: 0
  property bool playing: false
  property real clock: 0
  property int px: 2
  property bool active: true
  property string buddyMood: ""
  property string gamerMood: ""
  property var place: null

  property alias touch: petTouch
  // True while the cat wants frames although nothing else would tick.
  readonly property bool moving: petTouch.busy || fidgeting || landT >= 0 || morningPlay.running || greeting || loveRow

  // Dance tiers from sustained loudness (EMA of the level) -- tune live.
  property real gentleBelow: 0.22
  property real intenseAbove: 0.62
  property real maxedAbove: 0.80
  property real awakeAfterPause: 40     // seconds awake after the music stops (last 10 drowsy)

  width: 44 * px
  height: 38 * px

  // ---------- time ----------
  // Ticks in 1/8 s. At 4 fps it advances by 2, so all one-shot animations
  // keep their timing when the clock speeds up for a reaction.
  readonly property int tick: petTouch.busy || greeting ? Math.floor(clock * 8) : Math.floor(clock * 4) * 2
  // Wall-clock quarter seconds, re-read on every clock tick: the z's of the
  // cat and the buddy share one phase, so they float up in sync.
  readonly property int wallQ: { var c = cat.clock; return Math.floor((Date.now() % 100000000) / 250) }

  // ---------- mood ----------
  property real energy: 0
  onLevelChanged: energy += (level - energy) * 0.03
  property real awakeUntil: -1
  onPlayingChanged: if (!playing) { energy = 0; awakeUntil = clock + awakeAfterPause }

  readonly property bool dancing: playing && level > 0.02
  readonly property string mode: dancing ? "dance"
    : (playing || level > 0.02 || (!still && clock < awakeUntil - 10)) ? "idle"
    : !still && clock < awakeUntil ? "drowsy" : "sleep"
  readonly property int tier: energy > maxedAbove ? 4 : energy > intenseAbove ? 3 : energy > gentleBelow ? 1 : 0
  readonly property int amp: still ? 1 : level > 0.75 ? 3 : level > 0.5 ? 2 : level > 0.25 ? 1 : 0
  readonly property string neighbour: !extras ? ""
    : gamerMood === "launching" ? "alert"
    : (buddyMood === "maxed" || buddyMood === "hot") ? "stressed"
    : buddyMood === "load" ? "worried" : ""

  // ---------- blink + fidgets ----------
  property bool blinking: false
  Timer {
    interval: 3200
    running: cat.active && !cat.still && cat.mode !== "sleep"
    repeat: true
    onTriggered: { cat.blinking = true; blinkOff.restart(); interval = 2600 + Math.floor(Math.random() * 3000) }
  }
  Timer { id: blinkOff; interval: 150; onTriggered: cat.blinking = false }
  onExtrasChanged: if (!extras) fidget = ""


  property string fidget: ""
  property int fidgetStart: 0
  readonly property bool fidgeting: fidget !== "" && mode === "idle" && tick - fidgetStart < Sprites.fidgetTicks(fidget)
  Timer {
    interval: 9000
    repeat: true
    running: cat.active && cat.extras && cat.mode === "idle" && cat.neighbour === "" && petTouch.reaction === "" && !petTouch.hovered
    onTriggered: {
      var names = Sprites.FIDGET_NAMES
      cat.fidget = names[Math.floor(Math.random() * names.length)]
      if (cat.night && Math.random() < 0.5) cat.fidget = "yawn"   // day-night: extra sleepy
      cat.fidgetStart = cat.tick
      interval = 8000 + Math.floor(Math.random() * 7000)
    }
  }

  // ---------- touch ----------
  property int reactStart: 0
  property int landStart: -1000
  readonly property int landT: !still && tick - landStart < 18 ? tick - landStart : -1
  Connections {
    target: petTouch
    function onSerialChanged() {
      cat.reactStart = cat.tick
      // Annoying or squishing a sleeping cat wakes it up for a while.
      if (petTouch.reaction === "annoyed" || petTouch.reaction === "squish")
        cat.awakeUntil = Math.max(cat.awakeUntil, cat.clock + 30)
    }
    function onLandingsChanged() { cat.landStart = cat.tick }
  }

  // ---------- day / night (day-night; PetCalendar via the card) ----------
  // night: nightcap while asleep + more yawns; morning: the first wake of the
  // day (sleep -> idle / dance) is a stretch + a mug of coffee. Single-shot timers.
  property bool night: false
  property bool morning: false
  property string morningDay: ""
  property int morningStart: 0
  readonly property bool dozing: mode === "sleep"
  onDozingChanged: if (!dozing && morning && motion !== "still" && morningDay !== new Date().toDateString()) morningWait.restart()
  Timer {
    id: morningWait
    interval: 800
    onTriggered: if (cat.active && cat.morningDay !== new Date().toDateString() && (cat.mode === "idle" || cat.mode === "dance") && petTouch.reaction === "" && !petTouch.dragged) cat.startMorning()
  }
  Timer { id: morningPlay; interval: 4500 }
  function startMorning() {
    cat.morningDay = new Date().toDateString()
    cat.morningStart = cat.tick
    cat.fidget = ""
    morningPlay.restart()
  }

  // ---------- affection (PetMemory.qml in the card; rows from PetLove.js) ----------
  // Level 1..5 (0 = off). After a pet: a VU meter beside its head: five rising bars sweep up to its affection level; the newest one blinks
  // right after a level-up. On hover (motion "full", at most every 30 s): level 3 perks up,
  // level 4+ plays the wave from its welcome-back greeting.
  property int affection: 0
  property bool affectionUp: false
  property real loveStart: 0
  property double lastHello: 0
  readonly property bool loveRow: loveShow.running && affection > 0 && motion !== "still"
  readonly property real loveT: clock - loveStart
  readonly property int loveShown: Math.max(0, Math.min(5, Math.floor((loveT - 0.4) / 0.15) + 1))
  readonly property int loveFilled: affectionUp && Math.floor(clock * 4) % 2 === 0 ? affection - 1 : affection
  Timer { id: loveShow; interval: 3400 }
  Connections {
    target: petTouch
    function onSerialChanged() { if (petTouch.reaction === "pet" && cat.affection > 0) { cat.loveStart = cat.clock; loveShow.restart() } }
    function onHoveredChanged() { if (petTouch.hovered) cat.hoverHello() }
  }
  function greetPart(from, to) {
    fidget = ""; greetStart = Math.floor(clock * 8) - Math.round(from * 8)
    greetPlay.interval = Math.round((to - from) * 1000); greetPlay.restart()
  }
  function hoverHello() {
    if (motion !== "full" || !active || affection < 3 || greeting || petTouch.reaction !== "" || petTouch.dragged) return
    var now = Date.now()
    if (now - lastHello < 30000) return
    lastHello = now
    if (affection >= 4) greetPart(1.875, 2.75); else greetPart(0, 0.5)
  }
  PixelSprite {
    visible: cat.loveRow && cat.loveT >= 0.4
    px: cat.px
    x: 34 * cat.px
    y: 0 * cat.px
    z: 5
    opacity: cat.loveT > 3.0 ? 0.5 : 1
    palette: colors.base
    rows: cat.loveRow ? PetLove.bars(5, cat.loveFilled, cat.loveShown, "p", "n") : []
  }

  // ---------- welcome back (shared/PetGreet.qml bumps greetSerial) ----------
  // Lifts one headphone cup to hear you, slow-blinks hello (Sprites greet()).
  property int greetSerial: 0
  property int greetStart: 0
  readonly property bool greeting: greetPlay.running
  onGreetSerialChanged: if (motion !== "still" && active && !petTouch.dragged) {
    fidget = ""; greetStart = Math.floor(clock * 8); greetPlay.interval = 2800; greetPlay.restart()
  }
  onMotionChanged: if (motion === "still") greetPlay.stop()
  Timer { id: greetPlay; interval: 2800 }

  // ---------- scene ----------
  readonly property var scene: Sprites.scene({
    mode: mode, t: tick, tier: tier, amp: amp, blink: blinking,
    hov: petTouch.hovered, lx: petTouch.lookX, ly: petTouch.lookY,
    fid: fidgeting ? fidget : "", ft: tick - fidgetStart,
    rea: petTouch.reaction, rt: tick - reactStart,
    drag: petTouch.dragged, lean: petTouch.lean, lt: landT,
    nb: dancing ? "" : neighbour,
    zp: mode === "sleep" ? wallQ / 4 : 0,
    season: season, motion: motion,
    night: night, mt: morningPlay.running ? tick - morningStart : -1,
    gt: greeting ? tick - greetStart : -1
  })
  readonly property string poseKey: scene.key

  PetColors { id: colors }
  readonly property var fxPalettes: ({
    "o": colors.fx(colors.fg), "r": colors.fx(colors.urgent),
    "l": colors.fx(colors.base["l"]), "w": colors.fx(colors.base["w"]), "p": colors.fx(colors.base["p"])
  })

  PixelSprite {
    id: body
    px: cat.px
    x: cat.scene.dx * cat.px
    y: 0
    palette: cat.season !== "" ? colors.extend(PetSeason.palette(colors.bg, Qt.rgba)) : colors.base
    rows: Sprites.rows(cat.poseKey, PetSeason)
  }

  // Effect slots: hearts, notes, z's, sweat, sparkles… positioned in cells.
  Repeater {
    model: 8
    PixelSprite {
      required property int index
      readonly property var f: cat.scene.fx[index] || null
      readonly property string fxName: f ? f.n : ""
      readonly property string fxColor: f ? f.c : "o"
      px: cat.px
      visible: fxName !== ""
      x: (f ? f.x + cat.scene.dx : 0) * cat.px
      y: (f ? f.y : 0) * cat.px
      opacity: f ? f.o : 0
      palette: cat.fxPalettes[fxColor] || cat.fxPalettes["o"]
      rows: Sprites.fxRows(fxName, PetFx)
    }
  }

  PetTouch {
    id: petTouch
    gazing: chat.looking
    gazeX: chat.lookX
    gazeY: chat.lookY
    anchors.fill: parent
    active: cat.active
    reactions: cat.reactions
    place: cat.place

  }

  // ---------- pet chat (shared PetChat.qml) ----------
  // Calm and awake: may send a music note to a neighbour card now and then;
  // asleep: may receive one (wakes up to look). Only with motion "full".
  readonly property string chatStatus: !cat.extras || !cat.active || cat.dancing || cat.neighbour !== "" ? ""
    : cat.mode === "idle" ? "calm" : (cat.mode === "sleep" || cat.mode === "drowsy") ? "sleep" : ""
  PetChat {
    id: chat
    name: "cat"
    item: "note"
    status: cat.chatStatus
    place: cat.place
    clock: cat.clock
    px: cat.px
    from: Qt.point(19, 0)
  }
}
