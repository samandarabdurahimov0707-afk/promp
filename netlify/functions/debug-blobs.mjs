/* Vaqtinchalik diagnostika funksiyasi. Tekshiruvdan keyin o'chiriladi. */

import { getStore } from "@netlify/blobs";

export async function handler() {
  const envKeys = Object.keys(process.env)
    .filter((key) => /NETLIFY|BLOBS|SITE|AWS_LAMBDA|LAMBDA/i.test(key))
    .sort();

  const report = {
    envKeys,
    hasBlobsContext: Boolean(process.env.NETLIFY_BLOBS_CONTEXT),
    siteIdPresent: Boolean(process.env.SITE_ID),
    storeError: null,
    writeError: null,
    readError: null,
    roundTrip: null
  };

  let store = null;

  try {
    store = getStore({ name: "prompt-kursi", consistency: "strong" });
    report.storeOk = true;
  } catch (error) {
    report.storeError = String(error && error.message);
  }

  if (store) {
    const key = "debug/" + Date.now();

    try {
      await store.setJSON(key, { ok: true, at: Date.now() });
      report.writeOk = true;
    } catch (error) {
      report.writeError = String(error && error.message);
    }

    try {
      const value = await store.get(key, { type: "json" });
      report.roundTrip = value;
    } catch (error) {
      report.readError = String(error && error.message);
    }
  }

  return {
    statusCode: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
    body: JSON.stringify(report, null, 2)
  };
}
