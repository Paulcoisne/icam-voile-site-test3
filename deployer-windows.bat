@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo === Publication du site Icam Voile Lille sur Netlify ===
where node >nul 2>nul || (echo Node.js n'est pas installe. Telechargez-le sur https://nodejs.org puis relancez ce fichier. & pause & exit /b)
call npm install
call npx --yes netlify-cli deploy --build --prod
pause
