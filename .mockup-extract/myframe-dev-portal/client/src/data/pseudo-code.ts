import type { Api } from "../types";

export function generatePseudoCode(api: Api): string[] {
  const lines: string[] = [];
  const indent = "  ";

  lines.push(`// ${api.nameEn}`);
  lines.push(`// ${api.description}`);
  lines.push("");

  // Dependencies
  if (api.dependencies.length > 0) {
    lines.push("// Prerequisites:");
    for (const depId of api.dependencies) {
      lines.push(`//   - Requires result from API: ${depId}`);
    }
    lines.push("");
  }

  // Auth step
  lines.push("STEP 1: Authenticate");
  lines.push(`${indent}token = auth.getToken(apiKey)`);
  lines.push(`${indent}if token is invalid → return 401`);
  lines.push("");

  // Request building
  lines.push(`STEP 2: Build Request`);
  lines.push(`${indent}method = "${api.method}"`);
  lines.push(`${indent}url = "${api.url}"`);
  lines.push(`${indent}headers = {`);
  lines.push(`${indent}${indent}"Authorization": "Bearer " + token`);
  lines.push(`${indent}${indent}"Content-Type": "application/json"`);
  lines.push(`${indent}}`);

  // Parameters
  if (api.params.length > 0) {
    lines.push("");
    lines.push(`STEP 3: Set Parameters`);
    for (const param of api.params) {
      if (api.url.includes(`{${param.name}}`)) {
        lines.push(`${indent}// Replace {${param.name}} in URL path`);
        lines.push(`${indent}url = url.replace("{${param.name}}", ${param.name})`);
      } else if (api.method === "GET") {
        lines.push(`${indent}queryParams.${param.name} = ${param.name}  // ${param.type}, ${param.required ? "required" : "optional"}`);
      } else {
        lines.push(`${indent}body.${param.name} = ${param.name}  // ${param.type}, ${param.required ? "required" : "optional"}`);
      }
    }
  }

  // Validation
  lines.push("");
  lines.push("STEP 4: Validate Required Fields");
  lines.push(`${indent}for each required param:`);
  lines.push(`${indent}${indent}if param is empty → return validation error`);
  lines.push("");

  // Execute
  lines.push(`STEP 5: Execute ${api.method} Request`);
  lines.push(`${indent}response = httpClient.${api.method.toLowerCase()}(url, headers, data)`);
  lines.push(`${indent}statusCode = response.status`);
  lines.push("");

  // Response handling
  lines.push("STEP 6: Handle Response");
  lines.push(`${indent}if 200 ≤ statusCode < 300:`);
  lines.push(`${indent}${indent}return response.json()`);
  lines.push(`${indent}else if statusCode === 401:`);
  lines.push(`${indent}${indent}→ Token expired, refresh authentication`);
  lines.push(`${indent}else if statusCode === 429:`);
  lines.push(`${indent}${indent}→ Rate limited, wait and retry`);
  lines.push(`${indent}else if statusCode ≥ 500:`);
  lines.push(`${indent}${indent}→ Server error, retry with backoff`);
  lines.push(`${indent}else:`);
  lines.push(`${indent}${indent}→ Return error object`);

  return lines;
}
