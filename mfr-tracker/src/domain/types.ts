// Shared domain types. Pure TypeScript, no framework imports.
export type Confidence = 'high' | 'medium' | 'low';
export type PackUnit = 'box' | 'pallet';

export interface PartPack {
  eachPerBox: number | null;
  eachPerPallet: number | null;
}

export interface ParsedQty {
  /** Count of individual items, or null when the text is not a countable quantity. */
  qtyEach: number | null;
  packQty: number | null;
  packUnit: PackUnit | null;
  /** Trailing word written after the number, lowercased ("bolts", "ea", "pc"). */
  unitWord: string | null;
  /** 'pack_only' | 'ambiguous_qty' | 'unparsed' */
  flags: string[];
}

export interface ParsedPb {
  pbLocation: string;
  pbNumber: number | null;
}

export type CrewCheck =
  | { type: 'equal'; parts: [string, string] }
  | { type: 'ratio'; part: string; of: string; factor: number }
  | { type: 'sum'; total: string; parts: string[] };

export interface CheckLine {
  partNumber: string | null;
  qtyEach: number | null;
  isWriteIn?: boolean;
}

export interface CheckWarning {
  type: CrewCheck['type'];
  message: string;
  partNumbers: string[];
}

export interface FingerprintLine {
  partNumber: string | null;
  partNumberRaw: string | null;
  qtyEach: number | null;
  qtyRaw: string | null;
}

export interface PartRef {
  id: number;
  partNumber: string;
}

export interface AliasRef {
  alias: string;
  partId: number;
}
