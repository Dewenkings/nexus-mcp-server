import { timingSafeEqual } from "node:crypto";

export function isAuthorized(authorization: string | undefined, configuredToken: string | undefined): boolean {
  const token = configuredToken?.trim();
  if (!token) return true;
  const expected = Buffer.from(`Bearer ${token}`);
  const actual = Buffer.from(authorization ?? "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
