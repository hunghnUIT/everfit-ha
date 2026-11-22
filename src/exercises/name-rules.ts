import {
  MAX_GROUP_NAME_LENGTH,
  MAX_KEY_LENGTH,
  MAX_NAME_LENGTH,
} from '../common/limits';
import { Check } from '../common/problem';
import { codePointLength, exerciseKey, muscleGroupName } from './exercise-key';

// Lengths are checked on what is stored, after normalising (design §10.1):
// NFKC and lower-casing can lengthen a name (U+FDFA becomes 18 code points,
// İ becomes two), and such input must be a 400 here, not a database CHECK.

const GROUP_PATTERN = /^[\p{L}\p{N} -]+$/u;

function refuse<T>(path: string, message: string): Check<T> {
  return { ok: false, errors: [{ path, message }] };
}

// PostgreSQL's text type cannot hold U+0000: a statement that binds it fails
// with 22021, a 500. So no stored name or key contains it.
export const hasNul = (s: string) => s.includes('\u0000');

// One rule for the entry write, the catalog write and the seed. `name` is the
// trimmed input as the client wrote it; `key` is what is stored and matched.
export function checkExerciseName(
  raw: unknown,
  path: string,
): Check<{ name: string; key: string }> {
  if (typeof raw !== 'string')
    return refuse(path, 'The name must be a string.');
  if (hasNul(raw)) {
    return refuse(path, 'The name must not contain the NUL character.');
  }
  const name = raw.trim();
  const key = exerciseKey(name);
  if (name === '' || key === '') {
    return refuse(path, 'The name must not be blank.');
  }
  const nameLength = codePointLength(name);
  if (nameLength > MAX_NAME_LENGTH) {
    return refuse(
      path,
      `The name must be at most ${MAX_NAME_LENGTH} characters; it has ${nameLength}.`,
    );
  }
  const keyLength = codePointLength(key);
  if (keyLength > MAX_KEY_LENGTH) {
    return refuse(
      path,
      `The name becomes ${keyLength} characters once normalised; the limit is ${MAX_KEY_LENGTH}.`,
    );
  }
  return { ok: true, value: { name, key } };
}

// The `exercise` term of a read (history, PRs, compare), normalised as keys
// are. Blank once normalised is refused rather than read as no filter or as
// the key '' (design §9: an unfiltered list reads as an answer), and NUL
// before it reaches a statement. Length is the DTO's check.
export function readExerciseTerm(raw: string, path: string): Check<string> {
  if (hasNul(raw)) {
    return refuse(path, `${path} must not contain the NUL character.`);
  }
  const key = exerciseKey(raw);
  if (key === '') return refuse(path, `${path} must not be blank.`);
  return { ok: true, value: key };
}

// Returns the normalised group name, the form that is stored and matched.
export function checkMuscleGroupName(
  raw: unknown,
  path: string,
): Check<string> {
  if (typeof raw !== 'string') {
    return refuse(path, 'The muscle group name must be a string.');
  }
  const group = muscleGroupName(raw);
  if (group === '') {
    return refuse(path, 'The muscle group name must not be blank.');
  }
  const length = codePointLength(group);
  if (length > MAX_GROUP_NAME_LENGTH) {
    return refuse(
      path,
      `The muscle group name becomes ${length} characters once normalised; the limit is ${MAX_GROUP_NAME_LENGTH}.`,
    );
  }
  if (!GROUP_PATTERN.test(group)) {
    return refuse(
      path,
      'The muscle group name may contain only letters, digits, spaces and hyphens.',
    );
  }
  return { ok: true, value: group };
}
