import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { ApiEnv } from '../config/env';
import { ApiProblem } from './problem';

// The admin token check of design §10.7. Written by hand (D-28): a guard is
// Nest's own hook, and the check is one constant-time comparison that a
// Passport strategy would wrap in two more packages. It is a placeholder: the
// platform's real answer is a role check on the caller's identity, here.

// RFC 6750's scheme name is case-insensitive; the token is the rest.
const BEARER = /^Bearer +(\S+) *$/i;

// Equal-length digests, so a token of another length is a plain "no", never
// an exception from timingSafeEqual and never a length leak.
const sha256 = (value: string) =>
  createHash('sha256').update(value, 'utf8').digest();

function unauthorized(): ApiProblem {
  return new ApiProblem(
    401,
    'UNAUTHORIZED',
    'This route needs the admin token: send Authorization: Bearer <token>.',
    undefined,
    { 'WWW-Authenticate': 'Bearer' },
  );
}

@Injectable()
export class AdminTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService<ApiEnv, true>) {}

  // Fails closed: with ADMIN_API_TOKEN unset or empty, every request is
  // refused. One answer for every refusal, so the reason is never told.
  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get('ADMIN_API_TOKEN', { infer: true });
    const header = context.switchToHttp().getRequest<Request>()
      .headers.authorization;
    const sent = BEARER.exec(header ?? '')?.[1];
    if (
      !expected ||
      sent === undefined ||
      !timingSafeEqual(sha256(sent), sha256(expected))
    ) {
      throw unauthorized();
    }
    return true;
  }
}

// The second of the two lines that switch the guard on (§10.7).
export const AdminOnly = () => UseGuards(AdminTokenGuard);
