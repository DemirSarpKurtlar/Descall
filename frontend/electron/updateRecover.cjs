/**
 * Windows update launch.
 *
 * electron-updater's quitAndInstall spawns NSIS and only then quits. NSIS
 * then replaces Descall.exe and ffmpeg.dll while this process may still have
 * them mapped. A half-written or previous-Electron ffmpeg.dll makes the new
 * exe fail at startup with 0xc000007b. The launcher below waits until
 * Descall.exe is gone, runs the installer, and if the new process never
 * writes boot-ok, runs one clean reinstall. It is a GUI wscript host:
 * cmd.exe, tasklist, and find.exe each open a Windows Terminal window.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { readPeMachine } = require("./peArch.cjs");

const CLEAN_DOWNLOAD_URL =
  "https://github.com/DemirSarpKurtlar/Descall/releases/latest/download/Descall-Setup.exe";

function assertDownloadedInstaller(filePath, expectedSize) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error("update installer is missing");
  }
  const size = fs.statSync(filePath).size;
  const expected = Number(expectedSize);
  if (Number.isFinite(expected) && expected > 0 && size !== expected) {
    throw new Error(`update installer is incomplete (${size} bytes, expected ${expected})`);
  }
  if (size < 8 * 1024 * 1024) {
    throw new Error(`update installer is too small to be a full setup (${size} bytes)`);
  }
  const machine = readPeMachine(filePath);
  if (!machine) throw new Error("update installer is not a Windows executable");
  return { size, machine };
}

function vbsQuote(value) {
  return String(value ?? "").replace(/"/g, '""');
}

function buildRecoveryScript({ installerPath, bootOkPath, version, forceRun, productExe }) {
  const exe = vbsQuote(productExe || "Descall.exe");
  const setup = vbsQuote(installerPath);
  const boot = vbsQuote(bootOkPath);
  const want = vbsQuote(version);
  const url = vbsQuote(CLEAN_DOWNLOAD_URL);
  // wscript.exe is a GUI host. The old cmd script ran
  // `tasklist | find /I "Descall.exe"`, and each retry opened a visible
  // Windows Terminal window with that title. WMI queries the process list
  // in-process, so install / launch / quit never allocates a console.
  // A relaunch trusts boot-ok, not the installer exit code: NSIS can
  // return 0 before the new process has written the marker. A quiet quit
  // trusts the installer exit code and does not poll or force the window up.
  const installAndFinish = forceRun
    ? [
        'RunSetup "--updated --force-run"',
        "If Poll() = 0 Then WScript.Quit 0",
        'RunSetup "--descall-clean=1 --updated --force-run"',
        "If Poll() = 0 Then WScript.Quit 0",
        "OpenDownload",
        "WScript.Quit 1",
      ]
    : [
        'If RunSetup("--updated") = 0 Then WScript.Quit 0',
        'If RunSetup("--descall-clean=1 --updated") = 0 Then WScript.Quit 0',
        "OpenDownload",
        "WScript.Quit 1",
      ];
  // forceRun used to ignore the installer exit code and only trust boot-ok.
  // A quiet quit trusts the installer exit code and does not relaunch.
  const lines = [
    "Option Explicit",
    "Dim exeName, setup, boot, want, tries, sh, svc",
    `exeName = "${exe}"`,
    `setup = "${setup}"`,
    `boot = "${boot}"`,
    `want = "${want}"`,
    'Set sh = CreateObject("WScript.Shell")',
    'Set svc = GetObject("winmgmts:\\\\.\\root\\cimv2")',
    "Function IsRunning()",
    "  IsRunning = False",
    "  On Error Resume Next",
    "  Dim procs",
    '  Set procs = svc.ExecQuery("SELECT ProcessId FROM Win32_Process WHERE Name=\'" & exeName & "\'")',
    "  If Err.Number = 0 Then",
    "    If procs.Count > 0 Then IsRunning = True",
    "  End If",
    "  On Error GoTo 0",
    "End Function",
    "Sub KillImage()",
    "  On Error Resume Next",
    "  Dim procs, proc",
    '  Set procs = svc.ExecQuery("SELECT * FROM Win32_Process WHERE Name=\'" & exeName & "\'")',
    "  For Each proc In procs",
    "    proc.Terminate",
    "  Next",
    "  On Error GoTo 0",
    "End Sub",
    "tries = 0",
    "Do While IsRunning()",
    "  tries = tries + 1",
    "  If tries >= 40 Then",
    "    KillImage",
    "    WScript.Sleep 2000",
    "    Exit Do",
    "  End If",
    "  WScript.Sleep 1000",
    "Loop",
    "WScript.Sleep 800",
    "Function RunSetup(extra)",
    "  Dim cmd",
    '  cmd = """" & setup & """ /S " & extra',
    "  RunSetup = sh.Run(cmd, 0, True)",
    "End Function",
    "Function BootOk()",
    "  BootOk = False",
    "  Dim fso, ts, text, lines, i",
    '  Set fso = CreateObject("Scripting.FileSystemObject")',
    "  If Not fso.FileExists(boot) Then Exit Function",
    "  Set ts = fso.OpenTextFile(boot, 1, False)",
    "  If ts.AtEndOfStream Then",
    '    text = ""',
    "  Else",
    "    text = ts.ReadAll",
    "  End If",
    "  ts.Close",
    "  lines = Split(Replace(text, vbCrLf, vbLf), vbLf)",
    "  For i = 0 To UBound(lines)",
    "    If lines(i) = want Then",
    "      BootOk = True",
    "      Exit Function",
    "    End If",
    "  Next",
    "End Function",
    "Function Poll()",
    "  Dim n",
    "  Poll = 1",
    "  For n = 1 To 45",
    "    If BootOk() Then",
    "      Poll = 0",
    "      Exit Function",
    "    End If",
    "    WScript.Sleep 1000",
    "  Next",
    "End Function",
    "Sub OpenDownload()",
    `  sh.Run "${url}", 1, False`,
    "End Sub",
    ...installAndFinish,
  ];
  return `${lines.join("\r\n")}\r\n`;
}

// Kept so older callers and the selftest still name the recovery script.
function buildRecoveryCmd(opts) {
  return buildRecoveryScript(opts);
}

function launchUpdateAfterExit({
  installerPath,
  expectedSize,
  bootOkPath,
  version,
  forceRun,
  productExe,
  log,
}) {
  assertDownloadedInstaller(installerPath, expectedSize);
  if (!version) throw new Error("update version is missing");
  if (!bootOkPath) throw new Error("boot-ok path is missing");
  fs.mkdirSync(path.dirname(bootOkPath), { recursive: true });
  const scriptPath = path.join(os.tmpdir(), `descall-update-${process.pid}-${Date.now()}.vbs`);
  fs.writeFileSync(
    scriptPath,
    buildRecoveryScript({ installerPath, bootOkPath, version, forceRun, productExe }),
    "utf8",
  );
  // wscript.exe is a GUI subsystem process. cmd.exe / tasklist / find.exe
  // are not: Windows Terminal shows a window for each of them.
  const child = spawn("wscript.exe", ["//nologo", "//B", scriptPath], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
  if (log && typeof log.info === "function") {
    log.info(`[updater] installer waits for ${productExe || "Descall.exe"} to exit, then runs ${installerPath}`);
  }
  return scriptPath;
}

module.exports = {
  CLEAN_DOWNLOAD_URL,
  assertDownloadedInstaller,
  buildRecoveryCmd,
  buildRecoveryScript,
  launchUpdateAfterExit,
};
