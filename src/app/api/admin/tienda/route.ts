import { getDb } from "@/db/client";
import { saveStorefrontConfig } from "@/features/admin/storefront";
import { adminAction } from "@/server/admin-api";

export function PATCH(req: Request) {
  return adminAction(req, "tienda", async ({ body, user }) => {
    return saveStorefrontConfig(getDb(), body, user.email);
  }, { limit: 30 });
}
