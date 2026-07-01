@echo off
title People Prime ATS Control Center
echo ====================================================
echo   PEOPLE PRIME ATS - AUTOMATED SERVICES LAUNCHER
echo ====================================================
echo.

:: 1. Start Redis in WSL
echo [1/4] Starting Redis Server in WSL...
wsl -d Ubuntu -u root service redis-server start
echo Redis Service checked.
echo ----------------------------------------------------

:: 2. Start Celery Worker in a new window
echo [2/4] Starting Celery Background Task Worker...
start "ATS Celery Worker" cmd /k "cd /d C:\ATS\backend && celery -A ats_backend worker --loglevel=info --pool=solo"
echo Celery Worker launched in background window.
echo ----------------------------------------------------

:: 3. Start Django Server in a new window
echo [3/4] Starting Django API Server...
start "ATS Django API" cmd /k "cd /d C:\ATS\backend && python manage.py runserver"
echo Django Backend Server launched in background window.
echo ----------------------------------------------------

:: 4. Start Vite Frontend in a new window
echo [4/4] Starting Vite Frontend Server...
start "ATS React Frontend" cmd /k "cd /d C:\ATS\frontend && npm run dev"
echo Vite Frontend Server launched in background window.
echo ----------------------------------------------------

echo ====================================================
echo   All services have been successfully initiated!
echo   - Frontend: http://localhost:3000
echo   - Backend API: http://localhost:8000
echo ====================================================
echo.
pause
