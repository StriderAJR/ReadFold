@echo off
pushd "%~dp0"
node scripts\publish-docs.mjs --publish-only
set "publish_exit_code=%errorlevel%"
popd
exit /b %publish_exit_code%
