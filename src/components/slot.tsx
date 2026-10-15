import Image from "next/image";
import publicAssets from "@/generated/public-assets.json";

const PUBLIC_ASSETS = new Set<string>(publicAssets as string[]);

/**
 * ¿Existe la imagen? Las imágenes versionadas de /public se consultan en un listado generado en cada build (`npm run assets:manifest`): en un
 * despliegue serverless la carpeta /public no está en el disco de la función, así que no se puede preguntar al sistema de archivos.
 * Las fotos subidas desde el panel (`/images/uploads/…`) viven en Storage y solo llegan a la base tras validarse al guardar la galería:
 * se dan por existentes (si el archivo faltara, la ruta responde 404 y el panel lo marca).
 */
export function hasAsset(src: string): boolean {
  if (src.startsWith("/images/uploads/")) return true;
  return PUBLIC_ASSETS.has(src.replace(/^\//, ""));
}

/**
 * Espacio para una imagen raster. Si el archivo existe en public/images se muestra con next/image;
 * si no, se muestra la ilustración de reserva. El listado de archivos esperados está en docs/ASSETS-PENDIENTES.md.
 */
export function ArtSlot({
  src,
  alt,
  width,
  height,
  className = "",
  priority = false,
  sizes,
  lowPriority = false,
  quality,
  fallback,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
  priority?: boolean;
  sizes?: string;
  /** Imagen secundaria (miniaturas, tarjetas lejos de la primera pantalla): se pide con prioridad baja para no competir con la principal. */
  lowPriority?: boolean;
  /** Calidad del optimizador (60 o 75). */
  quality?: 60 | 75;
  fallback: React.ReactNode;
}) {
  if (!hasAsset(src)) return <>{fallback}</>;
  return <Image src={src} alt={alt} width={width} height={height} className={className} priority={priority} sizes={sizes} {...(quality ? { quality } : {})} {...(lowPriority && !priority ? { fetchPriority: "low" as const } : {})} />;
}
