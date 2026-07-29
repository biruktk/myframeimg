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
  /** Display URL shown in docs */
  url: string;
  /** Real Next.js proxy path executed by the portal */
  proxyPath: string;
  auth: "admin" | "none";
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
  apis: string[];
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
  statusCode?: number;
}

export type CodeLanguage = "javascript" | "typescript" | "python" | "curl";

export interface CodeSnippet {
  language: CodeLanguage;
  label: string;
  code: string;
}

export interface DevsStatus {
  ok?: boolean;
  mqtt?: {
    connected?: boolean;
    brokerUrl?: string | null;
    liveFrameCount?: number;
    mqttOnlineCount?: number;
  };
  messagesPerMin?: number;
  connectedClients?: number;
  registeredFrames?: number;
  totalLogEntries?: number;
  liveFrames?: Array<{
    mac: string;
    status: string;
    age: number;
    lastAction?: string | null;
    lastResult?: number | null;
  }>;
  frames?: Array<{
    id: string;
    bleMac?: string;
    wifiStatus?: string;
    firmwareVersion?: string;
  }>;
}

export interface LiveEndpointSample {
  ok: boolean;
  status: number;
  body: unknown;
}

export interface LiveBootstrap {
  ok: boolean;
  sampledAtMs: number;
  defaults: { deviceId: string; frameId: string };
  endpoints: Record<string, LiveEndpointSample>;
}
