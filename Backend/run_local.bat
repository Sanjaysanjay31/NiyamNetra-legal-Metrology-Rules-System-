@echo off
REM ---------------------------------------------------------------------------
REM run_local.bat - start the NiyamNetra backend for local testing.
REM
REM The one thing that matters here is --host 0.0.0.0. uvicorn's default is
REM 127.0.0.1, which accepts connections only from this laptop; from a phone
REM that looks exactly like "cannot reach the backend", even though the server
REM is running fine. 0.0.0.0 means "every network interface on this machine".
REM ---------------------------------------------------------------------------
setlocal
cd /d "%~dp0"

if not exist "niyamnetra_venv\Scripts\activate.bat" (
  echo [x] niyamnetra_venv was not found next to this script.
  echo     Create it once:
  echo         python -m venv niyamnetra_venv
  echo         niyamnetra_venv\Scripts\python -m pip install -r requirements.txt
  pause
  exit /b 1
)
call "niyamnetra_venv\Scripts\activate.bat"

echo.
echo === This laptop's addresses ===
ipconfig | findstr /c:"IPv4 Address"
echo.
echo On the laptop  : http://127.0.0.1:8000/docs
echo From the phone : http://^<the Wi-Fi IPv4 above^>:8000/health
echo                  ^(type that IP into the app's Custom backend field^)
echo.
echo If the phone still cannot connect, port 8000 is blocked. Run ONCE in an
echo admin PowerShell:
echo     New-NetFirewallRule -DisplayName "NiyamNetra API 8000" -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow -Profile Private,Domain
echo.

uvicorn main:app --host 0.0.0.0 --port 8000 --reload

endlocal
