// Every query DTO extends this class (design §9; Tasks 10b and 13–15). It
// declares nothing: toFieldErrors recognises a query by it and words an
// unknown or repeated parameter as §9 says. The global ValidationPipe keeps
// each error's target for that reason (configureApp).
//
// A query DTO checks with class-validator alone: @IsString() on every text
// parameter (a repeated one arrives as an array and fails it), @IsNotEmpty()
// against `exercise=`, @Type(() => Number) with @IsInt(), @Min() and @Max()
// for numbers, @IsDefined() for a required one, @IsSupportedUnit() for unit.
// A property's rules run bottom-up, so the type check is written last.
export abstract class QueryDto {}
