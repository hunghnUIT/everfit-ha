import { ArgumentMetadata, Injectable, PipeTransform } from '@nestjs/common';
import { USER_ID_PATTERN } from './limits';
import { validationProblem } from './problem';

// The path userId of every user route (design §9): an opaque string of 1–64
// characters of [A-Za-z0-9_.-]. Express has already decoded it, so a pasted
// e-mail address arrives here as 'coach@example.com'.
@Injectable()
export class UserIdPipe implements PipeTransform<string, string> {
  transform(value: string, _metadata: ArgumentMetadata): string {
    if (typeof value === 'string' && USER_ID_PATTERN.test(value)) return value;
    throw validationProblem([
      {
        path: 'userId',
        message:
          `'${value}' is not a userId: use 1 to 64 letters, digits, ` +
          "'_', '.' or '-'.",
      },
    ]);
  }
}
