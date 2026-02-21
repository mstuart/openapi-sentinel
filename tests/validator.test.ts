import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMatcher } from '../src/matcher.js';
import { validateRequest, validateResponse } from '../src/validator.js';
import type { OpenApiSpec } from '../src/types.js';

const spec: OpenApiSpec = {
  openapi: '3.1.0',
  info: { title: 'Test', version: '1.0.0' },
  paths: {
    '/users': {
      get: {
        parameters: [
          { name: 'limit', in: 'query', required: false },
          { name: 'page', in: 'query', required: true },
        ],
        responses: { '200': { description: 'OK' } },
      },
      post: {
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email'],
                properties: {
                  email: { type: 'string' },
                  name: { type: 'string' },
                  age: { type: 'number' },
                },
              },
            },
          },
        },
        responses: { '201': { description: 'Created' } },
      },
    },
    '/users/{id}': {
      get: {
        responses: {
          '200': { description: 'OK' },
          '404': { description: 'Not Found' },
        },
      },
    },
  },
};

const match = createMatcher(spec);

describe('validateRequest', () => {
  it('POST /users with valid JSON body passes', async () => {
    const req = new Request('http://localhost/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.com', name: 'Alice' }),
    });
    const matched = match('POST', '/users')!;
    const violations = await validateRequest(req, matched, '/users');
    assert.equal(violations.length, 0);
  });

  it('POST /users missing required email field produces violation', async () => {
    const req = new Request('http://localhost/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Alice' }),
    });
    const matched = match('POST', '/users')!;
    const violations = await validateRequest(req, matched, '/users');
    assert.equal(violations.length, 1);
    assert.equal(violations[0].type, 'request');
    assert.ok(violations[0].issue.includes('Missing required field: email'));
  });

  it('POST /users with unknown field produces violation', async () => {
    const req = new Request('http://localhost/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.com', legacyId: 99 }),
    });
    const matched = match('POST', '/users')!;
    const violations = await validateRequest(req, matched, '/users');
    assert.equal(violations.length, 1);
    assert.ok(violations[0].issue.includes('Unknown field: legacyId'));
  });

  it('POST /users with wrong type produces violation', async () => {
    const req = new Request('http://localhost/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.com', age: 'not-a-number' }),
    });
    const matched = match('POST', '/users')!;
    const violations = await validateRequest(req, matched, '/users');
    assert.equal(violations.length, 1);
    assert.ok(violations[0].issue.includes("Field 'age' expected type 'number'"));
  });

  it('POST /users with wrong Content-Type produces violation', async () => {
    const req = new Request('http://localhost/users', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'not json',
    });
    const matched = match('POST', '/users')!;
    const violations = await validateRequest(req, matched, '/users');
    assert.ok(violations.some((v) => v.issue.includes('Unexpected Content-Type')));
  });

  it('GET /users missing required query param produces violation', async () => {
    const req = new Request('http://localhost/users');
    const matched = match('GET', '/users')!;
    const violations = await validateRequest(req, matched, '/users');
    assert.equal(violations.length, 1);
    assert.ok(violations[0].issue.includes('Missing required query parameter: page'));
  });

  it('GET /users with required query param passes', async () => {
    const req = new Request('http://localhost/users?page=1');
    const matched = match('GET', '/users')!;
    const violations = await validateRequest(req, matched, '/users');
    assert.equal(violations.length, 0);
  });
});

describe('validateResponse', () => {
  it('200 response matches spec — no violation', async () => {
    const req = new Request('http://localhost/users/123');
    const res = new Response('OK', { status: 200 });
    const matched = match('GET', '/users/123')!;
    const violations = await validateResponse(req, res, matched, '/users/123');
    assert.equal(violations.length, 0);
  });

  it('unexpected status code not in spec produces violation', async () => {
    const req = new Request('http://localhost/users/123');
    const res = new Response('', { status: 500 });
    const matched = match('GET', '/users/123')!;
    const violations = await validateResponse(req, res, matched, '/users/123');
    assert.equal(violations.length, 1);
    assert.equal(violations[0].type, 'response');
    assert.ok(violations[0].issue.includes('Unexpected response status 500'));
  });

  it('404 response matches spec — no violation', async () => {
    const req = new Request('http://localhost/users/123');
    const res = new Response('Not Found', { status: 404 });
    const matched = match('GET', '/users/123')!;
    const violations = await validateResponse(req, res, matched, '/users/123');
    assert.equal(violations.length, 0);
  });
});
