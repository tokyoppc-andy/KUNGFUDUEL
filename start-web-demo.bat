@echo off
cd /d "%~dp0"
set "PATH=C:\Users\tokyo\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;%PATH%"
set "NODE_EXE=C:\Users\tokyo\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
set "PORT=9002"
set "FALLBACK_IP=192.168.0.17"

for /f "usebackq delims=" %%I in (`node -e "const os=require('os');const nets=os.networkInterfaces();const ips=[];function isPrivate(ip){if(ip.startsWith('192.168.'))return true;if(ip.startsWith('10.'))return true;const p=ip.split('.');if(p[0]!=='172')return false;const allowed='16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31'.split(',');return allowed.indexOf(p[1])!==-1;}for(const list of Object.values(nets)){for(const item of list){if(!item)continue;if(item.family!=='IPv4')continue;if(item.internal)continue;if(item.address.startsWith('169.254.'))continue;ips.push(item.address);}}let ip='';for(const item of ips){if(isPrivate(item)){ip=item;break;}}if(!ip){if(ips.length){ip=ips[0];}}if(!ip){ip='%FALLBACK_IP%';}console.log(ip);"`) do set "LOCAL_IP=%%I"

if not defined LOCAL_IP set "LOCAL_IP=%FALLBACK_IP%"
set "NETWORK_URL=http://%LOCAL_IP%:%PORT%"

echo Starting Next.js dev server...
echo Network URL: %NETWORK_URL%
echo Browser will open when the dev server is reachable.

start "" /b powershell -NoProfile -ExecutionPolicy Bypass -Command "$url='%NETWORK_URL%'; for ($i=0; $i -lt 45; $i++) { try { $r=Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -lt 500) { Start-Process $url; exit } } catch { }; Start-Sleep -Seconds 1 }; Start-Process $url"

"%NODE_EXE%" ".codex-tools\npm\package\bin\npm-cli.js" run dev -- --turbopack -p %PORT%

echo.
echo Dev server stopped. Press any key to close this window.
pause >nul
