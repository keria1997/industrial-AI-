import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, closeSync, copyFileSync, readFileSync,
  symlinkSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const release = resolve(process.argv[2] || '');
if (!process.argv[2]) throw new Error('Usage: node deploy/run-local-release.mjs <extracted-release> [frontend-port]');
const frontendPort = Number(process.argv[3] || '5175');
if (!Number.isInteger(frontendPort) || frontendPort < 1024 || frontendPort > 65535 || frontendPort === 8081) {
  throw new Error('Frontend port must be an integer from 1024 to 65535 other than 8081');
}
const frontendUrl = `http://127.0.0.1:${frontendPort}`;
const runtime = resolve(repo, `deploy/artifacts/${frontendPort === 5175 ? 'local-runtime' : `local-runtime-${frontendPort}`}`);
const jar = resolve(release, 'app/server-java/industrial-ai-api-0.1.0.jar');
const manifest = resolve(release, 'MANIFEST.txt');
if (!existsSync(jar) || !existsSync(resolve(release, 'app/dist/index.html')) || !existsSync(manifest)) {
  throw new Error('Release must contain a Java JAR, built frontend and MANIFEST.txt');
}
process.loadEnvFile(resolve(repo, '.env.local'));
if (!process.env.DATABASE_URL || !process.env.AUTH_SECRET || !process.env.FULFILLMENT_DATA_KEY) {
  throw new Error('DATABASE_URL, AUTH_SECRET and FULFILLMENT_DATA_KEY are required; memory storage is not permitted');
}
const db = new URL(process.env.DATABASE_URL.replace(/^jdbc:/, ''));
if (!['postgres:', 'postgresql:'].includes(db.protocol)) throw new Error('PostgreSQL is required');
const pgEnv = { ...process.env, PGHOST: db.hostname, PGPORT: db.port || '5432',
  PGDATABASE: db.pathname.slice(1), PGUSER: decodeURIComponent(db.username) || process.env.USER,
  PGPASSWORD: decodeURIComponent(db.password) };
const env = { ...process.env, JAVA_API_PORT: '8081', PRODUCTION_API_PORT: '8081',
  PRODUCTION_API_HOST: '127.0.0.1', JAVA_NATIVE_ONLY: 'true', LEGACY_PROXY_ENABLED: 'false',
  APP_DATABASE_MIGRATE: 'false' };
const run = (command, args, options = {}) => execFileSync(command, args,
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options });

mkdirSync(resolve(runtime, 'logs'), { recursive: true });
mkdirSync(resolve(runtime, 'backups'), { recursive: true, mode: 0o700 });
const mime = ['/opt/homebrew/etc/nginx/mime.types', '/etc/nginx/mime.types', '/usr/local/etc/nginx/mime.types']
  .find(existsSync);
if (!mime) throw new Error('nginx mime.types is not installed');
copyFileSync(mime, resolve(runtime, 'mime.types'));
writeFileSync(resolve(runtime, 'nginx.conf'), readFileSync(resolve(repo, 'deploy/nginx/local-5175.conf'), 'utf8')
  .replace('listen 127.0.0.1:5175;', `listen 127.0.0.1:${frontendPort};`));
run('nginx', ['-t', '-p', `${runtime}/`, '-c', 'nginx.conf']);
run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-c', 'SELECT 1'], { env: pgEnv });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = resolve(runtime, `backups/industrial-ai-${stamp}.dump`);
const backupDescriptor = openSync(backup, 'wx', 0o600);
try {
  execFileSync('pg_dump', ['--format=custom', '--no-owner', '--no-acl'],
    { env: pgEnv, stdio: ['ignore', backupDescriptor, 'pipe'] });
} finally { closeSync(backupDescriptor); }
console.log(`Database backup: ${backup} (${statSync(backup).size} bytes)`);
console.log(run('java', ['-jar', jar, '--spring.main.web-application-type=none',
  '--app.database.migrate=true', '--app.migration.exit=true'], { env }));

function listeners(port) {
  try {
    return run('lsof', ['-nP', '-t', `-iTCP:${port}`, '-sTCP:LISTEN']).trim().split(/\s+/).filter(Boolean).map(Number);
  } catch (error) { if (error.status === 1) return []; throw error; }
}
function checkedListeners(port) {
  const pids = [...new Set(listeners(port))];
  for (const pid of pids) {
    const command = run('ps', ['-p', String(pid), '-o', 'command=']).trim();
    const masterPid = existsSync(resolve(runtime, 'nginx.pid'))
      ? Number(readFileSync(resolve(runtime, 'nginx.pid'), 'utf8').trim()) : 0;
    const parentPid = Number(run('ps', ['-p', String(pid), '-o', 'ppid=']).trim());
    const nginxWorker = command.includes('nginx: worker process') && parentPid === masterPid
      && run('ps', ['-p', String(masterPid), '-o', 'command=']).includes(runtime);
    const allowed = port === 8081
      ? /com\.wanshen\.platform\.IndustrialAiApiApplication|industrial-ai-api[^ ]*\.jar/.test(command)
      : /node .*vite/.test(command) || (command.includes('nginx') && command.includes(runtime)) || nginxWorker;
    if (!allowed) throw new Error(`Port ${port} is owned by an unrelated process (${pid}); refusing to stop it`);
  }
  return pids;
}
const backendPids = checkedListeners(8081);
const frontendPids = checkedListeners(frontendPort);
const previous = existsSync(resolve(runtime, 'current'))
  ? run('readlink', [resolve(runtime, 'current')]).trim() : null;
for (const pid of backendPids) process.kill(pid, 'SIGTERM');
for (let attempt = 0; listeners(8081).length && attempt < 30; attempt++) await delay(1000);
if (listeners(8081).length) throw new Error('Backend did not stop within 30 seconds; no forced shutdown performed');

function startBackend(source) {
  const output = openSync(resolve(runtime, 'logs/api.log'), 'a', 0o600);
  const child = spawn('java', ['-jar', resolve(source, 'app/server-java/industrial-ai-api-0.1.0.jar')], {
    env, cwd: source, detached: true, stdio: ['ignore', output, output],
  });
  closeSync(output);
  child.unref();
  writeFileSync(resolve(runtime, 'api.pid'), `${child.pid}\n`, { mode: 0o600 });
  return child;
}
async function waitBackend(child) {
  for (let attempt = 0; attempt < 45; attempt++) {
    if (child.exitCode !== null) throw new Error(`Backend exited with code ${child.exitCode}`);
    try {
      const response = await fetch('http://127.0.0.1:8081/healthz', { signal: AbortSignal.timeout(2000) });
      if (response.ok && (await response.json()).status === 'ok') return;
    } catch {}
    await delay(1000);
  }
  throw new Error('Backend health check timed out');
}
const backend = startBackend(release);
try { await waitBackend(backend); }
catch (error) {
  backend.kill('SIGTERM');
  if (previous) {
    for (let attempt = 0; listeners(8081).length && attempt < 30; attempt++) await delay(1000);
    await waitBackend(startBackend(previous));
    console.error('Previous backend release restored; database backup retained');
  }
  throw error;
}
const pendingLink = resolve(runtime, `current-${stamp}`);
symlinkSync(release, pendingLink);
renameSync(pendingLink, resolve(runtime, 'current'));
for (const pid of frontendPids) {
  try { process.kill(pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
}
for (let attempt = 0; listeners(frontendPort).length && attempt < 30; attempt++) await delay(1000);
if (listeners(frontendPort).length) throw new Error('Frontend did not stop within 30 seconds');
run('nginx', ['-p', `${runtime}/`, '-c', 'nginx.conf']);
const frontend = await fetch(frontendUrl, { signal: AbortSignal.timeout(5000) });
const html = await frontend.text();
if (!frontend.ok || html.includes('/@vite/client') || !html.includes('/assets/')) {
  throw new Error('Built frontend health check failed');
}
const proxied = await fetch(`${frontendUrl}/healthz`, { signal: AbortSignal.timeout(5000) });
if (!proxied.ok) throw new Error('Frontend-to-backend health check failed');
const evidence = { at: new Date().toISOString(), release, previous, backup,
  javaPid: backend.pid, frontend: frontendUrl, backend: 'http://127.0.0.1:8081',
  database: db.pathname.slice(1), storage: 'PostgreSQL', demoAuthEnabled: env.DEMO_AUTH_ENABLED === 'true',
  manifest: readFileSync(manifest, 'utf8'),
  jarSha256: createHash('sha256').update(readFileSync(jar)).digest('hex') };
writeFileSync(resolve(runtime, 'deployment.json'), JSON.stringify(evidence, null, 2) + '\n', { mode: 0o600 });
console.log(`Deployed built frontend on ${frontendPort} and Java/PostgreSQL backend on 8081`);
if (evidence.demoAuthEnabled) console.log('Public production prerequisite: configure real accounts and disable demo authentication');
