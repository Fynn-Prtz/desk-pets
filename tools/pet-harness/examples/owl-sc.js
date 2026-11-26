(function(){
function R(p, pl) { p.touch.react("", 0); pl.editing = false; pl.dragging = false; p.fidget = "" }
function S(name, props, opt) {
  opt = opt || {}
  return { name: name, props: Object.assign({ mood: "awake", motion: "full", hourStep: 29, minuteStep: 7 }, props),
    frames: opt.frames || 16, step: opt.step || 0.25,
    setup: function(p, pl) { R(p, pl); if (opt.setup) opt.setup(p, pl) }, each: opt.each }
}
function F(kind) { return { setup: function(p) { p.fidget = kind; p.fidgetStart = p.clock } } }
return [
  S("01-awake", {}, { frames: 4 }),
  S("02-drowsy", { mood: "drowsy" }, { frames: 4 }),
  S("03-sleep", { mood: "sleep" }, { frames: 12 }),
  S("04-hoot3", {}, { frames: 20, setup: function(p) { p.hoot(3) } }),
  S("05-hoot-calm", { motion: "calm" }, { frames: 8, setup: function(p) { p.hoot(7) } }),
  S("06-still-sleep", { mood: "sleep", motion: "still" }, { frames: 3 }),
  S("07-swivel", {}, F("swivel")),
  S("08-watch", {}, F("watch")),
  S("09-preen", {}, F("preen")),
  S("10-pet", {}, { step: 0.125, setup: function(p) { p.touch.react("pet", 100000) } }),
  S("11-pet-asleep", { mood: "sleep" }, { step: 0.125, setup: function(p) { p.touch.react("pet", 100000) } }),
  S("12-annoyed", {}, { step: 0.125, setup: function(p) { p.touch.react("annoyed", 100000) } }),
  S("13-squish", {}, { step: 0.125, setup: function(p) { p.touch.react("squish", 0) } }),
  S("14-drag", {}, { step: 0.125, setup: function(p, pl) { pl.editing = true; pl.dragging = true },
     each: function(p, pl, f) { pl.dragX += (f % 6 < 3 ? 12 : -12) } }),
  S("15-landing", {}, { frames: 10, step: 0.125, setup: function(p, pl) { pl.editing = true; pl.dragging = true; pl.dragging = false } })
]
})()
