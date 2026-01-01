@echo off
setlocal enabledelayedexpansion

echo ========================================
echo  Image Link Converter - CRX Builder
echo ========================================
echo.

:: Check if Chrome is installed
set "CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME_PATH%" (
    set "CHROME_PATH=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
)

if not exist "%CHROME_PATH%" (
    echo ERROR: Chrome not found!
    echo Please install Google Chrome or update the CHROME_PATH in this script.
    pause
    exit /b 1
)

echo Chrome found at: %CHROME_PATH%
echo.

:: Get current directory
set "EXTENSION_DIR=%~dp0"
set "EXTENSION_DIR=%EXTENSION_DIR:~0,-1%"

:: Create output directory for builds
set "OUTPUT_DIR=%EXTENSION_DIR%\build"
if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"

:: Create temporary directory for packaging (exclude unnecessary files)
set "TEMP_DIR=%OUTPUT_DIR%\temp_package"
if exist "%TEMP_DIR%" rmdir /s /q "%TEMP_DIR%"
mkdir "%TEMP_DIR%"

echo Copying extension files...

:: Copy only necessary files for the extension
xcopy "%EXTENSION_DIR%\manifest.json" "%TEMP_DIR%\" /Y >nul
xcopy "%EXTENSION_DIR%\popup.html" "%TEMP_DIR%\" /Y >nul
xcopy "%EXTENSION_DIR%\popup.js" "%TEMP_DIR%\" /Y >nul
xcopy "%EXTENSION_DIR%\popup.css" "%TEMP_DIR%\" /Y >nul
xcopy "%EXTENSION_DIR%\background.js" "%TEMP_DIR%\" /Y >nul
xcopy "%EXTENSION_DIR%\icons" "%TEMP_DIR%\icons\" /E /I /Y >nul

echo Files copied successfully.
echo.

:: Create ZIP file (Chrome Web Store accepts ZIP, not CRX for manual upload)
set "ZIP_NAME=ImageURLConverter_Extension.zip"
set "ZIP_PATH=%OUTPUT_DIR%\%ZIP_NAME%"

:: Remove old ZIP if exists
if exist "%ZIP_PATH%" del "%ZIP_PATH%"

echo Creating ZIP package...

:: Use PowerShell to create ZIP
powershell -Command "Compress-Archive -Path '%TEMP_DIR%\*' -DestinationPath '%ZIP_PATH%' -Force"

if exist "%ZIP_PATH%" (
    echo.
    echo ========================================
    echo  SUCCESS!
    echo ========================================
    echo.
    echo ZIP package created: %ZIP_NAME%
    echo Location: %OUTPUT_DIR%
    echo.
    echo File size:
    dir "%ZIP_PATH%" | find "%ZIP_NAME%"
    echo.
    echo ----------------------------------------
    echo  NEXT STEPS:
    echo ----------------------------------------
    echo 1. Go to Chrome Web Store Developer Dashboard
    echo    https://chrome.google.com/webstore/devconsole
    echo.
    echo 2. Click "New Item" or update existing item
    echo.
    echo 3. Upload the ZIP file:
    echo    %ZIP_PATH%
    echo.
    echo 4. Fill in the store listing details
    echo.
    echo 5. Submit for review
    echo ========================================
) else (
    echo ERROR: Failed to create ZIP package!
    echo Please check if PowerShell is available.
)

:: Clean up temporary directory
echo.
echo Cleaning up temporary files...
rmdir /s /q "%TEMP_DIR%"

echo.
echo Opening build folder...
start "" "%OUTPUT_DIR%"

echo.
pause
