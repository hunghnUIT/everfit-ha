import { ConfigError, validateApiEnv, validateMigrateEnv } from './env';

const url = 'postgres://workout:workout@localhost:5432/workout';

describe('validateApiEnv', () => {
  it('applies the §13 defaults', () =>
    expect(validateApiEnv({ DATABASE_URL: url })).toEqual({
      DATABASE_URL: url,
      PORT: 3000,
      LOG_LEVEL: 'info',
      DB_POOL_MAX: 10,
      DB_STATEMENT_TIMEOUT_MS: 5000,
      CATALOG_REFRESH_SECONDS: 300,
    }));

  it('reads numbers from their string form', () =>
    expect(
      validateApiEnv({ DATABASE_URL: url, PORT: '8080', DB_POOL_MAX: '20' }),
    ).toMatchObject({ PORT: 8080, DB_POOL_MAX: 20 }));

  it('refuses a missing DATABASE_URL, naming it', () => {
    expect(() => validateApiEnv({})).toThrow(ConfigError);
    expect(() => validateApiEnv({})).toThrow(/DATABASE_URL/);
  });

  it.each(['abc', '5', '3601'])('refuses CATALOG_REFRESH_SECONDS=%s', (value) =>
    expect(() =>
      validateApiEnv({ DATABASE_URL: url, CATALOG_REFRESH_SECONDS: value }),
    ).toThrow(/CATALOG_REFRESH_SECONDS: /),
  );

  it('refuses an ADMIN_API_TOKEN under 32 characters without printing it', () => {
    const token = 'a-token-of-31-characters-long-x';
    expect(token).toHaveLength(31);
    let message = '';
    try {
      validateApiEnv({ DATABASE_URL: url, ADMIN_API_TOKEN: token });
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      message = (error as Error).message;
    }
    expect(message).toContain('ADMIN_API_TOKEN');
    expect(message).not.toContain(token);
  });

  it('keeps an ADMIN_API_TOKEN of 32 characters', () => {
    const token = 'x'.repeat(32);
    expect(
      validateApiEnv({ DATABASE_URL: url, ADMIN_API_TOKEN: token })
        .ADMIN_API_TOKEN,
    ).toBe(token);
  });

  it('lists every bad variable, one line each', () => {
    let message = '';
    try {
      validateApiEnv({ DATABASE_URL: url, PORT: '0', LOG_LEVEL: 'loud' });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/^ {2}PORT: /m);
    expect(message).toMatch(/^ {2}LOG_LEVEL: /m);
    expect(message).not.toContain('loud');
  });
});

describe('validateMigrateEnv', () => {
  it('validates migrate with only DATABASE_URL set', () =>
    expect(validateMigrateEnv({ DATABASE_URL: url })).toEqual({
      DATABASE_URL: url,
      LOG_LEVEL: 'info',
    }));

  it('ignores api settings, even invalid ones', () =>
    expect(validateMigrateEnv({ DATABASE_URL: url, DB_POOL_MAX: '0' })).toEqual(
      { DATABASE_URL: url, LOG_LEVEL: 'info' },
    ));
});
