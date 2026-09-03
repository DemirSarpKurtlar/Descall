# Build and Deployment Instructions

## Electron App Build (Windows)

### Manual Build
```bash
cd frontend/electron
npm install
npm run build:win
```

Setup file will be created at: `frontend/electron/dist/Descall Setup 1.0.0.exe`

### Automated Build and Push

Use the provided batch script to build and push in one step:

```bash
push-with-build.bat
```

This script will:
1. Build the Electron app for Windows
2. Copy the setup file to project root
3. Commit and push to GitHub
4. Remind you to upload to Google Drive

## Deployment Flow

1. **Build the app**
   ```bash
   push-with-build.bat
   ```

2. **Upload to Google Drive**
   - Upload `Descall-Setup.exe` to Google Drive
   - Get the shareable link

3. **Update Download Page**
   - Edit `frontend/src/components/download/DownloadPage.jsx`
   - Update the `DOWNLOAD_LINKS` object:
   ```javascript
   const DOWNLOAD_LINKS = {
     windows: "https://drive.google.com/file/d/YOUR_FILE_ID/view",
     mac: null,
     linux: null
   };
   ```

4. **Deploy to Render**
   - Push changes to GitHub
   - Render will auto-deploy

## Notes

- Setup files are excluded from Git (see `.gitignore`)
- Use Google Drive or Dropbox for hosting setup files
- Update version number in `DownloadPage.jsx` when releasing new versions
