//! Bundle lookup for nested routes (descall_shell::dist_path): the admin windows open at
//! /admin/panel and /admin/signup-stats, and their relative `./assets/...` URLs arrive as
//! `admin/assets/...`. Wraps the embedded assets so those keys resolve to the real files
//! instead of Tauri's index.html fallback (which left the window on the marketing page).

use std::borrow::Cow;
use std::collections::HashSet;

use tauri::utils::assets::{AssetKey, AssetsIter, CspHash};
use tauri::{App, Assets, Context, Runtime};

pub struct NestedAssets<R: Runtime> {
    inner: Box<dyn Assets<R>>,
    keys: HashSet<String>,
}

impl<R: Runtime> NestedAssets<R> {
    pub fn wrap(inner: Box<dyn Assets<R>>) -> Self {
        let keys = inner.iter().map(|(k, _)| k.trim_start_matches('/').to_string()).collect();
        Self { inner, keys }
    }
}

impl<R: Runtime> Assets<R> for NestedAssets<R> {
    fn setup(&self, app: &App<R>) {
        self.inner.setup(app);
    }

    fn get(&self, key: &AssetKey) -> Option<Cow<'_, [u8]>> {
        if let Some(found) = self.inner.get(key) {
            return Some(found);
        }
        let real = descall_shell::dist_path::nested_asset_key(key.as_ref(), |k| self.keys.contains(k))?;
        self.inner.get(&AssetKey::from(real.as_str()))
    }

    fn iter(&self) -> Box<AssetsIter<'_>> {
        self.inner.iter()
    }

    fn csp_hashes(&self, html_path: &AssetKey) -> Box<dyn Iterator<Item = CspHash<'_>> + '_> {
        self.inner.csp_hashes(html_path)
    }
}

/// Placeholder while the embedded assets move into the wrapper.
struct Empty;

impl<R: Runtime> Assets<R> for Empty {
    fn get(&self, _: &AssetKey) -> Option<Cow<'_, [u8]>> {
        None
    }
    fn iter(&self) -> Box<AssetsIter<'_>> {
        Box::new(std::iter::empty())
    }
    fn csp_hashes(&self, _: &AssetKey) -> Box<dyn Iterator<Item = CspHash<'_>> + '_> {
        Box::new(std::iter::empty())
    }
}

/// The generated context with its assets wrapped in [`NestedAssets`].
pub fn with_nested_routes<R: Runtime>(mut ctx: Context<R>) -> Context<R> {
    let embedded = ctx.set_assets(Box::new(Empty));
    ctx.set_assets(Box::new(NestedAssets::wrap(embedded)));
    ctx
}
