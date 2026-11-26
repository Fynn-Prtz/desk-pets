// Welcome-back greeting scenarios for any pet (bumps greetSerial at frame 0).
// MOODS is replaced per pet by tools/greet-check.sh: { asleep, calm, busy, stressed } -> props.
(function(){
var M = MOODS
function R(p, pl) { p.touch.react("", 0); pl.editing = false; pl.dragging = false; if (p.fidget !== undefined) p.fidget = "" }
function G(name, props, motion) {
  return { name: name, props: Object.assign({ motion: motion || "full" }, props), frames: 24, step: 0.125,
    setup: function(p, pl) { R(p, pl); p.greetSerial++ } }
}
return [
  G("1-greet-asleep", M.asleep),
  G("2-greet-calm", M.calm),
  G("3-greet-busy", M.busy),
  G("4-greet-stressed", M.stressed),
  G("5-greet-calm-motion-calm", M.calm, "calm"),
  G("6-greet-still-none", M.asleep, "still")
]
})()
