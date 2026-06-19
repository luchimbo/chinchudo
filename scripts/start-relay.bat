@echo off
cd /d D:\pcmidi-suite
title PC MIDI Relay

:loop
echo [%date% %time%] Arrancando relay...
npm run relay:start
echo [%date% %time%] El relay se detuvo. Reiniciando en 10 segundos...
timeout /t 10 /nobreak >nul
goto loop
