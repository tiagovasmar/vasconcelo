/**
 * Cobertura de una lista de cartas a partir de sus números impresos. Una lista solo se considera completa si los números van
 * de 1 al máximo sin huecos (y no hay cartas repetidas). Los huecos se informan exactamente para documentarlos.
 */
export type Coverage = { status: "complete" | "partial"; numbered: number; maxNumber: number; missing: number[]; unnumbered: number };

export function coverageOf(numbers: Array<string | null | undefined>): Coverage {
  const nums = numbers.map((n) => (n && /^\d+$/.test(n) ? Number(n) : null));
  const numbered = nums.filter((n): n is number => n !== null);
  const set = new Set(numbered);
  const max = numbered.length ? Math.max(...numbered) : 0;
  const missing: number[] = [];
  for (let i = 1; i <= max; i++) if (!set.has(i)) missing.push(i);
  const duplicated = set.size !== numbered.length;
  return { status: missing.length === 0 && !duplicated && numbered.length > 0 ? "complete" : "partial", numbered: numbered.length, maxNumber: max, missing, unnumbered: nums.length - numbered.length };
}

/** «71, 73 y 75» · «104–135 y 151» (agrupa rangos). */
export function formatRanges(list: number[]): string {
  const parts: string[] = [];
  for (let i = 0; i < list.length; ) {
    let j = i;
    while (j + 1 < list.length && list[j + 1] === list[j] + 1) j++;
    parts.push(j - i >= 2 ? `${list[i]}–${list[j]}` : list.slice(i, j + 1).join(", "));
    i = j + 1;
  }
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} y ${parts.at(-1)}` : (parts[0] ?? "");
}
