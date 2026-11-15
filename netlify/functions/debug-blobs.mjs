/* Vaqtinchalik diagnostika funksiyasi. Tekshiruvdan keyin o'chiriladi. */

import { getStore, getDeployStore } from "@netlify/blobs";

export async function handler() {
  const siteID = process.env.SITE_ID || process.env.NETLIFY_SITE_ID || "";
  const token =
    process.env.NETLIFY_BLOBS_TOKEN ||
    process.env.NETLIFY_FUNCTIONS_TOKEN ||
    "";

  const report = {
    allEnvKeys: Object.keys(process.env).sort(),
    siteIdPresent: Boolean(siteID),
    tokenSource: process.env.NETLIFY_BLOBS_TOKEN
      ? "NETLIFY_BLOBS_TOKEN"
      : process.env.NETLIFY_FUNCTIONS_TOKEN
        ? "NETLIFY_FUNCTIONS_TOKEN"
        : "none",
    siteStore: null,
    deployStore: null
  };

  try {
    const store = getStore({
      name: "prompt-kursi",
      consistency: "strong",
      siteID,
      token
    });
    const key = "debug/" + Date.now();
    await store.setJSON(key, { ok: true });
    report.siteStore = await store.get(key, { type: "json" });
  } catch (error) {
    report.siteStore = "ERROR: " + String(error && error.message);
  }

  try {
    const deploy = getDeployStore({
      name: "prompt-kursi",
      siteID,
      token
    });
    const key = "debug/" + Date.now();
    await deploy.setJSON(key, { ok: true });
    report.deployStore = await deploy.get(key, { type: "json" });
  } catch (error) {
    report.deployStore = "ERROR: " + String(error && error.message);
  }

  return {
    statusCode: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
    body: JSON.stringify(report, null, 2)
  };
}
