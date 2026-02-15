@echo off
REM MemoryForge Installer (Windows batch wrapper)
REM Usage: install.bat [flags]
REM   Install:   install.bat -TargetDir "C:\project" [-WithTeam] [-WithVector] [-WithGraph] [-Full] [-Global]
REM   Dry run:   install.bat -TargetDir "C:\project" -DryRun
REM   No CLAUDE.md: install.bat -TargetDir "C:\project" -NoClaudeMd
REM   Uninstall: install.bat -TargetDir "C:\project" -Uninstall
REM Docs: https://github.com/marolinik/MemoryForge
powershell -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
