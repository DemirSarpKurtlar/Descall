//! Environment of the two child processes. The backend gets a clean environment: a short list
//! of Windows basics from this app's own environment, the environment the primary handed out
//! (`bootstrapEnv`, crate::bootstrap), the owner's extra `.env` lines, the stored named
//! values (DPAPI store -> process env, the only place secrets go) and the `DESCALL_NODE_*`
//! variables of the hybrid contract, each later one winning. cloudflared gets only the basics and its
//! `TUNNEL_TOKEN` (an env var, so the token never shows in a process list command line).

use std::collections::BTreeMap;

use crate::limits::JobLimits;
use crate::secrets::{parse_env_json, parse_env_lines, FIELDS};

/// Inherited from this app (Windows needs SystemRoot & co. to start anything at all).
pub const INHERIT: &[&str] = &[
    "SystemRoot",
    "SystemDrive",
    "windir",
    "ComSpec",
    "PATHEXT",
    "TEMP",
    "TMP",
    "USERPROFILE",
    "LOCALAPPDATA",
    "APPDATA",
    "ProgramData",
    "ProgramFiles",
    "NUMBER_OF_PROCESSORS",
    "PROCESSOR_ARCHITECTURE",
    "OS",
    "COMPUTERNAME",
    "HOMEDRIVE",
    "HOMEPATH",
];

pub struct NodeIdentity<'a> {
    pub node_id: &'a str,
    pub port: u16,
    /// Per-launch random token of the local control endpoints.
    pub control_token: &'a str,
    pub version: &'a str,
}

fn inherit(own: &dyn Fn(&str) -> Option<String>, out: &mut BTreeMap<String, String>, path_dirs: &[String]) {
    for k in INHERIT {
        if let Some(v) = own(k) {
            out.insert((*k).to_string(), v);
        }
    }
    // PATH: the bundled runtime folder first, then Windows' own folders only.
    let sysroot = own("SystemRoot").unwrap_or_else(|| r"C:\Windows".into());
    let mut path: Vec<String> = path_dirs.to_vec();
    path.push(format!(r"{sysroot}\System32"));
    path.push(sysroot.clone());
    path.push(format!(r"{sysroot}\System32\Wbem"));
    out.insert("PATH".into(), path.join(";"));
}

/// Environment of node.exe running frontend/backend/server.js.
pub fn backend_env(own: &dyn Fn(&str) -> Option<String>, stored: &dyn Fn(&str) -> Option<String>, id: &NodeIdentity, limits: &JobLimits, runtime_dir: &str) -> BTreeMap<String, String> {
    let mut out = BTreeMap::new();
    inherit(own, &mut out, &[runtime_dir.to_string()]);
    // The primary's environment first (filtered again: never a name the app owns); then the
    // owner's extra lines; then the named fields; the contract variables win over all.
    if let Some(boot) = stored("bootstrapEnv") {
        for (k, v) in parse_env_json(&boot) {
            out.insert(k, v);
        }
    }
    if let Some(extra) = stored("extraEnv") {
        for (k, v) in parse_env_lines(&extra).vars {
            out.insert(k, v);
        }
    }
    for f in FIELDS {
        if let (Some(env), Some(v)) = (f.env, stored(f.id).filter(|v| !v.is_empty())) {
            out.insert(env.to_string(), v);
        }
    }
    out.entry("DESCALL_NODE_PUBLIC_URL".into()).or_insert_with(|| crate::DEFAULT_PUBLIC_URL.into());
    out.insert("NODE_ENV".into(), "production".into());
    out.insert("PORT".into(), id.port.to_string());
    out.insert("DESCALL_NODE_ID".into(), id.node_id.into());
    out.insert("DESCALL_NODE_ROLE".into(), "secondary".into());
    out.insert("DESCALL_NODE_MEMORY_MB".into(), limits.share_mb.to_string());
    out.insert("DESCALL_NODE_CORES".into(), limits.cores.to_string());
    out.insert("DESCALL_NODE_CONTROL_TOKEN".into(), id.control_token.into());
    out.insert("DESCALL_NODE_SUPERVISOR".into(), format!("descall-node/{}", id.version));
    // The backend's own public URL (links, CORS self checks) is the PC hostname.
    let public = out["DESCALL_NODE_PUBLIC_URL"].clone();
    out.entry("PUBLIC_API_URL".into()).or_insert(public);
    out
}

/// cloudflared arguments (`tunnel run` with the token from the env).
pub fn tunnel_args(metrics_port: u16) -> Vec<String> {
    ["tunnel", "--no-autoupdate", "--metrics", &format!("127.0.0.1:{metrics_port}"), "--loglevel", "info", "run"].iter().map(|s| s.to_string()).collect()
}

pub fn tunnel_env(own: &dyn Fn(&str) -> Option<String>, token: &str, runtime_dir: &str) -> BTreeMap<String, String> {
    let mut out = BTreeMap::new();
    inherit(own, &mut out, &[runtime_dir.to_string()]);
    out.insert("TUNNEL_TOKEN".into(), token.into());
    out.insert("NO_AUTOUPDATE".into(), "true".into());
    out
}

/// `pc-` + 6 hex characters of the install's random seed.
pub fn node_id_from_seed(seed: &[u8]) -> String {
    let hex: String = seed.iter().take(3).map(|b| format!("{b:02x}")).collect();
    format!("pc-{hex:0<6}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::limits::{compute, Machine};
    use std::collections::HashMap;

    fn own(k: &str) -> Option<String> {
        match k {
            "SystemRoot" => Some(r"C:\Windows".into()),
            "TEMP" => Some(r"C:\Users\o\AppData\Local\Temp".into()),
            "PATH" => Some(r"C:\evil;C:\Windows".into()),
            "SUPABASE_SERVICE_ROLE_KEY" => Some("leaked-from-the-parent".into()),
            _ => None,
        }
    }

    #[test]
    fn backend_env_has_the_contract_vars_and_nothing_leaks_from_the_parent() {
        let mut st: HashMap<&str, String> = HashMap::new();
        st.insert("primaryUrl", "https://des-call.onrender.com".into());
        st.insert("nodeKey", "dsk_node_k".into());
        st.insert("tunnelToken", "eyJtoken".into());
        st.insert("supabaseUrl", "https://x.supabase.co".into());
        st.insert("supabaseServiceKey", "eyJservice".into());
        st.insert("extraEnv", "TOTP_ENC_KEY=t\nSUPABASE_URL=https://wrong\nPORT=1".into());
        st.insert("bootstrapEnv", r#"{"TOTP_ENC_KEY":"from-primary","WEB_PUSH_PRIVATE_KEY":"wp","SUPABASE_URL":"https://primary","PORT":"10000","REDIS_URL":"redis://internal","DESCALL_NODE_ROLE":"primary","SystemRoot":"C:/evil"}"#.into());
        let stored = |id: &str| st.get(id).cloned();
        let l = compute(3072, 4, Machine { total_mb: 32768, logical_cpus: 16 });
        let id = NodeIdentity { node_id: "pc-a1b2c3", port: 3210, control_token: "ctl", version: "1.0.0" };
        let e = backend_env(&own, &stored, &id, &l, r"C:\Program Files\Descall Node\runtime");
        assert_eq!(e["DESCALL_NODE_ID"], "pc-a1b2c3");
        assert_eq!(e["DESCALL_NODE_ROLE"], "secondary");
        assert_eq!(e["DESCALL_NODE_MEMORY_MB"], "3072");
        assert_eq!(e["DESCALL_NODE_KEY"], "dsk_node_k");
        assert_eq!(e["DESCALL_NODE_PRIMARY_URL"], "https://des-call.onrender.com");
        assert_eq!(e["DESCALL_NODE_PUBLIC_URL"], "https://pc.descall.com");
        assert_eq!(e["PUBLIC_API_URL"], "https://pc.descall.com");
        assert_eq!(e["PORT"], "3210");
        assert_eq!(e["SUPABASE_URL"], "https://x.supabase.co", "named field beats an extra line");
        assert_eq!(e["SUPABASE_SERVICE_ROLE_KEY"], "eyJservice", "the parent's value never counts");
        assert_eq!(e["TOTP_ENC_KEY"], "t", "an extra line beats the primary");
        assert_eq!(e["WEB_PUSH_PRIVATE_KEY"], "wp", "the primary's value fills the rest");
        assert_eq!(e["SystemRoot"], r"C:\Windows", "never an inherited name from the primary");
        assert!(!e.contains_key("REDIS_URL"), "the primary's internal Key Value URL never reaches the PC");
        assert!(!e.values().any(|v| v == "eyJtoken"), "the tunnel token stays with cloudflared");
        assert!(e["PATH"].starts_with(r"C:\Program Files\Descall Node\runtime;C:\Windows\System32"));
        assert!(!e["PATH"].contains("evil"));
    }

    #[test]
    fn tunnel_gets_only_its_token() {
        let e = tunnel_env(&own, "eyJtoken", r"C:\rt");
        assert_eq!(e["TUNNEL_TOKEN"], "eyJtoken");
        assert!(!e.contains_key("SUPABASE_SERVICE_ROLE_KEY"));
        let a = tunnel_args(20241);
        assert!(a.contains(&"run".to_string()) && a.contains(&"127.0.0.1:20241".to_string()));
        assert!(!a.iter().any(|x| x.contains("eyJ")), "no token on the command line");
    }

    #[test]
    fn node_id() {
        assert_eq!(node_id_from_seed(&[0xa1, 0xb2, 0xc3, 0xd4]), "pc-a1b2c3");
        assert_eq!(node_id_from_seed(&[0x01]), "pc-010000");
    }
}
