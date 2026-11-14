/* ==========================================================================
   Payme Merchant API (avtomatik to'lov tasdiqlash).
   POST /api/payme
   --------------------------------------------------------------------------
   Payme serveri shu manzilga JSON-RPC so'rovlar yuboradi:
     CheckPerformTransaction, CreateTransaction, PerformTransaction,
     CancelTransaction, CheckTransaction, GetStatement.

   To'lov muvaffaqiyatli bo'lganda (PerformTransaction) foydalanuvchiga
   kirish huquqi avtomatik beriladi — admin sahifasida qo'lda tasdiqlash
   shart emas.

   Environment variables:
     PAYME_MERCHANT_ID — Payme Business kabinetidagi merchant ID
     PAYME_KEY         — Payme Business'dagi maxfiy kalit
     COURSE_PRICE      — kurs narxi so'mda (Payme'ga tiyinda yuboriladi)

   Payme kabinetida webhook manzili:
     https://SAYTINGIZ.netlify.app/api/payme
   ========================================================================== */

import crypto from "node:crypto";
import { list, read, remove, write } from "../lib/store.mjs";
import { price } from "../lib/settings.mjs";

const TX_PREFIX = "payme/";
const ORDER_PREFIX = "orders/";
const ENTITLEMENT_PREFIX = "entitlements/";
const LOGIN = "Paycom";
const TIMEOUT_MS = 12 * 60 * 60 * 1000;

/* ------------------------------ Yordamchilar ----------------------------- */

function rpc(id, result) {
  return {
    jsonrpc: "2.0",
    id: id === undefined ? null : id,
    result: result
  };
}

function rpcError(id, code, message, data) {
  const error = { code: code, message: message };
  if (data) error.data = data;

  return {
    jsonrpc: "2.0",
    id: id === undefined ? null : id,
    error: error
  };
}

function respond(body) {
  return {
    statusCode: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store"
    },
    body: JSON.stringify(body)
  };
}

function safeEqual(a, b) {
  const bufferA = Buffer.from(String(a));
  const bufferB = Buffer.from(String(b));

  if (bufferA.length !== bufferB.length) return false;
  return crypto.timingSafeEqual(bufferA, bufferB);
}

function authorized(event) {
  const key = String(process.env.PAYME_KEY || "");
  if (key.length < 8) return false;

  const headers = event.headers || {};
  const header = String(
    headers.authorization || headers.Authorization || ""
  ).trim();

  const expected =
    "Basic " + Buffer.from(LOGIN + ":" + key).toString("base64");

  return safeEqual(header, expected);
}

function amountTiyin() {
  return price() * 100;
}

function validUid(uid) {
  return /^[A-Za-z0-9_-]{8,64}$/.test(uid);
}

function validTxId(id) {
  return /^[A-Za-z0-9_-]{1,64}$/.test(id);
}

async function getTx(id) {
  return read(TX_PREFIX + id);
}

async function saveTx(tx) {
  return write(TX_PREFIX + tx.id, tx);
}

async function grant(uid, tx) {
  await write(ENTITLEMENT_PREFIX + uid, {
    uid: uid,
    paidAt: tx.perform_time,
    code: "payme:" + tx.id,
    amount: Math.round(tx.amount / 100)
  });
}

async function revokeIfOnly(uid, txId) {
  const results = await Promise.all([list(TX_PREFIX), list(ORDER_PREFIX)]);

  const stillPayme = results[0].some(function (item) {
    return (
      item &&
      item.uid === uid &&
      item.state === 2 &&
      item.id !== txId
    );
  });

  const stillManual = results[1].some(function (order) {
    return order && order.uid === uid && order.status === "paid";
  });

  const stillPaid = stillPayme || stillManual;

  if (!stillPaid) await remove(ENTITLEMENT_PREFIX + uid);

  return stillPaid;
}

function accountUid(params) {
  const account = (params && params.account) || {};
  return String(account.uid || "").trim();
}

function validateAccount(params) {
  const uid = accountUid(params);

  if (!validUid(uid)) {
    return { error: { code: -31050, message: "Account not found" } };
  }

  const amount = Number(params && params.amount);

  if (!Number.isFinite(amount) || amount !== amountTiyin()) {
    return { error: { code: -31001, message: "Incorrect amount" } };
  }

  return { uid: uid, amount: amount };
}

/* -------------------------------- Metodlar ------------------------------- */

function checkPerformTransaction(id, params) {
  const check = validateAccount(params);
  if (check.error) return rpcError(id, check.error.code, check.error.message);

  return rpc(id, { allow: true });
}

async function createTransaction(id, params) {
  const check = validateAccount(params);
  if (check.error) return rpcError(id, check.error.code, check.error.message);

  const txId = String(params.id || "");

  if (!validTxId(txId)) {
    return rpcError(id, -31008, "Unable to perform operation");
  }

  const existing = await getTx(txId);

  if (existing) {
    if (existing.state === 1) {
      return rpc(id, {
        create_time: existing.create_time,
        transaction: existing.id,
        state: 1
      });
    }

    if (existing.state === 2) {
      return rpc(id, {
        create_time: existing.create_time,
        transaction: existing.id,
        perform_time: existing.perform_time,
        state: 2
      });
    }

    return rpcError(id, -31008, "Transaction is cancelled");
  }

  const now = Date.now();

  const tx = {
    id: txId,
    uid: check.uid,
    amount: check.amount,
    state: 1,
    create_time: Number(params.time) || now,
    perform_time: 0,
    cancel_time: 0,
    reason: 0
  };

  await saveTx(tx);

  return rpc(id, {
    create_time: tx.create_time,
    transaction: tx.id,
    state: 1
  });
}

async function performTransaction(id, params) {
  const txId = String(params.id || "");
  const tx = validTxId(txId) ? await getTx(txId) : null;

  if (!tx) return rpcError(id, -31003, "Transaction not found");

  if (tx.state === 2) {
    return rpc(id, {
      transaction: tx.id,
      perform_time: tx.perform_time,
      state: 2
    });
  }

  if (tx.state < 0) {
    return rpcError(id, -31008, "Unable to perform operation");
  }

  if (Date.now() - tx.create_time > TIMEOUT_MS) {
    tx.state = -1;
    tx.cancel_time = Date.now();
    tx.reason = 4;
    await saveTx(tx);

    return rpcError(id, -31008, "Transaction timed out");
  }

  tx.state = 2;
  tx.perform_time = Date.now();
  await saveTx(tx);

  await grant(tx.uid, tx);

  return rpc(id, {
    transaction: tx.id,
    perform_time: tx.perform_time,
    state: 2
  });
}

async function cancelTransaction(id, params) {
  const txId = String(params.id || "");
  const tx = validTxId(txId) ? await getTx(txId) : null;

  if (!tx) return rpcError(id, -31003, "Transaction not found");

  if (tx.state === -1 || tx.state === -2) {
    return rpc(id, {
      transaction: tx.id,
      cancel_time: tx.cancel_time,
      state: tx.state
    });
  }

  if (tx.state === 2) {
    tx.state = -2;
    await revokeIfOnly(tx.uid, tx.id);
  } else {
    tx.state = -1;
  }

  tx.cancel_time = Date.now();
  tx.reason = Number(params.reason) || 0;
  await saveTx(tx);

  return rpc(id, {
    transaction: tx.id,
    cancel_time: tx.cancel_time,
    state: tx.state
  });
}

async function checkTransaction(id, params) {
  const txId = String(params.id || "");
  const tx = validTxId(txId) ? await getTx(txId) : null;

  if (!tx) return rpcError(id, -31003, "Transaction not found");

  return rpc(id, {
    create_time: tx.create_time,
    perform_time: tx.perform_time,
    cancel_time: tx.cancel_time,
    transaction: tx.id,
    state: tx.state,
    reason: tx.reason
  });
}

async function getStatement(id, params) {
  const from = Number(params.from) || 0;
  const to = Number(params.to) || Date.now();

  const all = await list(TX_PREFIX);

  const transactions = all
    .filter(function (tx) {
      return tx && tx.create_time >= from && tx.create_time <= to;
    })
    .map(function (tx) {
      return {
        id: tx.id,
        time: tx.create_time,
        amount: tx.amount,
        account: { uid: tx.uid },
        create_time: tx.create_time,
        perform_time: tx.perform_time,
        cancel_time: tx.cancel_time,
        transaction: tx.id,
        state: tx.state,
        reason: tx.reason
      };
    });

  return rpc(id, { transactions: transactions });
}

/* -------------------------------- Handler -------------------------------- */

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return respond(rpcError(null, -32600, "Invalid request"));
  }

  let body;

  try {
    body = JSON.parse(event.body || "{}");
  } catch (error) {
    return respond(rpcError(null, -32700, "Parse error"));
  }

  const id = body && body.id;
  const method = body && body.method;
  const params = (body && body.params) || {};

  if (!authorized(event)) {
    return respond(rpcError(id, -32504, "Insufficient privilege"));
  }

  if (!method || typeof method !== "string") {
    return respond(rpcError(id, -32600, "Invalid request"));
  }

  switch (method) {
    case "CheckPerformTransaction":
      return respond(checkPerformTransaction(id, params));
    case "CreateTransaction":
      return respond(await createTransaction(id, params));
    case "PerformTransaction":
      return respond(await performTransaction(id, params));
    case "CancelTransaction":
      return respond(await cancelTransaction(id, params));
    case "CheckTransaction":
      return respond(await checkTransaction(id, params));
    case "GetStatement":
      return respond(await getStatement(id, params));
    default:
      return respond(rpcError(id, -32601, "Method not found"));
  }
}
