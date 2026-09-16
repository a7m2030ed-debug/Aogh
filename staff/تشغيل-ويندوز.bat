@echo off
chcp 65001 >nul
title نظام إدارة الموظفين
setlocal

rem =====================================================================
rem  تشغيل النظام على جهاز ويندوز — بلا نطاق ولا استضافة
rem  ---------------------------------------------------------------------
rem  انقر هذا الملف نقرًا مزدوجًا. يفتح النظام في المتصفح، ويبقى يعمل
rem  ما دامت هذه النافذة مفتوحة. لإيقافه: أغلق النافذة.
rem =====================================================================

cd /d "%~dp0server"
set PORT=3000

echo.
echo   نظام إدارة الموظفين
echo   ----------------------------------------------------------
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   [x] لم يُعثر على Node.js على هذا الجهاز.
  echo.
  echo       نزّله مرة واحدة من:  https://nodejs.org
  echo       اختر النسخة المكتوب عليها LTS، وثبّتها بالضغط على Next،
  echo       ثم شغّل هذا الملف من جديد.
  echo.
  pause
  exit /b 1
)

node -e "require('node:sqlite')" >nul 2>nul
if errorlevel 1 (
  echo   [x] نسخة Node.js قديمة ولا تحمل قاعدة البيانات المدمجة.
  echo.
  echo       حدّثها من https://nodejs.org  ^(نسخة 22 أو أحدث^)
  echo       ثم شغّل هذا الملف من جديد.
  echo.
  pause
  exit /b 1
)

if not exist ".env" (
  echo   أول تشغيل: يُنشأ ملف الإعدادات…
  (
    echo NODE_ENV=production
    echo LAN=1
    echo PORT=%PORT%
    echo HOST=0.0.0.0
    echo DATA_DIR=data
    echo BACKUP_DIR=backups
    echo BACKUP_HOUR=2
    echo BACKUP_RETENTION_DAYS=60
    echo SESSION_IDLE_MINUTES=60
    echo ADMIN_USERNAME=admin
  ) > .env
  echo   تمّ. كلمة مرور أول دخول ستظهر بعد قليل — احفظها.
  echo.
)

rem فتح المتصفح بعد أن يُقلع الخادم
start "" /b cmd /c "timeout /t 4 >nul & start "" http://localhost:%PORT%"

node server.js

echo.
echo   توقّف النظام.
pause
