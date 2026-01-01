@echo off
echo ================================================================
echo   Image Link Converter - Quick Install
echo ================================================================
echo.

REM Get the current directory path
set EXTENSION_PATH=%~dp0
set EXTENSION_PATH=%EXTENSION_PATH:~0,-1%

echo Extension location: %EXTENSION_PATH%
echo.

REM Check if Chrome is installed
set CHROME_PATH=
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    set CHROME_PATH=%ProgramFiles%\Google\Chrome\Application\chrome.exe
) else if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    set CHROME_PATH=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe
) else if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" (
    set CHROME_PATH=%LocalAppData%\Google\Chrome\Application\chrome.exe
)

REM Check if Edge is installed
set EDGE_PATH=
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
    set EDGE_PATH=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe
) else if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
    set EDGE_PATH=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe
)

echo Detected browsers:
if defined CHROME_PATH (
    echo [X] Google Chrome found
) else (
    echo [ ] Google Chrome not found
)
if defined EDGE_PATH (
    echo [X] Microsoft Edge found
) else (
    echo [ ] Microsoft Edge not found
)
echo.

REM Ask user which browser
echo Which browser do you want to use?
echo [1] Google Chrome
echo [2] Microsoft Edge
echo [3] Open extensions page manually
echo.
choice /C 123 /N /M "Enter choice (1-3): "

if errorlevel 3 goto MANUAL
if errorlevel 2 goto EDGE
if errorlevel 1 goto CHROME

:CHROME
if not defined CHROME_PATH (
    echo ERROR: Chrome not found!
    goto MANUAL
)
echo.
echo Opening Chrome extensions page...
start "" "%CHROME_PATH%" chrome://extensions/
goto INSTRUCTIONS

:EDGE
if not defined EDGE_PATH (
    echo ERROR: Edge not found!
    goto MANUAL
)
echo.
echo Opening Edge extensions page...
start "" "%EDGE_PATH%" edge://extensions/
goto INSTRUCTIONS

:MANUAL
echo.
echo Please open your browser and navigate to:
echo   Chrome: chrome://extensions/
echo   Edge:   edge://extensions/
echo.
pause
goto INSTRUCTIONS

:INSTRUCTIONS
echo.
echo ================================================================
echo   INSTALLATION STEPS:
echo ================================================================
echo.
echo 1. In the browser window that just opened:
echo    - Turn ON "Developer mode" (toggle in top-right corner)
echo.
echo 2. Click "Load unpacked" button
echo.
echo 3. In the folder selection dialog, navigate to:
echo    %EXTENSION_PATH%
echo.
echo 4. Click "Select Folder"
echo.
echo 5. Done! The extension icon will appear in your toolbar
echo.
echo ================================================================
echo.
echo TIP: The extension folder path has been copied to your clipboard!
echo      You can paste it (Ctrl+V) in the folder dialog.
echo.

REM Copy path to clipboard
echo %EXTENSION_PATH% | clip

echo Press any key to open the extension folder...
pause >nul

REM Open the folder so they can verify location
explorer "%EXTENSION_PATH%"

echo.
echo Installation folder opened. Use this path when selecting the folder.
echo.
pause
