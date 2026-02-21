// OpenAPI 3.1 subset types — just enough for validation

export interface OpenApiSpec {
  openapi: string;
  info: { title: string; version: string };
  paths: Record<string, PathItem>;
}

export interface PathItem {
  get?: Operation;
  post?: Operation;
  put?: Operation;
  patch?: Operation;
  delete?: Operation;
  options?: Operation;
  head?: Operation;
}

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'options' | 'head';

export interface Operation {
  parameters?: Parameter[];
  requestBody?: RequestBody;
  responses: Record<string, ResponseObject>;
}

export interface Parameter {
  name: string;
  in: 'query' | 'header' | 'path' | 'cookie';
  required?: boolean;
  schema?: SchemaObject;
}

export interface RequestBody {
  required?: boolean;
  content: Record<string, MediaType>;
}

export interface MediaType {
  schema?: SchemaObject;
}

export interface ResponseObject {
  description: string;
  content?: Record<string, MediaType>;
}

export interface SchemaObject {
  type?: string;
  properties?: Record<string, SchemaObject>;
  required?: string[];
  items?: SchemaObject;
}

// Sentinel types

export interface SentinelOptions {
  spec: object | string;
  validate: {
    request?: boolean;
    response?: boolean;
    onViolation: 'throw' | 'warn' | 'log';
  };
  report?: {
    driftReportPath?: string;
  };
}

export interface Violation {
  type: 'request' | 'response';
  method: string;
  path: string;
  issue: string;
  timestamp: string;
}

export interface MatchedOperation {
  operation: Operation;
  pathTemplate: string;
  pathParams: Record<string, string>;
}
