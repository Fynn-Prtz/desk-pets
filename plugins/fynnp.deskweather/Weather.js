.pragma library

// Desk Weather data: Open-Meteo request, response parsing, WMO weather codes
// and the frog's mood. Pure functions (no Qt), so node can test them:
//   tools/weather-check.js runs them against a live response.
//
// Open-Meteo (https://open-meteo.com) needs no API key. Everything is fetched
// in metric units; the card converts for display.

var HOURS = 40      // hourly forecast columns (the 40-column lattice)
var DAYS = 4        // today + three

function validCoord(lat, lon) {
  return isFinite(lat) && isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180
    && !(lat === 0 && lon === 0)
}

// Coordinates rounded to ~100 m: plenty for a forecast, and less precise
// than the user's exact position.
function coordText(v) { return (Math.round(v * 1000) / 1000).toFixed(3) }

function url(lat, lon) {
  return "https://api.open-meteo.com/v1/forecast"
    + "?latitude=" + coordText(lat) + "&longitude=" + coordText(lon)
    + "&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_gusts_10m,is_day,precipitation"
    + "&hourly=temperature_2m,precipitation_probability,weather_code"
    + "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset"
    + "&forecast_hours=" + HOURS + "&forecast_days=" + DAYS
    + "&timezone=auto&timeformat=unixtime"
}

function num(v, dflt) {
  var n = Number(v)
  return v === null || v === undefined || v === "" || !isFinite(n) ? dflt : n
}

function arr(a, n, dflt) {
  var out = []
  for (var i = 0; i < n; i++) out.push(a && i < a.length ? num(a[i], dflt) : dflt)
  return out
}

// Cache file: {"fetched": unix seconds, "data": <Open-Meteo response>}.
// Returns null when the text is not a usable response.
function parse(text) {
  var c = null
  try { c = JSON.parse(text) } catch (e) { return null }
  if (!c || typeof c !== "object") return null
  var d = c.data
  if (!d || typeof d !== "object" || !d.current || !d.hourly || !d.daily) return null
  var cur = d.current
  var code = num(cur.weather_code, -1)
  var temp = num(cur.temperature_2m, NaN)
  if (code < 0 || !isFinite(temp)) return null
  var hours = Array.isArray(d.hourly.time) ? Math.min(HOURS, d.hourly.time.length) : 0
  var days = Array.isArray(d.daily.time) ? Math.min(DAYS, d.daily.time.length) : 0
  var m = {
    fetched: num(c.fetched, 0),
    offset: num(d.utc_offset_seconds, 0),
    time: num(cur.time, 0),
    temp: temp,
    feels: num(cur.apparent_temperature, temp),
    humidity: num(cur.relative_humidity_2m, -1),
    code: code,
    wind: Math.max(0, num(cur.wind_speed_10m, 0)),
    gusts: Math.max(0, num(cur.wind_gusts_10m, 0)),
    isDay: num(cur.is_day, 1) !== 0,
    precip: Math.max(0, num(cur.precipitation, 0)),
    hourTime: arr(d.hourly.time, hours, 0),
    hourTemp: arr(d.hourly.temperature_2m, hours, NaN),
    hourRain: arr(d.hourly.precipitation_probability, hours, -1),
    hourCode: arr(d.hourly.weather_code, hours, -1),
    dayTime: arr(d.daily.time, days, 0),
    dayCode: arr(d.daily.weather_code, days, -1),
    dayMax: arr(d.daily.temperature_2m_max, days, NaN),
    dayMin: arr(d.daily.temperature_2m_min, days, NaN),
    dayRain: arr(d.daily.precipitation_probability_max, days, -1),
    sunrise: num(d.daily.sunrise && d.daily.sunrise[0], 0),
    sunset: num(d.daily.sunset && d.daily.sunset[0], 0)
  }
  return m
}

// ---------------------------------------------------------------- WMO codes
//
// kind: clear | cloudy | fog | drizzle | rain | snow | storm
// level: 0 light, 1 moderate, 2 heavy; freezing: rain that freezes.

var CODES = {
  0:  ["clear", 0, "clear", "Clear sky"],
  1:  ["clear", 1, "mainlyClear", "Mainly clear"],
  2:  ["cloudy", 0, "partlyCloudy", "Partly cloudy"],
  3:  ["cloudy", 1, "overcast", "Overcast"],
  45: ["fog", 1, "fog", "Fog"],
  48: ["fog", 1, "rimeFog", "Freezing fog"],
  51: ["drizzle", 0, "lightDrizzle", "Light drizzle"],
  53: ["drizzle", 1, "drizzle", "Drizzle"],
  55: ["drizzle", 2, "heavyDrizzle", "Heavy drizzle"],
  56: ["drizzle", 0, "freezingDrizzle", "Freezing drizzle"],
  57: ["drizzle", 2, "freezingDrizzle", "Freezing drizzle"],
  61: ["rain", 0, "lightRain", "Light rain"],
  63: ["rain", 1, "rain", "Rain"],
  65: ["rain", 2, "heavyRain", "Heavy rain"],
  66: ["rain", 0, "freezingRain", "Freezing rain"],
  67: ["rain", 2, "freezingRain", "Freezing rain"],
  71: ["snow", 0, "lightSnow", "Light snow"],
  73: ["snow", 1, "snow", "Snow"],
  75: ["snow", 2, "heavySnow", "Heavy snow"],
  77: ["snow", 0, "snowGrains", "Snow grains"],
  80: ["rain", 0, "showers", "Showers"],
  81: ["rain", 1, "showers", "Showers"],
  82: ["rain", 2, "heavyShowers", "Heavy showers"],
  85: ["snow", 1, "snowShowers", "Snow showers"],
  86: ["snow", 2, "snowShowers", "Snow showers"],
  95: ["storm", 2, "thunderstorm", "Thunderstorm"],
  96: ["storm", 2, "thunderHail", "Thunderstorm with hail"],
  99: ["storm", 2, "thunderHail", "Thunderstorm with hail"]
}

function info(code) {
  var c = CODES[code] || ["cloudy", 0, "unknown", "Unknown"]
  return { kind: c[0], level: c[1], key: c[2], label: c[3], freezing: code === 56 || code === 57 || code === 66 || code === 67 || code === 48 }
}

// Nerd Font (Material Design) weather glyphs.
function glyph(code, isDay) {
  var k = info(code).kind
  var cp = 0xF0590                                         // weather-cloudy
  if (k === "clear") cp = code === 0 ? (isDay ? 0xF0599 : 0xF0594) : (isDay ? 0xF0595 : 0xF0F31)
  else if (code === 2) cp = isDay ? 0xF0595 : 0xF0F31      // partly cloudy
  else if (k === "fog") cp = 0xF0591
  else if (k === "drizzle") cp = 0xF0597
  else if (k === "rain") cp = info(code).freezing ? 0xF067F : info(code).level >= 2 ? 0xF0596 : 0xF0597
  else if (k === "snow") cp = info(code).level >= 2 ? 0xF0F36 : 0xF0598
  else if (k === "storm") cp = code === 95 ? 0xF0593 : 0xF067E
  return String.fromCodePoint(cp)
}

var WIND_GLYPH = 0xF059D

// ---------------------------------------------------------------- frog mood
//
// sleep (late night, nothing falling) · night (evening / dawn, clear or
// cloudy) · sun · hot · cloudy · cold · wind · fog · drizzle · rain · storm ·
// snow. `cold` (scarf) and `heavy` ride along as flags. `hour` = local hour.

var HOT = 28, COLD = 5, WINDY = 40, STORMY = 60

function mood(m, hour) {
  if (!m) return { mood: "waiting", cold: false, heavy: false }
  var ci = info(m.code)
  var cold = m.temp < COLD || ci.freezing
  var heavy = ci.level >= 2
  var windy = Math.max(m.wind, m.gusts * 0.7) >= WINDY
  var mo = "cloudy"
  if (ci.kind === "storm" || ((ci.kind === "rain" || ci.kind === "drizzle") && Math.max(m.wind, m.gusts * 0.7) >= STORMY)) mo = "storm"
  else if (ci.kind === "snow") mo = "snow"
  else if (ci.kind === "rain") mo = "rain"
  else if (ci.kind === "drizzle") mo = "drizzle"
  else if (ci.kind === "fog") mo = "fog"
  else if (windy) mo = "wind"
  else if (!m.isDay) mo = hour >= 22 || hour < 6 ? "sleep" : "night"
  else if (m.temp >= HOT && m.code <= 2) mo = "hot"
  else if (cold) mo = "cold"
  else if (ci.kind === "clear") mo = "sun"
  return { mood: mo, cold: cold, heavy: heavy }
}

// Local wall-clock pieces of a unix time at the forecast location.
function localDate(t, offset) { return new Date((t + offset) * 1000) }
function hourOf(t, offset) { return localDate(t, offset).getUTCHours() }
function hhmm(t, offset) {
  var d = localDate(t, offset)
  var h = d.getUTCHours(), mi = d.getUTCMinutes()
  return (h < 10 ? "0" : "") + h + ":" + (mi < 10 ? "0" : "") + mi
}
function weekday(t, offset) { return localDate(t, offset).getUTCDay() }

// First forecast hour with a precipitation chance of at least 50 %:
// { index, time } or null. Starts one hour ahead (the current hour is "now").
function nextRain(m) {
  if (!m) return null
  for (var i = 1; i < m.hourRain.length; i++)
    if (m.hourRain[i] >= 50) return { index: i, time: m.hourTime[i] }
  return null
}

// Hourly temperatures scaled into 0..1 for the lattice (min..max of the
// window, with a floor so a flat day still shows a row of cells).
function tempCurve(m) {
  if (!m || !m.hourTemp.length) return []
  var lo = 1e9, hi = -1e9
  for (var i = 0; i < m.hourTemp.length; i++) {
    var v = m.hourTemp[i]
    if (!isFinite(v)) continue
    lo = Math.min(lo, v); hi = Math.max(hi, v)
  }
  if (lo > hi) return []
  var span = Math.max(4, hi - lo)
  var out = []
  for (var j = 0; j < m.hourTemp.length; j++) {
    var t = m.hourTemp[j]
    out.push(isFinite(t) ? 0.2 + 0.8 * (t - lo) / span : -1)
  }
  return out
}
