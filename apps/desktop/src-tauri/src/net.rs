//! Local address and port put in the QR code.
//! The full network checks of E11 (private network, firewall, real adapter)
//! are not written yet.

use std::net::{IpAddr, Ipv4Addr, TcpListener};

/// Fixed port first (spec `Core - Reconnexion`, E8).
pub const DEFAULT_PORT: u16 = 47800;

/// IPv4 address of the adapter that carries the default route.
pub fn local_ip() -> Option<IpAddr> {
    match local_ip_address::local_ip() {
        Ok(ip @ IpAddr::V4(v4)) if is_lan(v4) => Some(ip),
        _ => None,
    }
}

fn is_lan(ip: Ipv4Addr) -> bool {
    ip.is_private() && !ip.is_loopback()
}

/// The saved port if still free, else the default one, else a random one.
pub fn pick_port(saved: Option<u16>) -> u16 {
    for p in saved.into_iter().chain([DEFAULT_PORT]) {
        if TcpListener::bind((Ipv4Addr::UNSPECIFIED, p)).is_ok() {
            return p;
        }
    }
    TcpListener::bind((Ipv4Addr::UNSPECIFIED, 0))
        .and_then(|l| l.local_addr())
        .map(|a| a.port())
        .unwrap_or(DEFAULT_PORT)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn busy_port_falls_back() {
        let busy = TcpListener::bind((Ipv4Addr::UNSPECIFIED, 0)).unwrap();
        let port = busy.local_addr().unwrap().port();
        assert_ne!(pick_port(Some(port)), port);
    }

    #[test]
    fn only_private_addresses() {
        assert!(is_lan(Ipv4Addr::new(192, 168, 1, 20)));
        assert!(!is_lan(Ipv4Addr::new(8, 8, 8, 8)));
        assert!(!is_lan(Ipv4Addr::LOCALHOST));
    }
}
