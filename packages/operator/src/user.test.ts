import { describe, expect, it } from "vitest";
import { tokenUser } from "./user";

const jwt = (claims: object) => `x.${btoa(JSON.stringify(claims)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}.y`;

describe("tokenUser", () => {
  it("reads the name and role from a login token", () => expect(tokenUser(jwt({ sub: "dan", role: "admin" }))).toEqual({ name: "dan", role: "admin" }));
  it.each([null, "", "nonsense", "a.b", "a.%%%.c", jwt({ role: "admin" })])("%s is nobody", (t) => expect(tokenUser(t as string | null)).toBeNull());
});
