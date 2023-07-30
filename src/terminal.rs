use std::sync::{Arc, RwLock};
use std::net::SocketAddr;
use std::sync::atomic::{AtomicUsize, Ordering};
use super::proxy;

#[derive(Clone)]
pub struct Terminal {
    tunnels: Arc<RwLock<Ternnels>>,
}

impl Terminal {
    pub fn new() -> Self {
        Self { tunnels: Arc::new(RwLock::new(Ternnels::new())) }
    }
    pub fn add_tunnel(&self, tunnel: SocketAddr) {
        self.tunnels.write().unwrap().add_tunnel(tunnel);
    }
    pub fn round_robin_tunnel(&self) -> SocketAddr {
        self.tunnels.read().unwrap().round_robin_tunnel()
    }
    pub async fn start<A>(self, addr: A) where SocketAddr: From<A> {
        let ternnels = self.tunnels.clone();
        proxy::start(addr, move |req| async {
            ternnels;
            Ok::<_, String>(None)
        });
    }
}

struct Ternnels {
    tunnels: Vec<SocketAddr>,
    idx: AtomicUsize,
}

impl Ternnels {
    pub fn new() -> Self {
        Self {
            tunnels: Vec::new(),
            idx: 0.into(),
        }
    }
    pub fn add_tunnel(&mut self, tunnel: SocketAddr) {
        if !self.tunnels.iter().any(|t| t == &tunnel) {
            self.tunnels.push(tunnel);
        }
    }
    pub fn round_robin_tunnel(&self) -> SocketAddr {
        let len = self.tunnels.len();
        let idx = self.idx.fetch_update(Ordering::SeqCst, Ordering::SeqCst, move |x| { Some(if x >= len-1 { 0 } else { x + 1 }) }).unwrap();
        return self.tunnels[idx];
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn terminal() {
        let t = Terminal::new();
        let u = SocketAddr::from(([0, 0, 0, 0], 8000));
        let v = SocketAddr::from(([0, 0, 0, 1], 8001));
        t.add_tunnel(u.clone());
        assert_eq!((0..3).map(|_| t.round_robin_tunnel()).collect::<Vec<_>>(), (0..3).map(|_| u.clone()).collect::<Vec<_>>());
        t.add_tunnel(v.clone());
        assert_eq!((0..3).map(|_| t.round_robin_tunnel()).collect::<Vec<_>>(), (0..3).map(|i| if i % 2 == 0 { u.clone() } else { v.clone() }).collect::<Vec<_>>());
    }
}
