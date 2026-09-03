// Audio path resolver for both web and Electron
export function getAudioPath(filename) {
  // Electron environment
  if (window.electronAPI?.isElectron) {
    // In Electron, sounds are in extraResources (sounds folder)
    // Use relative path from the app
    return `sounds/${filename}`;
  }
  
  // Web environment - use absolute path from public
  return `/sounds/${filename}`;
}

// Preload all sounds with correct paths
export const SOUND_PATHS = {
  click: getAudioPath('click.mp3'),
  incomingCall: getAudioPath('incoming-call.mp3'),
  outgoingCall: getAudioPath('outgoing-call.mp3'),
  callStart: getAudioPath('call-start.mp3'),
  message: getAudioPath('message.mp3'),
  notification: getAudioPath('notification.mp3'),
  send: getAudioPath('send.mp3'),
  join: getAudioPath('join.mp3'),
  leave: getAudioPath('leave.mp3')
};
