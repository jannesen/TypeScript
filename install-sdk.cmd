#@ echo off
pause # Create symbolic links

set VERSION=3.7
set SDK_ROOT=C:\Program Files (x86)\Microsoft SDKs\TypeScript
set SDK_ROOT_VERSION=%SDK_ROOT%\%VERSION%
set TYPESCRIPT_LIB=%~dp0lib

cd %TYPESCRIPT_LIB%
%~d0

if exist "%SDK_ROOT%\%VERSION%-org" goto org_exists
move "%SDK_ROOT%\%VERSION%" "%SDK_ROOT%\%VERSION%-org"
:org_exists

if not exist "%SDK_ROOT_VERSION%" mkdir "%SDK_ROOT_VERSION%"

for %%n in (tsc.js tsserver.js typingsInstaller.js watchGuard.js cancellationToken.js lib.* typesMap.json diagnosticMessages.generated.json) do (
	if exist "%SDK_ROOT_VERSION%\%%n"  del /q "%SDK_ROOT_VERSION%\%%n"
	mklink  "%SDK_ROOT_VERSION%\%%n"   "%TYPESCRIPT_LIB%\%%n"
)

for %%n in (build node_modules) do (
	if exist "%SDK_ROOT_VERSION%\%%n"  rd /q "%SDK_ROOT_VERSION%\%%n"
	mklink /d "%SDK_ROOT_VERSION%\%%n" "%SDK_ROOT_VERSION%-org\%%n"
)

echo "Done"
pause