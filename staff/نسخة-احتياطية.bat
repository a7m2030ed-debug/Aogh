@echo off
chcp 65001 >nul
title نسخة احتياطية — نظام إدارة الموظفين
cd /d "%~dp0server"

echo.
echo   أخذ نسخة احتياطية…
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   [x] لم يُعثر على Node.js. شغّل «تشغيل-ويندوز.bat» أولًا.
  pause
  exit /b 1
)

node tools/backup-now.js
if errorlevel 1 (
  echo.
  echo   [x] تعذّر أخذ النسخة.
  pause
  exit /b 1
)

echo.
echo   انسخ الملفات التي ستُفتح الآن إلى فلاش أو مجلد سحابي.
echo   نسخة على نفس الجهاز لا تنجو من عطب الجهاز.
echo.
start "" "%~dp0server\backups"
pause
