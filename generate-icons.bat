@echo off
echo Creating placeholder icons...
echo.

REM Create a simple PowerShell script to generate icons
powershell -Command ^
"Add-Type -AssemblyName System.Drawing; ^
$sizes = @(16, 48, 128); ^
foreach ($size in $sizes) { ^
    $bmp = New-Object System.Drawing.Bitmap($size, $size); ^
    $graphics = [System.Drawing.Graphics]::FromImage($bmp); ^
    $graphics.Clear([System.Drawing.Color]::FromArgb(76, 175, 80)); ^
    $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, [Math]::Max(2, $size/16)); ^
    $pen.StartCap = 'Round'; ^
    $pen.EndCap = 'Round'; ^
    $scale = $size / 128; ^
    $graphics.DrawLine($pen, 40*$scale, 50*$scale, 60*$scale, 70*$scale); ^
    $graphics.DrawLine($pen, 60*$scale, 70*$scale, 88*$scale, 40*$scale); ^
    $graphics.Dispose(); ^
    $bmp.Save('icons\icon' + $size + '.png', [System.Drawing.Imaging.ImageFormat]::Png); ^
    $bmp.Dispose(); ^
    Write-Host \"Created icons\icon$size.png\"; ^
}"

echo.
echo Done! Icons created in the icons folder.
echo You can now load the extension in Chrome/Edge.
pause
