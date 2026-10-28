import assert from "node:assert/strict";
import { it } from "node:test";
import { createMatcher } from "../src/matcher.js";
import type {
  MatchedOperation,
  OpenApiSpec,
  Operation,
  SchemaObject,
} from "../src/types.js";
import { validateRequest, validateResponse } from "../src/validator.js";

function operation(): Operation {
  return { responses: { "200": { description: "OK" } } };
}
function spec(paths: OpenApiSpec["paths"]): OpenApiSpec {
  return { info: { title: "test", version: "1" }, openapi: "3.1.1", paths };
}
function matched(schema: SchemaObject, required = true): MatchedOperation {
  return {
    operation: {
      ...operation(),
      requestBody: { content: { "application/json": { schema } }, required },
    },
    pathParams: {},
    pathTemplate: "/items",
  };
}
function request(body?: string, contentType = "application/json"): Request {
  return new Request("https://example.com/items", {
    body,
    headers: { "content-type": contentType },
    method: "POST",
  });
}

it("checks required and unknown JSON fields as own properties", async () => {
  const schema = {
    properties: { name: { type: "string" } },
    required: ["toString"],
    type: "object",
  };
  const missing = await validateRequest(
    request('{"name":"A"}'),
    matched(schema),
    "/items"
  );
  assert.ok(
    missing.some((v) => v.issue === "Missing required field: toString")
  );
  const unknown = await validateRequest(
    request('{"toString":"value"}'),
    matched({ properties: { name: { type: "string" } }, type: "object" }),
    "/items"
  );
  assert.ok(unknown.some((v) => v.issue === "Unknown field: toString"));
});
it("does not match inherited object methods as HTTP operations", () => {
  const match = createMatcher(
    spec({ "/items": { get: operation(), trace: operation() } })
  );
  for (const method of ["constructor", "toString", "__proto__", "parameters"]) {
    assert.equal(match(method, "/items"), null);
  }
  assert.ok(match("GET", "/items"));
  assert.ok(match("TRACE", "/items"));
});
it("preserves prototype-named path parameters as own data", () => {
  const match = createMatcher(
    spec({ "/items/{__proto__}": { get: operation() } })
  );
  const result = match("GET", "/items/a%20b");
  assert.ok(result);
  assert.equal(Object.hasOwn(result.pathParams, "__proto__"), true);
  assert.equal(
    Object.getOwnPropertyDescriptor(result.pathParams, "__proto__")?.value,
    "a b"
  );
  assert.equal(Object.getPrototypeOf(result.pathParams), Object.prototype);
});
it("does not fall through concrete paths to another operation", () => {
  const match = createMatcher(
    spec({
      "/items/{id}": { get: operation() },
      "/items/me": { post: operation() },
    })
  );
  assert.equal(match("GET", "/items/me"), null);
  assert.equal(match("POST", "/items/me")?.pathTemplate, "/items/me");
  assert.equal(match("GET", "/items/other")?.pathTemplate, "/items/{id}");
});
it("matches content media ranges and selects the most specific JSON schema", async () => {
  const target = matched({ type: "object" });
  target.operation.requestBody = {
    content: { "application/*": { schema: { type: "object" } } },
  };
  assert.deepEqual(
    await validateRequest(
      request("{}", "Application/JSON; charset=utf-8"),
      target,
      "/items"
    ),
    []
  );
  assert.equal(
    (await validateRequest(request('"text"'), target, "/items")).length,
    1
  );
  target.operation.requestBody.content["application/json"] = {
    schema: { type: "string" },
  };
  assert.deepEqual(
    await validateRequest(request('"text"'), target, "/items"),
    []
  );
  target.operation.responses["200"].content = { "text/*": {} };
  assert.deepEqual(
    await validateResponse(
      request("{}"),
      new Response("ok", { headers: { "content-type": "Text/Plain" } }),
      target,
      "/items"
    ),
    []
  );
});
it("accepts absent optional JSON bodies without parsing them", async () => {
  assert.deepEqual(
    await validateRequest(
      request(),
      matched({ type: "object" }, false),
      "/items"
    ),
    []
  );
  assert.equal(
    (
      await validateRequest(
        request("not json"),
        matched({ type: "object" }, false),
        "/items"
      )
    ).length,
    1
  );
});
it("inherits path-level query parameters with operation overrides", async () => {
  const op = operation();
  op.parameters = [{ in: "query", name: "search", required: false }];
  const match = createMatcher(
    spec({
      "/items": {
        get: op,
        parameters: [
          { in: "query", name: "tenant", required: true },
          { in: "query", name: "search", required: true },
        ],
      },
    })
  );
  const target = match("GET", "/items");
  assert.ok(target);
  const missing = await validateRequest(
    new Request("https://example.com/items"),
    target,
    "/items"
  );
  assert.deepEqual(
    missing.map((v) => v.issue),
    ["Missing required query parameter: tenant"]
  );
  assert.deepEqual(
    await validateRequest(
      new Request("https://example.com/items?tenant=a"),
      target,
      "/items"
    ),
    []
  );
  assert.equal(op.parameters.length, 1);
});
it("checks array item types in top-level and property arrays", async () => {
  const array = matched({ items: { type: "integer" }, type: "array" });
  assert.equal(
    (await validateRequest(request("[1,2.5]"), array, "/items")).length,
    1
  );
  assert.deepEqual(
    await validateRequest(request("[1,2]"), array, "/items"),
    []
  );
  const object = matched({
    properties: { tags: { items: { type: "string" }, type: "array" } },
    type: "object",
  });
  assert.equal(
    (await validateRequest(request('{"tags":["a",3]}'), object, "/items"))
      .length,
    1
  );
});
