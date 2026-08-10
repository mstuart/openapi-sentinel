import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMatcher } from "../src/matcher.js";
import type { OpenApiSpec } from "../src/types.js";
import { validateRequest, validateResponse } from "../src/validator.js";

const spec: OpenApiSpec = {
  info: { title: "Test", version: "1.0.0" },
  openapi: "3.1.0",
  paths: {
    "/users": {
      get: {
        parameters: [
          { in: "query", name: "limit", required: false },
          { in: "query", name: "page", required: true },
        ],
        responses: { "200": { description: "OK" } },
      },
      post: {
        requestBody: {
          content: {
            "application/json": {
              schema: {
                properties: {
                  age: { type: "number" },
                  email: { type: "string" },
                  name: { type: "string" },
                },
                required: ["email"],
                type: "object",
              },
            },
          },
          required: true,
        },
        responses: { "201": { description: "Created" } },
      },
    },
    "/users/{id}": {
      get: {
        responses: {
          "200": { description: "OK" },
          "404": { description: "Not Found" },
        },
      },
    },
  },
};

const match = createMatcher(spec);

function matchRequired(method: string, pathname: string) {
  const result = match(method, pathname);
  assert.ok(result);
  return result;
}

describe("validateRequest", () => {
  it("POST /users with valid JSON body passes", async () => {
    const req = new Request("http://localhost/users", {
      body: JSON.stringify({ email: "a@b.com", name: "Alice" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const matched = matchRequired("POST", "/users");
    const violations = await validateRequest(req, matched, "/users");
    assert.equal(violations.length, 0);
  });

  it("POST /users missing required email field produces violation", async () => {
    const req = new Request("http://localhost/users", {
      body: JSON.stringify({ name: "Alice" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const matched = matchRequired("POST", "/users");
    const violations = await validateRequest(req, matched, "/users");
    assert.equal(violations.length, 1);
    assert.equal(violations[0].type, "request");
    assert.ok(violations[0].issue.includes("Missing required field: email"));
  });

  it("POST /users with unknown field produces violation", async () => {
    const req = new Request("http://localhost/users", {
      body: JSON.stringify({ email: "a@b.com", legacyId: 99 }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const matched = matchRequired("POST", "/users");
    const violations = await validateRequest(req, matched, "/users");
    assert.equal(violations.length, 1);
    assert.ok(violations[0].issue.includes("Unknown field: legacyId"));
  });

  it("POST /users with wrong type produces violation", async () => {
    const req = new Request("http://localhost/users", {
      body: JSON.stringify({ age: "not-a-number", email: "a@b.com" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const matched = matchRequired("POST", "/users");
    const violations = await validateRequest(req, matched, "/users");
    assert.equal(violations.length, 1);
    assert.ok(
      violations[0].issue.includes("Field 'age' expected type 'number'")
    );
  });

  it("POST /users with wrong Content-Type produces violation", async () => {
    const req = new Request("http://localhost/users", {
      body: "not json",
      headers: { "Content-Type": "text/plain" },
      method: "POST",
    });
    const matched = matchRequired("POST", "/users");
    const violations = await validateRequest(req, matched, "/users");
    assert.ok(
      violations.some((v) => v.issue.includes("Unexpected Content-Type"))
    );
  });

  it("GET /users missing required query param produces violation", async () => {
    const req = new Request("http://localhost/users");
    const matched = matchRequired("GET", "/users");
    const violations = await validateRequest(req, matched, "/users");
    assert.equal(violations.length, 1);
    assert.ok(
      violations[0].issue.includes("Missing required query parameter: page")
    );
  });

  it("GET /users with required query param passes", async () => {
    const req = new Request("http://localhost/users?page=1");
    const matched = matchRequired("GET", "/users");
    const violations = await validateRequest(req, matched, "/users");
    assert.equal(violations.length, 0);
  });
});

describe("validateResponse", () => {
  it("200 response matches spec — no violation", async () => {
    const req = new Request("http://localhost/users/123");
    const res = new Response("OK", { status: 200 });
    const matched = matchRequired("GET", "/users/123");
    const violations = await validateResponse(req, res, matched, "/users/123");
    assert.equal(violations.length, 0);
  });

  it("unexpected status code not in spec produces violation", async () => {
    const req = new Request("http://localhost/users/123");
    const res = new Response("", { status: 500 });
    const matched = matchRequired("GET", "/users/123");
    const violations = await validateResponse(req, res, matched, "/users/123");
    assert.equal(violations.length, 1);
    assert.equal(violations[0].type, "response");
    assert.ok(violations[0].issue.includes("Unexpected response status 500"));
  });

  it("404 response matches spec — no violation", async () => {
    const req = new Request("http://localhost/users/123");
    const res = new Response("Not Found", { status: 404 });
    const matched = matchRequired("GET", "/users/123");
    const violations = await validateResponse(req, res, matched, "/users/123");
    assert.equal(violations.length, 0);
  });
});
