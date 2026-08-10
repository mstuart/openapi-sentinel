import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSentinel } from "../src/sentinel.js";

const spec = {
  info: { title: "Test", version: "1.0.0" },
  openapi: "3.1.0",
  paths: {
    "/users": {
      get: {
        parameters: [{ in: "query", name: "limit", required: false }],
        responses: { "200": { description: "OK" } },
      },
      post: {
        requestBody: {
          content: {
            "application/json": {
              schema: {
                properties: {
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

describe("OpenApiSentinel", () => {
  it("validateRequest passes for valid request", async () => {
    const sentinel = createSentinel({
      spec,
      validate: { onViolation: "log" },
    });

    const req = new Request("http://localhost/users", {
      body: JSON.stringify({ email: "a@b.com" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    const violations = await sentinel.validateRequest(req);
    assert.equal(violations.length, 0);
  });

  it("validateRequest detects missing required field", async () => {
    const sentinel = createSentinel({
      spec,
      validate: { onViolation: "log" },
    });

    const req = new Request("http://localhost/users", {
      body: JSON.stringify({ name: "Alice" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    const violations = await sentinel.validateRequest(req);
    assert.equal(violations.length, 1);
    assert.ok(violations[0].issue.includes("Missing required field: email"));
  });

  it("validateResponse detects unexpected status code", async () => {
    const sentinel = createSentinel({
      spec,
      validate: { onViolation: "log", response: true },
    });

    const req = new Request("http://localhost/users/123");
    const res = new Response("", { status: 500 });

    const violations = await sentinel.validateResponse(req, res);
    assert.equal(violations.length, 1);
    assert.ok(violations[0].issue.includes("Unexpected response status 500"));
  });

  it("getViolations accumulates across multiple calls", async () => {
    const sentinel = createSentinel({
      spec,
      validate: { onViolation: "log", response: true },
    });

    // First: missing email
    const req1 = new Request("http://localhost/users", {
      body: JSON.stringify({ name: "Alice" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    await sentinel.validateRequest(req1);

    // Second: unexpected status
    const req2 = new Request("http://localhost/users/123");
    const res2 = new Response("", { status: 500 });
    await sentinel.validateResponse(req2, res2);

    const all = sentinel.getViolations();
    assert.equal(all.length, 2);
    assert.equal(all[0].type, "request");
    assert.equal(all[1].type, "response");
  });

  it("middleware passes through for unknown paths", async () => {
    const sentinel = createSentinel({
      spec,
      validate: { onViolation: "throw" },
    });

    const mw = sentinel.middleware();
    const req = new Request("http://localhost/unknown");
    const res = await mw(req, async () => new Response("OK"));
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.equal(text, "OK");
  });

  it("middleware throws on violation when onViolation is throw", async () => {
    const sentinel = createSentinel({
      spec,
      validate: { onViolation: "throw" },
    });

    const mw = sentinel.middleware();
    const req = new Request("http://localhost/users", {
      body: JSON.stringify({ name: "no email" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    await assert.rejects(
      () => mw(req, async () => new Response("OK", { status: 201 })),
      (err: Error) => {
        assert.ok(err.message.includes("Missing required field: email"));
        return true;
      }
    );
  });

  it("middleware validates response when enabled", async () => {
    const sentinel = createSentinel({
      spec,
      validate: { onViolation: "log", response: true },
    });

    const mw = sentinel.middleware();
    const req = new Request("http://localhost/users/123");
    await mw(req, async () => new Response("", { status: 500 }));

    const violations = sentinel.getViolations();
    assert.ok(
      violations.some((v) => v.issue.includes("Unexpected response status 500"))
    );
  });

  it("creates sentinel from JSON string spec", async () => {
    const sentinel = createSentinel({
      spec: JSON.stringify(spec),
      validate: { onViolation: "log" },
    });

    const req = new Request("http://localhost/users");
    const violations = await sentinel.validateRequest(req);
    assert.equal(violations.length, 0);
  });

  it("returns empty violations for paths not in spec", async () => {
    const sentinel = createSentinel({
      spec,
      validate: { onViolation: "log" },
    });

    const req = new Request("http://localhost/not-in-spec");
    const violations = await sentinel.validateRequest(req);
    assert.equal(violations.length, 0);
  });
});
