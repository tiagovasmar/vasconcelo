import { getDb } from "@/db/client";
import { setRecordArchived } from "@/features/admin/record-archives";
import { adminAction } from "@/server/admin-api";

export async function POST(req: Request) {
  return adminAction(req, "record-archives", ({ user, body }) => setRecordArchived(getDb(), body, user));
}
