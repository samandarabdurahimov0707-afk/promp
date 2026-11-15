/* Vaqtinchalik diagnostika funksiyasi. Tekshiruvdan keyin o'chiriladi. */

import { getStore } from "@netlify/blobs";
import { blobsReady, read, write } from "../lib/store.mjs";

export async function handler() {
  const siteID = process.env.SITE_ID || process.env.NETLIFY_SITE_ID || "";
  const token =
    process.env.NETLIFY_BLOBS_TOKEN ||
    process.env.NETLIFY_FUNCTIONS_TOKEN ||
    "";

  const report = {
    siteIdPresent: Boolean(siteID),
    tokenPresent: Boolean(token),
    blobsReady: await blobsReady(),
    storeError: null,
    roundTrip: null
  };

  try {
    const store = getStore({
      name: "prompt-kursi",
      consistency: "strong",
      siteID,
      token
    });

    const key = "debug/" + Date.now();
    await store.setJSON(key, { ok: true, at: Date.now() });
    report.roundTrip = await store.get(key, { type: "json" });
  } catch (error) {
    report.storeError = String(error && error.message);
  }

  try {
    await write("debug/layer", { via: "store.mjs", at: Date.now() });
    report.layerRead = await read("debug/layer");
  } catch (error) {
    report.layerError = String(error && error.message);
  }

  return {
    statusCode: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
    body: JSON.stringify(report, null, 2)
  };
}
