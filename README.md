# openapi-sentinel

Runtime OpenAPI 3.1 request/response validation middleware. Detect spec drift live in staging environments. Zero runtime dependencies.

## Motivation

API specifications and implementations drift apart over time. New fields get added without updating the spec, required fields get silently dropped, and response shapes change without notice. **openapi-sentinel** catches these mismatches at runtime by validating actual HTTP traffic against your OpenAPI 3.1 specification.

Run it in staging to build a drift report before each release. Or run it in development to catch contract violations as you code.

## Install

```bash
npm install openapi-sentinel
```

## Quick Start

```typescript
import { createSentinel } from 'openapi-sentinel';
import spec from './openapi.json';

const sentinel = createSentinel({
  spec,
  validate: {
    request: true,
    response: true,
    onViolation: 'warn',
  },
  report: {
    driftReportPath: './drift-report.json',
  },
});
```

## Framework Integration

### Hono

```typescript
import { Hono } from 'hono';
import { createSentinel } from 'openapi-sentinel';

const app = new Hono();
const sentinel = createSentinel({
  spec: myOpenApiSpec,
  validate: { request: true, response: true, onViolation: 'warn' },
});

app.use('*', sentinel.middleware());

app.get('/users', (c) => c.json({ users: [] }));
```

### Generic Web Standards

Any framework that uses the Web Standards `Request`/`Response` API:

```typescript
const mw = sentinel.middleware();

// In your handler:
const response = await mw(request, async () => {
  // your handler logic
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
```

### Express / Fastify (via adapter)

Wrap the Web Standards middleware with a framework-specific adapter:

```typescript
// Express example
app.use((req, res, next) => {
  const webReq = new Request(`http://${req.headers.host}${req.url}`, {
    method: req.method,
    headers: req.headers as any,
    body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined,
  });

  const mw = sentinel.middleware();
  mw(webReq, async () => {
    // Let Express handle the actual response
    next();
    return new Response(); // placeholder
  });
});
```

## onViolation Modes

| Mode | Behavior |
|------|----------|
| `'throw'` | Throws an error immediately on first violation. Use in tests or strict development. |
| `'warn'` | Logs violations via `console.warn`. Use in staging for visibility without breaking requests. |
| `'log'` | Logs violations via `console.log`. Quieter alternative for production-adjacent environments. |

In all modes, violations are accumulated and available via `sentinel.getViolations()`.

## Drift Report

When `report.driftReportPath` is set, openapi-sentinel writes a JSON report of all accumulated violations on process exit:

```json
{
  "generatedAt": "2026-01-15T10:30:00.000Z",
  "totalViolations": 3,
  "violations": [
    {
      "type": "request",
      "method": "POST",
      "path": "/users",
      "issue": "Unknown field: legacyId",
      "timestamp": "2026-01-15T10:25:00.000Z"
    }
  ]
}
```

Use this in CI to detect spec drift:

```bash
node your-staging-tests.js
# After tests, check the drift report
if [ -f drift-report.json ]; then
  violations=$(node -e "console.log(require('./drift-report.json').totalViolations)")
  if [ "$violations" -gt "0" ]; then
    echo "Spec drift detected: $violations violations"
    exit 1
  fi
fi
```

## Direct Validation

For testing or one-off checks without middleware:

```typescript
const violations = await sentinel.validateRequest(request);
const responseViolations = await sentinel.validateResponse(request, response);
const allViolations = sentinel.getViolations();
```

## What Gets Validated

### Requests
- Required query parameters are present
- Content-Type matches spec-defined media types
- Required body fields are present (JSON bodies)
- No unknown top-level fields (JSON bodies)
- Scalar field types match (string, number, boolean)

### Responses
- Status code is defined in the spec
- Content-Type matches spec-defined media types

## YAML Specs

openapi-sentinel accepts parsed objects. For YAML specs, parse them first:

```typescript
import { readFileSync } from 'fs';
import yaml from 'js-yaml';

const spec = yaml.load(readFileSync('./openapi.yaml', 'utf8'));
const sentinel = createSentinel({ spec, validate: { onViolation: 'warn' } });
```

## License

MIT
