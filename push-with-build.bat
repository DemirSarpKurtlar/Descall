@echo off
echo ========================================
echo Build and Push Script
echo ========================================
echo.

REM Step 1: Build Electron app
echo Step 1: Building Electron app...
cd frontend\electron
call npm run build:win

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo BUILD FAILED! Aborting.
    pause
    exit /b 1
)

echo.
echo BUILD SUCCESSFUL!
echo.

REM Step 2: Check if setup file exists
if not exist "dist\Descall Setup 1.0.0.exe" (
    echo ERROR: Setup file not found!
    pause
    exit /b 1
)

REM Step 3: Copy setup to project root
echo Step 2: Copying setup file to project root...
copy "dist\Descall Setup 1.0.0.exe" "..\..\Descall-Setup.exe" /Y

cd ..\..

REM Step 4: Git add, commit, push
echo Step 3: Committing and pushing to GitHub...
git add -A
git commit -m "Build and update setup file"
git push

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo SUCCESS!
    echo ========================================
    echo.
    echo IMPORTANT: Upload Descall-Setup.exe to Google Drive
    echo Then update DOWNLOAD_LINKS in DownloadPage.jsx
    echo.
) else (
    echo.
    echo Git push failed. Please check your connection.
)

pause
