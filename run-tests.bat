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
if not exist "node_modules\vitest\vitest.mjs" (
    echo ERROR: Dependencies are missing. Run npm ci in this folder first.
    goto failed
)

call npm run test:content
if errorlevel 1 goto failed
call npm test
if errorlevel 1 goto failed
call npm run test:deployment
if errorlevel 1 goto failed
call npm run test:sql
if errorlevel 1 goto failed
call npm run test:e2e
if errorlevel 1 goto failed

echo.
echo SUCCESS: All test suites passed.
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
