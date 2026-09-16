#!/usr/bin/env node
/**
 * Pretest do backend: garante que o binding nativo do sqlite3 seja compatível
 * com o host atual (plataforma/arquitetura/ABI do Node).
 *
 * Comportamento:
 *  - Faz um probe real (require + abrir/fechar banco em memória) em processo filho.
 *  - Se o sqlite3 não estiver instalado, falha com instrução de instalação.
 *  - Se o probe falhar por incompatibilidade do binário nativo, executa
 *    `npm rebuild sqlite3 --build-from-source` uma única vez e revalida.
 *  - Falhas que não são de binding nativo não disparam recompilação.
 *  - Falhas de preparação bloqueiam `npm test`, evitando falso verde.
 *
 * Variáveis de ambiente:
 *  - SQLITE3_PRETEST_SKIP=1   pula a verificação.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const BACKEND_ROOT = path.resolve(__dirname, '..');
const SQLITE3_DIR = path.join(BACKEND_ROOT, 'node_modules', 'sqlite3');
const PREFIX = '[pretest:sqlite3]';

// Erros típicos de binding nativo incompatível com o host (ABI/arch/plataforma).
const NATIVE_FAILURE_PATTERNS = [
  /could not locate the bindings file/i,
  /node_sqlite3\.node/i,
  /NODE_MODULE_VERSION/i,
  /compiled against a different Node\.js version/i,
  /dlopen/i,
  /invalid ELF header/i,
  /not a valid (mach-o|elf)/i,
  /slice is not valid mach-o file/i,
  /incompatible architecture/i,
  /cannot open shared object file/i,
  /undefined symbol/i,
];

function log(message) {
  console.log(`${PREFIX} ${message}`);
}

function warn(message) {
  console.warn(`${PREFIX} ${message}`);
}

function firstLine(text) {
  return String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)[0] || 'erro desconhecido';
}

function sqlite3Installed() {
  return fs.existsSync(path.join(SQLITE3_DIR, 'package.json'));
}

function probeSqlite3() {
  // Processo filho: um binding corrompido pode derrubar o processo ao carregar.
  const probe = [
    `const sqlite3 = require(${JSON.stringify(SQLITE3_DIR)});`,
    "const db = new sqlite3.Database(':memory:');",
    'db.close((err) => {',
    "  if (err) { console.error(err.message); process.exit(3); }",
    "  console.log('sqlite3-probe-ok');",
    '});',
  ].join('\n');

  const result = spawnSync(process.execPath, ['-e', probe], {
    cwd: BACKEND_ROOT,
    encoding: 'utf8',
    timeout: 30000,
  });

  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  if (result.error) {
    return { ok: false, detail: result.error.message };
  }
  return { ok: result.status === 0, detail: output.trim() };
}

function isNativeFailure(detail) {
  return NATIVE_FAILURE_PATTERNS.some((pattern) => pattern.test(detail));
}

function findCompatiblePython() {
  for (const command of ['python3.13', 'python3.12', 'python3.11', 'python3']) {
    const result = spawnSync('sh', ['-lc', `command -v ${command}`], { encoding: 'utf8' });
    const executable = result.stdout && result.stdout.trim();
    if (!executable) continue;
    const probe = spawnSync(executable, ['-c', 'import distutils'], { stdio: 'ignore' });
    if (probe.status === 0) return executable;
  }
  return null;
}

function rebuildFromSource() {
  const npmCli = process.env.npm_execpath;
  const command = npmCli ? process.execPath : process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const args = npmCli
    ? [npmCli, 'rebuild', 'sqlite3', '--build-from-source']
    : ['rebuild', 'sqlite3', '--build-from-source'];

  log('Executando: npm rebuild sqlite3 --build-from-source');
  log('Isso pode levar alguns minutos (compilação do SQLite a partir do fonte)...');

  const env = { ...process.env, npm_config_build_from_source: 'true' };
  const python = findCompatiblePython();
  let shimDirectory;
  if (python) {
    env.npm_config_python = python;
    shimDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'socorre-python-'));
    fs.symlinkSync(python, path.join(shimDirectory, 'python3'));
    env.PATH = `${shimDirectory}:${env.PATH}`;
  }

  const result = spawnSync(command, args, {
    cwd: BACKEND_ROOT,
    stdio: 'inherit',
    env,
  });

  if (shimDirectory) fs.rmSync(shimDirectory, { recursive: true, force: true });

  return !result.error && result.status === 0;
}

function finishUnavailable(detail) {
  warn(`sqlite3 nativo continua indisponível: ${firstLine(detail)}`);
  warn('Os testes não serão iniciados para evitar um resultado falso positivo.');
  warn('Para corrigir manualmente:');
  warn(`  cd "${BACKEND_ROOT}" && npm rebuild sqlite3 --build-from-source`);
  return 1;
}

function main() {
  if (process.env.SQLITE3_PRETEST_SKIP === '1') {
    log('Verificação ignorada (SQLITE3_PRETEST_SKIP=1).');
    return 0;
  }
  if (!fs.existsSync(path.join(BACKEND_ROOT, 'node_modules'))) {
    warn('node_modules ausente; rode `npm install` no backend.');
    return 1;
  }
  if (!sqlite3Installed()) {
    warn('sqlite3 não instalado; rode `npm install` no backend.');
    return 1;
  }

  const before = probeSqlite3();
  if (before.ok) {
    log(`sqlite3 nativo OK para ${process.platform}/${process.arch} (Node ${process.version}).`);
    return 0;
  }

  if (!isNativeFailure(before.detail)) {
    warn(`sqlite3 falhou por motivo não relacionado ao binding nativo: ${firstLine(before.detail)}`);
    warn('Recompilação não será tentada; verifique a instalação com `npm install`.');
    return 0;
  }

  log(
    `sqlite3 nativo incompatível com o host ${process.platform}/${process.arch} ` +
      `(Node ${process.version}, ABI ${process.versions.modules}).`
  );
  log(`Motivo: ${firstLine(before.detail)}`);

  if (!rebuildFromSource()) {
    warn('`npm rebuild sqlite3 --build-from-source` falhou.');
    return finishUnavailable(before.detail);
  }

  const after = probeSqlite3();
  if (after.ok) {
    log('sqlite3 recompilado com sucesso e compatível com o host.');
    return 0;
  }

  return finishUnavailable(after.detail);
}

process.exitCode = main();
