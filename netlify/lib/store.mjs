/* ==========================================================================
   Netlify Blobs uchun qulay qatlam.
   --------------------------------------------------------------------------
   Netlify'da ishlaganda ma'lumotlar Blobs'da saqlanadi. Kontekst
   (`NETLIFY_BLOBS_CONTEXT`) berilmasa, `SITE_ID` + `NETLIFY_FUNCTIONS_TOKEN`
   bilan qo'lda sozlanadi.
   Lokal testda (na kontekst, na token) xotirada saqlanadi.

   Production'da (Blobs sozlangan) xotiraga jimgina o'tib ketmaymiz — xato
   yuz bersa, xato ko'tariladi va Payme so'rovni qayta yuboradi. Shu bilan
   to'lov yozuvi yo'qolib qolmaydi.
   ========================================================================== */

import { getStore } from "@netlify/blobs";

const memory = new Map();

/* Netlify funksiyalarda `NETLIFY_BLOBS_CONTEXT` har doim ham berilmaydi.
   Bunday holatda `SITE_ID` va `NETLIFY_FUNCTIONS_TOKEN` bilan qo'lda
   sozlaymiz — bu Netlify tomonidan tavsiya etilgan rasmiy usul. */
function config() {
  const siteID = process.env.SITE_ID || process.env.NETLIFY_SITE_ID || "";
  const token =
    process.env.NETLIFY_BLOBS_TOKEN ||
    process.env.NETLIFY_FUNCTIONS_TOKEN ||
    "";

  return siteID && token ? { siteID, token } : null;
}

const production = Boolean(process.env.NETLIFY_BLOBS_CONTEXT || config());
const strict = production;
let store = null;
let checked = false;

function blobs() {
  if (checked) return store;
  checked = true;

  const manual = config();

  try {
    store = getStore(
      manual
        ? { name: "prompt-kursi", consistency: "strong", ...manual }
        : { name: "prompt-kursi", consistency: "strong" }
    );
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

/* Health tekshiruvi uchun: saqlash qatlami haqiqatan ishlayaptimi. */
export async function blobsReady() {
  const s = blobs();
  if (!s) return false;

  try {
    await s.get("health/ping");
    return true;
  } catch (error) {
    return false;
  }
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

/* --------------------------------------------------------------------------
   Ikkilik ma'lumot (video bo'laklari) uchun yordamchilar.
   -------------------------------------------------------------------------- */

function toBuffer(value) {
  if (!value) return null;
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }

  return null;
}

function toArrayBuffer(value) {
  const buffer = toBuffer(value);
  if (!buffer) return null;

  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  );
}

export async function writeBytes(key, value) {
  const buffer = toBuffer(value);
  if (!buffer) throw new Error("writeBytes: noto'g'ri ma'lumot");

  const s = blobs();

  if (s) {
    try {
      await s.set(key, toArrayBuffer(buffer));
      return true;
    } catch (error) {
      failed("writeBytes", key, error);
    }
  }

  memory.set(key, buffer);
  return true;
}

export async function readBytes(key) {
  const s = blobs();

  if (s) {
    try {
      const value = await s.get(key, { type: "arrayBuffer" });
      if (value !== null && value !== undefined) return Buffer.from(value);
    } catch (error) {
      failed("readBytes", key, error);
    }
  }

  return memory.has(key) ? toBuffer(memory.get(key)) : null;
}

export async function removeKeys(keys) {
  const list = Array.isArray(keys) ? keys.filter(Boolean) : [];

  if (!list.length) return;

  const s = blobs();

  if (s) {
    try {
      await Promise.all(
        list.map(function (key) {
          return s.delete(key);
        })
      );
    } catch (error) {
      failed("removeKeys", list.length + " ta kalit", error);
    }
  }

  list.forEach(function (key) {
    memory.delete(key);
  });
}

export async function listKeys(prefix) {
  const s = blobs();

  if (s) {
    try {
      const result = await s.list({ prefix });
      return (result.blobs || []).map(function (item) {
        return item.key;
      });
    } catch (error) {
      failed("listKeys", prefix, error);
    }
  }

  return Array.from(memory.keys()).filter(function (key) {
    return key.indexOf(prefix) === 0;
  });
}
