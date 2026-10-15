import type { Source } from "../schema";
import lote from "../colecciones/origen/colecciones.json";
import { COLECCIONES_PG } from "./search-groups";

const CONSULTADA = "2026-10-12";
const PUBLISHER_SITE = "Pokémon Card (sitio oficial, Japón)";
const PUBLISHER_CENTER = "Pokémon Center Online (Japón)";
const CENTER_NOTE = "Los precios en yenes, sorteos, stock, fechas de envío, promociones y políticas de Pokémon Center NO son condiciones de esta tienda.";

/** Texto leído en el envase oficial (foto del sobre alojada en la página oficial de la expansión). */
const ENVASE: Record<string, { page: string; scope: string }> = {
  "black-bolt": { page: "https://www.pokemon-card.com/ex/sv11/", scope: "Imagen oficial del sobre estándar (SV11B) en la página de la expansión: el envase dice «ランダム7枚入り · 必ず2枚キラカード» (7 cartas al azar, siempre 2 cartas brillantes)." },
  "white-flare": { page: "https://www.pokemon-card.com/ex/sv11/", scope: "Imagen oficial del sobre estándar (SV11W) en la página de la expansión: el envase dice «ランダム7枚入り · 必ず2枚キラカード» (7 cartas al azar, siempre 2 cartas brillantes)." },
  "mega-dream-ex": { page: "https://www.pokemoncenter-online.com/9900000006808.html", scope: "Imagen oficial del sobre (M2a): el envase dice «ランダム10枚入り · ポケモンexまたはメガシンカex 1枚確定！» (10 cartas al azar; 1 carta Pokémon ex o Mega Evolution ex asegurada)." },
  "30th-celebration": { page: "https://www.30th.pokemon-card.com/product/m6a", scope: "Imagen oficial del sobre (M6a): el envase dice «ランダム6枚入り · すべてがキラカード！» (6 cartas al azar, todas brillantes)." },
};

export const sources: Source[] = lote.collections.flatMap((c) => {
  const pg = COLECCIONES_PG[c.id];
  const out: Source[] = [
    { id: `exp-${c.id}`, url: c.expansionSource, publisher: PUBLISHER_SITE, consultedAt: CONSULTADA, scope: `Página oficial de la expansión ${c.displayName} (${c.code}): identidad, contenido del sobre y cartas destacadas.` },
    { id: `box-${c.id}`, url: c.boxSource, publisher: PUBLISHER_CENTER, consultedAt: CONSULTADA, scope: `Ficha de la caja de ${c.displayName}: sobres por caja, cartas por sobre y contenido aleatorio.`, note: CENTER_NOTE },
    {
      id: `cartas-${c.id}`,
      url: `https://www.pokemon-card.com/card-search/index.php?keyword=&se_ta=&regulation_sidebar_form=all&pg=${pg}&illust=&sm_and_keyword=true`,
      publisher: PUBLISHER_SITE,
      consultedAt: CONSULTADA,
      scope: `Buscador oficial de cartas, expansión ${c.displayName} (grupo ${pg}): nombre oficial, número y rareza (según el ícono) de cada carta, e imagen de la carta.`,
      note: "Las imágenes y datos provienen del sitio oficial y el enlace no concede un permiso de uso: están marcados como referencia.",
    },
  ];
  const e = ENVASE[c.id];
  if (e) out.push({ id: `envase-${c.id}`, url: e.page, publisher: c.id === "mega-dream-ex" ? PUBLISHER_CENTER : PUBLISHER_SITE, consultedAt: CONSULTADA, scope: e.scope, note: "Texto leído en la imagen oficial del envase; no figura como texto en la página." });
  return out;
});
