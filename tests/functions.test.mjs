/* ==========================================================================
   Backend funksiyalar uchun avtomatik testlar.
   Ishlatish: npm test
   --------------------------------------------------------------------------
   Testlar haqiqiy handler'larni chaqiradi. Netlify Blobs mavjud bo'lmaganda
   `netlify/lib/store.mjs` xotiradan foydalanadi — shuning uchun testlar
   tashqi xizmatsiz ishlaydi.
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/* ------------------------------ Muhit ------------------------------------ */

process.env.ACCESS_SECRET = "test-access-secret-0123456789";
process.env.ADMIN_SECRET = "test-admin-secret-0123456789";
process.env.PAYME_KEY = "test-payme-key-0123456789";
process.env.PAYME_MERCHANT_ID = "test-merchant-id";
process.env.COURSE_PRICE = "20000";
process.env.PAYMENT_CARD_NUMBER = "9860012132172771";
delete process.env.NETLIFY_BLOBS_CONTEXT;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load(name) {
  return import(pathToFileURL(path.join(root, "netlify", "functions", name + ".mjs")).href);
}

const { handler: configHandler } = await load("config");
const { handler: healthHandler } = await load("health");
const { handler: orderHandler } = await load("order");
const { handler: accessHandler } = await load("access");
const { handler: authHandler } = await load("auth");
const { handler: adminHandler } = await load("admin");
const { handler: paymeHandler } = await load("payme");
const { handler: bunnyHandler } = await load("bunny-token");
const { verifyToken, verifySession, parseCookies } = await import(
  pathToFileURL(path.join(root, "netlify", "lib", "access.mjs")).href
);

/* ---------------------------- Yordamchilar -------------------------------- */

let ipCounter = 0;

function nextIp() {
  ipCounter += 1;
  return "10.10." + Math.floor(ipCounter / 200) + "." + ((ipCounter % 200) + 1);
}

function event(options) {
  const opts = options || {};

  return {
    httpMethod: opts.method || "POST",
    headers: Object.assign(
      { "x-nf-client-connection-ip": nextIp() },
      opts.headers || {}
    ),
    queryStringParameters: opts.query || {},
    body:
      opts.body === undefined || opts.body === null
        ? null
        : typeof opts.body === "string"
          ? opts.body
          : JSON.stringify(opts.body)
  };
}

function parse(response) {
  return JSON.parse(response.body);
}

function admin(secret, action, extra) {
  return adminHandler(
    event({
      body: Object.assign({ secret: secret, action: action }, extra || {})
    })
  ).then(parse);
}

function payme(method, params, id) {
  const auth =
    "Basic " + Buffer.from("Paycom:" + process.env.PAYME_KEY).toString("base64");

  return paymeHandler(
    event({
      headers: { authorization: auth },
      body: {
        jsonrpc: "2.0",
        id: id === undefined ? 1 : id,
        method: method,
        params: params || {}
      }
    })
  ).then(parse);
}

async function paid(uid) {
  const result = await accessHandler(
    event({ method: "GET", query: { uid: uid } })
  );

  return { body: parse(result), response: result };
}

const AMOUNT = 20000 * 100;

/* --------------------------------- Testlar -------------------------------- */

test("config: ommaviy sozlamalarni qaytaradi, maxfiy kalitlarni chiqarmaydi", async () => {
  const response = await configHandler(event({ method: "GET" }));
  const body = parse(response);

  assert.equal(response.statusCode, 200);
  assert.equal(body.price, 20000);
  assert.equal(body.cardNumber, "9860012132172771");
  assert.equal(body.paymeMerchantId, "test-merchant-id");
  assert.equal(body.paymeEnabled, true);
  assert.equal(body.telegram, "abay_pg");
  assert.equal(body.lang, "uz");
  assert.equal("paymeKey" in body, false);
  assert.equal("adminSecret" in body, false);
  assert.equal("accessSecret" in body, false);
});

test("health: sozlamalar to'liq bo'lsa ok qaytaradi", async () => {
  const response = await healthHandler(event({ method: "GET" }));
  const body = parse(response);

  assert.equal(response.statusCode, 200);
  assert.equal(body.ok, true);
  assert.equal(body.status, "ok");
  assert.equal(body.checks.adminSecret, true);
  assert.equal(body.checks.accessSecret, true);
  assert.equal(body.checks.paymeKey, true);
});

test("health: kalitlar yo'q bo'lsa degraded qaytaradi", async () => {
  const saved = {
    admin: process.env.ADMIN_SECRET,
    access: process.env.ACCESS_SECRET,
    key: process.env.PAYME_KEY,
    merchant: process.env.PAYME_MERCHANT_ID
  };

  delete process.env.ADMIN_SECRET;
  delete process.env.ACCESS_SECRET;
  delete process.env.PAYME_KEY;
  delete process.env.PAYME_MERCHANT_ID;

  try {
    const response = await healthHandler(event({ method: "GET" }));
    const body = parse(response);

    assert.equal(response.statusCode, 503);
    assert.equal(body.ok, false);
    assert.equal(body.status, "degraded");
    assert.equal(body.checks.adminSecret, false);
    assert.equal(body.checks.paymeKey, false);
  } finally {
    process.env.ADMIN_SECRET = saved.admin;
    process.env.ACCESS_SECRET = saved.access;
    process.env.PAYME_KEY = saved.key;
    process.env.PAYME_MERCHANT_ID = saved.merchant;
  }
});

test("order: buyurtma yaratadi va takroriy so'rovda shu kodni qaytaradi", async () => {
  const uid = "order-user-0001";

  const first = parse(
    await orderHandler(event({ body: { uid: uid } }))
  );

  assert.match(first.code, /^[A-Z2-9]{6}$/);
  assert.equal(first.amount, 20000);
  assert.ok(first.createdAt > 0);

  const second = parse(
    await orderHandler(event({ body: { uid: uid } }))
  );

  assert.equal(second.code, first.code);
});

test("order: noto'g'ri so'rovlarni rad etadi", async () => {
  const badMethod = await orderHandler(event({ method: "GET" }));
  assert.equal(badMethod.statusCode, 405);

  const badJson = await orderHandler(event({ body: "{not-json" }));
  assert.equal(badJson.statusCode, 400);

  const badUid = await orderHandler(event({ body: { uid: "x" } }));
  assert.equal(badUid.statusCode, 400);
});

test("access: to'lovsiz foydalanuvchi yopiq, to'lovdan keyin cookie bilan ochiladi", async () => {
  const uid = "access-user-0001";

  const before = await paid(uid);
  assert.equal(before.body.paid, false);
  assert.equal(before.response.headers["set-cookie"], undefined);

  const order = parse(await orderHandler(event({ body: { uid: uid } })));
  const activated = await admin(process.env.ADMIN_SECRET, "activate", {
    code: order.code
  });

  assert.equal(activated.ok, true);

  const after = await paid(uid);
  assert.equal(after.body.paid, true);
  assert.equal(after.body.uid, uid);

  const cookie = after.response.headers["set-cookie"];
  assert.ok(cookie && cookie.indexOf("pk_access=") === 0);
  assert.ok(cookie.indexOf("HttpOnly") !== -1);
  assert.ok(cookie.indexOf("SameSite=Lax") !== -1);

  const token = parseCookies(cookie).pk_access;
  assert.equal(verifyToken(token), uid);
  assert.equal(verifyToken(uid + ".deadbeef"), null);
  assert.equal(verifyToken("buzilgan-token"), null);
});

test("admin: noto'g'ri kalit va noto'g'ri amalni rad etadi", async () => {
  const unauthorized = await admin("noto-gri-kalit-123456", "overview");
  assert.equal(unauthorized.error, "Maxfiy kalit noto'g'ri");

  const invalid = await admin(process.env.ADMIN_SECRET, "noma-lum");
  assert.equal(invalid.error, "Amal noto'g'ri");

  const missing = await admin(process.env.ADMIN_SECRET, "activate", {
    code: "YOQ123"
  });
  assert.equal(missing.error, "Bunday kod topilmadi");
});

test("admin: overview statistika va buyurtmalarni birlashtiradi", async () => {
  const uid = "overview-user-01";
  const order = parse(await orderHandler(event({ body: { uid: uid } })));

  const overview = await admin(process.env.ADMIN_SECRET, "overview");

  assert.ok(overview.stats);
  assert.ok(overview.stats.total >= 1);
  assert.ok(overview.stats.pending >= 1);

  const found = overview.orders.find(function (item) {
    return item.code === order.code;
  });

  assert.ok(found);
  assert.equal(found.source, "manual");
  assert.equal(found.status, "pending");
  assert.equal(found.uid, uid);
});

test("admin: karta to'lovini tasdiqlaydi va bekor qiladi", async () => {
  const uid = "admin-user-00001";
  const order = parse(await orderHandler(event({ body: { uid: uid } })));

  const activated = await admin(process.env.ADMIN_SECRET, "activate", {
    code: order.code.toLowerCase()
  });

  assert.equal(activated.ok, true);
  assert.equal(activated.code, order.code);
  assert.equal((await paid(uid)).body.paid, true);

  const again = await admin(process.env.ADMIN_SECRET, "activate", {
    code: order.code
  });

  assert.equal(again.alreadyPaid, true);

  const revoked = await admin(process.env.ADMIN_SECRET, "revoke", {
    code: order.code
  });

  assert.equal(revoked.ok, true);
  assert.equal(revoked.stillPaid, false);
  assert.equal((await paid(uid)).body.paid, false);

  const twice = await admin(process.env.ADMIN_SECRET, "revoke", {
    code: order.code
  });

  assert.equal(twice.error, "Bu buyurtma to'lanmagan");
});

test("payme: avtorizatsiya va summani tekshiradi", async () => {
  const uid = "payme-check-0001";

  const denied = await paymeHandler(
    event({
      headers: { authorization: "Basic " + Buffer.from("Paycom:wrong").toString("base64") },
      body: {
        jsonrpc: "2.0",
        id: 7,
        method: "CheckPerformTransaction",
        params: { amount: AMOUNT, account: { uid: uid } }
      }
    })
  ).then(parse);

  assert.equal(denied.error.code, -32504);

  const ok = await payme("CheckPerformTransaction", {
    amount: AMOUNT,
    account: { uid: uid }
  });

  assert.deepEqual(ok.result, { allow: true });

  const wrongAmount = await payme("CheckPerformTransaction", {
    amount: 100,
    account: { uid: uid }
  });

  assert.equal(wrongAmount.error.code, -31001);

  const wrongAccount = await payme("CheckPerformTransaction", {
    amount: AMOUNT,
    account: { uid: "x" }
  });

  assert.equal(wrongAccount.error.code, -31050);
});

test("payme: to'liq tranzaksiya — yaratish, tasdiqlash, bekor qilish", async () => {
  const uid = "payme-user-00001";
  const txId = "payme-tx-000001";
  const time = Date.now();

  const created = await payme("CreateTransaction", {
    id: txId,
    time: time,
    amount: AMOUNT,
    account: { uid: uid }
  });

  assert.equal(created.result.state, 1);
  assert.equal(created.result.transaction, txId);

  const repeated = await payme("CreateTransaction", {
    id: txId,
    time: time,
    amount: AMOUNT,
    account: { uid: uid }
  });

  assert.equal(repeated.result.state, 1);
  assert.equal(repeated.result.create_time, created.result.create_time);

  const performed = await payme("PerformTransaction", { id: txId });
  assert.equal(performed.result.state, 2);
  assert.ok(performed.result.perform_time > 0);

  assert.equal((await paid(uid)).body.paid, true);

  const repeatedPerform = await payme("PerformTransaction", { id: txId });
  assert.equal(repeatedPerform.result.state, 2);
  assert.equal(
    repeatedPerform.result.perform_time,
    performed.result.perform_time
  );

  const checked = await payme("CheckTransaction", { id: txId });
  assert.equal(checked.result.state, 2);
  assert.equal(checked.result.transaction, txId);
  assert.equal(checked.result.reason, 0);

  const statement = await payme("GetStatement", { from: 0, to: time + 1000 });
  const found = statement.result.transactions.find(function (item) {
    return item.id === txId;
  });

  assert.ok(found);
  assert.equal(found.amount, AMOUNT);
  assert.equal(found.account.uid, uid);
  assert.equal(found.state, 2);

  const cancelled = await payme("CancelTransaction", { id: txId, reason: 5 });
  assert.equal(cancelled.result.state, -2);
  assert.ok(cancelled.result.cancel_time > 0);
  assert.equal((await paid(uid)).body.paid, false);

  const repeatedCancel = await payme("CancelTransaction", { id: txId });
  assert.equal(repeatedCancel.result.state, -2);

  const performCancelled = await payme("PerformTransaction", { id: txId });
  assert.equal(performCancelled.error.code, -31008);
});

test("payme: noma'lum tranzaksiya -31003 qaytaradi", async () => {
  const result = await payme("PerformTransaction", { id: "yoq-tx-0001" });
  assert.equal(result.error.code, -31003);

  const checked = await payme("CheckTransaction", { id: "yoq-tx-0001" });
  assert.equal(checked.error.code, -31003);
});

test("payme: vaqt tugagan tranzaksiya bekor qilinadi", async () => {
  const uid = "payme-timeout-01";
  const txId = "payme-timeout-tx";
  const old = Date.now() - 13 * 60 * 60 * 1000;

  await payme("CreateTransaction", {
    id: txId,
    time: old,
    amount: AMOUNT,
    account: { uid: uid }
  });

  const performed = await payme("PerformTransaction", { id: txId });
  assert.equal(performed.error.code, -31008);

  const checked = await payme("CheckTransaction", { id: txId });
  assert.equal(checked.result.state, -1);
});

test("kanallar orasi: Payme bekor qilinsa qo'lda to'lov saqlanadi", async () => {
  const uid = "cross-channel-01";
  const order = parse(await orderHandler(event({ body: { uid: uid } })));

  await admin(process.env.ADMIN_SECRET, "activate", { code: order.code });

  const txId = "cross-tx-manual-1";

  await payme("CreateTransaction", {
    id: txId,
    time: Date.now(),
    amount: AMOUNT,
    account: { uid: uid }
  });
  await payme("PerformTransaction", { id: txId });
  await payme("CancelTransaction", { id: txId });

  assert.equal((await paid(uid)).body.paid, true);

  const revoked = await admin(process.env.ADMIN_SECRET, "revoke", {
    code: order.code
  });

  assert.equal(revoked.stillPaid, false);
  assert.equal((await paid(uid)).body.paid, false);
});

test("kanallar orasi: qo'lda to'lov bekor qilinsa Payme to'lovi saqlanadi", async () => {
  const uid = "cross-channel-02";
  const txId = "cross-tx-payme-01";

  await payme("CreateTransaction", {
    id: txId,
    time: Date.now(),
    amount: AMOUNT,
    account: { uid: uid }
  });
  await payme("PerformTransaction", { id: txId });

  const order = parse(await orderHandler(event({ body: { uid: uid } })));
  await admin(process.env.ADMIN_SECRET, "activate", { code: order.code });

  const revoked = await admin(process.env.ADMIN_SECRET, "revoke", {
    code: order.code
  });

  assert.equal(revoked.stillPaid, true);
  assert.equal((await paid(uid)).body.paid, true);
});

/* ------------------------------ Hisoblar -------------------------------- */

function cookieFrom(response, name) {
  const raw = response.headers["set-cookie"] || "";
  return parseCookies(raw)[name] || "";
}

async function registerUser(email, guestUid) {
  return authHandler(
    event({
      body: {
        action: "register",
        name: "Test Foydalanuvchi",
        email: email,
        password: "parol12345",
        guestUid: guestUid || ""
      }
    })
  );
}

test("auth: ro'yxatdan o'tish sessiya cookie'si va xavfsiz profil qaytaradi", async () => {
  const response = await registerUser("Auth.User@Example.com");
  const body = parse(response);

  assert.equal(response.statusCode, 200);
  assert.equal(body.ok, true);
  assert.equal(body.user.email, "auth.user@example.com");
  assert.equal(body.user.name, "Test Foydalanuvchi");
  assert.equal("passwordHash" in body.user, false);
  assert.equal("salt" in body.user, false);

  const token = cookieFrom(response, "pk_session");
  assert.ok(token);
  assert.equal(verifySession(token), body.user.id);
  assert.equal(verifySession(token + "x"), null);

  const me = await authHandler(
    event({ method: "GET", headers: { cookie: "pk_session=" + token } })
  ).then(parse);

  assert.equal(me.user.id, body.user.id);
  assert.equal(me.paid, false);
});

test("auth: takroriy email, noto'g'ri parol va validatsiyani rad etadi", async () => {
  const email = "duplicate@example.com";
  const first = await registerUser(email);
  assert.equal(first.statusCode, 200);

  const duplicate = await registerUser(email.toUpperCase());
  assert.equal(duplicate.statusCode, 409);

  const shortPassword = await authHandler(
    event({
      body: {
        action: "register",
        name: "Qisqa Parol",
        email: "short@example.com",
        password: "123"
      }
    })
  );
  assert.equal(shortPassword.statusCode, 400);

  const wrongPassword = await authHandler(
    event({
      body: {
        action: "login",
        email: email,
        password: "noto-gri-parol"
      }
    })
  );
  assert.equal(wrongPassword.statusCode, 401);

  const unknown = await authHandler(
    event({
      body: {
        action: "login",
        email: "yoq@example.com",
        password: "parol12345"
      }
    })
  );
  assert.equal(unknown.statusCode, 401);
});

test("auth: kirish va chiqish — ikkala cookie ham tozalanadi", async () => {
  const email = "logout@example.com";
  await registerUser(email);

  const login = await authHandler(
    event({
      body: {
        action: "login",
        email: email.toUpperCase(),
        password: "parol12345"
      }
    })
  );
  const body = parse(login);

  assert.equal(login.statusCode, 200);
  assert.equal(body.user.email, email);
  assert.ok(cookieFrom(login, "pk_session"));

  const logout = await authHandler(
    event({ body: { action: "logout" } })
  );

  assert.equal(logout.statusCode, 200);
  assert.equal(parse(logout).user, null);

  const cookies = logout.multiValueHeaders["Set-Cookie"];
  assert.equal(cookies.length, 2);
  assert.ok(cookies[0].indexOf("pk_session=") === 0);
  assert.ok(cookies[0].indexOf("Max-Age=0") !== -1);
  assert.ok(cookies[1].indexOf("pk_access=") === 0);
  assert.ok(cookies[1].indexOf("Max-Age=0") !== -1);
});

test("auth: hisobga bog'langan buyurtma va sessiya ustuvorligi", async () => {
  const response = await registerUser("session-order@example.com");
  const body = parse(response);
  const token = cookieFrom(response, "pk_session");
  const cookie = "pk_session=" + token;

  const order = parse(
    await orderHandler(
      event({
        headers: { cookie: cookie },
        body: { uid: "spoof-user-0001" }
      })
    )
  );

  const overview = await admin(process.env.ADMIN_SECRET, "overview");
  const found = overview.orders.find(function (item) {
    return item.code === order.code;
  });

  assert.ok(found);
  assert.equal(found.uid, body.user.id);
  assert.equal(found.email, "session-order@example.com");

  await admin(process.env.ADMIN_SECRET, "activate", { code: order.code });

  const access = parse(
    await accessHandler(
      event({
        method: "GET",
        headers: { cookie: cookie },
        query: { uid: "spoof-user-0001" }
      })
    )
  );

  assert.equal(access.paid, true);
  assert.equal(access.uid, body.user.id);

  const me = await authHandler(
    event({ method: "GET", headers: { cookie: cookie } })
  ).then(parse);

  assert.equal(me.paid, true);
});

test("auth: mehmon to'lovi hisobga ko'chadi va mehmon huquqi o'chadi", async () => {
  const guest = "guest-merge-0001";
  const order = parse(await orderHandler(event({ body: { uid: guest } })));
  await admin(process.env.ADMIN_SECRET, "activate", { code: order.code });

  assert.equal((await paid(guest)).body.paid, true);

  const response = await registerUser("merge@example.com", guest);
  const body = parse(response);

  assert.equal(response.statusCode, 200);
  assert.equal(body.paid, true);
  assert.equal((await paid(guest)).body.paid, false);

  const overview = await admin(process.env.ADMIN_SECRET, "overview");
  const migrated = overview.orders.find(function (item) {
    return item.code === order.code;
  });

  assert.equal(migrated.uid, body.user.id);

  const access = parse(
    await accessHandler(
      event({
        method: "GET",
        headers: { cookie: "pk_session=" + cookieFrom(response, "pk_session") }
      })
    )
  );

  assert.equal(access.paid, true);
});

test("admin: bekor qilingan buyurtmani qayta ochadi", async () => {
  const uid = "reopen-user-0001";
  const order = parse(await orderHandler(event({ body: { uid: uid } })));

  await admin(process.env.ADMIN_SECRET, "activate", { code: order.code });
  await admin(process.env.ADMIN_SECRET, "revoke", { code: order.code });

  assert.equal((await paid(uid)).body.paid, false);

  const reopened = await admin(process.env.ADMIN_SECRET, "activate", {
    code: order.code
  });

  assert.equal(reopened.ok, true);
  assert.equal(reopened.reopened, true);
  assert.equal((await paid(uid)).body.paid, true);

  const overview = await admin(process.env.ADMIN_SECRET, "overview");
  const found = overview.orders.find(function (item) {
    return item.code === order.code;
  });

  assert.equal(found.status, "paid");
});

test("admin: email orqali ruxsat beradi va bekor qiladi", async () => {
  const email = "grant@example.com";
  const registered = parse(await registerUser(email));
  const userId = registered.user.id;

  const grant = await admin(process.env.ADMIN_SECRET, "grant", {
    email: email.toUpperCase()
  });

  assert.equal(grant.ok, true);
  assert.equal(grant.user.id, userId);
  assert.equal((await paid(userId)).body.paid, true);

  const again = await admin(process.env.ADMIN_SECRET, "grant", { email: email });
  assert.equal(again.alreadyPaid, true);

  const unknown = await admin(process.env.ADMIN_SECRET, "grant", {
    email: "topilmadi@example.com"
  });
  assert.equal(unknown.error, "Bu email bilan hisob topilmadi");

  const revoked = await admin(process.env.ADMIN_SECRET, "revokeUser", {
    email: email
  });

  assert.equal(revoked.ok, true);
  assert.equal((await paid(userId)).body.paid, false);
});

test("admin: email ruxsati to'langan buyurtma bo'lsa bekor qilinmaydi", async () => {
  const email = "grant-order@example.com";
  const registered = parse(await registerUser(email));
  const userId = registered.user.id;

  const order = parse(await orderHandler(event({ body: { uid: userId } })));
  await admin(process.env.ADMIN_SECRET, "activate", { code: order.code });

  const denied = await admin(process.env.ADMIN_SECRET, "revokeUser", {
    email: email
  });

  assert.match(denied.error, /to'langan buyurtma/);
  assert.equal((await paid(userId)).body.paid, true);
});

test("bunny: to'lovsiz va sozlanmagan holatda rad etadi", async () => {
  const noAuth = await bunnyHandler(
    event({ method: "GET", query: { id: "video-id-0001" } })
  );
  assert.equal(noAuth.statusCode, 401);

  const uid = "bunny-user-00001";
  const order = parse(await orderHandler(event({ body: { uid: uid } })));
  await admin(process.env.ADMIN_SECRET, "activate", { code: order.code });

  const notConfigured = await bunnyHandler(
    event({ method: "GET", query: { id: "video-id-0001", uid: uid } })
  );
  assert.equal(notConfigured.statusCode, 501);
});

/* ------------------------------ Dars videolari ---------------------------- */

const { handler: videosHandler } = await load("videos");
const { handler: videoHandler } = await load("video");
const { handler: uploadHandler } = await load("video-upload");
const { readChunk, readVideoList } = await import(
  pathToFileURL(path.join(root, "netlify", "lib", "videos.mjs")).href
);

const ADMIN = process.env.ADMIN_SECRET;
const CHUNK = 256 * 1024;

function uploadCall(body) {
  return uploadHandler(event({ body: body }));
}

async function uploadBuffer(bytes) {
  const init = parse(
    await uploadCall({
      secret: ADMIN,
      action: "init",
      filename: "test.mp4",
      size: bytes.length,
      mime: "video/mp4",
      chunkSize: CHUNK
    })
  );

  assert.equal(init.ok, true);

  for (let index = 0; index < init.chunkCount; index += 1) {
    const start = index * init.chunkSize;
    const end = Math.min(bytes.length, start + init.chunkSize);
    const result = parse(
      await uploadCall({
        secret: ADMIN,
        action: "chunk",
        uploadId: init.uploadId,
        index: index,
        data: bytes.subarray(start, end).toString("base64")
      })
    );

    assert.equal(result.ok, true);
  }

  const finish = parse(
    await uploadCall({ secret: ADMIN, action: "finish", uploadId: init.uploadId })
  );

  assert.equal(finish.ok, true);
  return finish.video;
}

function videoGet(id, range, cookie) {
  const headers = {};

  if (range) headers.range = range;
  if (cookie) headers.cookie = cookie;

  return videoHandler(
    event({ method: "GET", query: { id: id }, headers: headers })
  );
}

function makeBytes(size) {
  const buffer = Buffer.alloc(size);

  for (let index = 0; index < size; index += 1) {
    buffer[index] = index % 251;
  }

  return buffer;
}

test("videos: ro'yxat sozlanmagan bo'lsa configured false qaytaradi", async () => {
  const response = await videosHandler(event({ method: "GET" }));
  const body = parse(response);

  assert.equal(response.statusCode, 200);
  assert.equal(body.configured, false);
  assert.deepEqual(body.videos, []);
});

test("video-upload: maxfiy kalit, hajm va bo'lakni tekshiradi", async () => {
  const noSecret = await uploadCall({ action: "init", size: 1000 });
  assert.equal(noSecret.statusCode, 401);

  const wrongSecret = await uploadCall({
    secret: "noto'g'ri-kalit-123",
    action: "init",
    size: 1000
  });
  assert.equal(wrongSecret.statusCode, 401);

  const zero = await uploadCall({
    secret: ADMIN,
    action: "init",
    size: 0
  });
  assert.equal(zero.statusCode, 400);

  const huge = await uploadCall({
    secret: ADMIN,
    action: "init",
    size: 1024 * 1024 * 1024 + 1
  });
  assert.equal(huge.statusCode, 400);

  const badId = await uploadCall({
    secret: ADMIN,
    action: "chunk",
    uploadId: "x",
    index: 0,
    data: "AAAA"
  });
  assert.equal(badId.statusCode, 400);

  const unknownChunk = await uploadCall({
    secret: ADMIN,
    action: "chunk",
    uploadId: "video-upload-unknown-01",
    index: 0,
    data: "AAAA"
  });
  assert.equal(unknownChunk.statusCode, 404);

  const aborted = await uploadCall({
    secret: ADMIN,
    action: "abort",
    uploadId: "video-upload-unknown-01"
  });
  assert.equal(aborted.statusCode, 200);
});

test("video-upload: bo'laklab yuklaydi, ro'yxatga yozadi va Range bilan o'qiydi", async () => {
  const bytes = makeBytes(CHUNK + 5000);
  const uploaded = await uploadBuffer(bytes);

  assert.equal(uploaded.size, bytes.length);
  assert.equal(uploaded.chunkCount, 2);
  assert.equal(uploaded.chunkSize, CHUNK);
  assert.equal(uploaded.source, "upload");

  const record = Object.assign({}, uploaded, {
    id: "vid-test-0001",
    title: "1-dars. Test video",
    description: "Sinov darsi",
    duration: "00:30",
    poster: "",
    paid: false
  });

  const saved = await admin(ADMIN, "saveVideos", { videos: [record] });
  assert.equal(saved.ok, true);
  assert.equal(saved.videos.length, 1);

  const list = parse(await videosHandler(event({ method: "GET" })));

  assert.equal(list.configured, true);
  assert.equal(list.videos.length, 1);
  assert.equal(list.videos[0].id, "vid-test-0001");
  assert.equal("uploadId" in list.videos[0], false);
  assert.equal(list.videos[0].size, bytes.length);

  const first = await videoGet("vid-test-0001", "bytes=0-99");

  assert.equal(first.statusCode, 206);
  assert.equal(first.isBase64Encoded, true);
  assert.equal(first.headers["content-range"], "bytes 0-99/" + bytes.length);
  assert.equal(first.headers["content-type"], "video/mp4");

  const slice = Buffer.from(first.body, "base64");
  assert.equal(slice.length, 100);
  assert.deepEqual(slice, bytes.subarray(0, 100));

  /* Bo'lak chegarasidan oshib ketadigan so'rov — javob bitta bo'lak bilan
     cheklanadi, brauzer keyingisini o'zi so'raydi. */
  const start = CHUNK - 100;
  const edge = await videoGet(
    "vid-test-0001",
    "bytes=" + start + "-" + (start + 199)
  );

  assert.equal(edge.statusCode, 206);
  assert.equal(
    edge.headers["content-range"],
    "bytes " + start + "-" + (CHUNK - 1) + "/" + bytes.length
  );
  assert.deepEqual(
    Buffer.from(edge.body, "base64"),
    bytes.subarray(start, CHUNK)
  );

  const tail = await videoGet("vid-test-0001", "bytes=-50");
  assert.equal(tail.statusCode, 206);
  assert.deepEqual(
    Buffer.from(tail.body, "base64"),
    bytes.subarray(bytes.length - 50)
  );

  const invalid = await videoGet(
    "vid-test-0001",
    "bytes=" + (bytes.length + 100) + "-"
  );
  assert.equal(invalid.statusCode, 416);
  assert.equal(invalid.headers["content-range"], "bytes */" + bytes.length);

  const missing = await videoGet("vid-yoq-00000001");
  assert.equal(missing.statusCode, 404);
});

test("video: noto'g'ri ID, noto'g'ri manba va saqlash validatsiyasi", async () => {
  const badId = await videoGet("../etc/passwd");
  assert.equal(badId.statusCode, 400);

  const emptyTitle = await admin(ADMIN, "saveVideos", {
    videos: [{ id: "vid-test-0002", title: "   ", source: "url", src: "" }]
  });
  assert.match(emptyTitle.error, /dars nomi bo'sh/);

  const duplicate = await admin(ADMIN, "saveVideos", {
    videos: [
      { id: "vid-test-0003", title: "A", source: "url", src: "" },
      { id: "vid-test-0003", title: "B", source: "url", src: "" }
    ]
  });
  assert.match(duplicate.error, /takrorlangan/);

  const badUrl = await admin(ADMIN, "saveVideos", {
    videos: [
      { id: "vid-test-0004", title: "A", source: "url", src: "javascript:alert(1)" }
    ]
  });
  assert.match(badUrl.error, /havolasi noto'g'ri/);

  const notUploaded = await admin(ADMIN, "saveVideos", {
    videos: [
      {
        id: "vid-test-0005",
        title: "Yuklanmagan",
        source: "upload",
        uploadId: "video-upload-missing-01",
        size: CHUNK,
        chunkSize: CHUNK,
        chunkCount: 1,
        mime: "video/mp4"
      }
    ]
  });
  assert.match(notUploaded.error, /yuklanmagan/);

  const notArray = await admin(ADMIN, "saveVideos", { videos: "yo'q" });
  assert.match(notArray.error, /massiv/);
});

test("video: pullik dars to'lovsiz yopiq, to'lovdan keyin ochiladi", async () => {
  const email = "video-paid@example.com";
  const registered = parse(await registerUser(email));
  const uid = registered.user.id;
  const session = cookieFrom(
    await registerUser("video-paid-session@example.com"),
    "pk_session"
  );

  const list = await admin(ADMIN, "videos");
  const record = Object.assign({}, list.videos[0], { paid: true });

  const saved = await admin(ADMIN, "saveVideos", { videos: [record] });
  assert.equal(saved.ok, true);

  const denied = await videoGet("vid-test-0001", "bytes=0-99");
  assert.equal(denied.statusCode, 403);

  const guestSession = await videoGet("vid-test-0001", "bytes=0-99", "pk_session=" + session);
  assert.equal(guestSession.statusCode, 403);

  const order = parse(await orderHandler(event({ body: { uid: uid } })));
  await admin(ADMIN, "activate", { code: order.code });
  assert.equal((await paid(uid)).body.paid, true);

  const login = await authHandler(
    event({
      body: {
        action: "login",
        email: email,
        password: "parol12345"
      }
    })
  );

  const paidSession = cookieFrom(login, "pk_session");
  assert.ok(paidSession);

  const allowed = await videoGet(
    "vid-test-0001",
    "bytes=0-99",
    "pk_session=" + paidSession
  );

  assert.equal(allowed.statusCode, 206);
  assert.deepEqual(
    Buffer.from(allowed.body, "base64"),
    makeBytes(CHUNK + 5000).subarray(0, 100)
  );
});

test("video-upload: abort yarim qolgan bo'laklarni tozalaydi", async () => {
  const init = parse(
    await uploadCall({
      secret: ADMIN,
      action: "init",
      filename: "abort.mp4",
      size: 1000,
      mime: "video/mp4",
      chunkSize: CHUNK
    })
  );

  assert.equal(init.ok, true);

  const chunk = parse(
    await uploadCall({
      secret: ADMIN,
      action: "chunk",
      uploadId: init.uploadId,
      index: 0,
      data: makeBytes(1000).toString("base64")
    })
  );

  assert.equal(chunk.ok, true);
  assert.ok(await readChunk(init.uploadId, 0));

  const aborted = parse(
    await uploadCall({
      secret: ADMIN,
      action: "abort",
      uploadId: init.uploadId
    })
  );

  assert.equal(aborted.ok, true);
  assert.equal(await readChunk(init.uploadId, 0), null);

  const finish = parse(
    await uploadCall({
      secret: ADMIN,
      action: "finish",
      uploadId: init.uploadId
    })
  );

  assert.match(finish.error, /topilmadi/);
});

test("video: ro'yxatdan chiqarilgan video bo'laklari o'chiriladi", async () => {
  const stored = await readVideoList();
  const uploadId = stored && stored[0] ? stored[0].uploadId : "";

  assert.ok(uploadId);

  const cleared = await admin(ADMIN, "saveVideos", { videos: [] });
  assert.equal(cleared.ok, true);
  assert.deepEqual(cleared.videos, []);

  assert.equal(await readChunk(uploadId, 0), null);

  const after = parse(await videosHandler(event({ method: "GET" })));
  assert.equal(after.configured, true);
  assert.deepEqual(after.videos, []);

  const gone = await videoGet("vid-test-0001", "bytes=0-99");
  assert.equal(gone.statusCode, 404);
});

test("admin: resetVideos ro'yxatni o'chiradi va yuklangan faylni tozalaydi", async () => {
  const uploaded = await uploadBuffer(makeBytes(1000));
  const record = Object.assign({}, uploaded, {
    id: "vid-reset-0001",
    title: "Reset test",
    paid: false
  });

  assert.equal((await admin(ADMIN, "saveVideos", { videos: [record] })).ok, true);
  assert.equal(
    parse(await videosHandler(event({ method: "GET" }))).configured,
    true
  );

  const reset = await admin(ADMIN, "resetVideos");
  assert.equal(reset.ok, true);
  assert.equal(reset.configured, false);

  assert.equal(await readChunk(uploaded.uploadId, 0), null);

  const list = parse(await videosHandler(event({ method: "GET" })));
  assert.equal(list.configured, false);
  assert.deepEqual(list.videos, []);
});
