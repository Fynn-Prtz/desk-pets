//! desksys-feed: headless sensor feed for the `fynnp.desksys` Omarchy shell widget.
//!
//! Protocol: the widget writes one line to stdin whenever it wants a sample; we answer
//! with one JSON line on stdout. Between requests the process is blocked in read(2),
//! so it costs zero CPU while the widget is hidden. EOF (widget gone) exits.
//! The first answer also carries the CPU/GPU names.

mod sensors;

use std::fmt::Write as _;
use std::io::{BufRead, Write};

fn num(out: &mut String, key: &str, v: Option<f32>) {
    match v {
        Some(v) if v.is_finite() => { let _ = write!(out, ",\"{key}\":{v:.1}"); }
        _ => { let _ = write!(out, ",\"{key}\":null"); }
    }
}

fn json_str(out: &mut String, key: &str, v: &str) {
    let _ = write!(out, ",\"{key}\":\"");
    for c in v.chars().filter(|c| !c.is_control()) {
        if c == '"' || c == '\\' { out.push('\\'); }
        out.push(c);
    }
    out.push('"');
}

fn main() {
    let mut s = match sensors::Sensors::new() {
        Ok(s) => s,
        Err(e) => { eprintln!("desksys-feed: {e}"); std::process::exit(1) }
    };
    let stdin = std::io::stdin();
    let mut stdout = std::io::stdout().lock();
    let mut line = String::new();
    let mut out = String::with_capacity(256);
    let mut first = true;
    loop {
        line.clear();
        match stdin.lock().read_line(&mut line) {
            Ok(0) | Err(_) => break,
            Ok(_) => {}
        }
        let st = s.sample();
        out.clear();
        let _ = write!(out, "{{\"cpu\":{:.1}", st.cpu);
        num(&mut out, "ct", st.cpu_temp);
        num(&mut out, "cw", st.cpu_watts);
        num(&mut out, "mu", Some(st.mem.0));
        num(&mut out, "mt", Some(st.mem.1));
        let g = st.gpu;
        num(&mut out, "gpu", g.map(|g| g.util));
        num(&mut out, "gt", g.and_then(|g| g.temp));
        num(&mut out, "gw", g.and_then(|g| g.watts));
        num(&mut out, "vu", g.and_then(|g| g.vram).map(|v| v.0));
        num(&mut out, "vt", g.and_then(|g| g.vram).map(|v| v.1));
        if first {
            first = false;
            json_str(&mut out, "cn", &s.cpu_name);
            json_str(&mut out, "gn", &s.gpu_name);
            let _ = write!(out, ",\"raplDenied\":{}", s.rapl_denied);
        }
        out.push_str("}\n");
        if stdout.write_all(out.as_bytes()).and_then(|_| stdout.flush()).is_err() {
            break;
        }
    }
}
