import { applyDecorators } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
  ApiResponse,
  getSchemaPath,
} from '@nestjs/swagger';

// OpenAPI-only classes: they describe what the API sends (design §9) and are
// never used to build a response. The response itself is a plain object.

export class FieldErrorDto {
  @ApiProperty({ example: 'sets[0].unit' })
  path: string;

  @ApiProperty({
    example: "Unsupported unit 'stone'. Supported units: kg (kgs), lb (lbs).",
  })
  message: string;
}

// RFC 9457 problem details with the two extensions of design §9.6.
export class ProblemDetailsDto {
  @ApiProperty({ example: 'https://errors.workout-api.local/validation-error' })
  type: string;

  @ApiProperty({ example: 'Request validation failed' })
  title: string;

  @ApiProperty({ example: 400 })
  status: number;

  @ApiProperty({
    example: 'VALIDATION_ERROR',
    description:
      'VALIDATION_ERROR, MALFORMED_JSON, UNAUTHORIZED, NOT_FOUND, ' +
      'EXERCISE_EXISTS, MUSCLE_GROUP_EXISTS, MUSCLE_GROUP_IN_USE, ' +
      'PAYLOAD_TOO_LARGE, UNSUPPORTED_MEDIA_TYPE, INTERNAL_ERROR or ' +
      'SERVICE_UNAVAILABLE.',
  })
  code: string;

  @ApiProperty({ example: '2 fields are invalid.' })
  detail: string;

  @ApiProperty({ example: '/v1/users/u_123/workout-entries' })
  instance: string;

  @ApiProperty({
    example: 'b0c1d2e3-f4a5-4b6c-8d7e-9f0a1b2c3d4e',
    description: 'Also sent as the x-request-id header; quote it in a report.',
  })
  requestId: string;

  @ApiPropertyOptional({
    type: [FieldErrorDto],
    description:
      'Validation failures only: one entry per path, every problem of the request at once.',
  })
  errors?: FieldErrorDto[];
}

export class PageDto {
  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: true })
  hasMore: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    example:
      'eyJ2IjoxLCJhdCI6IjIwMjUtMDItMDlUMjI6MzA6MDAuMDAwWiIsImlkIjoiMDE5NGYyZmUifQ',
    description: 'Opaque. Send it unchanged as cursor for the next page.',
  })
  nextCursor: string | null;
}

const PROBLEMS: Record<number, string> = {
  400: 'VALIDATION_ERROR (the fields are listed in errors[]) or MALFORMED_JSON.',
  404: 'NOT_FOUND.',
  409: 'The write conflicts with what exists (the code says which).',
  413: 'PAYLOAD_TOO_LARGE: the body is over 1 MB.',
  415: 'UNSUPPORTED_MEDIA_TYPE: send Content-Type: application/json.',
};

// One problem+json response for each status given.
export function ApiProblems(...statuses: (keyof typeof PROBLEMS)[]) {
  return applyDecorators(
    ApiExtraModels(ProblemDetailsDto),
    ...statuses.map((status) =>
      ApiResponse({
        status: Number(status),
        description: PROBLEMS[status],
        content: {
          'application/problem+json': {
            schema: { $ref: getSchemaPath(ProblemDetailsDto) },
          },
        },
      }),
    ),
  );
}
