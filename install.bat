@echo off
REM MemoryForge Installer (Windows batch wrapper)
REM Usage: install.bat [target-dir] [--global] [--with-team] [--with-vector] [--with-graph] [--full]
REM Docs: https://github.com/marolinik/MemoryForge
powershell -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
