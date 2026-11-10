@echo off
rem qram-walkers on Windows: double-click this file to start the app.
rem The page opens in your browser. Close this window, or press Ctrl+C in it, to stop the app.
cd /d "%~dp0engine"
uv run qramsim app
if errorlevel 1 (
  echo.
  echo qram-walkers did not start: see the message above and INSTALL.md.
  pause
)
