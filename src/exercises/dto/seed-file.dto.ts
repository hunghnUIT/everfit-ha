// class-transformer's @Type reads design metadata. Nest loads this polyfill
// for the app, but the migrate step and the unit test reach this file
// without Nest, so it is imported here.
import 'reflect-metadata';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsString,
  ValidateNested,
} from 'class-validator';

// The shape of seed/exercise-catalog.seed.json (design §10.3). Only the shape:
// the name rules, the group list and the duplicates are checked after it, by
// validateSeedFile, with the admin routes' field rules. Decorators register
// bottom-up and toFieldErrors keeps a path's first message, so IsArray is
// written last to report first.

export class SeedExerciseDto {
  @IsString()
  name: string;

  // Primary mover first. The upper bound is checked after normalising, since
  // a list is de-duplicated then (design §10.1).
  @IsString({ each: true })
  @ArrayMinSize(1)
  @IsArray()
  muscleGroups: string[];
}

export class SeedFileDto {
  @IsString({ each: true })
  @IsArray()
  muscleGroups: string[];

  @ValidateNested({ each: true })
  @Type(() => SeedExerciseDto)
  @IsArray()
  exercises: SeedExerciseDto[];
}
