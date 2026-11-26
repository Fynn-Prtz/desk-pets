(function(){
function R(p, pl) { p.touch.react("", 0); pl.editing = false; pl.dragging = false; p.fidget = "" }
function S(name, props, opt) {
  opt = opt || {}
  return { name: name, props: Object.assign({ mood: "light", util: 0, readRate: 0, writeRate: 0, catMood: "" }, props),
    frames: opt.frames || 16, step: opt.step || 0.25,
    setup: function(p, pl) { R(p, pl); if (opt.setup) opt.setup(p, pl) }, each: opt.each }
}
function F(kind) { return { setup: function(p) { p.fidget = kind; p.fidgetAt = p.clock } } }
return [
  S("01-sleep", { mood: "idle" }, { frames: 16 }),
  S("02-calm", { mood: "light", readRate: 1e6 }, { frames: 8 }),
  S("03-fidget-look", { mood: "light" }, F("look")),
  S("04-fidget-sniff", { mood: "light" }, F("sniff")),
  S("05-fidget-wag", { mood: "light" }, F("wag")),
  S("06-fidget-scratch", { mood: "light" }, F("scratch")),
  S("06b-fidget-yawn", { mood: "light" }, F("yawn")),
  S("07-busy-read", { mood: "busy", util: 20, readRate: 20e6 }),
  S("08-busy-write", { mood: "busy", util: 20, writeRate: 20e6 }),
  S("09-strain", { mood: "busy", util: 60, readRate: 80e6 }),
  S("10-strain-max", { mood: "busy", util: 99, readRate: 400e6 }),
  S("11-full", { mood: "full" }),
  S("12-full-heavy", { mood: "full", util: 80, writeRate: 90e6 }),
  S("13-pet", { mood: "light" }, { step: 0.125, setup: function(p) { p.touch.react("pet", 100000) } }),
  S("14-pet-strained", { mood: "busy", util: 70, readRate: 90e6 }, { step: 0.125, setup: function(p) { p.touch.react("pet", 100000) } }),
  S("15-annoyed", { mood: "light" }, { step: 0.125, setup: function(p) { p.touch.react("annoyed", 100000) } }),
  S("16-squish", { mood: "light" }, { step: 0.125, setup: function(p) { p.touch.react("squish", 0) } }),
  S("16b-groove", { mood: "idle", catMood: "dance" }),
  S("17-drag", { mood: "light" }, { step: 0.125, setup: function(p, pl) { pl.editing = true; pl.dragging = true },
     each: function(p, pl, f) { pl.dragX += (f % 6 < 3 ? 12 : -12) } }),
  S("18-landing", { mood: "light" }, { frames: 6, step: 0.125, setup: function(p, pl) { pl.editing = true; pl.dragging = true; pl.dragging = false } })
]
})()
