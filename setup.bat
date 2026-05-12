@echo off
REM Order Management System Setup Script
REM Run this script to install dependencies and start the development server

echo.
echo ========================================
echo Order Management System (OMS) Setup
echo ========================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed!
    echo.
    echo Please install Node.js from: https://nodejs.org/
    echo.
    echo After installing Node.js:
    echo 1. Close this command prompt
    echo 2. Open a NEW command prompt
    echo 3. Run this script again
    echo.
    pause
    exit /b 1
)

echo [OK] Node.js found: 
node --version
npm --version
echo.

REM Check if node_modules exists
if not exist "node_modules\" (
    echo [INSTALL] Installing dependencies...
    echo.
    call npm install
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Failed to install dependencies
        pause
        exit /b 1
    )
) else (
    echo [OK] Dependencies already installed
)

echo.
echo [SUCCESS] Setup complete!
echo.
echo Starting development server...
echo.
echo The app will be available at: http://localhost:3000
echo Press Ctrl+C to stop the server
echo.

call npm run dev
