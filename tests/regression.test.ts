import assert from "node:assert/strict";
import { it } from "node:test";
import type { MatchedOperation, SchemaObject } from "../src/types.js";
import { validateRequest, validateResponse } from "../src/validator.js";

function operation(schema: SchemaObject): MatchedOperation {
  return {
    operation: {
      requestBody: {
        content: { "application/json": { schema } },
        required: true,
      },
      responses: { "200": { description: "OK" } },
    },
    pathParams: {},
    pathTemplate: "/items",
  };
}
function request(body?: string): Request {
  return new Request("https://example.com/items", {
    body,
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

it("rejects fractional integers and nonfinite JSON numbers", async () => {
  const matched = operation({
    properties: { count: { type: "integer" }, price: { type: "number" } },
    type: "object",
  });
  const violations = await validateRequest(
    request('{"count":1.5,"price":1e400}'),
    matched,
    "/items"
  );
  assert.equal(violations.length, 2);
  assert.equal(
    (
      await validateRequest(
        request('{"count":2,"price":3.5}'),
        matched,
        "/items"
      )
    ).length,
    0
  );
});
it("reports required bodies missing even when Content-Type is present", async () => {
  const violations = await validateRequest(
    request(),
    operation({ type: "object" }),
    "/items"
  );
  assert.ok(
    violations.some((v) => v.issue === "Request body is required but missing")
  );
});
it("validates the top-level JSON type without misclassifying valid JSON", async () => {
  const wrongObject = await validateRequest(
    request('"text"'),
    operation({ type: "object" }),
    "/items"
  );
  assert.equal(wrongObject.length, 1);
  assert.ok(wrongObject[0].issue.includes("expected type"));
  const wrongArray = await validateRequest(
    request("{}"),
    operation({ type: "array" }),
    "/items"
  );
  assert.equal(wrongArray.length, 1);
  assert.equal(
    (
      await validateRequest(
        request('"text"'),
        operation({ type: "string" }),
        "/items"
      )
    ).length,
    0
  );
  assert.equal(
    (
      await validateRequest(
        request("null"),
        operation({ type: "null" }),
        "/items"
      )
    ).length,
    0
  );
});
it("uses response ranges with exact-code then range then default precedence", async () => {
  const req = request("{}");
  const matched = operation({ type: "object" });
  matched.operation.responses = {
    "2XX": { content: { "application/json": {} }, description: "Success" },
    default: { content: { "text/plain": {} }, description: "Fallback" },
  };
  const response = new Response("{}", {
    headers: { "content-type": "application/json" },
    status: 201,
  });
  assert.equal(
    (await validateResponse(req, response, matched, "/items")).length,
    0
  );
  const wrongMedia = new Response("text", {
    headers: { "content-type": "text/plain" },
    status: 202,
  });
  assert.equal(
    (await validateResponse(req, wrongMedia, matched, "/items")).length,
    1
  );
  matched.operation.responses["201"] = {
    content: { "text/plain": {} },
    description: "Exact",
  };
  assert.equal(
    (await validateResponse(req, response, matched, "/items")).length,
    1
  );
});
