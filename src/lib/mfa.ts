import speakeasy from "speakeasy";

export function generateTotpSecret(label: string) {
  return speakeasy.generateSecret({ name: `Mail Orchestrator (${label})` });
}

export function verifyTotp(secret: string, token: string) {
  return speakeasy.totp.verify({
    secret,
    encoding: "base32",
    token,
    window: 1
  });
}
