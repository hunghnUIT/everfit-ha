import { ApiProblem } from './problem';
import { UserIdPipe } from './user-id.pipe';

const pipe = new UserIdPipe();
const run = (value: string) =>
  pipe.transform(value, { type: 'param', data: 'userId' });

function problemOf(value: string): ApiProblem {
  try {
    run(value);
  } catch (error) {
    if (error instanceof ApiProblem) return error;
    throw error;
  }
  throw new Error(`${value} was accepted`);
}

describe('UserIdPipe (design §9)', () => {
  it.each(['coach@example.com', 'user:1', 'u 1', 'x'.repeat(65), 'ü'])(
    'refuses %p on path userId',
    (value) => {
      const problem = problemOf(value);
      expect(problem.status).toBe(400);
      expect(problem.code).toBe('VALIDATION_ERROR');
      expect(problem.errors).toEqual([
        { path: 'userId', message: expect.any(String) },
      ]);
    },
  );

  it.each(['u_123', 'client-42.a', 'x'.repeat(64)])('accepts %p', (value) =>
    expect(run(value)).toBe(value),
  );
});
