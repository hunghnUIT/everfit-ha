import { describeDatabaseUrl } from './describe-url';

describe('describeDatabaseUrl', () => {
  it("describes 'postgres://workout:secret@postgres:5432/workout' as 'postgres:5432/workout'", () =>
    expect(
      describeDatabaseUrl('postgres://workout:secret@postgres:5432/workout'),
    ).toBe('postgres:5432/workout'));
});
