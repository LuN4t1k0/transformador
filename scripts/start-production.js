const { spawn } = require('node:child_process');
const path = require('node:path');

if (process.env.SERVICE_MODE !== 'web') {
  require('./start-backend');
} else {
  const port = String(process.env.PORT || 3000);
  const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '--hostname', '0.0.0.0', '--port', port], {
    cwd: path.join(__dirname, '..', 'apps', 'web'),
    env: process.env,
    stdio: 'inherit'
  });

  let shuttingDown = false;
  function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    child.kill(signal);
  }

  child.on('error', (error) => {
    console.error(JSON.stringify({ event: 'web:child-error', message: error.message }));
    process.exit(1);
  });
  child.on('exit', (code, signal) => process.exit(signal ? 1 : (code || 0)));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
