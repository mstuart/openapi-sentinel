import type { MatchedOperation, SchemaObject, Violation } from './types.js';

function now(): string {
  return new Date().toISOString();
}

/**
 * Basic structural type check for a value against a schema type string.
 */
function checkType(value: unknown, expectedType: string): boolean {
  switch (expectedType) {
    case 'string':
      return typeof value === 'string';
    case 'number':
    case 'integer':
      return typeof value === 'number';
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    default:
      return true; // unknown type, pass
  }
}

/**
 * Validate a request body against the matched operation's schema.
 * Performs structural checks: required fields, unknown fields, scalar types.
 */
function validateBody(
  body: Record<string, unknown>,
  schema: SchemaObject,
  method: string,
  path: string
): Violation[] {
  const violations: Violation[] = [];

  // Check required fields
  if (schema.required) {
    for (const field of schema.required) {
      if (!(field in body)) {
        violations.push({
          type: 'request',
          method,
          path,
          issue: `Missing required field: ${field}`,
          timestamp: now(),
        });
      }
    }
  }

  // Check unknown fields at top level
  if (schema.properties) {
    for (const key of Object.keys(body)) {
      if (!(key in schema.properties)) {
        violations.push({
          type: 'request',
          method,
          path,
          issue: `Unknown field: ${key}`,
          timestamp: now(),
        });
      }
    }
  }

  // Check types for known properties
  if (schema.properties) {
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (key in body && propSchema.type) {
        if (!checkType(body[key], propSchema.type)) {
          violations.push({
            type: 'request',
            method,
            path,
            issue: `Field '${key}' expected type '${propSchema.type}', got '${typeof body[key]}'`,
            timestamp: now(),
          });
        }
      }
    }
  }

  return violations;
}

/**
 * Validate an incoming request against its matched OpenAPI operation.
 */
export async function validateRequest(
  req: Request,
  matched: MatchedOperation,
  pathname: string
): Promise<Violation[]> {
  const violations: Violation[] = [];
  const method = req.method.toUpperCase();

  // Check required query parameters
  if (matched.operation.parameters) {
    const url = new URL(req.url, 'http://localhost');
    for (const param of matched.operation.parameters) {
      if (param.in === 'query' && param.required) {
        if (!url.searchParams.has(param.name)) {
          violations.push({
            type: 'request',
            method,
            path: pathname,
            issue: `Missing required query parameter: ${param.name}`,
            timestamp: now(),
          });
        }
      }
    }
  }

  // Validate request body if operation expects one
  if (matched.operation.requestBody) {
    const rb = matched.operation.requestBody;
    const contentType = req.headers.get('content-type') || '';

    if (rb.required && !req.body && contentType === '') {
      violations.push({
        type: 'request',
        method,
        path: pathname,
        issue: 'Request body is required but missing',
        timestamp: now(),
      });
    }

    // Check Content-Type matches one of the expected media types
    const expectedTypes = Object.keys(rb.content);
    const baseContentType = contentType.split(';')[0].trim();

    if (baseContentType && expectedTypes.length > 0 && !expectedTypes.includes(baseContentType)) {
      violations.push({
        type: 'request',
        method,
        path: pathname,
        issue: `Unexpected Content-Type '${baseContentType}', expected one of: ${expectedTypes.join(', ')}`,
        timestamp: now(),
      });
    }

    // Validate body structure for JSON
    if (baseContentType === 'application/json' && rb.content['application/json']?.schema) {
      try {
        const cloned = req.clone();
        const body = (await cloned.json()) as Record<string, unknown>;
        const schema = rb.content['application/json'].schema!;
        violations.push(...validateBody(body, schema, method, pathname));
      } catch {
        violations.push({
          type: 'request',
          method,
          path: pathname,
          issue: 'Request body is not valid JSON',
          timestamp: now(),
        });
      }
    }
  }

  return violations;
}

/**
 * Validate a response against the matched OpenAPI operation.
 */
export async function validateResponse(
  req: Request,
  res: Response,
  matched: MatchedOperation,
  pathname: string
): Promise<Violation[]> {
  const violations: Violation[] = [];
  const method = req.method.toUpperCase();
  const statusCode = String(res.status);

  // Check that the status code is defined in the spec
  const definedStatuses = Object.keys(matched.operation.responses);
  if (!definedStatuses.includes(statusCode) && !definedStatuses.includes('default')) {
    violations.push({
      type: 'response',
      method,
      path: pathname,
      issue: `Unexpected response status ${statusCode}, expected one of: ${definedStatuses.join(', ')}`,
      timestamp: now(),
    });
  }

  // Check response Content-Type if spec defines content for this status
  const responseSpec = matched.operation.responses[statusCode] || matched.operation.responses['default'];
  if (responseSpec?.content) {
    const contentType = res.headers.get('content-type') || '';
    const baseContentType = contentType.split(';')[0].trim();
    const expectedTypes = Object.keys(responseSpec.content);

    if (baseContentType && expectedTypes.length > 0 && !expectedTypes.includes(baseContentType)) {
      violations.push({
        type: 'response',
        method,
        path: pathname,
        issue: `Unexpected response Content-Type '${baseContentType}', expected one of: ${expectedTypes.join(', ')}`,
        timestamp: now(),
      });
    }
  }

  return violations;
}
