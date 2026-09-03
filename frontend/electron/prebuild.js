const fs = require('fs');
const path = require('path');

// Clean electron-builder cache before build
const caches = [
  path.join(process.env.APPDATA || process.env.HOME, 'electron-builder'),
  path.join(process.env.TEMP || '/tmp', 'electron-builder'),
  path.join(__dirname, 'node_modules', '.cache')
];

caches.forEach(c => {
  try {
    if (fs.existsSync(c)) {
      fs.rmSync(c, { recursive: true, force: true });
      console.log('Cleaned:', c);
    }
  } catch (e) {
    console.log('Skip:', c);
  }
});

console.log('Prebuild complete');
