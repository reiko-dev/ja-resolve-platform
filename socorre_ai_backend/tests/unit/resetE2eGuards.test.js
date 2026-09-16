/**
 * Guardas do reset E2E (`scripts/reset-e2e-data.js`).
 *
 * O script é a única rotina destrutiva de massa; estes testes garantem que ele
 * falha fechado antes de tocar no banco: flag explícita, IDs numéricos, alvo
 * de produção bloqueado e dono de teste obrigatório.
 */
const { spawnSync } = require('child_process');
const path = require('path');

const SCRIPT = path.join(__dirname, '../../scripts/reset-e2e-data.js');

function runReset(env = {}, args = []) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      E2E_RESET_CONFIRM: '',
      E2E_RESET_EMERGENCY_IDS: '',
      E2E_RESET_TARGET: '',
      E2E_RESET_ALLOW_HOMOLOG: '',
      E2E_RESET_ALLOW_ANY_OWNER: '',
      ...env,
    },
    encoding: 'utf8',
  });

  return {
    status: result.status,
    output: `${result.stdout || ''}${result.stderr || ''}`,
  };
}

describe('reset E2E — guardas de segurança', () => {
  test('sem IDs explícitos não executa', () => {
    const { status, output } = runReset({ E2E_RESET_CONFIRM: 'I_UNDERSTAND' }, ['--apply']);
    expect(status).toBe(1);
    expect(output).toContain('E2E_RESET_EMERGENCY_IDS não informado');
  });

  test('ID não numérico aborta em vez de ignorar o token', () => {
    const { status, output } = runReset(
      { E2E_RESET_CONFIRM: 'I_UNDERSTAND', E2E_RESET_EMERGENCY_IDS: '10,abc' },
      ['--apply'],
    );
    expect(status).toBe(1);
    expect(output).toContain('IDs inválidos');
    expect(output).toContain('abc');
  });

  test('--apply sem confirmação explícita não apaga', () => {
    const { status, output } = runReset({ E2E_RESET_EMERGENCY_IDS: '10' }, ['--apply']);
    expect(status).toBe(1);
    expect(output).toContain('E2E_RESET_CONFIRM=I_UNDERSTAND');
  });

  test('produção exige alvo homolog explícito', () => {
    const blocked = runReset(
      {
        NODE_ENV: 'production',
        E2E_RESET_CONFIRM: 'I_UNDERSTAND',
        E2E_RESET_EMERGENCY_IDS: '10',
      },
      ['--apply'],
    );
    expect(blocked.status).toBe(1);
    expect(blocked.output).toContain('produção exige E2E_RESET_TARGET=homolog');
  });

  test('E2E_RESET_ALLOW_ANY_OWNER não é aceito em produção', () => {
    const { status, output } = runReset(
      {
        NODE_ENV: 'production',
        E2E_RESET_TARGET: 'homolog',
        E2E_RESET_ALLOW_HOMOLOG: '1',
        E2E_RESET_ALLOW_ANY_OWNER: '1',
        E2E_RESET_CONFIRM: 'I_UNDERSTAND',
        E2E_RESET_EMERGENCY_IDS: '10',
      },
      ['--apply'],
    );
    expect(status).toBe(1);
    expect(output).toContain('E2E_RESET_ALLOW_ANY_OWNER=1 não é permitido');
  });
});
