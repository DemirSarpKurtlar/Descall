@echo off
echo ========================================
echo Building Electron App Before Push
echo ========================================
echo.

cd frontend\electron
call npm run build:win

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo BUILD SUCCESSFUL!
    echo ========================================
    echo.
    echo Please upload the setup file to Google Drive:
    echo Location: frontend\electron\dist\Descall Setup 1.0.0.exe
    echo.
    echo Then update DOWNLOAD_LINKS in:
    echo frontend\src\components\download\DownloadPage.jsx
    echo.
    echo Press any key to continue with git push...
    pause >nul
) else (
    echo.
    echo ========================================
    echo BUILD FAILED!
    echo ========================================
    echo Please fix the errors before pushing.
    pause
    exit /b 1
)
