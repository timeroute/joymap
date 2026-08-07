import { describe, expect, test } from "bun:test";
import pkg from "../package.json";
import { version } from "../src/version";

describe("version", () => {
  test("matches package.json", () => {
    expect(version).toBe(pkg.version);
  });
});
