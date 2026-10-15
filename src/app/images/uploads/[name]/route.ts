import { readUpload } from "@/server/media";

export const runtime = "nodejs";

/**
 * Sirve las fotos subidas desde el panel (guardadas en Supabase Storage). Solo acepta nombres generados por el servidor. La dirección pública
 * sigue siendo `/images/uploads/<nombre>` (las referencias guardadas en la base no cambian) y el archivo pasa por acá, así `next/image` puede optimizarlo.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  let data: Buffer | null;
  try {
    data = await readUpload(name);
  } catch {
    return new Response("Almacenamiento no disponible", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  if (!data) return new Response("No encontrado", { status: 404, headers: { "Cache-Control": "public, max-age=30" } });
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "image/webp",
      // El nombre es el hash del contenido: nunca cambia, se puede cachear por mucho tiempo (navegador y CDN).
      "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
}
