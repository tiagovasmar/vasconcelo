/**
 * Rareza de una carta según el ÍCONO que muestra el buscador oficial de cartas (p. ej. `ic_rare_sr_c` → «SR»).
 * Se verificó contra la lista oficial independiente de Storm Emeralda y Abyss Eye (156 cartas, 100 % de coincidencia).
 * Si la fuente no muestra ícono, no hay rareza: no se infiere. Los códigos poco habituales (MA, BWR, MUR) se muestran tal cual.
 */
export function rarityFromIcon(icon: string | null | undefined): string | undefined {
  if (!icon) return undefined;
  const m = icon.match(/^ic_rare_([A-Za-z0-9]+?)(?:_c)?$/);
  return m ? m[1].toUpperCase() : undefined;
}
