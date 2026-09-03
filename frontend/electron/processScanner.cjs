'use strict';

const { exec } = require('child_process');
const { ipcMain } = require('electron');

// Inlined minimal blocklist for main process (renderer has full version)
const BLOCKLIST = new Set([
  'svchost.exe','runtimebroker.exe','system','registry','smss.exe','csrss.exe',
  'wininit.exe','winlogon.exe','services.exe','lsass.exe','dwm.exe','explorer.exe',
  'taskhostw.exe','sihost.exe','fontdrvhost.exe','searchhost.exe','searchindexer.exe',
  'searchapp.exe','ctfmon.exe','audiodg.exe','wuauclt.exe','msiexec.exe','spoolsv.exe',
  'dllhost.exe','conhost.exe','backgroundtaskhost.exe','msmpeng.exe','nissrv.exe',
  'igfxcuiservice.exe','igfxem.exe','nvdisplay.container.exe','nvcontainer.exe',
  'textinputhost.exe','sppsvc.exe','usocoreworker.exe','startmenuexperiencehost.exe',
  'shellexperiencehost.exe','applicationframehost.exe','systemsettings.exe',
  'lockapp.exe','logonui.exe','werfault.exe','wermgr.exe','ngen.exe','ngentask.exe',
  'microsoftedgeupdate.exe','googleupdate.exe','crashreporter.exe','updater.exe',
  'setup.exe','unins000.exe','uninstall.exe','installer.exe','compattelrunner.exe',
  'cmd.exe','powershell.exe','pwsh.exe','windowsterminal.exe','windows terminal.exe',
  'wt.exe','openconsole.exe','notepad.exe','calc.exe','calculator.exe','calculatorapp.exe',
  'snippingtool.exe','screensketch.exe','mmc.exe','control.exe','regedit.exe',
  'bash.exe','wsl.exe','wslhost.exe','widgets.exe','widgetservice.exe',
  'msedgewebview2.exe','securityhealthhost.exe','smartscreen.exe','searchui.exe',
  'gamebar.exe','gamebarftw.exe',
]);

/**
 * Returns a deduplicated list of running process names (lowercase .exe),
 * filtered against the system blocklist.
 */
function getRawProcessList() {
  return new Promise((resolve) => {
    // /fo csv = CSV format, /nh = no header row
    exec('tasklist /fo csv /nh', { timeout: 8000, windowsHide: true }, (err, stdout) => {
      if (err) return resolve([]);
      const names = new Set();
      for (const line of stdout.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        // CSV format: "process.exe","pid","session","num","mem"
        const match = trimmed.match(/^"([^"]+)"/);
        if (!match) continue;
        const name = match[1].toLowerCase();
        if (!BLOCKLIST.has(name)) names.add(name);
      }
      resolve([...names]);
    });
  });
}

function registerProcessScannerIPC() {
  ipcMain.handle('scan-processes', async () => {
    try {
      return await getRawProcessList();
    } catch {
      return [];
    }
  });
}

module.exports = { registerProcessScannerIPC };
