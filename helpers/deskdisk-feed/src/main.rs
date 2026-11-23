//! deskdisk-feed: headless disk feed for the `fynnp.deskdisk` Omarchy shell widget.
//!
//! Protocol (same as desksys-feed): the widget writes one line to stdin whenever it wants a
//! sample; we answer with one JSON line on stdout. Between requests the process is blocked in
//! read(2), so it costs zero CPU while the widget is hidden. EOF (widget gone) exits.
//!
//! Every answer carries the I/O rates of the whole disks since the previous request:
//!   {"rd":<bytes/s>,"wr":<bytes/s>,"util":<0..100, busiest disk>}
//! The first answer and then one about every 30 s also carry the filesystems:
//!   ...,"fs":[{"mnt":"/","src":"/dev/nvme0n1p2","type":"btrfs","total":<bytes>,"used":<bytes>,"avail":<bytes>}]

mod disks;

use std::fmt::Write as _;
use std::io::{BufRead, Write};
use std::time::{Duration, Instant};

const USAGE_EVERY: Duration = Duration::from_secs(30);

fn json_str(out: &mut String, v: &str) {
    out.push('"');
    for c in v.chars().filter(|c| !c.is_control()) {
        if c == '"' || c == '\\' {
            out.push('\\');
        }
        out.push(c);
    }
    out.push('"');
}

fn main() {
    let stdin = std::io::stdin();
    let mut stdout = std::io::stdout().lock();
    let mut line = String::new();
    let mut out = String::with_capacity(512);
    let mut io = disks::IoMeter::new();
    let mut last_usage: Option<Instant> = None;
    loop {
        line.clear();
        match stdin.lock().read_line(&mut line) {
            Ok(0) | Err(_) => break,
            Ok(_) => {}
        }
        let rate = io.sample();
        out.clear();
        let _ = write!(
            out,
            "{{\"rd\":{:.0},\"wr\":{:.0},\"util\":{:.1}",
            rate.read, rate.write, rate.util
        );
        if last_usage.map_or(true, |t| t.elapsed() >= USAGE_EVERY) {
            last_usage = Some(Instant::now());
            out.push_str(",\"fs\":[");
            for (i, fs) in disks::filesystems().iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                out.push_str("{\"mnt\":");
                json_str(&mut out, &fs.mount);
                out.push_str(",\"src\":");
                json_str(&mut out, &fs.source);
                out.push_str(",\"type\":");
                json_str(&mut out, &fs.fstype);
                let _ = write!(
                    out,
                    ",\"total\":{},\"used\":{},\"avail\":{}}}",
                    fs.total, fs.used, fs.avail
                );
            }
            out.push(']');
        }
        out.push_str("}\n");
        if stdout.write_all(out.as_bytes()).and_then(|_| stdout.flush()).is_err() {
            break;
        }
    }
}
