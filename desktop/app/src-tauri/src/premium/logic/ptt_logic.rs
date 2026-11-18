//! Push-to-talk logic (port of electron/premium/pttLogic.cjs), with Windows virtual-key codes
//! instead of uiohook key codes. Pure: the Raw Input listener feeds [`InputEvent`]s in, the
//! talk state is driven with explicit timestamps so tests need no clock.

use super::hotkey_logic::normalize_accelerator;

/// What the Raw Input listener watches. Only this key (or button) is ever compared; every
/// other input is dropped unread, so the listener is not a keylogger.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HookSpec {
    /// Raw mouse button: 3 middle, 4 / 5 side buttons (XBUTTON1 / XBUTTON2).
    Mouse { button: u8 },
    /// Virtual-key code plus the modifiers that must be held when it goes down.
    Key { vk: u16, alt_vk: Option<u16>, ctrl: bool, alt: bool, shift: bool, meta: bool },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum InputEvent {
    KeyDown { vk: u16, ctrl: bool, alt: bool, shift: bool, meta: bool },
    KeyUp { vk: u16 },
    MouseDown { button: u8 },
    MouseUp { button: u8 },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Edge {
    Down,
    Up,
}

/// Accelerator key name (normalised Electron syntax) -> Windows virtual-key code.
pub fn vk_for_key(key: &str) -> Option<u16> {
    if key.len() == 1 {
        let c = key.as_bytes()[0];
        return match c {
            b'A'..=b'Z' | b'0'..=b'9' => Some(c as u16),
            b'`' => Some(0xC0),
            b'-' => Some(0xBD),
            b'=' => Some(0xBB),
            b'[' => Some(0xDB),
            b']' => Some(0xDD),
            b';' => Some(0xBA),
            b'\'' => Some(0xDE),
            b',' => Some(0xBC),
            b'.' => Some(0xBE),
            b'/' => Some(0xBF),
            b'\\' => Some(0xDC),
            _ => None,
        };
    }
    if let Some(n) = key.strip_prefix('F').and_then(|n| n.parse::<u16>().ok()) {
        return (1..=24).contains(&n).then_some(0x6F + n);
    }
    if let Some(n) = key.strip_prefix("num").and_then(|n| n.parse::<u16>().ok()) {
        return (n <= 9).then_some(0x60 + n);
    }
    Some(match key {
        "Space" => 0x20,
        "Tab" => 0x09,
        "Backspace" => 0x08,
        "Delete" => 0x2E,
        "Insert" => 0x2D,
        "Return" | "Enter" => 0x0D,
        "Up" => 0x26,
        "Down" => 0x28,
        "Left" => 0x25,
        "Right" => 0x27,
        "Home" => 0x24,
        "End" => 0x23,
        "PageUp" => 0x21,
        "PageDown" => 0x22,
        "Escape" | "Esc" => 0x1B,
        "Plus" | "Equal" => 0xBB,
        "CapsLock" => 0x14,
        "NumLock" => 0x90,
        "ScrollLock" => 0x91,
        "PrintScreen" => 0x2C,
        "VolumeUp" => 0xAF,
        "VolumeDown" => 0xAE,
        "VolumeMute" => 0xAD,
        "MediaNextTrack" => 0xB0,
        "MediaPreviousTrack" => 0xB1,
        "MediaStop" => 0xB2,
        "MediaPlayPause" => 0xB3,
        "Backquote" => 0xC0,
        "Minus" => 0xBD,
        "BracketLeft" => 0xDB,
        "BracketRight" => 0xDD,
        "Semicolon" => 0xBA,
        "Quote" => 0xDE,
        "Comma" => 0xBC,
        "Period" => 0xBE,
        "Slash" => 0xBF,
        "Backslash" => 0xDC,
        "numdec" => 0x6E,
        "numadd" => 0x6B,
        "numsub" => 0x6D,
        "nummult" => 0x6A,
        "numdiv" => 0x6F,
        _ => return None,
    })
}

/// With NumLock off, the numpad digits arrive as navigation keys (VK_INSERT, VK_END ...).
fn numpad_alt_vk(key: &str) -> Option<u16> {
    Some(match key {
        "num0" => 0x2D,
        "num1" => 0x23,
        "num2" => 0x28,
        "num3" => 0x22,
        "num4" => 0x25,
        "num5" => 0x0C,
        "num6" => 0x27,
        "num7" => 0x24,
        "num8" => 0x26,
        "num9" => 0x21,
        "numdec" => 0x2E,
        _ => return None,
    })
}

/// Hook spec for an accelerator, or None when Raw Input cannot match it.
pub fn binding_to_spec(accel: &str) -> Option<HookSpec> {
    let a = normalize_accelerator(accel);
    if a.is_empty() {
        return None;
    }
    match a.as_str() {
        "Mouse3" => return Some(HookSpec::Mouse { button: 3 }),
        "Mouse4" => return Some(HookSpec::Mouse { button: 4 }),
        "Mouse5" => return Some(HookSpec::Mouse { button: 5 }),
        _ => {}
    }
    let parts: Vec<&str> = a.split('+').collect();
    let (key, mods) = parts.split_last()?;
    let vk = vk_for_key(key)?;
    let has = |m: &str| mods.contains(&m);
    Some(HookSpec::Key {
        vk,
        alt_vk: numpad_alt_vk(key),
        ctrl: has("Control") || has("CommandOrControl") || has("AltGr"),
        alt: has("Alt") || has("AltGr"),
        shift: has("Shift"),
        meta: has("Super") || has("Command"),
    })
}

/// Does an input event press / release the binding? Releasing the key ends talk whatever
/// modifiers are still held; pressing needs the binding's modifiers.
pub fn match_event(spec: &HookSpec, e: &InputEvent) -> Option<Edge> {
    match (spec, e) {
        (HookSpec::Mouse { button }, InputEvent::MouseDown { button: b }) if b == button => Some(Edge::Down),
        (HookSpec::Mouse { button }, InputEvent::MouseUp { button: b }) if b == button => Some(Edge::Up),
        (HookSpec::Key { vk, alt_vk, .. }, InputEvent::KeyUp { vk: v }) if v == vk || Some(*v) == *alt_vk => Some(Edge::Up),
        (HookSpec::Key { vk, alt_vk, ctrl, alt, shift, meta }, InputEvent::KeyDown { vk: v, ctrl: c, alt: a, shift: s, meta: m })
            if v == vk || Some(*v) == *alt_vk =>
        {
            if (*ctrl && !c) || (*alt && !a) || (*shift && !s) || (*meta && !m) {
                None
            } else {
                Some(Edge::Down)
            }
        }
        _ => None,
    }
}

/// Talk state with a short release tail (the last syllable is not cut) and key-repeat
/// suppression. Every call returns `Some(talking)` on a transition only. Toggle mode (the
/// fallback when Raw Input is unavailable): each press flips; auto-off after `timeout_ms`.
#[derive(Clone, Debug)]
pub struct PttState {
    pub release_delay_ms: u64,
    pub timeout_ms: u64,
    talking: bool,
    release_at: Option<u64>,
    timeout_at: Option<u64>,
}

impl PttState {
    pub fn new(release_delay_ms: u64, timeout_ms: u64) -> Self {
        Self { release_delay_ms, timeout_ms, talking: false, release_at: None, timeout_at: None }
    }

    pub fn talking(&self) -> bool {
        self.talking
    }

    fn set(&mut self, next: bool) -> Option<bool> {
        if self.talking == next {
            return None;
        }
        self.talking = next;
        Some(next)
    }

    pub fn press(&mut self, _now: u64) -> Option<bool> {
        self.release_at = None;
        self.set(true)
    }

    /// Starts the release tail; the caller runs [`PttState::tick`] at [`PttState::next_deadline`].
    pub fn release(&mut self, now: u64) -> Option<bool> {
        if !self.talking {
            return None;
        }
        if self.release_delay_ms == 0 {
            self.release_at = None;
            return self.set(false);
        }
        self.release_at = Some(now + self.release_delay_ms);
        None
    }

    pub fn toggle(&mut self, now: u64) -> Option<bool> {
        self.release_at = None;
        self.timeout_at = None;
        if self.talking {
            return self.set(false);
        }
        if self.timeout_ms > 0 {
            self.timeout_at = Some(now + self.timeout_ms);
        }
        self.set(true)
    }

    pub fn reset(&mut self) -> Option<bool> {
        self.release_at = None;
        self.timeout_at = None;
        self.set(false)
    }

    pub fn next_deadline(&self) -> Option<u64> {
        match (self.release_at, self.timeout_at) {
            (Some(a), Some(b)) => Some(a.min(b)),
            (a, b) => a.or(b),
        }
    }

    pub fn tick(&mut self, now: u64) -> Option<bool> {
        let due = |t: Option<u64>| t.is_some_and(|t| now >= t);
        if due(self.release_at) || due(self.timeout_at) {
            self.release_at = None;
            self.timeout_at = None;
            return self.set(false);
        }
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn specs() {
        assert_eq!(binding_to_spec("Mouse4"), Some(HookSpec::Mouse { button: 4 }));
        let sp = binding_to_spec("Ctrl+Space").unwrap();
        assert_eq!(sp, HookSpec::Key { vk: 0x20, alt_vk: None, ctrl: true, alt: false, shift: false, meta: false });
        assert!(matches!(binding_to_spec("Up"), Some(HookSpec::Key { vk: 0x26, .. })));
        assert!(matches!(binding_to_spec("F13"), Some(HookSpec::Key { vk: 0x7C, .. })));
        assert!(matches!(binding_to_spec("`"), Some(HookSpec::Key { vk: 0xC0, .. })));
        assert!(matches!(binding_to_spec("num1"), Some(HookSpec::Key { vk: 0x61, alt_vk: Some(0x23), .. })));
        assert_eq!(binding_to_spec("Ctrl+Nope"), None);
        assert_eq!(binding_to_spec(""), None);
    }

    #[test]
    fn edges() {
        let sp = binding_to_spec("Ctrl+Space").unwrap();
        let down = |ctrl| InputEvent::KeyDown { vk: 0x20, ctrl, alt: false, shift: false, meta: false };
        assert_eq!(match_event(&sp, &down(true)), Some(Edge::Down));
        assert_eq!(match_event(&sp, &down(false)), None, "modifier required to start");
        assert_eq!(match_event(&sp, &InputEvent::KeyUp { vk: 0x20 }), Some(Edge::Up), "release ends talk whatever else is held");
        assert_eq!(match_event(&sp, &InputEvent::KeyDown { vk: 0x41, ctrl: true, alt: false, shift: false, meta: false }), None, "other keys are ignored");
        let m4 = HookSpec::Mouse { button: 4 };
        assert_eq!(match_event(&m4, &InputEvent::MouseDown { button: 4 }), Some(Edge::Down));
        assert_eq!(match_event(&m4, &InputEvent::MouseDown { button: 5 }), None);
        assert_eq!(match_event(&m4, &InputEvent::KeyDown { vk: 4, ctrl: false, alt: false, shift: false, meta: false }), None);
        let n1 = binding_to_spec("num1").unwrap();
        assert_eq!(match_event(&n1, &InputEvent::KeyDown { vk: 0x23, ctrl: false, alt: false, shift: false, meta: false }), Some(Edge::Down), "NumLock off");
    }

    #[test]
    fn talk_state() {
        let mut changes = Vec::new();
        let mut p = PttState::new(150, 5000);
        let mut push = |r: Option<bool>| if let Some(v) = r { changes.push(v) };
        push(p.press(0));
        push(p.press(10));
        push(p.press(20));
        push(p.release(100));
        assert_eq!(p.next_deadline(), Some(250));
        push(p.tick(200));
        push(p.press(200)); // pressed again inside the tail: no gap
        push(p.tick(400));
        push(p.release(500));
        push(p.tick(649));
        push(p.tick(650));
        push(p.toggle(1000));
        push(p.tick(5999));
        push(p.tick(6000)); // timeout
        push(p.toggle(7000));
        push(p.toggle(7001));
        assert_eq!(changes, vec![true, false, true, false, true, false]);
        let mut instant = PttState::new(0, 0);
        assert_eq!(instant.press(0), Some(true));
        assert_eq!(instant.release(1), Some(false));
        assert_eq!(instant.reset(), None);
    }
}
