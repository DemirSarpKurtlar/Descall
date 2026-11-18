//! WinHTTP client: system proxy (incl. PAC/WPAD), system certificate store, HTTPS only.
//! No TLS stack in the exe; Windows keeps it patched.

use crate::download::{DlError, Fetch};
use std::ffi::c_void;
use std::time::Instant;
use windows::core::{HSTRING, PCWSTR};
use windows::Win32::Networking::WinHttp::*;

pub struct Session(*mut c_void);

// The session handle is only used from the thread that owns the Session value.
unsafe impl Send for Session {}

const UA: &str = concat!("DescallSetup/", env!("CARGO_PKG_VERSION"), " (Windows; x64)");
const WINHTTP_OPTION_SECURITY_INFO: u32 = 151;

fn last_net_error(e: &windows::core::Error) -> DlError {
    DlError::Net((e.code().0 as u32) & 0xffff)
}

struct Handle(*mut c_void);
impl Drop for Handle {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe {
                let _ = WinHttpCloseHandle(self.0);
            }
        }
    }
}

pub struct Url {
    pub host: String,
    pub port: u16,
    pub path: String,
}

pub fn parse_https(url: &str) -> Option<Url> {
    let rest = url.strip_prefix("https://")?;
    let (hostport, path) = match rest.find('/') {
        Some(i) => (&rest[..i], &rest[i..]),
        None => (rest, "/"),
    };
    let (host, port) = match hostport.rsplit_once(':') {
        Some((h, p)) => (h, p.parse().ok()?),
        None => (hostport, 443),
    };
    (!host.is_empty()).then(|| Url { host: host.to_string(), port, path: path.to_string() })
}

pub struct Response {
    /// Protocol from SECURITY_INFO, e.g. "TLS 1.3"; "TLS" when Windows does not say.
    pub tls: String,
}

impl Session {
    pub fn new() -> Result<Self, DlError> {
        let h = unsafe { WinHttpOpen(&HSTRING::from(UA), WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY, PCWSTR::null(), PCWSTR::null(), 0) };
        let h = if h.is_null() {
            // Windows 8.0 and older builds lack AUTOMATIC_PROXY; fall back to the WinHTTP default.
            unsafe { WinHttpOpen(&HSTRING::from(UA), WINHTTP_ACCESS_TYPE_DEFAULT_PROXY, PCWSTR::null(), PCWSTR::null(), 0) }
        } else {
            h
        };
        if h.is_null() {
            return Err(DlError::Net(windows::core::Error::from_thread().code().0 as u32 & 0xffff));
        }
        unsafe {
            let _ = WinHttpSetTimeouts(h, 10_000, 10_000, 15_000, 20_000);
            // TLS 1.2 + 1.3 only.
            let protos: u32 = 0x0000_0800 | 0x0000_2000;
            let _ = WinHttpSetOption(Some(h), WINHTTP_OPTION_SECURE_PROTOCOLS, Some(&protos.to_le_bytes()));
        }
        Ok(Session(h))
    }

    /// GET with an optional byte range; `body` gets the bytes as they arrive.
    pub fn get(&self, url: &str, range: Option<(u64, u64)>, body: &mut dyn FnMut(&[u8]) -> Result<(), DlError>) -> Result<Response, DlError> {
        let u = parse_https(url).ok_or(DlError::Net(12005))?; // ERROR_WINHTTP_INVALID_URL
        let conn = Handle(unsafe { WinHttpConnect(self.0, &HSTRING::from(u.host.as_str()), u.port, 0) });
        if conn.0.is_null() {
            return Err(DlError::Net(windows::core::Error::from_thread().code().0 as u32 & 0xffff));
        }
        let req = Handle(unsafe { WinHttpOpenRequest(conn.0, &HSTRING::from("GET"), &HSTRING::from(u.path.as_str()), PCWSTR::null(), PCWSTR::null(), std::ptr::null(), WINHTTP_FLAG_SECURE) });
        if req.0.is_null() {
            return Err(DlError::Net(windows::core::Error::from_thread().code().0 as u32 & 0xffff));
        }
        let mut headers = String::from("Cache-Control: no-transform\r\n");
        if let Some((from, to)) = range {
            headers.push_str(&format!("Range: bytes={}-{}\r\n", from, to.saturating_sub(1)));
        }
        let hw: Vec<u16> = headers.encode_utf16().collect();
        unsafe {
            WinHttpSendRequest(req.0, Some(&hw), None, 0, 0, 0).map_err(|e| last_net_error(&e))?;
            WinHttpReceiveResponse(req.0, std::ptr::null_mut()).map_err(|e| last_net_error(&e))?;
        }
        let status = unsafe {
            let mut code: u32 = 0;
            let mut len = 4u32;
            let mut idx = 0u32;
            WinHttpQueryHeaders(req.0, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER, PCWSTR::null(), Some(&mut code as *mut u32 as *mut c_void), &mut len, &mut idx).map_err(|e| last_net_error(&e))?;
            code as u16
        };
        let tls = tls_name(req.0);
        let expected = if range.is_some() { 206 } else { 200 };
        if status != expected {
            return Err(DlError::Http(status));
        }
        let mut buf = vec![0u8; 64 * 1024];
        loop {
            let mut read = 0u32;
            unsafe { WinHttpReadData(req.0, buf.as_mut_ptr() as *mut c_void, buf.len() as u32, &mut read) }.map_err(|e| last_net_error(&e))?;
            if read == 0 {
                break;
            }
            body(&buf[..read as usize])?;
        }
        Ok(Response { tls })
    }

    /// Small whole-body GET (manifest, signature), capped at 1 MiB.
    pub fn get_small(&self, url: &str) -> Result<(Vec<u8>, Response), DlError> {
        let mut v = Vec::new();
        let r = self.get(url, None, &mut |c| {
            if v.len() + c.len() > 1 << 20 {
                return Err(DlError::Http(413));
            }
            v.extend_from_slice(c);
            Ok(())
        })?;
        Ok((v, r))
    }

    /// Round trip of a 1-byte range request (used to pick the nearest mirror) and the TLS version.
    pub fn probe(&self, url: &str) -> Option<(u32, String)> {
        let t = Instant::now();
        let r = self.get(url, Some((0, 1)), &mut |_| Ok(())).ok()?;
        Some((t.elapsed().as_millis().min(9_999) as u32, r.tls))
    }
}

impl Drop for Session {
    fn drop(&mut self) {
        unsafe {
            let _ = WinHttpCloseHandle(self.0);
        }
    }
}

#[repr(C)]
struct ConnInfo {
    protocol: u32,
    cipher: u32,
    cipher_strength: u32,
    hash: u32,
    hash_strength: u32,
    exch: u32,
    exch_strength: u32,
}

fn tls_name(req: *mut c_void) -> String {
    // WINHTTP_SECURITY_INFO starts with SecPkgContext_ConnectionInfo; query a generous buffer.
    let mut buf = [0u8; 1024];
    let mut len = buf.len() as u32;
    let ok = unsafe { WinHttpQueryOption(req, WINHTTP_OPTION_SECURITY_INFO, Some(buf.as_mut_ptr() as *mut c_void), &mut len) }.is_ok();
    if ok && len as usize >= std::mem::size_of::<ConnInfo>() {
        let ci = unsafe { std::ptr::read_unaligned(buf.as_ptr() as *const ConnInfo) };
        if ci.protocol & 0x3000 != 0 {
            return "TLS 1.3".into();
        }
        if ci.protocol & 0x0c00 != 0 {
            return "TLS 1.2".into();
        }
    }
    "TLS".into()
}

/// `Fetch` over one mirror URL, used by the downloader.
pub struct WinFetch<'a> {
    pub session: &'a Session,
}

impl Fetch for WinFetch<'_> {
    fn fetch(&mut self, url: &str, from: u64, to: u64, sink: &mut dyn FnMut(&[u8]) -> Result<(), DlError>) -> Result<(), DlError> {
        self.session.get(url, Some((from, to)), sink).map(|_| ())
    }
}

/// Proxy configured for the user (manual proxy or PAC script).
pub fn proxy_configured() -> bool {
    let mut cfg = WINHTTP_CURRENT_USER_IE_PROXY_CONFIG::default();
    if unsafe { WinHttpGetIEProxyConfigForCurrentUser(&mut cfg) }.is_err() {
        return false;
    }
    let has = !cfg.lpszProxy.is_null() || !cfg.lpszAutoConfigUrl.is_null();
    unsafe {
        for p in [cfg.lpszProxy, cfg.lpszAutoConfigUrl, cfg.lpszProxyBypass] {
            if !p.is_null() {
                let _ = windows::Win32::Foundation::GlobalFree(Some(windows::Win32::Foundation::HGLOBAL(p.0 as *mut c_void)));
            }
        }
    }
    has
}
