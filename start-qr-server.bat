@echo off
chcp 65001 >nul
cd /d "C:\Users\SISMADAK\Web\rsud-hadir-qr"

:: Kill any existing PM2 daemon to avoid conflicts
pm2 kill >nul 2>&1

:: Start the app
pm2 start ecosystem.config.cjs

:: Save the process list so PM2 remembers it
pm2 save

:: Optional: keep the window open for a few seconds so you can see the result
timeout /t 3 /nobreak >nul
