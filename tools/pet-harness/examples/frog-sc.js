(function(){
function R(p, pl) { p.touch.react("", 0); pl.editing = false; pl.dragging = false; p.fidget = "" }
function S(name, props, opt) {
  opt = opt || {}
  return { name: name, props: Object.assign({ mood: "cloudy", cold: false, heavy: false, motion: "full", catMood: "", gamerMood: "" }, props),
    frames: opt.frames || 12, step: opt.step || 0.25,
    setup: function(p, pl) { R(p, pl); if (opt.setup) opt.setup(p, pl) }, each: opt.each }
}
function F(kind) { return { setup: function(p) { p.fidget = kind; p.fidgetStart = p.clock } } }
return [
  S("01-setup", { mood: "setup" }, { frames: 2 }),
  S("02-cloudy", { mood: "cloudy" }, { frames: 2 }),
  S("03-fly", { mood: "cloudy" }, F("fly")),
  S("04-croak", { mood: "cloudy" }, F("croak")),
  S("05-sun-shades", { mood: "sun" }, F("shades")),
  S("06-hot", { mood: "hot" }),
  S("07-cold", { mood: "cold", cold: true }),
  S("08-wind", { mood: "wind", cold: true }),
  S("09-fog", { mood: "fog" }, { step: 0.5 }),
  S("10-drizzle", { mood: "drizzle" }, { frames: 24 }),
  S("11-rain", { mood: "rain" }, { frames: 20 }),
  S("12-storm", { mood: "storm" }, { frames: 16 }),
  S("13-snow", { mood: "snow", cold: true }, { frames: 20 }),
  S("14-sleep", { mood: "sleep" }, { step: 0.5 }),
  S("15-night-stars", { mood: "night" }, F("stars")),
  S("16-pet-rain", { mood: "rain" }, { step: 0.125, setup: function(p) { p.touch.react("pet", 100000) } }),
  S("17-annoyed", { mood: "sun" }, { step: 0.125, setup: function(p) { p.touch.react("annoyed", 100000) } }),
  S("18-squish", { mood: "cloudy" }, { step: 0.125, setup: function(p) { p.touch.react("squish", 0) } }),
  S("19-drag-rain", { mood: "rain" }, { step: 0.125, setup: function(p, pl) { pl.editing = true; pl.dragging = true },
     each: function(p, pl, f) { pl.dragX += (f % 6 < 3 ? 12 : -12) } }),
  S("21-bop", { mood: "cloudy", catMood: "dance" }),
  S("22-still-rain", { mood: "rain", motion: "still" }, { frames: 2 }),
  S("23-calm-cloudy", { mood: "cloudy", motion: "calm" }, { frames: 2 }),
  S("24-landing-rain", { mood: "rain" }, { frames: 8, step: 0.125, setup: function(p, pl) { pl.editing = true; pl.dragging = true; pl.dragging = false } })
]
})()
