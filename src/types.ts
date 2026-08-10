// OpenAPI 3.1 subset types — just enough for validation

export interface OpenApiSpec {
  info: { title: string; version: string };
  openapi: string;
  paths: Record<string, PathItem>;
}

export interface PathItem {
  delete?: Operation;
  get?: Operation;
  head?: Operation;
  options?: Operation;
  patch?: Operation;
  post?: Operation;
  put?: Operation;
}

export type HttpMethod =
  | "get"
  | "post"
  | "put"
  | "patch"
  | "delete"
  | "options"
  | "head";

export interface Operation {
  parameters?: Parameter[];
  requestBody?: RequestBody;
  responses: Record<string, ResponseObject>;
}

export interface Parameter {
  in: "query" | "header" | "path" | "cookie";
  name: string;
  required?: boolean;
  schema?: SchemaObject;
}

export interface RequestBody {
  content: Record<string, MediaType>;
  required?: boolean;
}

export interface MediaType {
  schema?: SchemaObject;
}

export interface ResponseObject {
  content?: Record<string, MediaType>;
  description: string;
}

export interface SchemaObject {
  items?: SchemaObject;
  properties?: Record<string, SchemaObject>;
  required?: string[];
  type?: string;
}

// Sentinel types

export interface SentinelOptions {
  report?: {
    driftReportPath?: string;
  };
  spec: object | string;
  validate: {
    request?: boolean;
    response?: boolean;
    onViolation: "throw" | "warn" | "log";
  };
}

export interface Violation {
  issue: string;
  method: string;
  path: string;
  timestamp: string;
  type: "request" | "response";
}

export interface MatchedOperation {
  operation: Operation;
  pathParams: Record<string, string>;
  pathTemplate: string;
}
