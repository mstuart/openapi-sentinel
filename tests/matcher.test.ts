import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMatcher } from '../src/matcher.js';
import type { OpenApiSpec } from '../src/types.js';

const spec: OpenApiSpec = {
  openapi: '3.1.0',
  info: { title: 'Test', version: '1.0.0' },
  paths: {
    '/users': {
      get: {
        parameters: [{ name: 'limit', in: 'query', required: false }],
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
    '/teams/{teamId}/members/{memberId}': {
      get: {
        responses: { '200': { description: 'OK' } },
      },
    },
  },
};

describe('matchOperation', () => {
  const match = createMatcher(spec);

  it('GET /users matches paths./users.get', () => {
    const result = match('GET', '/users');
    assert.ok(result);
    assert.equal(result.pathTemplate, '/users');
    assert.deepEqual(result.pathParams, {});
    assert.ok(result.operation.responses['200']);
  });

  it('POST /users matches paths./users.post', () => {
    const result = match('POST', '/users');
    assert.ok(result);
    assert.equal(result.pathTemplate, '/users');
    assert.ok(result.operation.requestBody);
  });

  it('GET /users/123 matches paths./users/{id}.get', () => {
    const result = match('GET', '/users/123');
    assert.ok(result);
    assert.equal(result.pathTemplate, '/users/{id}');
    assert.equal(result.pathParams['id'], '123');
  });

  it('matches multiple path parameters', () => {
    const result = match('GET', '/teams/t1/members/m2');
    assert.ok(result);
    assert.equal(result.pathTemplate, '/teams/{teamId}/members/{memberId}');
    assert.equal(result.pathParams['teamId'], 't1');
    assert.equal(result.pathParams['memberId'], 'm2');
  });

  it('returns null for unmatched path', () => {
    const result = match('GET', '/unknown');
    assert.equal(result, null);
  });

  it('returns null for unmatched method on existing path', () => {
    const result = match('DELETE', '/users');
    assert.equal(result, null);
  });

  it('is case-insensitive for HTTP method', () => {
    const result = match('get', '/users');
    assert.ok(result);
  });
});
