/** The Hub's authenticated endpoint. A public listing ignores a bogus bearer. */
export const AUTH_CHECK_URL = "https://huggingface.co/api/whoami-v2";

export type AuthResult = "ok" | "rejected" | "other";

export function authResult(status: number): AuthResult {
  if (status === 200) return "ok";
  if (status === 401 || status === 403) return "rejected";
  return "other";
}
