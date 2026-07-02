import type { QuickGuideItem } from "../types";

export const QUICK_GUIDE_ITEMS: QuickGuideItem[] = [
  {
    id: "auth",
    title: "1. Authentication",
    content:
      "All API requests require authentication via an API key. Include your API key in the `Authorization` header:\n\n`Authorization: Bearer YOUR_API_KEY`\n\nYou can generate or manage your API keys from the MyFrame developer dashboard at https://myframe.ink/devs.",
  },
  {
    id: "base-url",
    title: "2. Base URL",
    content:
      "The base URL for all API requests is:\n\n`https://api.myframe.ink/v1`\n\nAll endpoints are prefixed with this base URL. The current API version is v1.",
  },
  {
    id: "request-format",
    title: "3. Request Format",
    content:
      "All requests must include the `Content-Type: application/json` header for JSON payloads. For file uploads, use `multipart/form-data`.\n\nGET requests pass parameters as query strings. POST/PUT requests pass parameters as JSON in the request body.",
  },
  {
    id: "rate-limiting",
    title: "4. Rate Limiting",
    content:
      "API rate limits are enforced per API key:\n- Standard tier: 100 requests/minute\n- Pro tier: 1,000 requests/minute\n\nRate limit headers are included in all responses:\n- `X-RateLimit-Limit`\n- `X-RateLimit-Remaining`\n- `X-RateLimit-Reset`\n\nWhen exceeded, the API returns HTTP 429.",
  },
  {
    id: "errors",
    title: "5. Error Handling",
    content:
      "The API returns standard HTTP status codes:\n- 2xx: Success\n- 4xx: Client error (bad request, auth failure, rate limit)\n- 5xx: Server error\n\nError responses follow this format:\n```json\n{\"error\":{\"code\":\"invalid_param\",\"message\":\"Parameter 'id' is required\",\"details\":{}}}\n```",
  },
];
