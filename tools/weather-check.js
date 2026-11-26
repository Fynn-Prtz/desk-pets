// weather-check: fetch Open-Meteo once with the card's own URL and run the card's
// parser + mood mapping on it (plugins/fynnp.deskweather/Weather.js). Prints the
// parsed model summary and the frog's mood; exits 1 when parsing fails.
//   node tools/weather-check.js [lat] [lon]          (default: Berlin test coords)
//   node tools/weather-check.js --file cache.json    (parse a saved cache file)
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process")
const P = require(path.join(__dirname, "pet-preview.js"))
const W = P.load(path.join(__dirname, "../plugins/fynnp.deskweather/Weather.js"))
let text
if (process.argv[2] === "--file") text = fs.readFileSync(process.argv[3], "utf8")
else {
  const lat = +(process.argv[2] || 52.52), lon = +(process.argv[3] || 13.405)
  if (!W.validCoord(lat, lon)) { console.error("invalid coords"); process.exit(2) }
  const url = W.url(lat, lon)
  console.log("GET", url)
  const body = execFileSync("curl", ["-fsS", "--compressed", "--max-time", "20", url]).toString()
  text = JSON.stringify({ fetched: Math.floor(Date.now() / 1000), data: JSON.parse(body) })
}
const m = W.parse(text)
if (!m) { console.error("parse failed"); process.exit(1) }
const i = W.info(m.code)
const hour = W.hourOf(Math.floor(Date.now() / 1000), m.offset)
console.log("now", m.temp + "°C feels", m.feels, "code", m.code, i.label, "wind", m.wind, "gusts", m.gusts, "day", m.isDay, "local hour", hour)
console.log("hours", m.hourTemp.length, "days", m.dayTime.length, "next rain", JSON.stringify(W.nextRain(m)))
console.log("days", m.dayTime.map((t, k) => W.weekday(t, m.offset) + ":" + m.dayMin[k] + "/" + m.dayMax[k] + " " + W.info(m.dayCode[k]).key + " " + m.dayRain[k] + "%").join("  "))
console.log("curve", W.tempCurve(m).map(v => v.toFixed(2)).join(" "))
console.log("mood", JSON.stringify(W.mood(m, hour)))
// mapping self-test
const base = Object.assign({}, m)
const cases = [[0, 20, 1, 5, 14, "sun"], [0, 30, 1, 5, 14, "hot"], [3, 2, 1, 5, 14, "cold"], [0, 15, 0, 5, 23, "sleep"],
  [0, 15, 0, 5, 19, "night"], [63, 10, 1, 5, 14, "rain"], [53, 10, 1, 5, 14, "drizzle"], [95, 20, 1, 5, 14, "storm"],
  [73, -2, 1, 5, 14, "snow"], [45, 8, 1, 5, 14, "fog"], [3, 12, 1, 45, 14, "wind"], [63, 12, 1, 70, 14, "storm"]]
let bad = 0
for (const [code, temp, day, wind, h, want] of cases) {
  const got = W.mood(Object.assign({}, base, { code, temp, isDay: !!day, wind, gusts: wind }), h).mood
  if (got !== want) { bad++; console.log("MISMATCH", code, temp, day, wind, h, got, "want", want) }
}
console.log(bad ? bad + " mapping failures" : "mapping ok (" + cases.length + " cases)")
process.exit(bad ? 1 : 0)
