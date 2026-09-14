const { getJwtSecret, getJwtExpiresIn, DEV_FALLBACK_SECRET } = require('../../src/config/jwt');
const { fallbackExpiration } = require('../../src/services/tokenRevocationService');

const ORIGINAL_ENV = { ...process.env };

function setEnv(overrides) {
  if (overrides.NODE_ENV !== undefined) {
    process.env.NODE_ENV = overrides.NODE_ENV;
  } else {
    delete process.env.NODE_ENV;
  }
  if (overrides.JWT_SECRET !== undefined) {
    process.env.JWT_SECRET = overrides.JWT_SECRET;
  } else {
    delete process.env.JWT_SECRET;
  }
  if (overrides.JWT_EXPIRES_IN !== undefined) {
    process.env.JWT_EXPIRES_IN = overrides.JWT_EXPIRES_IN;
  } else {
    delete process.env.JWT_EXPIRES_IN;
  }
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('config/jwt (config única para HTTP e Socket.IO)', () => {
  test('produção sem JWT_SECRET falha rápido (fail-fast)', () => {
    setEnv({ NODE_ENV: 'production', JWT_SECRET: undefined });

    expect(() => getJwtSecret()).toThrow(/JWT_SECRET/);
  });

  test('produção com JWT_SECRET vazio falha rápido', () => {
    setEnv({ NODE_ENV: 'production', JWT_SECRET: '   ' });

    expect(() => getJwtSecret()).toThrow(/JWT_SECRET/);
  });

  test('produção com JWT_SECRET definido usa o segredo', () => {
    setEnv({ NODE_ENV: 'production', JWT_SECRET: 'segredo-forte-de-producao' });

    expect(getJwtSecret()).toBe('segredo-forte-de-producao');
  });

  test('fora de produção sem JWT_SECRET usa fallback de dev', () => {
    setEnv({ NODE_ENV: 'development', JWT_SECRET: undefined });

    expect(getJwtSecret()).toBe(DEV_FALLBACK_SECRET);
  });

  test('fora de produção com JWT_SECRET definido usa o segredo', () => {
    setEnv({ NODE_ENV: 'test', JWT_SECRET: 'segredo-de-teste' });

    expect(getJwtSecret()).toBe('segredo-de-teste');
  });

  test('expiração padrão é 7d e aceita override', () => {
    setEnv({ NODE_ENV: 'test', JWT_EXPIRES_IN: undefined });
    expect(getJwtExpiresIn()).toBe('7d');

    setEnv({ NODE_ENV: 'test', JWT_EXPIRES_IN: '1h' });
    expect(getJwtExpiresIn()).toBe('1h');
  });

  test('fallback de revogação respeita unidades configuradas', () => {
    const now = Date.now();

    setEnv({ NODE_ENV: 'test', JWT_EXPIRES_IN: '1h' });
    const oneHour = Date.parse(fallbackExpiration());
    expect(oneHour - now).toBeGreaterThan(3599000);
    expect(oneHour - now).toBeLessThan(3601000);

    setEnv({ NODE_ENV: 'test', JWT_EXPIRES_IN: '3600' });
    const bareSeconds = Date.parse(fallbackExpiration());
    expect(bareSeconds - Date.now()).toBeGreaterThan(3599000);

    setEnv({ NODE_ENV: 'test', JWT_EXPIRES_IN: 'valor-inválido' });
    const invalid = Date.parse(fallbackExpiration());
    expect(invalid - Date.now()).toBeGreaterThan(6 * 24 * 60 * 60 * 1000);
  });
});
