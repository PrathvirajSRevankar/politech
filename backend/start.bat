@echo off
echo ====================================================
echo  POLITECH Backend — Setup ^& Launch Script
echo ====================================================
echo.

:: Step 1 — Install Python dependencies
echo [1/3] Installing Python dependencies...
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo ERROR: pip install failed. Check your internet connection.
    pause
    exit /b 1
)

echo.
echo [2/3] Dependencies installed successfully!
echo.

:: Step 2 — Seed the database
echo [3/3] Seeding database...
python seed.py
if %errorlevel% neq 0 (
    echo WARNING: Seed failed. DB may not be running or .env needs updating.
)

echo.
echo ====================================================
echo  Starting POLITECH API server on http://localhost:8000
echo  API Docs: http://localhost:8000/docs
echo ====================================================
echo.

:: Start the server
uvicorn main:app --reload --host 0.0.0.0 --port 8000

