import QtQuick
import "Sprites.js" as Sprites
import "PetSeason.js" as PetSeason
import "PetFx.js" as PetFx

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
  readonly property bool moving: petTouch.busy || fidgeting || landT >= 0

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
  readonly property int tick: petTouch.busy ? Math.floor(clock * 8) : Math.floor(clock * 4) * 2
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
    : (playing || level > 0.02 || clock < awakeUntil - 10) ? "idle"
    : clock < awakeUntil ? "drowsy" : "sleep"
  readonly property int tier: energy > maxedAbove ? 4 : energy > intenseAbove ? 3 : energy > gentleBelow ? 1 : 0
  readonly property int amp: level > 0.75 ? 3 : level > 0.5 ? 2 : level > 0.25 ? 1 : 0
  readonly property string neighbour: gamerMood === "launching" ? "alert"
    : (buddyMood === "maxed" || buddyMood === "hot") ? "stressed"
    : buddyMood === "load" ? "worried" : ""

  // ---------- blink + fidgets ----------
  property bool blinking: false
  Timer {
    interval: 3200
    running: cat.active && cat.mode !== "sleep"
    repeat: true
    onTriggered: { cat.blinking = true; blinkOff.restart(); interval = 2600 + Math.floor(Math.random() * 3000) }
  }
  Timer { id: blinkOff; interval: 150; onTriggered: cat.blinking = false }

  property string fidget: ""
  property int fidgetStart: 0
  readonly property bool fidgeting: fidget !== "" && mode === "idle" && tick - fidgetStart < Sprites.fidgetTicks(fidget)
  Timer {
    interval: 9000
    repeat: true
    running: cat.active && cat.mode === "idle" && cat.neighbour === "" && petTouch.reaction === "" && !petTouch.hovered
    onTriggered: {
      var names = Sprites.FIDGET_NAMES
      cat.fidget = names[Math.floor(Math.random() * names.length)]
      cat.fidgetStart = cat.tick
      interval = 8000 + Math.floor(Math.random() * 7000)
    }
  }

  // ---------- touch ----------
  property int reactStart: 0
  property int landStart: -1000
  readonly property int landT: tick - landStart < 18 ? tick - landStart : -1
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

  // ---------- scene ----------
  readonly property var scene: Sprites.scene({
    mode: mode, t: tick, tier: tier, amp: amp, blink: blinking,
    hov: petTouch.hovered, lx: petTouch.lookX, ly: petTouch.lookY,
    fid: fidgeting ? fidget : "", ft: tick - fidgetStart,
    rea: petTouch.reaction, rt: tick - reactStart,
    drag: petTouch.dragged, lean: petTouch.lean, lt: landT,
    nb: dancing ? "" : neighbour,
    zp: mode === "sleep" ? wallQ / 4 : 0,
    season: season, motion: motion
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
    anchors.fill: parent
    active: cat.active
    place: cat.place
  }
}
