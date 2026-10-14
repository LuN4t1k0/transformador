const { spawn } = require('node:child_process');

const processes = [
  ['api', 'apps/api/src/server.js'],
  ['worker', 'apps/worker/src/worker.js']
].map(([name, entrypoint]) => ({
  name,
  child: spawn(process.execPath, [entrypoint], {
    env: process.env,
    stdio: 'inherit'
  })
}));

let shuttingDown = false;

function shutdown(signal, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const { child } of processes) {
    if (!child.killed) child.kill(signal);
  }
  const timer = setTimeout(() => process.exit(exitCode), 10_000);
  timer.unref();
  Promise.all(processes.map(({ child }) => new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) resolve();
    else child.once('exit', resolve);
  }))).then(() => process.exit(exitCode));
}

for (const { name, child } of processes) {
  child.on('error', (error) => {
    console.error(JSON.stringify({ event: 'backend:child-error', process: name, message: error.message }));
    shutdown('SIGTERM', 1);
  });
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    console.error(JSON.stringify({ event: 'backend:child-exit', process: name, code, signal }));
    shutdown('SIGTERM', code || 1);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
