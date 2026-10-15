/**
 * Windows update launch.
 *
 * electron-updater's quitAndInstall spawns NSIS and only then quits. NSIS
 * then replaces Descall.exe and ffmpeg.dll while this process may still have
 * them mapped. A half-written or previous-Electron ffmpeg.dll makes the new
 * exe fail at startup with 0xc000007b. The launcher below waits until
 * Descall.exe is gone, runs the installer, and if the new process never
 * writes boot-ok, runs one clean reinstall.
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

function buildRecoveryCmd({ installerPath, bootOkPath, version, forceRun, productExe }) {
  const exe = productExe || "Descall.exe";
  // %1 %2 %3 are the call :install arguments. %* is the batch file's own
  // arguments, which are empty here, so it must not be used.
  const lines = [
    "@echo off",
    "setlocal EnableExtensions",
    `set "EXE=${exe}"`,
    `set "SETUP=${installerPath}"`,
    `set "BOOT=${bootOkPath}"`,
    `set "WANT=${version}"`,
    "set /a TRIES=0",
    ":wait",
    'tasklist /FI "IMAGENAME eq %EXE%" | find /I "%EXE%" >nul',
    "if errorlevel 1 goto gone",
    "set /a TRIES+=1",
    "if %TRIES% GEQ 40 (",
    '  taskkill /f /im "%EXE%" >nul 2>&1',
    "  ping -n 3 127.0.0.1 >nul",
    "  goto gone",
    ")",
    "ping -n 2 127.0.0.1 >nul",
    "goto wait",
    ":gone",
    ...(forceRun
      ? [
          "call :install --updated --force-run",
          "call :poll",
          "if not errorlevel 1 exit /b 0",
          "call :install --descall-clean=1 --updated --force-run",
          "call :poll",
          "if not errorlevel 1 exit /b 0",
          `start "" "${CLEAN_DOWNLOAD_URL}"`,
          "exit /b 1",
        ]
      : [
          "call :install --updated",
          "if not errorlevel 1 goto done",
          "call :install --descall-clean=1 --updated",
          "if not errorlevel 1 goto done",
          `start "" "${CLEAN_DOWNLOAD_URL}"`,
          "exit /b 1",
          ":done",
          "exit /b 0",
        ]),
    ":install",
    '"%SETUP%" /S %1 %2 %3',
    "exit /b",
    ":poll",
    "set /a N=0",
    ":pollloop",
    'findstr /x /c:"%WANT%" "%BOOT%" >nul',
    "if not errorlevel 1 exit /b 0",
    "set /a N+=1",
    "if %N% GEQ 45 exit /b 1",
    "ping -n 2 127.0.0.1 >nul",
    "goto pollloop",
  ];
  return `${lines.join("\r\n")}\r\n`;
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
  const cmdPath = path.join(os.tmpdir(), `descall-update-${process.pid}-${Date.now()}.cmd`);
  fs.writeFileSync(
    cmdPath,
    buildRecoveryCmd({ installerPath, bootOkPath, version, forceRun, productExe }),
    "utf8",
  );
  const child = spawn("cmd.exe", ["/d", "/c", cmdPath], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
  if (log && typeof log.info === "function") {
    log.info(`[updater] installer waits for ${productExe || "Descall.exe"} to exit, then runs ${installerPath}`);
  }
  return cmdPath;
}

module.exports = {
  CLEAN_DOWNLOAD_URL,
  assertDownloadedInstaller,
  buildRecoveryCmd,
  launchUpdateAfterExit,
};
