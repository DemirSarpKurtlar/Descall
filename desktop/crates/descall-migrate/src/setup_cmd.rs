//! Command line for the silent setup.
//!
//! NSIS reads `/D=` only as the LAST argument and only UNQUOTED, even when the path has
//! spaces (`/D=C:\Program Files\Descall`). Rust's `Command::arg` would quote it, so that
//! one is passed raw (`CommandExt::raw_arg` on Windows). Every other argument is quoted
//! normally. The template comes from the signed plan, so a different installer (for
//! example a custom Rust setup) only needs a different template, not a new migrator.

use std::path::Path;

use crate::MigrateError;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SetupArg {
    /// Passed with `Command::arg` (quoted when needed).
    Quoted(String),
    /// Appended verbatim (`raw_arg`): only the NSIS `/D=` argument.
    Raw(String),
}

impl SetupArg {
    pub fn text(&self) -> &str {
        match self {
            SetupArg::Quoted(s) | SetupArg::Raw(s) => s,
        }
    }
}

const MAX_ARGS: usize = 16;

pub fn validate_template(args: &[String]) -> crate::Result<()> {
    if args.is_empty() || args.len() > MAX_ARGS {
        return Err(MigrateError::Job("setup args: 1..16 entries".into()));
    }
    for (i, a) in args.iter().enumerate() {
        if a.is_empty() || a.len() > 200 || a.contains('"') || a.contains('\0') || a.contains('\n') {
            return Err(MigrateError::Job("setup args: bad entry".into()));
        }
        // Only the {dir} placeholder exists.
        let without = a.replace("{dir}", "");
        if without.contains('{') || without.contains('}') {
            return Err(MigrateError::Job("setup args: unknown placeholder".into()));
        }
        if a.to_ascii_uppercase().starts_with("/D=") && i != args.len() - 1 {
            return Err(MigrateError::Job("setup args: /D= must be last".into()));
        }
    }
    if !args.iter().any(|a| a.contains("{dir}")) {
        return Err(MigrateError::Job("setup args: the target folder {dir} is missing".into()));
    }
    Ok(())
}

/// Fill the template for `dir`.
pub fn build(args: &[String], dir: &Path) -> crate::Result<Vec<SetupArg>> {
    validate_template(args)?;
    let d = dir.to_string_lossy();
    if d.contains('"') || d.is_empty() {
        return Err(MigrateError::Job("bad target folder".into()));
    }
    Ok(args
        .iter()
        .map(|a| {
            let v = a.replace("{dir}", &d);
            if a.to_ascii_uppercase().starts_with("/D=") {
                SetupArg::Raw(v)
            } else {
                SetupArg::Quoted(v)
            }
        })
        .collect())
}

/// Human-readable line for the log (never contains secrets: setups take no tokens).
pub fn display(exe: &Path, args: &[SetupArg]) -> String {
    let mut s = format!("\"{}\"", exe.display());
    for a in args {
        s.push(' ');
        match a {
            SetupArg::Raw(v) => s.push_str(v),
            SetupArg::Quoted(v) if v.contains(' ') => s.push_str(&format!("\"{v}\"")),
            SetupArg::Quoted(v) => s.push_str(v),
        }
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn nsis_target_is_last_and_raw_even_with_spaces() {
        let out = build(&crate::job::default_args(), &PathBuf::from(r"D:\My Apps\Descall")).unwrap();
        assert_eq!(out, vec![SetupArg::Quoted("/S".into()), SetupArg::Raw(r"/D=D:\My Apps\Descall".into())]);
        assert_eq!(display(Path::new(r"C:\t\Setup.exe"), &out), r#""C:\t\Setup.exe" /S /D=D:\My Apps\Descall"#);
    }

    #[test]
    fn custom_installer_templates_are_quoted() {
        let t = vec!["--silent".to_string(), "--install-dir".to_string(), "{dir}".to_string()];
        let out = build(&t, &PathBuf::from(r"C:\Program Files\Descall")).unwrap();
        assert_eq!(out[2], SetupArg::Quoted(r"C:\Program Files\Descall".into()));
    }

    #[test]
    fn rejects_bad_templates() {
        for t in [
            vec![],
            vec!["/S".to_string()],
            vec!["/D={dir}".to_string(), "/S".to_string()],
            vec!["/S".to_string(), "{user}".to_string(), "{dir}".to_string()],
            vec!["/S".to_string(), "\"{dir}\"".to_string()],
        ] {
            assert!(validate_template(&t).is_err(), "{t:?}");
        }
        assert!(build(&crate::job::default_args(), Path::new("")).is_err());
    }
}
