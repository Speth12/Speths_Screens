@echo off
set PATH=%PATH%;C:\Program Files\Go\bin
cd /d "%~dp0\.."
go run ./cmd/spike
