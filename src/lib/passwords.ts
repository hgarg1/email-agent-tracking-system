import bcrypt from "bcryptjs";

export function hashPassword(password: string) {
  if (password.startsWith("$2a$") || password.startsWith("$2b$")) {
    return password;
  }
  const salt = bcrypt.genSaltSync(10);
  return bcrypt.hashSync(password, salt);
}

export function verifyPassword(password: string, hash: string) {
  if (hash.startsWith("$2a$") || hash.startsWith("$2b$")) {
    return bcrypt.compareSync(password, hash);
  }
  return password === hash;
}
