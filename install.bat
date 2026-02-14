@echo off
REM MemoryForge Installer (Windows batch wrapper)
REM Delegates to PowerShell installer
powershell -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
