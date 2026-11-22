//! HTTP. Loopback calls to the node's own backend (health, local control) use a tiny blocking
//! HTTP/1.1 client over std::net with short timeouts (127.0.0.1 only, never a proxy); calls to
//! the primary (register, drain-done) use reqwest over TLS.

use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::time::Duration;

use serde_json::Value;

pub struct Reply {
    pub status: u16,
    pub body: Value,
}

fn decode_chunked(mut b: &[u8]) -> Vec<u8> {
    let mut out = Vec::new();
    while let Some(pos) = b.windows(2).position(|w| w == b"\r\n") {
        let size = usize::from_str_radix(std::str::from_utf8(&b[..pos]).unwrap_or("0").split(';').next().unwrap_or("0").trim(), 16).unwrap_or(0);
        if size == 0 {
            break;
        }
        let start = pos + 2;
        if b.len() < start + size {
            out.extend_from_slice(&b[start..]);
            break;
        }
        out.extend_from_slice(&b[start..start + size]);
        b = &b[(start + size + 2).min(b.len())..];
    }
    out
}

/// `method path` on 127.0.0.1:`port` with an optional JSON body and control token.
pub fn local(method: &str, port: u16, path: &str, token: Option<&str>, body: Option<&Value>, timeout: Duration) -> Result<Reply, String> {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let mut s = TcpStream::connect_timeout(&addr, timeout).map_err(|e| e.to_string())?;
    s.set_read_timeout(Some(timeout)).ok();
    s.set_write_timeout(Some(timeout)).ok();
    let payload = body.map(|b| b.to_string()).unwrap_or_default();
    let mut req = format!("{method} {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\nAccept: application/json\r\nUser-Agent: DescallNode/{}\r\n", descall_node::SERVICE_VERSION);
    if let Some(t) = token {
        req.push_str(&format!("{}: {t}\r\n", descall_node::local_api::HEADER));
    }
    if body.is_some() {
        req.push_str(&format!("Content-Type: application/json\r\nContent-Length: {}\r\n", payload.len()));
    }
    req.push_str("\r\n");
    req.push_str(&payload);
    s.write_all(req.as_bytes()).map_err(|e| e.to_string())?;
    let mut raw = Vec::new();
    s.take(4 * 1024 * 1024).read_to_end(&mut raw).map_err(|e| e.to_string())?;
    let split = raw.windows(4).position(|w| w == b"\r\n\r\n").ok_or("bad response")?;
    let head = String::from_utf8_lossy(&raw[..split]).to_string();
    let status: u16 = head.split_whitespace().nth(1).and_then(|c| c.parse().ok()).ok_or("bad status")?;
    let mut bytes = raw[split + 4..].to_vec();
    if head.to_ascii_lowercase().contains("transfer-encoding: chunked") {
        bytes = decode_chunked(&bytes);
    }
    Ok(Reply { status, body: serde_json::from_slice(&bytes).unwrap_or(Value::Null) })
}

fn client() -> Option<reqwest::Client> {
    static ONCE: std::sync::Once = std::sync::Once::new();
    ONCE.call_once(|| {
        let _ = rustls::crypto::ring::default_provider().install_default();
    });
    reqwest::Client::builder().timeout(Duration::from_secs(10)).user_agent(concat!("DescallNode/", env!("CARGO_PKG_VERSION"))).build().ok()
}

/// POST JSON to the primary with the node key. (status, body); status 0 on a network error.
pub async fn primary_post(base: &str, path: &str, key: &str, body: &Value) -> (u16, Value) {
    primary_post_with(base, path, key, body, Duration::from_secs(10)).await
}

/// Same with its own timeout (the one-off setup call waits longer than the heartbeat). The
/// body may carry secrets (POST /api/node/bootstrap): callers never log it.
pub async fn primary_post_with(base: &str, path: &str, key: &str, body: &Value, timeout: Duration) -> (u16, Value) {
    let Some(c) = client() else { return (0, Value::Null) };
    let url = format!("{}{}", base.trim_end_matches('/'), path);
    match c.post(url).bearer_auth(key).timeout(timeout).json(body).send().await {
        Ok(r) => {
            let st = r.status().as_u16();
            let v = r.json::<Value>().await.unwrap_or(Value::Null);
            (st, v)
        }
        Err(_) => (0, Value::Null),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chunked() {
        assert_eq!(decode_chunked(b"4\r\n{\"a\"\r\n3\r\n:1}\r\n0\r\n\r\n"), b"{\"a\":1}");
    }

    #[test]
    fn loopback_round_trip() {
        let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = l.local_addr().unwrap().port();
        let h = std::thread::spawn(move || {
            let (mut s, _) = l.accept().unwrap();
            let mut buf = [0u8; 2048];
            let n = s.read(&mut buf).unwrap();
            let req = String::from_utf8_lossy(&buf[..n]).to_string();
            s.write_all(b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 11\r\n\r\n{\"ok\":true}").unwrap();
            req
        });
        let r = local("POST", port, "/api/node/local/drain", Some("tok"), Some(&serde_json::json!({ "reason": "pause" })), Duration::from_secs(2)).unwrap();
        assert_eq!(r.status, 200);
        assert_eq!(r.body["ok"], true);
        let req = h.join().unwrap();
        assert!(req.starts_with("POST /api/node/local/drain HTTP/1.1"));
        assert!(req.contains("x-descall-node-control: tok"));
        assert!(req.ends_with("{\"reason\":\"pause\"}"));
    }
}
