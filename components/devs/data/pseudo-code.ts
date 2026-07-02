import type { Api } from "../types";

export function generatePseudoCode(api: Api): string[] {
  const lines: string[] = [];
  const indent = "  ";

  lines.push(`// ${api.nameEn}`);
  lines.push(`// ${api.description}`);
  lines.push("");

  if (api.dependencies.length > 0) {
    lines.push("// Prerequisites:");
    for (const depId of api.dependencies) {
      lines.push(`//   - Call ${depId} first`);
    }
    lines.push("");
  }

  if (api.auth === "admin") {
    lines.push("STEP 1: Admin auth (session cookie or x-admin-token)");
    lines.push(`${indent}POST /api/admin/login → sets myframe_admin_session cookie`);
    lines.push("");
  }

  lines.push("STEP 2: Build request");
  lines.push(`${indent}method = "${api.method}"`);
  lines.push(`${indent}path = "${api.proxyPath}"`);

  if (api.params.length > 0) {
    lines.push("");
    lines.push("STEP 3: Parameters");
    for (const param of api.params) {
      if (api.proxyPath.includes(`{${param.name}}`)) {
        lines.push(`${indent}path = path.replace("{${param.name}}", ${param.name})`);
      } else if (api.method === "GET") {
        lines.push(`${indent}query.${param.name} = ${param.name}`);
      } else {
        lines.push(`${indent}body.${param.name} = ${param.name}`);
      }
    }
  }

  lines.push("");
  lines.push("STEP 4: Execute via fetch (credentials: include)");
  lines.push(`${indent}response = fetch(origin + path, { method, credentials: "include", ... })`);
  lines.push(`${indent}return response.json()`);

  return lines;
}
