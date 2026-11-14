/* ==========================================================================
   Netlify Blobs uchun qulay qatlam.
   --------------------------------------------------------------------------
   Netlify'da ishlaganda ma'lumotlar Blobs'da saqlanadi.
   Lokal testda (NETLIFY_BLOBS_CONTEXT yo'q) xotirada saqlanadi.

   Production'da (NETLIFY_BLOBS_CONTEXT bor) xotiraga jimgina o'tib
   ketmaymiz — xato yuz bersa, xato ko'tariladi va Payme so'rovni qayta
   yuboradi. Shu bilan to'lov yozuvi yo'qolib qolmaydi.
   ========================================================================== */

import { getStore } from "@netlify/blobs";

const memory = new Map();
const strict = Boolean(process.env.NETLIFY_BLOBS_CONTEXT);
let store = null;
let checked = false;

function blobs() {
  if (checked) return store;
  checked = true;

  try {
    store = getStore({ name: "prompt-kursi", consistency: "strong" });
  } catch (error) {
    if (strict) throw error;
    store = null;
  }

  return store;
}

function failed(action, key, error) {
  console.error("Blobs " + action + " failed:", key, error && error.message);
  if (strict) throw error;
}

export async function read(key) {
  const s = blobs();

  if (s) {
    try {
      const value = await s.get(key, { type: "json" });
      if (value !== null && value !== undefined) return value;
    } catch (error) {
      failed("read", key, error);
    }
  }

  return memory.has(key) ? memory.get(key) : null;
}

export async function write(key, value) {
  const s = blobs();

  if (s) {
    try {
      await s.setJSON(key, value);
      return value;
    } catch (error) {
      failed("write", key, error);
    }
  }

  memory.set(key, value);
  return value;
}

export async function remove(key) {
  const s = blobs();

  if (s) {
    try {
      await s.delete(key);
    } catch (error) {
      failed("delete", key, error);
    }
  }

  memory.delete(key);
}

export async function list(prefix) {
  const s = blobs();

  if (s) {
    try {
      const result = await s.list({ prefix });
      const items = result.blobs || [];
      const values = [];

      for (const item of items) {
        const value = await s.get(item.key, { type: "json" });
        if (value) values.push(value);
      }

      return values;
    } catch (error) {
      failed("list", prefix, error);
    }
  }

  return Array.from(memory.entries())
    .filter(([key]) => key.indexOf(prefix) === 0)
    .map(([, value]) => value);
}
