import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { favorites } from "@/db/schema";
import { listProducts } from "@/features/catalog/data";
import type { Product } from "@/content/schema";

export class FavoriteError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Ids de los productos favoritos del usuario (solo los suyos). */
export async function listFavoriteIds(db: Db, userId: string): Promise<string[]> {
  return (await db.select().from(favorites).where(eq(favorites.userId, userId)).orderBy(asc(favorites.createdAt), asc(favorites.productId))).map((f) => f.productId);
}

/** Productos favoritos que siguen activos en el catálogo (si uno se retiró, deja de mostrarse pero no se pierde el registro). */
export async function listFavoriteProducts(db: Db, userId: string): Promise<Product[]> {
  const ids = new Set(await listFavoriteIds(db, userId));
  return (await listProducts(db)).filter((p) => ids.has(p.id));
}

/** Agrega un favorito sin duplicar (idempotente). Solo productos sellados activos del catálogo. */
export async function addFavorite(db: Db, userId: string, productId: string, now = Date.now()): Promise<void> {
  const exists = (await listProducts(db)).some((p) => p.id === productId);
  if (!exists) throw new FavoriteError(404, "Ese producto no existe o ya no está en el catálogo.");
  await db.insert(favorites).values({ userId, productId, createdAt: now }).onConflictDoNothing();
}

export async function removeFavorite(db: Db, userId: string, productId: string): Promise<void> {
  await db.delete(favorites).where(and(eq(favorites.userId, userId), eq(favorites.productId, productId)));
}

