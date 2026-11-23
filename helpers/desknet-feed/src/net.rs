//! Parsers for the procfs network files. Each takes the file's text so it can be
//! tested against captured samples; the `read_*` wrappers do the I/O.

use std::fs;
use std::net::Ipv4Addr;

const RTF_UP: u32 = 0x1;
const RTF_REJECT: u32 = 0x200;

/// One IPv4 route from /proc/net/route. Addresses are in network order as u32
/// (`u32::from(Ipv4Addr)`), so `ip & mask == dest` works directly.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Route {
    pub iface: String,
    pub dest: u32,
    pub mask: u32,
    pub flags: u32,
    pub metric: u32,
}

/// /proc/net/route stores addresses as the raw in-memory u32 printed in hex,
/// i.e. little-endian on x86: "01B2A8C0" is 192.168.178.1.
fn route_addr(hex: &str) -> Option<u32> {
    let raw = u32::from_str_radix(hex, 16).ok()?;
    Some(u32::from(Ipv4Addr::from(raw.to_ne_bytes())))
}

pub fn parse_routes(text: &str) -> Vec<Route> {
    let mut out = Vec::new();
    for line in text.lines().skip(1) {
        let f: Vec<&str> = line.split_whitespace().collect();
        if f.len() < 8 {
            continue;
        }
        let (Some(dest), Some(mask), Ok(flags), Ok(metric)) = (
            route_addr(f[1]),
            route_addr(f[7]),
            u32::from_str_radix(f[3], 16),
            f[6].parse::<u32>(),
        ) else {
            continue;
        };
        out.push(Route { iface: f[0].to_string(), dest, mask, flags, metric });
    }
    out
}

/// Interface of the IPv4 default route with the lowest metric.
pub fn default_iface_v4(routes: &[Route]) -> Option<&str> {
    routes
        .iter()
        .filter(|r| r.dest == 0 && r.mask == 0 && r.flags & RTF_UP != 0 && r.flags & RTF_REJECT == 0)
        .min_by_key(|r| r.metric)
        .map(|r| r.iface.as_str())
}

/// Interface of an IPv6 default route (::/0) from /proc/net/ipv6_route, for
/// IPv6-only networks. Columns: dest plen src splen nexthop metric refcnt use flags iface.
pub fn default_iface_v6(text: &str) -> Option<String> {
    let mut best: Option<(u32, &str)> = None;
    for line in text.lines() {
        let f: Vec<&str> = line.split_whitespace().collect();
        if f.len() < 10 || f[1] != "00" || f[0].bytes().any(|b| b != b'0') || f[9] == "lo" {
            continue;
        }
        let (Ok(metric), Ok(flags)) = (u32::from_str_radix(f[5], 16), u32::from_str_radix(f[8], 16)) else {
            continue;
        };
        if flags & RTF_UP == 0 || flags & RTF_REJECT != 0 {
            continue;
        }
        if best.map_or(true, |(m, _)| metric < m) {
            best = Some((metric, f[9]));
        }
    }
    best.map(|(_, i)| i.to_string())
}

/// Cumulative (rx, tx) bytes of `iface` from /proc/net/dev.
pub fn parse_dev(text: &str, iface: &str) -> Option<(u64, u64)> {
    for line in text.lines().skip(2) {
        let Some((name, rest)) = line.split_once(':') else { continue };
        if name.trim() != iface {
            continue;
        }
        let f: Vec<&str> = rest.split_whitespace().collect();
        if f.len() < 9 {
            return None;
        }
        return Some((f[0].parse().ok()?, f[8].parse().ok()?));
    }
    None
}

/// Local IPv4 addresses ("/32 host LOCAL" leaves) from /proc/net/fib_trie,
/// loopback excluded. Leaves look like:
///     |-- 192.168.178.125
///        /32 host LOCAL
pub fn parse_local_addrs(text: &str) -> Vec<Ipv4Addr> {
    let mut out: Vec<Ipv4Addr> = Vec::new();
    let mut leaf: Option<Ipv4Addr> = None;
    for line in text.lines() {
        let t = line.trim_start();
        if let Some(addr) = t.strip_prefix("|-- ") {
            leaf = addr.trim().parse().ok();
        } else if t.starts_with('/') {
            if t.split_whitespace().skip(1).eq(["host", "LOCAL"]) {
                if let Some(ip) = leaf {
                    if !ip.is_loopback() && !out.contains(&ip) {
                        out.push(ip);
                    }
                }
            }
        } else {
            leaf = None;
        }
    }
    out
}

/// The local address that sits inside one of `iface`'s on-link subnets.
pub fn iface_addr(routes: &[Route], locals: &[Ipv4Addr], iface: &str) -> Option<Ipv4Addr> {
    locals.iter().copied().find(|ip| {
        let v = u32::from(*ip);
        routes.iter().any(|r| r.iface == iface && r.mask != 0 && v & r.mask == r.dest)
    })
}

pub fn read(path: &str) -> String {
    fs::read_to_string(path).unwrap_or_default()
}

/// The interface traffic leaves through: IPv4 default route, else IPv6.
/// None while there is no route out, or the link is down.
pub fn default_iface(routes: &[Route]) -> Option<String> {
    let iface = match default_iface_v4(routes) {
        Some(i) => i.to_string(),
        None => default_iface_v6(&read("/proc/net/ipv6_route"))?,
    };
    let state = read(&format!("/sys/class/net/{iface}/operstate"));
    if state.trim() == "down" {
        return None;
    }
    Some(iface)
}

pub fn is_wireless(iface: &str) -> bool {
    fs::metadata(format!("/sys/class/net/{iface}/wireless")).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    const ROUTE: &str = "Iface\tDestination\tGateway \tFlags\tRefCnt\tUse\tMetric\tMask\t\tMTU\tWindow\tIRTT
eno1\t00000000\t01B2A8C0\t0003\t0\t0\t1002\t00000000\t0\t0\t0
docker0\t000011AC\t00000000\t0001\t0\t0\t0\t0000FFFF\t0\t0\t0
wlo2\t00000000\t01B2A8C0\t0003\t0\t0\t3003\t00000000\t0\t0\t0
eno1\t00B2A8C0\t00000000\t0001\t0\t0\t1002\t00FFFFFF\t0\t0\t0
";

    const TRIE: &str = "Main:
  +-- 0.0.0.0/0 3 0 4
     |-- 0.0.0.0
        /0 universe UNICAST
     +-- 127.0.0.0/8 2 0 2
        +-- 127.0.0.0/31 1 0 0
           |-- 127.0.0.1
              /32 host LOCAL
     +-- 172.16.0.0/13 4 0 6
           |-- 172.17.0.1
              /32 host LOCAL
        |-- 172.17.255.255
           /32 link BROADCAST
     +-- 192.168.178.0/24 2 0 1
        |-- 192.168.178.0
           /24 link UNICAST
        |-- 192.168.178.125
           /32 host LOCAL
";

    #[test]
    fn routes() {
        let r = parse_routes(ROUTE);
        assert_eq!(r.len(), 4);
        assert_eq!(default_iface_v4(&r), Some("eno1"));
        assert_eq!(r[3].dest, u32::from(Ipv4Addr::new(192, 168, 178, 0)));
        assert_eq!(r[3].mask, u32::from(Ipv4Addr::new(255, 255, 255, 0)));
    }

    #[test]
    fn addrs() {
        let locals = parse_local_addrs(TRIE);
        assert_eq!(locals, vec![Ipv4Addr::new(172, 17, 0, 1), Ipv4Addr::new(192, 168, 178, 125)]);
        let r = parse_routes(ROUTE);
        assert_eq!(iface_addr(&r, &locals, "eno1"), Some(Ipv4Addr::new(192, 168, 178, 125)));
        assert_eq!(iface_addr(&r, &locals, "wlo2"), None);
    }

    #[test]
    fn dev() {
        let t = "Inter-|   Receive                                                |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed
    lo: 363636450 1249266    0    0    0     0          0         0 363636450 1249266    0    0    0     0       0          0
  eno1: 13800068330 21979944    0 1509    0     0          0   2375672 9486542775 14250962    0    8    0     0       0          0
";
        assert_eq!(parse_dev(t, "eno1"), Some((13800068330, 9486542775)));
        assert_eq!(parse_dev(t, "wlo2"), None);
    }

    #[test]
    fn v6_default() {
        let t = "00000000000000000000000000000000 00 00000000000000000000000000000000 00 fe800000000000000000000000000001 00000400 00000001 00000000 00000003 wlo2
00000000000000000000000000000000 00 00000000000000000000000000000000 00 00000000000000000000000000000000 ffffffff 00000001 00000000 00200200       lo
";
        assert_eq!(default_iface_v6(t).as_deref(), Some("wlo2"));
    }
}
