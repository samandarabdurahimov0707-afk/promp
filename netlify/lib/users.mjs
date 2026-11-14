/* ==========================================================================
   Foydalanuvchi hisoblari (email + parol).
   --------------------------------------------------------------------------
   Parollar scrypt bilan xeshlanadi; ochiq parol hech qayerda saqlanmaydi.
   Email indeksi SHA-256 orqali saqlanadi.
   ========================================================================== */

import crypto from "node:crypto";
import { read, write } from "./store.mjs";

const USER_PREFIX = "users/";
const EMAIL_PREFIX = "email/";
const EMAIL_MAX = 254;

export function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

export function validEmail(email) {
  return (
    email.length >= 5 &&
    email.length <= EMAIL_MAX &&
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)
  );
}

export function validPassword(password) {
  return (
    typeof password === "string" &&
    password.length >= 8 &&
    password.length <= 128
  );
}

export function validName(name) {
  const value = String(name || "").trim();
  return value.length >= 2 && value.length <= 80;
}

export function validUserId(id) {
  return /^[A-Za-z0-9_-]{8,64}$/.test(String(id || ""));
}

function emailKey(email) {
  return (
    EMAIL_PREFIX +
    crypto.createHash("sha256").update(email).digest("hex")
  );
}

export function publicUser(user) {
  if (!user) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt
  };
}

export async function findById(id) {
  if (!validUserId(id)) return null;
  return read(USER_PREFIX + id);
}

export async function findByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!validEmail(normalized)) return null;

  const id = await read(emailKey(normalized));
  if (!id) return null;

  return findById(id);
}

export function hashPassword(password, salt) {
  const value = salt || crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), value, 64).toString("hex");

  return { salt: value, hash: hash };
}

export function verifyPassword(password, salt, hash) {
  try {
    const computed = crypto.scryptSync(String(password), String(salt), 64);
    const expected = Buffer.from(String(hash), "hex");

    if (computed.length !== expected.length) return false;

    return crypto.timingSafeEqual(computed, expected);
  } catch (error) {
    return false;
  }
}

export async function createUser(input) {
  const name = String((input && input.name) || "").trim();
  const email = normalizeEmail(input && input.email);
  const password = input && input.password;

  const existing = await findByEmail(email);
  if (existing) return { error: "exists" };

  const id = crypto.randomUUID();
  const passwordData = hashPassword(password);
  const now = Date.now();

  const user = {
    id: id,
    name: name,
    email: email,
    salt: passwordData.salt,
    passwordHash: passwordData.hash,
    createdAt: now,
    updatedAt: now
  };

  await write(USER_PREFIX + id, user);
  await write(emailKey(email), id);

  return { user: user };
}

const DUMMY_SALT = "6f1c0d5a9b2e8f3a7c4d1e0b5a8f2c6d";

export async function authenticate(email, password) {
  const user = await findByEmail(email);

  if (!user) {
    /* Email mavjud bo'lmasa ham scrypt hisoblanadi — javob vaqti bo'yicha
       email bor-yo'qligini aniqlab bo'lmaydi. */
    try {
      crypto.scryptSync(String(password || ""), DUMMY_SALT, 64);
    } catch (error) {
      /* e'tiborsiz */
    }

    return null;
  }

  if (!verifyPassword(password, user.salt, user.passwordHash)) return null;

  return user;
}
