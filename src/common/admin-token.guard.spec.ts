import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiEnv } from '../config/env';
import { AdminTokenGuard } from './admin-token.guard';
import { ApiProblem } from './problem';

// Design §10.7: SHA-256 of both tokens, compared with timingSafeEqual, and
// closed when ADMIN_API_TOKEN is unset or empty.

const TOKEN = 'test-admin-token-0123456789abcdefghij';
const SAME_LENGTH = 'test-admin-token-0123456789abcdefghiX';
const OTHER_LENGTH = 'test-admin-token-short-but-32-characters';

type Case = { configured: string | undefined; authorization?: string };

const CASES: [string, Case][] = [
  ['the right token', { configured: TOKEN, authorization: `Bearer ${TOKEN}` }],
  [
    'a wrong one of the same length',
    { configured: TOKEN, authorization: `Bearer ${SAME_LENGTH}` },
  ],
  [
    'one of another length',
    { configured: TOKEN, authorization: `Bearer ${OTHER_LENGTH}` },
  ],
  ['no header', { configured: TOKEN }],
  [
    'the variable unset',
    { configured: undefined, authorization: `Bearer ${TOKEN}` },
  ],
  // .env.example leaves the variable empty, so an operator who uncomments the
  // two lines without setting it meets this case first; an empty bearer
  // token must not match it.
  ['the variable empty', { configured: '', authorization: 'Bearer ' }],
];

// The guard reads the token through ConfigService; a stand-in returns the
// case's value, so the runner's own environment never leaks in.
function guardWith(configured: string | undefined): AdminTokenGuard {
  const config = {
    get: () => configured,
  } as unknown as ConfigService<ApiEnv, true>;
  return new AdminTokenGuard(config);
}

function contextWith(authorization: string | undefined): ExecutionContext {
  const headers = authorization === undefined ? {} : { authorization };
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

describe('AdminTokenGuard', () => {
  it.each(CASES)('%s', (label, { configured, authorization }) => {
    const run = () =>
      guardWith(configured).canActivate(contextWith(authorization));
    if (label === 'the right token') {
      expect(run()).toBe(true);
      return;
    }
    let thrown: unknown;
    try {
      run();
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ApiProblem);
    expect(thrown).toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
      headers: { 'WWW-Authenticate': 'Bearer' },
    });
  });
});
