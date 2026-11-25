//! desknet-feed: headless network feed for the `fynnp.desknet` Omarchy shell widget.
//!
//! Protocol (same as desksys-feed): the widget writes one line to stdin whenever it
//! wants a sample; we answer with one JSON line on stdout. Between requests the
//! process is blocked in read(2), so it costs zero CPU while the widget is hidden.
//! EOF (widget gone) exits.
//!
//! Answer: {"if":"eno1","ip":"192.168.178.125","wifi":false,"rx":1234,"tx":56,"trx":…,"ttx":…}
//!   if    interface of the default route ("" = offline)
//!   ip    its IPv4 address ("" if none / IPv6-only)
//!   rx/tx bytes per second since the previous request
//!   trx/ttx bytes moved through the default interface since the feed started
//!           (the card starts the feed, so: since the card started)
//!
//! Sources: /proc/net/route (+ ipv6_route), /proc/net/dev, /proc/net/fib_trie.

mod net;

use std::fmt::Write as _;
use std::io::{BufRead, Write};
use std::time::Instant;

/// Re-read fib_trie (the address) at most this often unless the interface changes.
const ADDR_REFRESH: u32 = 30;

struct Last {
    iface: String,
    rx: u64,
    tx: u64,
    at: Instant,
}

#[derive(Default)]
struct Feed {
    last: Option<Last>,
    total_rx: u64,
    total_tx: u64,
    addr_iface: String,
    addr: String,
    addr_age: u32,
}

struct Sample {
    iface: String,
    ip: String,
    wifi: bool,
    rx: u64,
    tx: u64,
}

impl Feed {
    fn sample(&mut self) -> Sample {
        let routes = net::parse_routes(&net::read("/proc/net/route"));
        let Some(iface) = net::default_iface(&routes) else {
            self.last = None;
            self.addr_iface.clear();
            return Sample { iface: String::new(), ip: String::new(), wifi: false, rx: 0, tx: 0 };
        };

        let now = Instant::now();
        let (mut rx_rate, mut tx_rate) = (0, 0);
        if let Some((rx, tx)) = net::parse_dev(&net::read("/proc/net/dev"), &iface) {
            if let Some(l) = self.last.as_ref().filter(|l| l.iface == iface && rx >= l.rx && tx >= l.tx) {
                let (drx, dtx) = (rx - l.rx, tx - l.tx);
                self.total_rx += drx;
                self.total_tx += dtx;
                let secs = now.duration_since(l.at).as_secs_f64();
                if secs > 0.05 {
                    rx_rate = (drx as f64 / secs).round() as u64;
                    tx_rate = (dtx as f64 / secs).round() as u64;
                }
            }
            self.last = Some(Last { iface: iface.clone(), rx, tx, at: now });
        } else {
            self.last = None;
        }

        if self.addr_iface != iface || self.addr_age >= ADDR_REFRESH {
            let locals = net::parse_local_addrs(&net::read("/proc/net/fib_trie"));
            self.addr = net::iface_addr(&routes, &locals, &iface).map(|a| a.to_string()).unwrap_or_default();
            self.addr_iface = iface.clone();
            self.addr_age = 0;
        }
        self.addr_age += 1;

        Sample { wifi: net::is_wireless(&iface), ip: self.addr.clone(), iface, rx: rx_rate, tx: tx_rate }
    }
}

fn json_str(out: &mut String, key: &str, v: &str) {
    let _ = write!(out, "\"{key}\":\"");
    for c in v.chars().filter(|c| !c.is_control()) {
        if c == '"' || c == '\\' {
            out.push('\\');
        }
        out.push(c);
    }
    out.push('"');
}

fn main() {
    let mut feed = Feed::default();
    // Prime the counters so the first answer already carries a real rate.
    let _ = feed.sample();
    feed.total_rx = 0;
    feed.total_tx = 0;

    let stdin = std::io::stdin();
    let mut stdout = std::io::stdout().lock();
    let mut line = String::new();
    let mut out = String::with_capacity(160);
    loop {
        line.clear();
        match stdin.lock().read_line(&mut line) {
            Ok(0) | Err(_) => break,
            Ok(_) => {}
        }
        let s = feed.sample();
        out.clear();
        out.push('{');
        json_str(&mut out, "if", &s.iface);
        out.push(',');
        json_str(&mut out, "ip", &s.ip);
        let _ = write!(
            out,
            ",\"wifi\":{},\"rx\":{},\"tx\":{},\"trx\":{},\"ttx\":{}}}\n",
            s.wifi, s.rx, s.tx, feed.total_rx, feed.total_tx
        );
        if stdout.write_all(out.as_bytes()).and_then(|_| stdout.flush()).is_err() {
            break;
        }
    }
}
