@echo off
rem =========================================================
rem  ПОСЛЕДНЯЯ БАШНЯ — бат-файл запуска
rem  Использование:
rem    start.bat          собрать dist\index.html и открыть игру в браузере
rem    start.bat test     headless-тест игрового цикла
rem    start.bat balance  симуляция баланса (4 профиля игрока)
rem    start.bat shots    перегенерировать скриншоты (нужен Python + Pillow)
rem =========================================================
setlocal
cd /d "%~dp0"
title ПОСЛЕДНЯЯ БАШНЯ
color 0B

where node >nul 2>nul
if errorlevel 1 goto :no_node

if /i "%~1"=="test"    goto :run_test
if /i "%~1"=="balance" goto :run_balance
if /i "%~1"=="shots"   goto :run_shots

echo [1/2] Сборка dist\index.html ...
node build.js
if errorlevel 1 goto :fail
echo [2/2] Открываю игру в браузере ...
start "" "%~dp0dist\index.html"
echo Готово. Приятной обороны!
goto :eof

:run_test
node tests\headless.js
goto :eof

:run_balance
node tests\balance.js
goto :eof

:run_shots
node tests\snapshot.js mid
node tests\snapshot.js rich
where python >nul 2>nul
if errorlevel 1 (
  echo [!] Python не найден — JSON-снимки записаны, PNG пропущен.
  goto :eof
)
python tests\rasterize.py mid rich
goto :eof

:no_node
echo [!] Node.js не найден в PATH.
if exist "%~dp0dist\index.html" (
  echo     Открываю уже собранную dist\index.html ...
  start "" "%~dp0dist\index.html"
) else (
  echo     И собранной игры нет: установите Node.js https://nodejs.org
  pause
)
goto :eof

:fail
echo [!] Сборка завершилась с ошибкой.
pause
exit /b 1
