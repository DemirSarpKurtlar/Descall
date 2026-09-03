import { useState, useEffect, useCallback } from 'react';

export function useElectron() {
  const [isElectron, setIsElectron] = useState(false);
  const [appVersion, setAppVersion] = useState('');
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateDownloaded, setUpdateDownloaded] = useState(false);

  useEffect(() => {
    // Check if running in Electron
    const electron = window.electronAPI;
    if (electron) {
      setIsElectron(true);
      
      // Get app version
      electron.getVersion().then(version => {
        setAppVersion(version);
      });

      // Listen for updates
      electron.onUpdateAvailable(() => {
        setUpdateAvailable(true);
      });

      electron.onUpdateDownloaded(() => {
        setUpdateDownloaded(true);
      });

      return () => {
        electron.removeAllListeners('update-available');
        electron.removeAllListeners('update-downloaded');
      };
    }
  }, []);

  const checkForUpdates = useCallback(async () => {
    if (window.electronAPI) {
      return await window.electronAPI.checkForUpdates();
    }
  }, []);

  const minimizeWindow = useCallback(() => {
    if (window.electronAPI) {
      window.electronAPI.minimizeWindow();
    }
  }, []);

  const maximizeWindow = useCallback(() => {
    if (window.electronAPI) {
      window.electronAPI.maximizeWindow();
    }
  }, []);

  const closeWindow = useCallback(() => {
    if (window.electronAPI) {
      window.electronAPI.closeWindow();
    }
  }, []);

  return {
    isElectron,
    appVersion,
    updateAvailable,
    updateDownloaded,
    checkForUpdates,
    minimizeWindow,
    maximizeWindow,
    closeWindow,
    platform: window.electronAPI?.platform || 'web'
  };
}
