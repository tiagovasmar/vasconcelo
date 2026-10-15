// Colecciones japonesas y sus códigos en el buscador oficial de cartas (parámetro `pg`).
// Los códigos `pg` se leyeron del propio selector de expansiones del buscador (https://www.pokemon-card.com/card-search/)
// y el script los valida contra el título que devuelve el buscador (un código equivocado detiene la importación).
// OJO: el paquete de origen traía pg=922 para Heat Wave Arena, que en realidad es otra expansión (SV7a): se corrigió a 940.
export const COLECCIONES = [
  { id: "black-bolt", pg: 942, nombreEnBuscador: "ブラックボルト" },
  { id: "white-flare", pg: 943, nombreEnBuscador: "ホワイトフレア" },
  { id: "heat-wave-arena", pg: 940, nombreEnBuscador: "熱風のアリーナ" },
  { id: "inferno-x", pg: 949, nombreEnBuscador: "インフェルノX" },
  { id: "mega-dream-ex", pg: 950, nombreEnBuscador: "MEGAドリームex" },
  { id: "30th-celebration", pg: 961, nombreEnBuscador: "30th CELEBRATION" },
  { id: "storm-emeralda", pg: 955, nombreEnBuscador: "ストームエメラルダ" },
  { id: "abyss-eye", pg: 954, nombreEnBuscador: "アビスアイ" },
  { id: "terastal-festival-ex", pg: 934, nombreEnBuscador: "テラスタルフェスex" },
  { id: "ninja-spinner", pg: 953, nombreEnBuscador: "ニンジャスピナー" },
  { id: "nihil-zero", pg: 952, nombreEnBuscador: "ムニキスゼロ" },
  { id: "mega-symphonia", pg: 945, nombreEnBuscador: "メガシンフォニア" },
  { id: "pokemon-card-151", pg: 882, nombreEnBuscador: "ポケモンカード151" },
];
