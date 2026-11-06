/**
 * Type priority for when multiple processes are detected simultaneously.
 * Kept apart from processDatabase.js so web/iOS (sidebar sort, activity view) do not
 * pull the ~128 KB process database into the App chunk; only the Electron scan loads it.
 */
export const TYPE_PRIORITY = ['game', 'music', 'creative', 'dev', 'communication', 'media', 'browser', 'launcher', 'productivity', 'app'];
