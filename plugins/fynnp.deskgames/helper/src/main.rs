// deskgames-feed: event source for the fynnp.deskgames desk card.
//
// Emits one JSON line on stdout whenever something the card shows changes:
//   {"t":"lib", ...}      installed Steam games, last played, playtime, covers
//   {"t":"session"}       ~/.local/state/fynnp-desk/sessions/latest.json changed
//
// It sleeps in poll(2) on an inotify fd plus stdin: no timers, no polling, zero
// wakeups while nothing happens. Bursts (Steam rewrites several files at once)
// are coalesced: 400 ms after the last event, at most 2 s after the first.
// A newline on stdin forces a rescan; EOF on stdin (the shell went away) exits.
//
// std only; inotify/poll are declared directly against glibc.

use std::collections::HashMap;
use std::ffi::CString;
use std::fs;
use std::io::{self, Write};
use std::os::unix::ffi::OsStrExt;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, SystemTime};

// ---------- libc ----------
#[repr(C)]
struct PollFd {
    fd: i32,
    events: i16,
    revents: i16,
}
extern "C" {
    fn inotify_init1(flags: i32) -> i32;
    fn inotify_add_watch(fd: i32, path: *const i8, mask: u32) -> i32;
    fn poll(fds: *mut PollFd, nfds: u64, timeout: i32) -> i32;
    fn read(fd: i32, buf: *mut std::ffi::c_void, count: usize) -> isize;
    fn close(fd: i32) -> i32;
}
const IN_NONBLOCK: i32 = 0o4000;
const IN_CLOEXEC: i32 = 0o2000000;
const IN_CLOSE_WRITE: u32 = 0x0008;
const IN_MOVED_FROM: u32 = 0x0040;
const IN_MOVED_TO: u32 = 0x0080;
const IN_CREATE: u32 = 0x0100;
const IN_DELETE: u32 = 0x0200;
const IN_DELETE_SELF: u32 = 0x0400;
const IN_MOVE_SELF: u32 = 0x0800;
const IN_IGNORED: u32 = 0x8000;
const IN_ONLYDIR: u32 = 0x0100_0000;
const POLLIN: i16 = 0x1;
const POLLERR: i16 = 0x8;
const POLLHUP: i16 = 0x10;

// ---------- VDF (Valve KeyValues text) ----------
enum Node {
    Str(String),
    Obj(Vec<(String, Node)>),
}

impl Node {
    fn get(&self, key: &str) -> Option<&Node> {
        match self {
            Node::Obj(kids) => kids.iter().find(|(k, _)| k.eq_ignore_ascii_case(key)).map(|(_, v)| v),
            _ => None,
        }
    }
    fn path(&self, keys: &[&str]) -> Option<&Node> {
        let mut n = self;
        for k in keys {
            n = n.get(k)?;
        }
        Some(n)
    }
    fn str(&self, key: &str) -> Option<&str> {
        match self.get(key)? {
            Node::Str(s) => Some(s),
            _ => None,
        }
    }
    fn num(&self, key: &str) -> u64 {
        self.str(key).and_then(|s| s.trim().parse().ok()).unwrap_or(0)
    }
    fn kids(&self) -> &[(String, Node)] {
        match self {
            Node::Obj(k) => k,
            _ => &[],
        }
    }
}

struct Lexer<'a> {
    b: &'a [u8],
    i: usize,
}

enum Tok {
    S(String),
    Open,
    Close,
}

impl<'a> Lexer<'a> {
    fn next(&mut self) -> Option<Tok> {
        let b = self.b;
        loop {
            while self.i < b.len() && b[self.i].is_ascii_whitespace() {
                self.i += 1;
            }
            if self.i + 1 < b.len() && b[self.i] == b'/' && b[self.i + 1] == b'/' {
                while self.i < b.len() && b[self.i] != b'\n' {
                    self.i += 1;
                }
                continue;
            }
            break;
        }
        if self.i >= b.len() {
            return None;
        }
        let c = b[self.i];
        self.i += 1;
        match c {
            b'{' => Some(Tok::Open),
            b'}' => Some(Tok::Close),
            b'"' => {
                let mut out = Vec::new();
                while self.i < b.len() && b[self.i] != b'"' {
                    if b[self.i] == b'\\' && self.i + 1 < b.len() {
                        self.i += 1;
                        out.push(match b[self.i] {
                            b'n' => b'\n',
                            b't' => b'\t',
                            x => x,
                        });
                    } else {
                        out.push(b[self.i]);
                    }
                    self.i += 1;
                }
                self.i += 1;
                Some(Tok::S(String::from_utf8_lossy(&out).into_owned()))
            }
            _ => {
                // Unquoted token (rare); read to whitespace or brace.
                let start = self.i - 1;
                while self.i < b.len() && !b[self.i].is_ascii_whitespace() && b[self.i] != b'{' && b[self.i] != b'}' {
                    self.i += 1;
                }
                Some(Tok::S(String::from_utf8_lossy(&b[start..self.i]).into_owned()))
            }
        }
    }
}

fn parse_obj(lx: &mut Lexer, depth: usize) -> Vec<(String, Node)> {
    let mut kids = Vec::new();
    loop {
        let key = match lx.next() {
            Some(Tok::S(s)) => s,
            _ => return kids, // '}' or EOF (or stray '{')
        };
        match lx.next() {
            Some(Tok::S(v)) => kids.push((key, Node::Str(v))),
            Some(Tok::Open) => {
                let sub = if depth < 64 { parse_obj(lx, depth + 1) } else { Vec::new() };
                kids.push((key, Node::Obj(sub)));
            }
            _ => return kids,
        }
    }
}

fn parse_vdf_file(p: &Path) -> Option<Node> {
    let data = fs::read(p).ok()?;
    if data.len() > 64 * 1024 * 1024 {
        return None;
    }
    let mut lx = Lexer { b: &data, i: 0 };
    Some(Node::Obj(parse_obj(&mut lx, 0)))
}

// ---------- JSON out ----------
fn jstr(out: &mut String, s: &str, max_chars: usize) {
    out.push('"');
    for c in s.chars().take(max_chars) {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            c if (c as u32) < 0x20 || c == '\u{7f}' || c == '\u{2028}' || c == '\u{2029}' => {
                out.push_str(&format!("\\u{:04x}", c as u32))
            }
            c => out.push(c),
        }
    }
    out.push('"');
}

// ---------- Steam scan ----------
struct Paths {
    home: PathBuf,
    steam: Option<PathBuf>,
    sessions: PathBuf,
}

fn find_steam(home: &Path) -> Option<PathBuf> {
    for c in [home.join(".steam/root"), home.join(".local/share/Steam"), home.join(".steam/steam")] {
        if let Ok(p) = fs::canonicalize(&c) {
            if p.join("steamapps").is_dir() {
                return Some(p);
            }
        }
    }
    None
}

fn libraries(steam: &Path) -> Vec<PathBuf> {
    let mut out = vec![steam.to_path_buf()];
    if let Some(v) = parse_vdf_file(&steam.join("steamapps/libraryfolders.vdf")) {
        let top = v.get("libraryfolders").unwrap_or(&v);
        for (_, lib) in top.kids() {
            if let Some(p) = lib.str("path") {
                let pb = fs::canonicalize(p).unwrap_or_else(|_| PathBuf::from(p));
                if !out.contains(&pb) && pb.join("steamapps").is_dir() {
                    out.push(pb);
                }
            }
        }
    }
    out
}

fn localconfigs(steam: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Ok(rd) = fs::read_dir(steam.join("userdata")) {
        for e in rd.flatten() {
            let p = e.path().join("config/localconfig.vdf");
            if p.is_file() {
                out.push(p);
            }
        }
    }
    out
}

fn mtime(p: &Path) -> SystemTime {
    fs::metadata(p).and_then(|m| m.modified()).unwrap_or(SystemTime::UNIX_EPOCH)
}

fn is_tool(appid: u64, name: &str) -> bool {
    const IDS: [u64; 5] = [228980, 1070560, 1391110, 1628350, 4183110];
    const PREFIX: [&str; 5] = ["Proton", "Steam Linux Runtime", "Steamworks Common", "SteamVR", "Steam Audio"];
    IDS.contains(&appid) || PREFIX.iter().any(|p| name.starts_with(p))
}

fn cover(steam: &Path, appid: u64) -> (String, bool) {
    const PREF: [&str; 4] = ["library_header.jpg", "header.jpg", "library_capsule.jpg", "library_600x900.jpg"];
    let mut best: Option<(usize, PathBuf)> = None;
    let mut consider = |p: PathBuf| {
        if let Some(n) = p.file_name().and_then(|n| n.to_str()) {
            if let Some(rank) = PREF.iter().position(|x| *x == n) {
                if best.as_ref().map_or(true, |(r, _)| rank < *r) {
                    best = Some((rank, p));
                }
            }
        }
    };
    let dir = steam.join("appcache/librarycache").join(appid.to_string());
    if let Ok(rd) = fs::read_dir(&dir) {
        for e in rd.flatten() {
            let p = e.path();
            if p.is_dir() {
                if let Ok(rd2) = fs::read_dir(&p) {
                    for e2 in rd2.flatten() {
                        consider(e2.path());
                    }
                }
            } else {
                consider(p);
            }
        }
    }
    // Older Steam layout: flat <appid>_header.jpg files.
    if best.is_none() {
        for (rank, suffix) in [(1usize, "_header.jpg"), (3, "_library_600x900.jpg")] {
            let p = steam.join("appcache/librarycache").join(format!("{appid}{suffix}"));
            if p.is_file() {
                best = Some((rank, p));
                break;
            }
        }
    }
    match best {
        Some((rank, p)) => (p.to_string_lossy().into_owned(), rank < 2),
        None => (String::new(), false),
    }
}

struct Game {
    appid: u64,
    name: String,
    dir: String,
    last: u64,
    min: u64,
}

fn scan(paths: &Paths) -> String {
    let mut out = String::from("{\"t\":\"lib\"");
    let steam = match &paths.steam {
        Some(s) => s,
        None => {
            out.push_str(",\"steam\":false,\"total_min\":0,\"installed\":0,\"games\":[]}");
            return out;
        }
    };

    // Playtime / last played per app from the most recently used account.
    let mut stats: HashMap<u64, (u64, u64)> = HashMap::new();
    let mut total_min = 0u64;
    let mut cfgs = localconfigs(steam);
    cfgs.sort_by_key(|p| std::cmp::Reverse(mtime(p)));
    if let Some(v) = cfgs.first().and_then(|p| parse_vdf_file(p)) {
        let apps = v
            .path(&["UserLocalConfigStore", "Software", "Valve", "Steam", "apps"])
            .or_else(|| v.path(&["UserLocalConfigStore", "Software", "Valve", "Steam", "Apps"]));
        if let Some(apps) = apps {
            for (id, a) in apps.kids() {
                let Ok(id) = id.parse::<u64>() else { continue };
                let pt = a.num("Playtime");
                total_min += pt;
                stats.insert(id, (a.num("LastPlayed"), pt));
            }
        }
    }

    let mut games: Vec<Game> = Vec::new();
    for lib in libraries(steam) {
        let Ok(rd) = fs::read_dir(lib.join("steamapps")) else { continue };
        for e in rd.flatten() {
            let fname = e.file_name();
            let n = fname.to_string_lossy();
            if !(n.starts_with("appmanifest_") && n.ends_with(".acf")) {
                continue;
            }
            let Some(v) = parse_vdf_file(&e.path()) else { continue };
            let Some(st) = v.get("AppState") else { continue };
            let appid = st.num("appid");
            let name = st.str("name").unwrap_or("").trim().to_string();
            if appid == 0 || name.is_empty() || is_tool(appid, &name) {
                continue;
            }
            if st.num("StateFlags") & 4 == 0 {
                continue; // not fully installed
            }
            if games.iter().any(|g| g.appid == appid) {
                continue;
            }
            let (lp, pt) = stats.get(&appid).copied().unwrap_or((0, 0));
            games.push(Game {
                appid,
                last: lp.max(st.num("LastPlayed")),
                min: pt,
                dir: st.str("installdir").unwrap_or("").to_string(),
                name,
            });
        }
    }
    games.sort_by(|a, b| b.last.cmp(&a.last).then(b.min.cmp(&a.min)).then(a.name.cmp(&b.name)));
    let installed = games.len();
    games.truncate(12);

    out.push_str(&format!(",\"steam\":true,\"total_min\":{total_min},\"installed\":{installed},\"games\":["));
    for (i, g) in games.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        let (cv, wide) = cover(steam, g.appid);
        out.push_str(&format!("{{\"appid\":{},\"last\":{},\"min\":{},\"name\":", g.appid, g.last, g.min));
        jstr(&mut out, &g.name, 80);
        out.push_str(",\"dir\":");
        jstr(&mut out, &g.dir, 80);
        out.push_str(",\"cover\":");
        jstr(&mut out, &cv, 512);
        out.push_str(&format!(",\"wide\":{wide}}}"));
    }
    out.push_str("]}");
    out
}

// ---------- watches ----------
#[derive(Clone, Copy, PartialEq)]
enum Kind {
    SteamApps, // appmanifest_*.acf, libraryfolders.vdf
    Config,    // localconfig.vdf
    UserData,  // a new account appears
    Sessions,  // latest.json
    Ancestor,  // waiting for the sessions dir to exist
}

struct Watches {
    fd: i32,
    map: HashMap<i32, Kind>,
}

impl Watches {
    fn build(paths: &Paths) -> Watches {
        let fd = unsafe { inotify_init1(IN_NONBLOCK | IN_CLOEXEC) };
        let mut w = Watches { fd, map: HashMap::new() };
        if fd < 0 {
            return w;
        }
        let file_mask = IN_CLOSE_WRITE | IN_MOVED_TO | IN_MOVED_FROM | IN_CREATE | IN_DELETE | IN_ONLYDIR;
        if let Some(steam) = &paths.steam {
            for lib in libraries(steam) {
                w.add(&lib.join("steamapps"), file_mask, Kind::SteamApps);
            }
            w.add(&steam.join("userdata"), IN_CREATE | IN_MOVED_TO | IN_ONLYDIR, Kind::UserData);
            for c in localconfigs(steam) {
                if let Some(d) = c.parent() {
                    w.add(d, file_mask, Kind::Config);
                }
            }
        }
        if paths.sessions.is_dir() {
            w.add(&paths.sessions, file_mask | IN_DELETE_SELF | IN_MOVE_SELF, Kind::Sessions);
        } else {
            // Watch the nearest existing ancestor until the dir shows up.
            let mut p = paths.sessions.parent();
            while let Some(d) = p {
                if d.is_dir() {
                    w.add(d, IN_CREATE | IN_MOVED_TO | IN_ONLYDIR, Kind::Ancestor);
                    break;
                }
                if d == paths.home {
                    break;
                }
                p = d.parent();
            }
        }
        w
    }

    fn add(&mut self, dir: &Path, mask: u32, kind: Kind) {
        let Ok(c) = CString::new(dir.as_os_str().as_bytes()) else { return };
        let wd = unsafe { inotify_add_watch(self.fd, c.as_ptr(), mask) };
        if wd >= 0 {
            self.map.insert(wd, kind);
        }
    }
}

impl Drop for Watches {
    fn drop(&mut self) {
        if self.fd >= 0 {
            unsafe { close(self.fd) };
        }
    }
}

#[derive(Default)]
struct Dirty {
    lib: bool,
    session: bool,
    rewatch: bool,
}

fn drain(w: &Watches, d: &mut Dirty) {
    let mut buf = [0u8; 8192];
    loop {
        let n = unsafe { read(w.fd, buf.as_mut_ptr().cast(), buf.len()) };
        if n <= 0 {
            return;
        }
        let n = n as usize;
        let mut i = 0;
        while i + 16 <= n {
            let wd = i32::from_ne_bytes(buf[i..i + 4].try_into().unwrap());
            let mask = u32::from_ne_bytes(buf[i + 4..i + 8].try_into().unwrap());
            let len = u32::from_ne_bytes(buf[i + 12..i + 16].try_into().unwrap()) as usize;
            let raw = &buf[i + 16..(i + 16 + len).min(n)];
            let name = std::str::from_utf8(raw.split(|b| *b == 0).next().unwrap_or(&[])).unwrap_or("");
            i += 16 + len;
            if mask & (IN_IGNORED | IN_DELETE_SELF | IN_MOVE_SELF) != 0 {
                d.rewatch = true;
                d.session = true;
                continue;
            }
            match w.map.get(&wd) {
                Some(Kind::SteamApps) => {
                    if name == "libraryfolders.vdf" {
                        d.lib = true;
                        d.rewatch = true;
                    } else if name.starts_with("appmanifest_") && name.ends_with(".acf") {
                        d.lib = true;
                    }
                }
                Some(Kind::Config) => {
                    if name == "localconfig.vdf" {
                        d.lib = true;
                    }
                }
                Some(Kind::UserData) => {
                    d.lib = true;
                    d.rewatch = true;
                }
                Some(Kind::Sessions) => {
                    if name == "latest.json" {
                        d.session = true;
                    }
                }
                Some(Kind::Ancestor) => {
                    d.rewatch = true;
                    d.session = true;
                }
                None => {}
            }
        }
    }
}

fn emit(line: &str) -> bool {
    let mut so = io::stdout().lock();
    so.write_all(line.as_bytes()).and_then(|_| so.write_all(b"\n")).and_then(|_| so.flush()).is_ok()
}

fn main() {
    let home = PathBuf::from(std::env::var_os("HOME").unwrap_or_default());
    let state = std::env::var_os("XDG_STATE_HOME")
        .map(PathBuf::from)
        .filter(|p| p.is_absolute())
        .unwrap_or_else(|| home.join(".local/state"));
    let mut paths = Paths { steam: find_steam(&home), sessions: state.join("fynnp-desk/sessions"), home };

    if std::env::args().any(|a| a == "--once") {
        emit(&scan(&paths));
        return;
    }

    let mut watches = Watches::build(&paths);
    let mut last_lib = scan(&paths);
    if !emit(&last_lib) || !emit("{\"t\":\"session\"}") {
        return;
    }

    let mut dirty = Dirty::default();
    let mut first: Option<Instant> = None;
    let mut latest = Instant::now();
    let quiet = Duration::from_millis(400);
    let cap = Duration::from_secs(2);

    loop {
        let timeout = match first {
            None => -1,
            Some(f) => {
                let due = (latest + quiet).min(f + cap);
                due.saturating_duration_since(Instant::now()).as_millis() as i32
            }
        };
        let mut fds = [
            PollFd { fd: 0, events: POLLIN, revents: 0 },
            PollFd { fd: watches.fd, events: POLLIN, revents: 0 },
        ];
        let r = unsafe { poll(fds.as_mut_ptr(), if watches.fd >= 0 { 2 } else { 1 }, timeout) };
        if r < 0 {
            if io::Error::last_os_error().kind() == io::ErrorKind::Interrupted {
                continue;
            }
            return;
        }

        if fds[0].revents & POLLIN != 0 {
            let mut b = [0u8; 256];
            let n = unsafe { read(0, b.as_mut_ptr().cast(), b.len()) };
            if n <= 0 {
                return; // stdin closed: the shell is gone
            }
            if b[..n as usize].contains(&b'\n') {
                dirty.lib = true;
                dirty.session = true;
                dirty.rewatch = true;
                first.get_or_insert(Instant::now());
                latest = Instant::now() - quiet; // flush right away
            }
        } else if fds[0].revents & (POLLHUP | POLLERR) != 0 {
            return;
        }

        if watches.fd >= 0 && fds[1].revents & POLLIN != 0 {
            drain(&watches, &mut dirty);
            if dirty.lib || dirty.session || dirty.rewatch {
                first.get_or_insert(Instant::now());
                latest = Instant::now();
            }
        }

        if let Some(f) = first {
            let now = Instant::now();
            if now >= latest + quiet || now >= f + cap {
                first = None;
                let d = std::mem::take(&mut dirty);
                if d.rewatch {
                    if paths.steam.is_none() {
                        paths.steam = find_steam(&paths.home);
                    }
                    watches = Watches::build(&paths);
                }
                if d.lib || d.rewatch {
                    let s = scan(&paths);
                    if s != last_lib {
                        if !emit(&s) {
                            return;
                        }
                        last_lib = s;
                    }
                }
                if d.session && !emit("{\"t\":\"session\"}") {
                    return;
                }
            }
        }
    }
}
