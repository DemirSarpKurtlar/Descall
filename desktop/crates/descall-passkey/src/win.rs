//! Windows WebAuthn API (webauthn.dll) for rp id descall.com.
//!
//! The DLL is loaded at run time (LoadLibraryExW from System32 + GetProcAddress), never
//! linked: on Windows 10 before 1903 it does not exist, and a static import would stop the
//! whole app from starting there. [`api_version`] is 0 then and the page uses the browser
//! handoff instead (frontend/src/lib/passkeys/handoff.js).
//!
//! One ceremony at a time ([`busy`]); [`cancel`] closes the open Windows Security dialog through
//! the cancellation id. Calls block until the person answers, so the app runs them on a
//! blocking thread with the main window as the dialog's parent.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};

use windows::Win32::Foundation::HWND;
use windows::Win32::Networking::WindowsWebServices::{
    WEBAUTHN_ASSERTION, WEBAUTHN_AUTHENTICATOR_GET_ASSERTION_OPTIONS, WEBAUTHN_AUTHENTICATOR_MAKE_CREDENTIAL_OPTIONS, WEBAUTHN_CLIENT_DATA, WEBAUTHN_COSE_CREDENTIAL_PARAMETER,
    WEBAUTHN_COSE_CREDENTIAL_PARAMETERS, WEBAUTHN_CREDENTIAL_ATTESTATION, WEBAUTHN_CREDENTIAL_EX, WEBAUTHN_CREDENTIAL_LIST, WEBAUTHN_RP_ENTITY_INFORMATION, WEBAUTHN_USER_ENTITY_INFORMATION,
};
use windows::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryExW, LOAD_LIBRARY_SEARCH_SYSTEM32};
use windows_core::{BOOL, GUID, HRESULT, PCSTR, PCWSTR};

use crate::{client_data_json, error_code, Ceremony, CreationOptions, RequestOptions, ORIGIN};

// webauthn.h constants (stable since API version 1).
const RP_ENTITY_VERSION: u32 = 1;
const USER_ENTITY_VERSION: u32 = 1;
const COSE_PARAMETER_VERSION: u32 = 1;
const CLIENT_DATA_VERSION: u32 = 1;
const CREDENTIAL_EX_VERSION: u32 = 1;
/// Version 3: cancellation id (v2) and the exclude list (v3); available from API version 1.
const MAKE_CREDENTIAL_OPTIONS_VERSION: u32 = 3;
/// Version 4: cancellation id (v3) and the allow list (v4); available from API version 1.
const GET_ASSERTION_OPTIONS_VERSION: u32 = 4;
const ATTACHMENT_ANY: u32 = 0;
const USER_VERIFICATION_REQUIRED: u32 = 1;
const ATTESTATION_NONE: u32 = 1;

type FnVersion = unsafe extern "system" fn() -> u32;
type FnMake = unsafe extern "system" fn(
    HWND,
    *const WEBAUTHN_RP_ENTITY_INFORMATION,
    *const WEBAUTHN_USER_ENTITY_INFORMATION,
    *const WEBAUTHN_COSE_CREDENTIAL_PARAMETERS,
    *const WEBAUTHN_CLIENT_DATA,
    *const WEBAUTHN_AUTHENTICATOR_MAKE_CREDENTIAL_OPTIONS,
    *mut *mut WEBAUTHN_CREDENTIAL_ATTESTATION,
) -> HRESULT;
type FnFreeAttestation = unsafe extern "system" fn(*const WEBAUTHN_CREDENTIAL_ATTESTATION);
type FnGet = unsafe extern "system" fn(HWND, PCWSTR, *const WEBAUTHN_CLIENT_DATA, *const WEBAUTHN_AUTHENTICATOR_GET_ASSERTION_OPTIONS, *mut *mut WEBAUTHN_ASSERTION) -> HRESULT;
type FnFreeAssertion = unsafe extern "system" fn(*const WEBAUTHN_ASSERTION);
type FnGetCancellationId = unsafe extern "system" fn(*mut GUID) -> HRESULT;
type FnCancel = unsafe extern "system" fn(*const GUID) -> HRESULT;
type FnErrorName = unsafe extern "system" fn(HRESULT) -> PCWSTR;
type FnUvpaAvailable = unsafe extern "system" fn(*mut BOOL) -> HRESULT;
type RawProc = unsafe extern "system" fn() -> isize;

struct Api {
    version: u32,
    make: FnMake,
    free_attestation: FnFreeAttestation,
    get: FnGet,
    free_assertion: FnFreeAssertion,
    cancellation_id: Option<FnGetCancellationId>,
    cancel: Option<FnCancel>,
    error_name: Option<FnErrorName>,
    uvpa: Option<FnUvpaAvailable>,
}

static API: OnceLock<Option<Api>> = OnceLock::new();
static BUSY: AtomicBool = AtomicBool::new(false);
static CANCEL_ID: Mutex<Option<GUID>> = Mutex::new(None);

fn load() -> Option<Api> {
    // SAFETY: LoadLibraryExW / GetProcAddress with constant, null-terminated names; every
    // pointer is transmuted to the exact signature webauthn.h declares for that export.
    unsafe {
        let module = LoadLibraryExW(windows_core::w!("webauthn.dll"), None, LOAD_LIBRARY_SEARCH_SYSTEM32).ok()?;
        let proc_of = |name: &[u8]| -> Option<RawProc> { GetProcAddress(module, PCSTR(name.as_ptr())) };
        let version: FnVersion = std::mem::transmute::<RawProc, FnVersion>(proc_of(b"WebAuthNGetApiVersionNumber\0")?);
        Some(Api {
            version: version(),
            make: std::mem::transmute::<RawProc, FnMake>(proc_of(b"WebAuthNAuthenticatorMakeCredential\0")?),
            free_attestation: std::mem::transmute::<RawProc, FnFreeAttestation>(proc_of(b"WebAuthNFreeCredentialAttestation\0")?),
            get: std::mem::transmute::<RawProc, FnGet>(proc_of(b"WebAuthNAuthenticatorGetAssertion\0")?),
            free_assertion: std::mem::transmute::<RawProc, FnFreeAssertion>(proc_of(b"WebAuthNFreeAssertion\0")?),
            cancellation_id: proc_of(b"WebAuthNGetCancellationId\0").map(|p| std::mem::transmute::<RawProc, FnGetCancellationId>(p)),
            cancel: proc_of(b"WebAuthNCancelCurrentOperation\0").map(|p| std::mem::transmute::<RawProc, FnCancel>(p)),
            error_name: proc_of(b"WebAuthNGetErrorName\0").map(|p| std::mem::transmute::<RawProc, FnErrorName>(p)),
            uvpa: proc_of(b"WebAuthNIsUserVerifyingPlatformAuthenticatorAvailable\0").map(|p| std::mem::transmute::<RawProc, FnUvpaAvailable>(p)),
        })
    }
}

fn api() -> Option<&'static Api> {
    API.get_or_init(load).as_ref()
}

/// webauthn.dll API version (0 = not available: Windows 10 before 1903).
pub fn api_version() -> u32 {
    api().map(|a| a.version).unwrap_or(0)
}

/// True when Windows Hello (a user-verifying platform authenticator) is set up.
pub fn platform_authenticator_available() -> bool {
    let Some(f) = api().and_then(|a| a.uvpa) else { return false };
    let mut out = BOOL(0);
    // SAFETY: the export writes one BOOL through the pointer we pass.
    let hr = unsafe { f(&mut out) };
    hr.is_ok() && out.as_bool()
}

pub fn busy() -> bool {
    BUSY.load(Ordering::Acquire)
}

/// Closes the open Windows Security dialog, if any.
pub fn cancel() {
    let id = *CANCEL_ID.lock().unwrap_or_else(|e| e.into_inner());
    if let (Some(id), Some(f)) = (id, api().and_then(|a| a.cancel)) {
        // SAFETY: a GUID that WebAuthNGetCancellationId returned.
        let _ = unsafe { f(&id) };
    }
}

/// The error of a failed call: HRESULT and the page's code.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CallError {
    pub hresult: i32,
    pub code: &'static str,
}

impl CallError {
    fn of(api: &Api, hr: HRESULT) -> Self {
        let name = api
            .error_name
            // SAFETY: WebAuthNGetErrorName returns a static, null-terminated wide string.
            .and_then(|f| unsafe { f(hr).to_string().ok() })
            .unwrap_or_default();
        CallError { hresult: hr.0, code: error_code(hr.0, &name) }
    }
    fn code(code: &'static str) -> Self {
        CallError { hresult: 0, code }
    }
}

/// Clears BUSY and the cancellation id when a ceremony ends (also on early returns).
struct Guard;
impl Drop for Guard {
    fn drop(&mut self) {
        *CANCEL_ID.lock().unwrap_or_else(|e| e.into_inner()) = None;
        BUSY.store(false, Ordering::Release);
    }
}

fn begin(api: &Api) -> Result<(Guard, Option<GUID>), CallError> {
    if BUSY.swap(true, Ordering::AcqRel) {
        return Err(CallError::code("busy"));
    }
    let guard = Guard;
    let id = api.cancellation_id.and_then(|f| {
        let mut g = GUID::zeroed();
        // SAFETY: the export writes one GUID.
        unsafe { f(&mut g) }.is_ok().then_some(g)
    });
    *CANCEL_ID.lock().unwrap_or_else(|e| e.into_inner()) = id;
    Ok((guard, id))
}

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

/// Copies `len` bytes from a pointer the API returned (empty for null / 0).
///
/// # Safety
/// `ptr` must be valid for `len` bytes (it comes from a live WEBAUTHN_* result).
unsafe fn bytes(ptr: *const u8, len: u32) -> Vec<u8> {
    if ptr.is_null() || len == 0 {
        Vec::new()
    } else {
        // SAFETY: guaranteed by the caller.
        unsafe { std::slice::from_raw_parts(ptr, len as usize) }.to_vec()
    }
}

/// Creates a passkey for descall.com. Returns RegistrationResponseJSON.
pub fn make_credential(hwnd: isize, options: &CreationOptions) -> Result<String, CallError> {
    let api = api().ok_or(CallError::code("unsupported"))?;
    let (_guard, cancel_id) = begin(api)?;
    let client_data = client_data_json(Ceremony::Create, &options.challenge, ORIGIN).into_bytes();

    let rp_id = wide(&options.rp_id);
    let rp_name = wide(&options.rp_name);
    let rp = WEBAUTHN_RP_ENTITY_INFORMATION { dwVersion: RP_ENTITY_VERSION, pwszId: PCWSTR(rp_id.as_ptr()), pwszName: PCWSTR(rp_name.as_ptr()), pwszIcon: PCWSTR::null() };

    let mut user_id = options.user_id.clone();
    let user_name = wide(&options.user_name);
    let display_name = wide(&options.user_display_name);
    let user = WEBAUTHN_USER_ENTITY_INFORMATION {
        dwVersion: USER_ENTITY_VERSION,
        cbId: user_id.len() as u32,
        pbId: user_id.as_mut_ptr(),
        pwszName: PCWSTR(user_name.as_ptr()),
        pwszIcon: PCWSTR::null(),
        pwszDisplayName: PCWSTR(display_name.as_ptr()),
    };

    let public_key = wide("public-key");
    let mut params: Vec<WEBAUTHN_COSE_CREDENTIAL_PARAMETER> = options
        .algorithms
        .iter()
        .map(|alg| WEBAUTHN_COSE_CREDENTIAL_PARAMETER { dwVersion: COSE_PARAMETER_VERSION, pwszCredentialType: PCWSTR(public_key.as_ptr()), lAlg: *alg })
        .collect();
    let cose = WEBAUTHN_COSE_CREDENTIAL_PARAMETERS { cCredentialParameters: params.len() as u32, pCredentialParameters: params.as_mut_ptr() };

    let mut client_bytes = client_data.clone();
    let sha256 = wide("SHA-256");
    let client = WEBAUTHN_CLIENT_DATA { dwVersion: CLIENT_DATA_VERSION, cbClientDataJSON: client_bytes.len() as u32, pbClientDataJSON: client_bytes.as_mut_ptr(), pwszHashAlgId: PCWSTR(sha256.as_ptr()) };

    let mut exclude_ids = options.exclude.clone();
    let mut exclude: Vec<WEBAUTHN_CREDENTIAL_EX> = exclude_ids
        .iter_mut()
        .map(|id| WEBAUTHN_CREDENTIAL_EX { dwVersion: CREDENTIAL_EX_VERSION, cbId: id.len() as u32, pbId: id.as_mut_ptr(), pwszCredentialType: PCWSTR(public_key.as_ptr()), dwTransports: 0 })
        .collect();
    let mut exclude_ptrs: Vec<*mut WEBAUTHN_CREDENTIAL_EX> = exclude.iter_mut().map(|e| e as *mut WEBAUTHN_CREDENTIAL_EX).collect();
    let mut exclude_list = WEBAUTHN_CREDENTIAL_LIST { cCredentials: exclude_ptrs.len() as u32, ppCredentials: exclude_ptrs.as_mut_ptr() };
    let mut cancel_guid = cancel_id.unwrap_or_else(GUID::zeroed);

    // SAFETY: plain C struct; every field we do not set is a null pointer / zero, which
    // webauthn.h defines as "not given" for this options version.
    let mut opts: WEBAUTHN_AUTHENTICATOR_MAKE_CREDENTIAL_OPTIONS = unsafe { std::mem::zeroed() };
    opts.dwVersion = MAKE_CREDENTIAL_OPTIONS_VERSION;
    opts.dwTimeoutMilliseconds = options.timeout_ms;
    opts.dwAuthenticatorAttachment = ATTACHMENT_ANY;
    opts.bRequireResidentKey = BOOL(1);
    opts.dwUserVerificationRequirement = USER_VERIFICATION_REQUIRED;
    opts.dwAttestationConveyancePreference = ATTESTATION_NONE;
    if cancel_id.is_some() {
        opts.pCancellationId = &mut cancel_guid;
    }
    if !exclude_ptrs.is_empty() {
        opts.pExcludeCredentialList = &mut exclude_list;
    }

    let mut out: *mut WEBAUTHN_CREDENTIAL_ATTESTATION = std::ptr::null_mut();
    // SAFETY: every pointer above points into a local that outlives the call; `out` receives
    // an allocation we free with WebAuthNFreeCredentialAttestation below.
    let hr = unsafe { (api.make)(HWND(hwnd as *mut core::ffi::c_void), &rp, &user, &cose, &client, &opts, &mut out) };
    if hr.is_err() {
        return Err(CallError::of(api, hr));
    }
    if out.is_null() {
        return Err(CallError::code("failed"));
    }
    // SAFETY: `out` is a valid attestation until it is freed below.
    let result = unsafe {
        let a = &*out;
        let credential_id = bytes(a.pbCredentialId, a.cbCredentialId);
        let attestation_object = bytes(a.pbAttestationObject, a.cbAttestationObject);
        let transports = if a.dwVersion >= 3 { a.dwUsedTransport } else { 0 };
        (api.free_attestation)(out);
        (credential_id, attestation_object, transports)
    };
    let (credential_id, attestation_object, transports) = result;
    if credential_id.is_empty() || attestation_object.is_empty() {
        return Err(CallError::code("failed"));
    }
    Ok(crate::registration_response(&credential_id, &client_data, &attestation_object, transports))
}

/// Signs in (discoverable when the allow list is empty). Returns AuthenticationResponseJSON.
pub fn get_assertion(hwnd: isize, options: &RequestOptions) -> Result<String, CallError> {
    let api = api().ok_or(CallError::code("unsupported"))?;
    let (_guard, cancel_id) = begin(api)?;
    let client_data = client_data_json(Ceremony::Get, &options.challenge, ORIGIN).into_bytes();

    let rp_id = wide(&options.rp_id);
    let mut client_bytes = client_data.clone();
    let sha256 = wide("SHA-256");
    let client = WEBAUTHN_CLIENT_DATA { dwVersion: CLIENT_DATA_VERSION, cbClientDataJSON: client_bytes.len() as u32, pbClientDataJSON: client_bytes.as_mut_ptr(), pwszHashAlgId: PCWSTR(sha256.as_ptr()) };

    let public_key = wide("public-key");
    let mut allow_ids = options.allow.clone();
    let mut allow: Vec<WEBAUTHN_CREDENTIAL_EX> = allow_ids
        .iter_mut()
        .map(|id| WEBAUTHN_CREDENTIAL_EX { dwVersion: CREDENTIAL_EX_VERSION, cbId: id.len() as u32, pbId: id.as_mut_ptr(), pwszCredentialType: PCWSTR(public_key.as_ptr()), dwTransports: 0 })
        .collect();
    let mut allow_ptrs: Vec<*mut WEBAUTHN_CREDENTIAL_EX> = allow.iter_mut().map(|e| e as *mut WEBAUTHN_CREDENTIAL_EX).collect();
    let mut allow_list = WEBAUTHN_CREDENTIAL_LIST { cCredentials: allow_ptrs.len() as u32, ppCredentials: allow_ptrs.as_mut_ptr() };
    let mut cancel_guid = cancel_id.unwrap_or_else(GUID::zeroed);

    // SAFETY: plain C struct, zero = "not given" (see make_credential).
    let mut opts: WEBAUTHN_AUTHENTICATOR_GET_ASSERTION_OPTIONS = unsafe { std::mem::zeroed() };
    opts.dwVersion = GET_ASSERTION_OPTIONS_VERSION;
    opts.dwTimeoutMilliseconds = options.timeout_ms;
    opts.dwAuthenticatorAttachment = ATTACHMENT_ANY;
    opts.dwUserVerificationRequirement = USER_VERIFICATION_REQUIRED;
    if cancel_id.is_some() {
        opts.pCancellationId = &mut cancel_guid;
    }
    if !allow_ptrs.is_empty() {
        opts.pAllowCredentialList = &mut allow_list;
    }

    let mut out: *mut WEBAUTHN_ASSERTION = std::ptr::null_mut();
    // SAFETY: as in make_credential; `out` is freed with WebAuthNFreeAssertion below.
    let hr = unsafe { (api.get)(HWND(hwnd as *mut core::ffi::c_void), PCWSTR(rp_id.as_ptr()), &client, &opts, &mut out) };
    if hr.is_err() {
        return Err(CallError::of(api, hr));
    }
    if out.is_null() {
        return Err(CallError::code("failed"));
    }
    // SAFETY: `out` is a valid assertion until it is freed below.
    let (credential_id, authenticator_data, signature, user_handle, transports) = unsafe {
        let a = &*out;
        let parts = (
            bytes(a.Credential.pbId, a.Credential.cbId),
            bytes(a.pbAuthenticatorData, a.cbAuthenticatorData),
            bytes(a.pbSignature, a.cbSignature),
            bytes(a.pbUserId, a.cbUserId),
            if a.dwVersion >= 4 { a.dwUsedTransport } else { 0 },
        );
        (api.free_assertion)(out);
        parts
    };
    if credential_id.is_empty() || authenticator_data.is_empty() || signature.is_empty() {
        return Err(CallError::code("failed"));
    }
    let handle = (!user_handle.is_empty()).then_some(user_handle.as_slice());
    Ok(crate::assertion_response(&credential_id, &client_data, &authenticator_data, &signature, handle, transports))
}
