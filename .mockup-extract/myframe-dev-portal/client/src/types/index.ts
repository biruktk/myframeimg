export interface ApiParam {
  name: string;
  required: boolean;
  type: string;
  description: string;
  defaultValue: string;
}

export interface Api {
  id: string;
  name: string;
  nameEn: string;
  category: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  url: string;
  description: string;
  requestNote?: string;
  responseNote?: string;
  params: ApiParam[];
  responseExample: string;
  dependencies: string[];
}

export type MenuSection = "quick-guide" | "demo" | "api-list";

export interface QuickGuideItem {
  id: string;
  title: string;
  content: string;
}

export interface DemoStep {
  id: string;
  title: string;
  description: string;
  apis: string[]; // Related API IDs
}

export type ConsoleLevel = "info" | "warn" | "error" | "debug" | "success";

export interface ConsoleEntry {
  id: string;
  timestamp: string;
  level: ConsoleLevel;
  message: string;
  detail?: string;
}

export type ExecutionStatus = "idle" | "loading" | "success" | "error";

export interface ExecutionResult {
  status: ExecutionStatus;
  response?: string;
  error?: string;
  durationMs?: number;
}

export type CodeLanguage = "javascript" | "typescript" | "python" | "curl";

export interface CodeSnippet {
  language: CodeLanguage;
  label: string;
  code: string;
}
