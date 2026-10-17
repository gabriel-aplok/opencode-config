/* Tests for profile.js. Run with: node --test profile.test.js
   Loads the real file through eval so the tests cover the shipped code. */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { webcrypto } = require("node:crypto");

if (!globalThis.crypto) globalThis.crypto = webcrypto;

eval(fs.readFileSync(require("node:path").join(__dirname, "profile.js"), "utf8"));
const P = globalThis.OpencodeProfile;

describe("base64 helpers", () => {
  it("round-trips random bytes", () => {
    const bytes = webcrypto.getRandomValues(new Uint8Array(64));
    assert.deepEqual(P.base64ToBytes(P.bytesToBase64(bytes)), bytes);
  });
});

describe("secret encryption", () => {
  it("round-trips a key", async () => {
    const payload = await P.encryptProfileSecret("correct horse 123", "sk-secret-123");
    assert.equal(await P.decryptProfileSecret("correct horse 123", payload), "sk-secret-123");
  });

  it("round-trips unicode and empty keys", async () => {
    for (const key of ["", "sk-chave-áéí-🔑"]) {
      const payload = await P.encryptProfileSecret("password-8+", key);
      assert.equal(await P.decryptProfileSecret("password-8+", payload), key);
    }
  });

  it("uses a fresh salt and iv every time", async () => {
    const a = await P.encryptProfileSecret("password-8+", "same-key");
    const b = await P.encryptProfileSecret("password-8+", "same-key");
    assert.notEqual(a.data, b.data);
    assert.notEqual(a.salt, b.salt);
    assert.notEqual(a.iv, b.iv);
  });

  it("rejects a wrong password", async () => {
    const payload = await P.encryptProfileSecret("right-password", "sk-secret");
    await assert.rejects(P.decryptProfileSecret("wrong-password", payload), /Wrong password/);
  });

  it("rejects tampered ciphertext", async () => {
    const payload = await P.encryptProfileSecret("password-8+", "sk-secret");
    const bytes = P.base64ToBytes(payload.data);
    bytes[0] ^= 1;
    payload.data = P.bytesToBase64(bytes);
    await assert.rejects(P.decryptProfileSecret("password-8+", payload), /Wrong password|damaged/);
  });

  it("rejects a damaged block", async () => {
    await assert.rejects(P.decryptProfileSecret("password-8+", { v: 1 }), /damaged|missing/);
    await assert.rejects(
      P.decryptProfileSecret("password-8+", { algo: "ROT13", kdf: "none", salt: "eA", iv: "eQ", data: "eA" }),
      /unknown format/,
    );
  });

  it("needs a password", async () => {
    await assert.rejects(P.encryptProfileSecret("", "sk-secret"), /password is required/);
    await assert.rejects(P.decryptProfileSecret("", null), /password is required/);
  });
});

describe("profile documents", () => {
  const inputs = {
    providerId: "custom",
    providerName: "Custom",
    baseURL: "http://127.0.0.1:1234/v1",
    envVar: "CUSTOM_API_KEY",
    package: "@opencode/ai/providers/openai-compatible",
    authScheme: "bearer",
    reasoningField: "",
    cacheFormat: "",
    defContext: "131072",
    defOutput: "8192",
    keyPlacement: true,
    defTools: true,
    profileName: "mine",
    extraUnknown: "dropped",
  };
  const models = [
    { apiId: "m1", alias: "m1", displayName: "M1", context: 100, output: 10, tools: true, include: true },
    { apiId: "", alias: "bad" },
    null,
  ];

  it("builds a clean document and parses it back", () => {
    const doc = P.buildProfileDocument({ name: "mine", inputs, models, secret: null });
    assert.equal(doc.app, "opencode-config-profile");
    assert.equal(doc.version, 1);
    assert.equal(doc.secret, null);
    assert.equal(doc.models.length, 1);
    assert.equal(doc.inputs.extraUnknown, undefined);
    const back = P.parseProfileDocument(JSON.stringify(doc));
    assert.equal(back.name, "mine");
    assert.equal(back.models[0].apiId, "m1");
    assert.equal(back.inputs.providerId, "custom");
  });

  it("keeps the encrypted block untouched", async () => {
    const secret = await P.encryptProfileSecret("password-8+", "sk-secret");
    const doc = P.buildProfileDocument({ name: "n", inputs: {}, models: [], secret });
    const back = P.parseProfileDocument(doc);
    assert.equal(await P.decryptProfileSecret("password-8+", back.secret), "sk-secret");
  });

  it("rejects foreign files", () => {
    assert.throws(() => P.parseProfileDocument('{"app":"other"}'), /not an opencode-config profile/);
    assert.throws(() => P.parseProfileDocument('{"app":"opencode-config-profile","version":99}'), /version/);
    assert.throws(() => P.parseProfileDocument("not json"), /Unexpected token/);
    assert.throws(
      () => P.parseProfileDocument('{"app":"opencode-config-profile","version":1}'),
      /no inputs|no model list/,
    );
  });
});
