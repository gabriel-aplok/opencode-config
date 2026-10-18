/* Profile save and load logic. DOM-free on purpose, so node:test can load
   this file directly. The API key is encrypted with AES-GCM. The password
   stretches through PBKDF2-SHA256. Everything runs on the WebCrypto API,
   which exists in browsers and in Node 18 and later. */

const PROFILE_APP = "opencode-config-profile";
const PROFILE_VERSION = 1;
const PBKDF2_ITERATIONS = 250000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

function profileSubtle() {
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (!subtle) throw new Error("WebCrypto is missing. Open this page over HTTPS or localhost.");
  return subtle;
}

function bytesToBase64(bytes) {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
}

function base64ToBytes(text) {
  const raw = atob(String(text).trim());
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

async function deriveProfileKey(password, salt) {
  const subtle = profileSubtle();
  const base = await subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveKey",
  ]);
  return subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptProfileSecret(password, plaintext) {
  if (!password) throw new Error("A password is required to encrypt the key.");
  const subtle = profileSubtle();
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveProfileKey(password, salt);
  const data = await subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
  return {
    v: 1,
    algo: "AES-GCM-256",
    kdf: "PBKDF2-SHA256",
    iterations: PBKDF2_ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(data)),
  };
}

async function decryptProfileSecret(password, payload) {
  if (!password) throw new Error("A password is required to decrypt the key.");
  if (!payload || typeof payload !== "object") throw new Error("The encrypted key is missing.");
  for (const field of ["salt", "iv", "data"]) {
    if (typeof payload[field] !== "string" || !payload[field]) {
      throw new Error("The encrypted key is damaged.");
    }
  }
  if (payload.algo !== "AES-GCM-256" || payload.kdf !== "PBKDF2-SHA256") {
    throw new Error("The encrypted key uses an unknown format.");
  }
  const subtle = profileSubtle();
  const salt = base64ToBytes(payload.salt);
  const iv = base64ToBytes(payload.iv);
  const key = await deriveProfileKey(password, salt);
  let plain;
  try {
    plain = await subtle.decrypt({ name: "AES-GCM", iv }, key, base64ToBytes(payload.data));
  } catch {
    throw new Error("Wrong password, or the file is damaged.");
  }
  return new TextDecoder().decode(plain);
}

const PROFILE_INPUT_KEYS = [
  "providerId",
  "providerName",
  "baseURL",
  "envVar",
  "package",
  "authScheme",
  "reasoningField",
  "cacheFormat",
  "defContext",
  "defOutput",
];

const PROFILE_CHECK_KEYS = ["keyPlacement", "defTools"];

function sanitizeProfileModel(entry) {
  if (!entry || typeof entry !== "object") return null;
  const apiId = String(entry.apiId || "").trim();
  if (!apiId) return null;
  return {
    apiId,
    alias: String(entry.alias || apiId),
    displayName: String(entry.displayName || entry.alias || apiId),
    context: Number(entry.context) || 0,
    output: Number(entry.output) || 0,
    tools: Boolean(entry.tools),
    vision: Boolean(entry.vision),
    reasoning: Boolean(entry.reasoning),
    include: entry.include !== false,
  };
}

function buildProfileDocument({ name, inputs, models, secret }) {
  const cleanInputs = {};
  for (const key of PROFILE_INPUT_KEYS) cleanInputs[key] = String(inputs[key] || "");
  for (const key of PROFILE_CHECK_KEYS) cleanInputs[key] = Boolean(inputs[key]);
  const cleanModels = Array.isArray(models)
    ? models.map(sanitizeProfileModel).filter((entry) => entry !== null)
    : [];
  return {
    app: PROFILE_APP,
    version: PROFILE_VERSION,
    savedAt: new Date().toISOString(),
    name: String(name || "profile"),
    inputs: cleanInputs,
    models: cleanModels,
    secret: secret === undefined || secret === null ? null : secret,
  };
}

function parseProfileDocument(raw) {
  const doc = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!doc || typeof doc !== "object") throw new Error("The profile file is not an object.");
  if (doc.app !== PROFILE_APP) throw new Error("This file is not an opencode-config profile.");
  if (doc.version !== PROFILE_VERSION) throw new Error(`Unsupported profile version: ${doc.version}.`);
  if (!doc.inputs || typeof doc.inputs !== "object") throw new Error("The profile has no inputs.");
  if (!Array.isArray(doc.models)) throw new Error("The profile has no model list.");
  if (doc.secret !== null && doc.secret !== undefined && typeof doc.secret !== "object") {
    throw new Error("The encrypted key block is invalid.");
  }
  return {
    name: String(doc.name || "profile"),
    savedAt: String(doc.savedAt || ""),
    inputs: doc.inputs,
    models: doc.models.map(sanitizeProfileModel).filter((entry) => entry !== null),
    secret: doc.secret === undefined ? null : doc.secret,
  };
}

globalThis.OpencodeProfile = {
  PROFILE_APP,
  PROFILE_VERSION,
  bytesToBase64,
  base64ToBytes,
  encryptProfileSecret,
  decryptProfileSecret,
  buildProfileDocument,
  parseProfileDocument,
};
