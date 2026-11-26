@echo off
rem Double-click launcher for Windows: starts the local server and opens the
rem default browser. Equivalent to:  python serve.py
setlocal
cd /d "%~dp0"

rem Prefer the official py launcher, then a real python/python3.
rem The "-c import sys" probe rejects the Microsoft Store stub, which would
rem otherwise open the Store instead of running the server.
where py >nul 2>nul
if %errorlevel%==0 (
    py -3 serve.py %*
    goto :end
)

python -c "import sys" >nul 2>nul
if %errorlevel%==0 (
    python serve.py %*
    goto :end
)

python3 -c "import sys" >nul 2>nul
if %errorlevel%==0 (
    python3 serve.py %*
    goto :end
)

echo.
echo   Python 3 not found.  /  未找到可用的 Python 3。
echo   Install it from https://www.python.org/downloads/
echo   or run any static server, e.g.:  npx serve .
echo.
pause

:end
