// Affection scenarios for any pet: heart-level row after a pet, level-up blink,
// hover perk (level 3) / wave (level 4+), calm motion = no hover extra.
// MOODS is replaced per pet by tools/affection-check.sh.
(function(){
var M = MOODS
function R(p, pl) { p.touch.react("", 0); pl.editing = false; pl.dragging = false; if (p.fidget !== undefined) p.fidget = "" }
function A(name, level, up, motion, setup) {
  return { name: name, props: Object.assign({ motion: motion || "full", affection: level, affectionUp: !!up }, M.calm),
    frames: 30, step: 0.125, setup: function(p, pl) { R(p, pl); p.lastHello = 0; setup(p) } }
}
function pet(p) { p.touch.react("pet", 1400) }
function hover(p) { p.hoverHello() }
return [
  A("a1-row-level2", 2, false, "full", pet),
  A("a2-row-level5-up", 5, true, "full", pet),
  A("a3-hover-level3-perk", 3, false, "full", hover),
  A("a4-hover-level4-wave", 4, false, "full", hover),
  A("a5-hover-calm-none", 5, false, "calm", hover),
  A("a6-off-no-row", 0, false, "full", pet)
]
})()
