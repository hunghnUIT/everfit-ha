import type Decimal from 'decimal.js';
import { D } from '../common/decimal';
import { UnitCode, WEIGHT_UNITS, WeightUnit } from './weight-units';

// Injection token for the one shared UnitRegistry (UnitsModule provides it).
export const UNIT_REGISTRY = Symbol('UNIT_REGISTRY');

// Every unit question goes through here: the DTO validator, the OpenAPI
// description, error messages and GET /v1/units (design §6).
export class UnitRegistry {
  private readonly units: readonly WeightUnit[];
  private readonly bySpelling = new Map<string, UnitCode>();
  private readonly factors = new Map<UnitCode, Decimal>();

  constructor(units: readonly WeightUnit[] = WEIGHT_UNITS) {
    this.units = units;
    for (const unit of units) {
      // A unit registered outside WEIGHT_UNITS (tests, a new line) is a
      // UnitCode at run time; the type only names the shipped codes.
      const code = unit.code as UnitCode;
      this.factors.set(code, new D(unit.kgPerUnit));
      for (const spelling of [unit.code, ...unit.aliases]) {
        this.bySpelling.set(spelling.toLowerCase(), code);
      }
    }
  }

  // Trims and lower-cases, then matches the code or an alias. Raw JSON or a
  // repeated query parameter can bring a non-string at run time: null.
  resolve(input: string): UnitCode | null {
    if (typeof input !== 'string') return null;
    return this.bySpelling.get(input.trim().toLowerCase()) ?? null;
  }

  codes(): UnitCode[] {
    return [...this.factors.keys()];
  }

  // Exact: a weight with at most 3 decimals times a factor with at most 8.
  toKg(weight: Decimal, code: UnitCode): Decimal {
    return this.factor(code).times(weight);
  }

  fromKg(kg: Decimal, code: UnitCode): Decimal {
    return kg.div(this.factor(code));
  }

  // "kg (kgs), lb (lbs)": for messages and the OpenAPI description.
  describe(): string {
    return this.units
      .map(({ code, aliases }) =>
        aliases.length > 0 ? `${code} (${aliases.join(', ')})` : code,
      )
      .join(', ');
  }

  list(): { code: UnitCode; label: string; aliases: readonly string[] }[] {
    return this.units.map(({ code, label, aliases }) => ({
      code: code as UnitCode,
      label,
      aliases,
    }));
  }

  private factor(code: UnitCode): Decimal {
    const factor = this.factors.get(code);
    if (factor === undefined) throw new Error(`Unknown unit code: ${code}`);
    return factor;
  }
}
