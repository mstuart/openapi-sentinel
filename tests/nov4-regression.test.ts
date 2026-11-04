import assert from "node:assert/strict";
import { it } from "node:test";
import type { MatchedOperation } from "../src/types.js";
import { validateRequest, validateResponse } from "../src/validator.js";

function target(media = "application/json"): MatchedOperation {
  return {
    operation: {
      requestBody: {
        content: { [media]: { schema: { required: ["id"], type: "object" } } },
      },
      responses: { "200": { content: { [media]: {} }, description: "OK" } },
    },
    pathParams: {},
    pathTemplate: "/items",
  };
}

it("validates JSON syntax and fields for structured JSON media types", async () => {
  await Promise.all(
    ["{}", "not json"].map(async (body) => {
      const req = new Request("https://example.com/items", {
        body,
        headers: { "content-type": "Application/Problem+JSON; charset=utf-8" },
        method: "POST",
      });
      const violations = await validateRequest(
        req,
        target("application/problem+json"),
        "/items"
      );
      assert.equal(violations.length, 1);
      assert.equal(
        violations[0].issue,
        body === "{}"
          ? "Missing required field: id"
          : "Request body is not valid JSON"
      );
    })
  );
  const req = new Request("https://example.com/items", {
    body: '{"id":1}',
    headers: { "content-type": "application/problem+json" },
    method: "POST",
  });
  assert.deepEqual(
    await validateRequest(req, target("application/problem+json"), "/items"),
    []
  );
});

it("checks the effective media type of bodies without Content-Type", async () => {
  const bytes = new TextEncoder().encode("{}");
  const req = new Request("https://example.com/items", {
    body: bytes,
    method: "POST",
  });
  const res = new Response(bytes);
  assert.equal(req.headers.has("content-type"), false);
  assert.equal(res.headers.has("content-type"), false);
  assert.equal((await validateRequest(req, target(), "/items")).length, 1);
  assert.equal(
    (await validateResponse(req, res, target(), "/items")).length,
    1
  );
  assert.deepEqual(await validateRequest(req, target("*/*"), "/items"), []);
  assert.deepEqual(
    await validateResponse(req, res, target("*/*"), "/items"),
    []
  );
  assert.deepEqual(
    await validateResponse(req, new Response(null), target(), "/items"),
    []
  );
});
