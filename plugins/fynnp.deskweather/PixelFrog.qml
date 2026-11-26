import QtQuick
import "Sprites.js" as Sprites
import "PetFx.js" as PetFx
import "PetSeason.js" as PetSeason
import "PetLove.js" as PetLove

// Pixel tree frog that dresses for the weather (px 2 on the shared 44x38 pet
// canvas, docs/PETS.md). Everything it shows comes from Sprites.scene(): this
// item gathers the state, times fidgets / blinks / reactions and lays out the
// body, the floor shadow, up to six effect sprites and the sky layer (rain,
// snow or fog in front of the frog, masked by its umbrella).
//
// Moods (from the forecast, Weather.js):
//   sleep   late at night: dozes, throat sac breathing, z's
//   night   evening: gazes at the stars now and then
//   sun     sunglasses, smug grin; fidgets: glint, pushes the shades up, fly
//   hot     flattened under its shades, panting, fanning itself, sweating
//   cloudy  calm: blinks, looks around, snaps a fly, croaks, hops, yawns
//   cold    scarf, shivers in bursts, teeth chatter, breath puffs
//   wind    leans into the wind, scarf flapping, leaves blowing past
//   fog     peers left and right into drifting fog bands, "?"
//   drizzle umbrella, sways, a small hop in its puddle now and then
//   rain    umbrella, PUDDLE JUMPING with splashes
//   storm   hangs on to the umbrella the wind keeps grabbing (flips inside
//           out), strains, sweats, lightning
//   snow    scarf, snow on its eye domes, catches flakes on its tongue
//   setup / offline / waiting: no location / no data yet (waves, "?")
// `cold` adds the scarf to any mood. Neighbours: cat dancing -> croaks along;
// gamer launching -> "!".
// Touch (PetTouch): pet (happy croak, hearts), annoyed (puffs up, stomps),
// squish, hover (wakes, eyes follow), drag (dangles; floats on its umbrella),
// landing (squash + dust or a splash, then dizzy).
// Seasons (PetCalendar): Santa hat across both eye domes / a carved pumpkin
// worn as a helmet / a party hat (all yield to the umbrella). Day-night: a
// nightcap when asleep after 23:00; the first wake of the morning is a big
// stretch + yawn, a coffee and a "good morning" croak. Welcome back: hops,
// waves and croaks. Affection: a row of lily pads (in bloom = filled) after
// petting; fond frogs perk up / wave on hover. Pet chat: sends a lily pad.
// motion: full | calm (no idle fidgets / neighbour extras) | still (one frame
// per mood, no clock at all).
Item {
  id: frog
  property string motion: "full"   // full | calm | still (petMotion setting)
  property bool reactions: true    // petReactions setting: false = no touch
  readonly property bool extras: motion === "full"
  property string season: ""   // "" | xmas | party | spooky (PetSeason.js via the card's PetCalendar)
  property string mood: "waiting"
  property bool cold: false
  property bool heavy: false
  property real clock: 0
  property int px: 2
  property bool active: true
  property string catMood: ""
  property string gamerMood: ""
  property var place: null
  property Item window: null
  property alias touch: touch

  width: 44 * px
  height: 38 * px

  PetColors { id: colors }

  readonly property bool still: motion === "still"
  readonly property bool calmOnly: motion !== "full"
  readonly property bool calmMood: mood === "cloudy" || mood === "sun" || mood === "night" || mood === "waiting"
    || mood === "setup" || mood === "offline"
  readonly property bool bop: !calmOnly && catMood === "dance" && calmMood
  readonly property bool bang: !calmOnly && gamerMood === "launching"

  // The mood itself animates (rain, snow, z's ...); calm moods rest.
  readonly property bool animated: !still && !calmMood
  // Wants frames although the mood alone would rest.
  readonly property bool moving: !still && (bop || bang || fidget !== "" || touch.busy || landPlay.running
    || morningPlay.running || greeting || loveRow)
  readonly property bool fast: active && !still && (touch.reaction !== "" || touch.dragged || touch.landing || landPlay.running || greeting)

  readonly property real wall: { var tick = frog.clock; return (Date.now() % 100000000) / 1000 }

  // ---------- blinks ----------
  property bool blinking: false
  Timer {
    interval: 3200
    running: frog.active && !frog.still && frog.mood !== "sleep" && frog.mood !== "hot" && !frog.bop
    repeat: true
    onTriggered: { frog.blinking = true; blinkOff.restart(); interval = 2600 + Math.floor(Math.random() * 3000) }
  }
  Timer { id: blinkOff; interval: 150; onTriggered: frog.blinking = false }

  // ---------- idle fidgets (calm moods, motion full) ----------
  readonly property var fidgetSets: ({
    cloudy: ["look", "fly", "croak", "hop", "yawn"],
    waiting: ["look", "croak"],
    sun: ["glint", "shades", "fly", "croak", "look"],
    night: ["stars", "croak", "look", "yawn"],
    setup: ["look"],
    offline: ["look"],
    cold: ["look"]
  })
  readonly property var fidgetLength: ({ look: 2800, fly: 2800, croak: 2200, hop: 1600, yawn: 2200,
                                         glint: 2000, shades: 2600, stars: 3000 })
  property string fidget: ""
  property real fidgetStart: 0
  Timer {
    interval: 9000
    running: frog.active && !frog.calmOnly && !!frog.fidgetSets[frog.mood] && !frog.bop && !frog.bang
      && frog.fidget === "" && touch.reaction === "" && !touch.dragged && !touch.hovered
    onTriggered: {
      var set = frog.fidgetSets[frog.mood]
      frog.fidget = set[Math.floor(Math.random() * set.length)]
      if (frog.night && set.indexOf("yawn") >= 0 && Math.random() < 0.5) frog.fidget = "yawn"   // day-night: extra sleepy
      frog.fidgetStart = frog.clock
      fidgetEnd.interval = frog.fidgetLength[frog.fidget]
      fidgetEnd.restart()
      interval = 8000 + Math.floor(Math.random() * 7000)
    }
  }
  Timer { id: fidgetEnd; onTriggered: frog.fidget = "" }
  onMoodChanged: if (fidget !== "") { fidget = ""; fidgetEnd.stop() }
  onActiveChanged: if (!active) { fidget = ""; fidgetEnd.stop() }
  onCalmOnlyChanged: if (calmOnly) { fidget = ""; fidgetEnd.stop() }

  // ---------- reactions ----------
  property real reactStart: 0
  property real landStart: 0
  Connections {
    target: touch
    function onSerialChanged() { frog.reactStart = frog.clock; frog.fidget = "" }
    function onLandingsChanged() { frog.landStart = frog.clock; if (!frog.still) landPlay.restart() }
  }
  Timer { id: landPlay; interval: 1500 }

  // ---------- day / night (day-night; PetCalendar via the card) ----------
  // night: nightcap while asleep + more yawns; morning: the first wake of the
  // day (sleep -> any weather) is a stretch + yawn, a coffee and a croak.
  property bool night: false
  property bool morning: false
  property string morningDay: ""
  property real morningStart: 0
  readonly property bool dozing: mood === "sleep"
  onDozingChanged: if (!dozing && morning && motion !== "still" && morningDay !== new Date().toDateString()) morningWait.restart()
  Timer {
    id: morningWait
    interval: 800
    onTriggered: if (frog.active && frog.morningDay !== new Date().toDateString() && frog.mood !== "sleep" && frog.mood !== "storm"
                     && touch.reaction === "" && !touch.dragged) frog.startMorning()
  }
  Timer { id: morningPlay; interval: 4500 }
  function startMorning() {
    frog.morningDay = new Date().toDateString()
    frog.morningStart = frog.clock
    frog.fidget = ""; fidgetEnd.stop()
    morningPlay.restart()
  }

  // ---------- affection (PetMemory.qml in the card; rows from PetLove.js) ----------
  // Level 1..5 (0 = off). After a pet: five lily pads pop up in a row over its
  // head, the filled ones in bloom (a pink flower); the newest blinks right
  // after a level-up. On hover (motion "full", at most every 30 s): level 3
  // perks up, level 4+ waves like in its welcome-back greeting.
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
    target: touch
    function onSerialChanged() { if (touch.reaction === "pet" && frog.affection > 0) { frog.loveStart = frog.clock; loveShow.restart() } }
    function onHoveredChanged() { if (touch.hovered) frog.hoverHello() }
  }
  function greetPart(from, to) {
    fidget = ""; fidgetEnd.stop(); greetStart = clock - from
    greetPlay.interval = Math.round((to - from) * 1000); greetPlay.restart()
  }
  function hoverHello() {
    if (motion !== "full" || !active || affection < 3 || greeting || touch.reaction !== "" || touch.dragged) return
    var now = Date.now()
    if (now - lastHello < 30000) return
    lastHello = now
    if (affection >= 4) greetPart(1.4, 2.7); else greetPart(0, 0.4)
  }
  PixelSprite {
    visible: frog.loveRow && frog.loveT >= 0.4
    px: frog.px
    x: 8 * frog.px
    y: 0
    z: 5
    opacity: frog.loveT > 3.0 ? 0.5 : 1
    palette: colors.base
    rows: frog.loveRow ? PetLove.row([".rpr.", "ooroo", "ohhho", ".ooo."], ["..o..", "oo.oo", "onnno", ".ooo."], 5, frog.loveFilled, frog.loveShown, 1) : []
  }

  // ---------- welcome back (shared/PetGreet.qml bumps greetSerial) ----------
  // Perks up ("!" if it was asleep), a big happy hop, then waves and croaks.
  property int greetSerial: 0
  property real greetStart: 0
  readonly property bool greeting: greetPlay.running
  onGreetSerialChanged: if (motion !== "still" && active && !touch.dragged) {
    fidget = ""; fidgetEnd.stop(); greetStart = clock; greetPlay.interval = 2700; greetPlay.restart()
  }
  onMotionChanged: if (motion === "still") greetPlay.stop()
  Timer { id: greetPlay; interval: 2700 }

  PetTouch {
    id: touch
    gazing: chat.looking
    gazeX: chat.lookX
    gazeY: chat.lookY
    anchors.fill: parent
    active: frog.active
    reactions: frog.reactions
    place: frog.place
    window: frog.window
  }

  readonly property var scene: Sprites.scene({
    mood: frog.mood,
    cold: frog.cold,
    heavy: frog.heavy,
    still: frog.still,
    t: frog.clock,
    wall: frog.wall,
    blink: frog.blinking,
    fidget: frog.fidget,
    fidgetT: frog.clock - frog.fidgetStart,
    reaction: touch.reaction,
    reactT: frog.clock - frog.reactStart,
    hovered: touch.hovered,
    lookX: touch.lookX,
    lookY: touch.lookY,
    dragged: touch.dragged,
    lean: touch.lean,
    landT: landPlay.running && !touch.dragged ? frog.clock - frog.landStart : -1,
    bop: frog.bop,
    bang: frog.bang,
    beat: Math.floor(frog.wall * 4),
    season: frog.season,
    motion: frog.motion,
    night: frog.night,
    morningT: morningPlay.running ? frog.clock - frog.morningStart : -1,
    greetT: greetPlay.running ? frog.clock - frog.greetStart : -1
  }, PetFx, PetSeason)

  readonly property var fxPalettes: ({
    "o": colors.fx(colors.fg),
    "r": colors.fx(colors.urgent),
    "l": colors.fx(colors.base.l),
    "w": colors.fx(colors.base.w),
    "n": colors.fx(colors.base.n),
    "p": colors.fx(colors.base.p)
  })
  readonly property var none: []

  PixelSprite {
    px: frog.px
    x: 2 * frog.px
    y: 35 * frog.px
    palette: colors.base
    rows: frog.scene.shadow
  }

  PixelSprite {
    px: frog.px
    x: frog.scene.x * frog.px
    y: frog.scene.y * frog.px
    palette: frog.season !== "" ? colors.extend(PetSeason.palette(colors.bg, Qt.rgba)) : colors.base
    rows: frog.scene.rows
  }

  Repeater {
    model: 6
    PixelSprite {
      required property int index
      readonly property var fx: index < frog.scene.fx.length ? frog.scene.fx[index] : null
      visible: !!fx
      px: frog.px
      x: fx ? fx.x * frog.px : 0
      y: fx ? fx.y * frog.px : 0
      opacity: fx ? fx.op : 0
      palette: fx ? frog.fxPalettes[fx.c] : frog.fxPalettes.o
      rows: fx ? fx.rows : frog.none
    }
  }

  // Weather in front of the frog (rain / snow / fog).
  PixelSprite {
    visible: !!frog.scene.sky
    px: frog.px
    opacity: frog.scene.skyOp
    palette: colors.base
    rows: frog.scene.sky || frog.none
  }

  // ---------- pet chat (shared PetChat.qml) ----------
  // Calm weather and awake: may send a lily pad (its favourite seat) to a
  // neighbour card now and then; asleep: may receive one (wakes up to look).
  // Only with motion "full".
  readonly property string chatStatus: !frog.extras || !frog.active || frog.bop || frog.bang ? ""
    : frog.mood === "sleep" ? "sleep" : (frog.mood === "cloudy" || frog.mood === "sun" || frog.mood === "night") ? "calm" : ""
  PetChat {
    id: chat
    name: "frog"
    item: "lily"
    status: frog.chatStatus
    place: frog.place
    clock: frog.clock
    px: frog.px
    from: Qt.point(21, 4)
  }
}
