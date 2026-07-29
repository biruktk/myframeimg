import { manageHtmlResponse } from "@/lib/serve-manage-html";

export const dynamic = "force-dynamic";

export async function GET() {
  return manageHtmlResponse();
}
