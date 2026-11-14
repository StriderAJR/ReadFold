@echo off
call "%~dp0publish-docs.bat" --skip-tests
exit /b %errorlevel%
