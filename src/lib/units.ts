// Some items were set up with unit "QTL" (Quintal) even though quantities
// have always effectively been tracked in KG throughout the app — printed
// bills show "KG" for those items instead. Purely a display relabel: the
// quantity number itself is untouched, no conversion applied.
export function displayUnit(unit: string) {
  return unit.trim().toUpperCase() === "QTL" ? "KG" : unit;
}
