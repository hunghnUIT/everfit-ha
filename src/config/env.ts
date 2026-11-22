import { applyDecorators } from '@nestjs/common';
import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  IsDefined,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export const LOG_LEVELS = [
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
] as const;

export type ApiEnv = {
  DATABASE_URL: string;
  PORT: number;
  LOG_LEVEL: (typeof LOG_LEVELS)[number];
  DB_POOL_MAX: number;
  DB_STATEMENT_TIMEOUT_MS: number;
  CATALOG_REFRESH_SECONDS: number;
  ADMIN_API_TOKEN?: string;
};

export type MigrateEnv = Pick<ApiEnv, 'DATABASE_URL' | 'LOG_LEVEL'>;

type RawEnv = Record<string, string | undefined>;

// The message names the variable and the rule. It never carries a value: the
// database URL holds a password and the token is a secret.
export class ConfigError extends Error {
  constructor(problems: string[]) {
    super(`Invalid environment:\n${problems.map((p) => `  ${p}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

// One rule text for the three decorators of an integer range.
const integerFrom = (min: number, max: number) => {
  const rule = { message: `must be an integer from ${min} to ${max}` };
  return applyDecorators(IsInt(rule), Min(min, rule), Max(max, rule));
};

// What migrate reads (§13): it never fails for want of an api setting.
class MigrateEnvSchema implements MigrateEnv {
  @IsDefined({ message: 'is required' })
  @Matches(/^postgres(ql)?:\/\/\S+$/, { message: 'must be a postgres:// URL' })
  DATABASE_URL: string;

  @IsIn(LOG_LEVELS, { message: `must be one of ${LOG_LEVELS.join(', ')}` })
  LOG_LEVEL: ApiEnv['LOG_LEVEL'] = 'info';
}

class ApiEnvSchema extends MigrateEnvSchema implements ApiEnv {
  @Type(() => Number)
  @integerFrom(1, 65_535)
  PORT = 3000;

  @Type(() => Number)
  @integerFrom(1, 100)
  DB_POOL_MAX = 10;

  @Type(() => Number)
  @integerFrom(100, 60_000)
  DB_STATEMENT_TIMEOUT_MS = 5000;

  @Type(() => Number)
  @integerFrom(10, 3600)
  CATALOG_REFRESH_SECONDS = 300;

  // .env.example leaves it empty, and an empty value means unset.
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsString()
  @MinLength(32, { message: 'must be at least 32 characters when set' })
  ADMIN_API_TOKEN?: string;
}

function validateWith<T extends object>(schema: new () => T, raw: RawEnv): T {
  // Only the schema's own variables are read; unset ones keep their default.
  const env = plainToInstance(schema, raw, {
    exposeDefaultValues: true,
    exposeUnsetFields: false,
  });
  const errors = validateSync(env, {
    whitelist: true,
    stopAtFirstError: true,
  });
  if (errors.length > 0) {
    throw new ConfigError(
      errors.map(
        (e) =>
          `${e.property}: ${Object.values(e.constraints ?? {}).join('; ')}`,
      ),
    );
  }
  return { ...env };
}

export function validateApiEnv(raw: RawEnv): ApiEnv {
  return validateWith(ApiEnvSchema, raw);
}

export function validateMigrateEnv(raw: RawEnv): MigrateEnv {
  return validateWith(MigrateEnvSchema, raw);
}
