#!/usr/bin/env node
// Tiny dependency-free local server for Picture Studio.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = __dirname;
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.svg':'image/svg+xml' };
const server = http.createServer((request, response) => {
  const cleanPath = decodeURIComponent((request.url || '/').split('?')[0]);
  const requested = cleanPath === '/' ? '/index.html' : cleanPath;
  const file = path.resolve(root, `.${requested}`);
  if (!file.startsWith(root + path.sep)) { response.writeHead(403); response.end('Forbidden'); return; }
  fs.readFile(file, (error, content) => {
    if (error) { response.writeHead(error.code === 'ENOENT' ? 404 : 500); response.end('Not found'); return; }
    response.writeHead(200, {
      'Content-Type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream',
      // Always serve the current editor files. This prevents an older app.js or
      // stylesheet from lingering after a template/masking change.
      'Cache-Control': 'no-store, max-age=0, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    response.end(content);
  });
});

const port = Number(process.env.PORT) || 4173;
function listenerOnPort() {
  try {
    // Only target the process *listening* on this port. A browser connected to
    // localhost:4173 must never be treated as a process to stop.
    return execFileSync('lsof', ['-nP', `-tiTCP:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' })
      .trim().split(/\s+/).filter(Boolean).map(Number);
  } catch { return []; }
}
function clearPort() {
  const pids = listenerOnPort().filter(pid => pid !== process.pid);
  pids.forEach(pid => {
    try { process.kill(pid, 'SIGTERM'); console.log(`Stopped process ${pid} on port ${port}.`); } catch { /* It may have already exited. */ }
  });
  // Some previous development servers do not exit after SIGTERM. Only force
  // stop the same PID if it is still the active listener after a brief grace
  // period; never target browser connections or another port.
  setTimeout(() => {
    const stillListening = new Set(listenerOnPort());
    pids.filter(pid => stillListening.has(pid)).forEach(pid => {
      try { process.kill(pid, 'SIGKILL'); console.log(`Force-stopped process ${pid} on port ${port}.`); } catch { /* It may have already exited. */ }
    });
  }, 300);
}
function start(attemptsLeft = 20) {
  const active = listenerOnPort();
  if (active.length && attemptsLeft > 0) {
    // The listener was already asked to stop. Wait rather than repeatedly
    // sending signals to unrelated processes.
    setTimeout(() => start(attemptsLeft - 1), 100);
    return;
  }
  server.once('error', (error) => {
    console.error(`Picture Studio could not start on localhost:${port}.`, error.message);
    console.error('A process is still listening on this port. Stop that process, then run ./server.js again.');
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => console.log(`Picture Studio is running at http://localhost:${port}`));
}
clearPort();
start();
