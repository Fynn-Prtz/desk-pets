(function(){
function R(p, pl) { p.touch.react("", 0); pl.editing = false; pl.dragging = false; p.fidget = "" }
function S(name, props, opt) {
  opt = opt || {}
  return { name: name, props: Object.assign({ mood: "light", rx: 0, tx: 0, catMood: "" }, props),
    frames: opt.frames || 16, step: opt.step || 0.25,
    setup: function(p, pl) { R(p, pl); if (opt.setup) opt.setup(p, pl) }, each: opt.each }
}
return [
  S("01-sleep", { mood: "idle" }),
  S("02-calm", { mood: "light", rx: 100000, tx: 8000 }, { frames: 8 }),
  S("03-fidget-look", { mood: "light" }, { setup: function(p) { p.fidget = "look"; p.fidgetAt = p.clock } }),
  S("04-fidget-preen", { mood: "light" }, { setup: function(p) { p.fidget = "preen"; p.fidgetAt = p.clock } }),
  S("05-fidget-stretch", { mood: "light" }, { setup: function(p) { p.fidget = "stretch"; p.fidgetAt = p.clock } }),
  S("06-fidget-bob", { mood: "light" }, { setup: function(p) { p.fidget = "bob"; p.fidgetAt = p.clock } }),
  S("06b-fidget-coo", { mood: "light" }, { setup: function(p) { p.fidget = "coo"; p.fidgetAt = p.clock } }),
  S("07-busy-down", { mood: "busy", rx: 3e6, tx: 50000 }),
  S("08-busy-both", { mood: "busy", rx: 3e6, tx: 2e6 }),
  S("09-strain", { mood: "busy", rx: 20e6, tx: 1e6 }),
  S("10-strain-max", { mood: "busy", rx: 90e6, tx: 5e6 }),
  S("11-offline", { mood: "offline" }, { frames: 24 }),
  S("12-pet", { mood: "light", rx: 100000 }, { step: 0.125, setup: function(p) { p.touch.react("pet", 100000) } }),
  S("13-pet-strained", { mood: "busy", rx: 30e6 }, { step: 0.125, setup: function(p) { p.touch.react("pet", 100000) } }),
  S("14-annoyed", { mood: "light" }, { step: 0.125, setup: function(p) { p.touch.react("annoyed", 100000) } }),
  S("15-squish", { mood: "light" }, { step: 0.125, setup: function(p) { p.touch.react("squish", 0) } }),
  S("16-drag", { mood: "light" }, { step: 0.125, setup: function(p, pl) { pl.editing = true; pl.dragging = true },
     each: function(p, pl, f) { pl.dragX += (f % 6 < 3 ? 12 : -12) } }),
  S("17-groove", { mood: "idle", catMood: "dance" }),
  S("18-landing", { mood: "light" }, { frames: 6, step: 0.125, setup: function(p, pl) { pl.editing = true; pl.dragging = true; pl.dragging = false } })
]
})()
