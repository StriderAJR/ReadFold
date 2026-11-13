@echo off
setlocal
pushd "%~dp0"
if errorlevel 1 exit /b 1

node --version >nul 2>&1
if not errorlevel 1 goto node_ready

rem Try installed runtimes when the Windows nvm shim is inactive.
for /d %%D in ("%LOCALAPPDATA%\Author Software\nvm\installs\v*") do (
    call :try_node "%%~fD"
    if not errorlevel 1 goto node_ready
)
echo ERROR: Node.js is unavailable. Install or activate Node.js 24 LTS.
goto failed

:node_ready
if not exist "node_modules\vite\bin\vite.js" (
    echo ERROR: Dependencies are missing. Run npm ci in this folder first.
    goto failed
)

echo Starting ReadFold at http://127.0.0.1:5173/ReadFold/
echo Keep this window open. Press Ctrl+C to stop the server.
node node_modules\vite\bin\vite.js --host 127.0.0.1 --port 5173 --strictPort --open /ReadFold/
if errorlevel 1 goto failed
popd
pause
exit /b 0

:failed
echo.
echo FAILED: Read the error above before trying again.
popd
pause
exit /b 1

:try_node
"%~1\node.exe" --version >nul 2>&1
if errorlevel 1 exit /b 1
set "PATH=%~1;%PATH%"
exit /b 0
