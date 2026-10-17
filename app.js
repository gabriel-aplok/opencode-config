// default model limits
const DEFAULT_CONTEXT = 131072;
const DEFAULT_OUTPUT = 8192;
const MIN_CONTEXT = 1024;
const MIN_OUTPUT = 256;
const FALLBACK_PROVIDER_ID = "custom";
const FALLBACK_ENV_VAR = "PROVIDER_API_KEY";
const CONFIG_SCHEMA_URL = "https://opencode.ai/config.json";
const DOCS_URL = "https://opencode.ai/v2/docs/providers#custom";

const $ = (id) => document.getElementById(id);

let models = [];

function normBase(u) {
  return (u || "").trim().replace(/\/+$/, "");
}

function setStatus(el, msg, ok = true) {
  el.textContent = msg;
  el.classList.toggle("ok", ok);
  el.classList.toggle("err", !ok);
}

function parseModelsPayload(payload) {
  const arr = Array.isArray(payload) ? payload : payload.data || payload.models || [];
  if (!Array.isArray(arr)) throw new Error("Unrecognized shape. Use {data:[{id}]}.");
  return arr.map((m) => {
    if (typeof m === "string") return { id: m };
    return { id: m.id || m.name || m.modelID || JSON.stringify(m), raw: m };
  });
}

function readNumber(value, fallback) {
  return Number(value) || fallback;
}

function ingest(entries) {
  const defC = readNumber(parseInt($("defContext").value, 10), DEFAULT_CONTEXT);
  const defO = readNumber(parseInt($("defOutput").value, 10), DEFAULT_OUTPUT);
  const defT = $("defTools").checked;
  models = entries.map(({ id, raw }) => {
    const ctx =
      raw?.context_length ||
      raw?.contextLength ||
      raw?.max_model_len ||
      raw?.maxModelLen ||
      raw?.context_window ||
      defC;
    return {
      apiId: String(id),
      alias: String(id),
      displayName: raw?.display_name || raw?.displayName || String(id),
      context: readNumber(ctx, defC),
      output: readNumber(raw?.max_output_tokens || raw?.maxOutputTokens, defO),
      tools: typeof raw?.tools === "boolean" ? raw.tools : defT,
      include: true,
    };
  });
  renderModels();
  generate();
}

function renderModels() {
  const list = $("modelList");
  list.innerHTML = "";
  if (!models.length) {
    list.innerHTML = '<p class="hint">No models loaded. Load models or paste JSON above.</p>';
    return;
  }
  models.forEach((m, i) => {
    const div = document.createElement("div");
    div.className = "model-row";
    div.innerHTML = `
      <input type="checkbox" data-k="include" ${m.include ? "checked" : ""} title="Include this model in the config" />
      <div class="model-fields">
        <label>Alias (config key)<input data-k="alias" value="${escapeHtml(m.alias)}" spellcheck="false" /></label>
        <label>Display name<input data-k="displayName" value="${escapeHtml(m.displayName)}" spellcheck="false" /></label>
        <span class="api-id" title="ID sent to the API">${escapeHtml(m.apiId)}</span>
        <div class="nums">
          <label>Context limit<input type="number" data-k="context" value="${m.context}" min="${MIN_CONTEXT}" /></label>
          <label>Output limit<input type="number" data-k="output" value="${m.output}" min="${MIN_OUTPUT}" /></label>
          <label><input type="checkbox" data-k="tools" ${m.tools ? "checked" : ""} /> Tools</label>
        </div>
      </div>`;
    div.querySelectorAll("[data-k]").forEach((el) => {
      el.addEventListener(el.type === "checkbox" ? "change" : "input", () => {
        const k = el.dataset.k;
        if (el.type === "checkbox") models[i][k] = el.checked;
        else if (k === "context" || k === "output") models[i][k] = parseInt(el.value, 10) || 0;
        else models[i][k] = el.value;
        generate();
      });
    });
    list.appendChild(div);
  });
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function sanitizeId(s, fallback) {
  const v = String(s || "")
    .trim()
    .replace(/\s+/g, "-");
  return v || fallback;
}

function uniqueAlias(alias, used) {
  if (!used.has(alias)) return alias;
  let n = 2;
  while (used.has(`${alias}-${n}`)) n += 1;
  return `${alias}-${n}`;
}

function buildConfig() {
  const providerId = sanitizeId($("providerId").value, FALLBACK_PROVIDER_ID);
  const providerName = $("providerName").value.trim() || providerId;
  const baseURL = normBase($("baseURL").value);
  const envVar = $("envVar").value.trim();
  const pkg = $("package").value;
  const keyPlacement = $("keyPlacement").checked ? "env" : "omit";
  const reasoningField = $("reasoningField").value;
  const cacheFormat = $("cacheFormat").value;
  const authScheme = $("authScheme").value;
  const selected = models.filter((m) => m.include && m.alias.trim());

  const settings = {};
  if (baseURL) settings.baseURL = baseURL;
  if (keyPlacement === "env" && envVar) settings.apiKey = `{env:${envVar}}`;

  const used = new Set();
  const modelEntries = {};
  for (const m of selected) {
    const alias = uniqueAlias(sanitizeId(m.alias, m.apiId), used);
    used.add(alias);
    const entry = {};
    if (alias !== m.apiId) entry.modelID = m.apiId;
    if (m.displayName && m.displayName !== alias) entry.name = m.displayName;
    entry.limit = { context: m.context, output: m.output };
    entry.capabilities = { tools: Boolean(m.tools), input: ["text"], output: ["text"] };
    const compat = {};
    if (reasoningField) compat.reasoningField = reasoningField;
    if (cacheFormat) compat.cacheFormat = cacheFormat;
    if (Object.keys(compat).length) entry.compatibility = compat;
    modelEntries[alias] = entry;
  }

  const provider = { name: providerName };
  if (authScheme !== "none" && envVar) provider.env = [envVar];
  provider.package = pkg;
  if (Object.keys(settings).length) provider.settings = settings;

  const config = { $schema: CONFIG_SCHEMA_URL };
  if (selected.length) config.model = `${providerId}/${sanitizeId(selected[0].alias, selected[0].apiId)}`;
  config.providers = { [providerId]: { ...provider, models: modelEntries } };
  return { config, providerId, envVar, authScheme, selected };
}

function stripComments(text) {
  return text
    .split("\n")
    .filter((line) => !line.startsWith("//"))
    .join("\n");
}

function generate() {
  const { config, providerId, envVar, authScheme, selected } = buildConfig();
  const fallbackEnv = envVar || FALLBACK_ENV_VAR;
  const figure = document.getElementById("outputFigure");
  const title = document.getElementById("outputTitle");
  if (!selected.length) {
    $("output").textContent = "// Select at least one model to generate the config.";
    figure.hidden = true;
  } else {
    const label = selected.length === 1 ? "1 model" : `${selected.length} models`;
    const header = `// Config for OpenCode V2. Provider ${providerId}. Models: ${label}.\n// Docs: ${DOCS_URL}\n`;
    $("output").textContent = header + JSON.stringify(config, null, 2);
    title.textContent = `opencode.jsonc / ${providerId} / ${label}`;
    figure.hidden = false;
  }
  const keyLine =
    authScheme === "none"
      ? "# No API key needed. The endpoint runs without auth."
      : `export ${fallbackEnv}="sk-..."`;
  $("envOutput").textContent = `# Set the key used as {env:${fallbackEnv}} in the config:\n${keyLine}`;
  $("switchText").textContent = $("keyPlacement").checked ? "Use environment variable" : "No key in config";
  const modelWord = selected.length === 1 ? "model" : "models";
  $("statusInfo").textContent = `${providerId} / ${selected.length} ${modelWord} selected`;
}

async function fetchModels() {
  const base = normBase($("baseURL").value);
  if (!base) return setStatus($("fetchStatus"), "Enter a base URL first.", false);
  const key = $("apiKey").value.trim();
  const scheme = $("authScheme").value;
  const headers = { Accept: "application/json" };
  if (key && scheme === "bearer") headers.Authorization = `Bearer ${key}`;
  if (key && scheme === "x-api-key") headers["x-api-key"] = key;
  setStatus($("fetchStatus"), "Loading models.");
  try {
    const res = await fetch(`${base}/models`, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const payload = await res.json();
    ingest(parseModelsPayload(payload));
    const label = models.length === 1 ? "1 model" : `${models.length} models`;
    setStatus($("fetchStatus"), `Loaded ${label}.`);
  } catch (e) {
    if (e instanceof TypeError) {
      setStatus(
        $("fetchStatus"),
        "Load blocked. The browser stopped the request. This is CORS, an ad blocker, or a down server. The manual paste box is open below.",
        false,
      );
    } else {
      setStatus($("fetchStatus"), `Load failed: ${e.message}. Paste JSON manually below.`, false);
    }
    const fallback = $("manualFallback");
    fallback.open = true;
    fallback.scrollIntoView({ block: "nearest" });
  }
}

function buildCurl() {
  const base = normBase($("baseURL").value) || "https://your-host/v1";
  const key = $("apiKey").value.trim();
  const scheme = $("authScheme").value;
  const parts = ["curl"];
  if (key && scheme === "bearer") parts.push(`-H "Authorization: Bearer ${key}"`);
  if (key && scheme === "x-api-key") parts.push(`-H "x-api-key: ${key}"`);
  parts.push(`${base}/models`);
  return parts.join(" ");
}

$("curlBtn").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(buildCurl());
    setStatus($("fetchStatus"), "Curl command copied. Run it in a terminal, then paste the output above.");
  } catch (e) {
    setStatus($("fetchStatus"), `Copy failed: ${e.message}.`, false);
  }
});

$("fetchBtn").addEventListener("click", fetchModels);
$("parseBtn").addEventListener("click", () => {
  try {
    ingest(parseModelsPayload(JSON.parse($("manualJson").value)));
    const label = models.length === 1 ? "1 model" : `${models.length} models`;
    setStatus($("fetchStatus"), `Parsed ${label}.`);
  } catch (e) {
    setStatus($("fetchStatus"), `Parse error: ${e.message}`, false);
  }
});
$("selectAll").addEventListener("click", () => {
  models.forEach((m) => (m.include = true));
  renderModels();
  generate();
});
$("selectNone").addEventListener("click", () => {
  models.forEach((m) => (m.include = false));
  renderModels();
  generate();
});
[
  "providerId",
  "providerName",
  "baseURL",
  "envVar",
  "package",
  "authScheme",
  "keyPlacement",
  "reasoningField",
  "cacheFormat",
].forEach((id) => {
  $(id).addEventListener("input", generate);
  $(id).addEventListener("change", generate);
});
["baseURL", "apiKey", "envVar"].forEach((id) => {
  $(id).addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      fetchModels();
    }
  });
});
["defContext", "defOutput", "defTools"].forEach((id) => {
  $(id).addEventListener("input", generate);
  $(id).addEventListener("change", generate);
});
$("copyBtn").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("output").textContent);
    setStatus($("genStatus"), "Copied.");
  } catch (e) {
    setStatus($("genStatus"), `Copy failed: ${e.message}. Select the text manually.`, false);
  }
});
$("downloadBtn").addEventListener("click", () => {
  const blob = new Blob([stripComments($("output").textContent)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "opencode.jsonc";
  a.click();
  URL.revokeObjectURL(a.href);
});

/* Security dialog: shown at start until the user hides it. */
const SECURITY_KEY = "opencode-config.security.hidden";
const securityDialog = $("securityDialog");

function openSecurityDialog() {
  if (typeof securityDialog.showModal === "function") securityDialog.showModal();
  else securityDialog.setAttribute("open", "");
  $("securityClose").focus();
}

function closeSecurityDialog() {
  if ($("securityDismiss").checked) {
    try {
      localStorage.setItem(SECURITY_KEY, "1");
    } catch (e) {
      /* storage blocked */
    }
  }
  securityDialog.close();
}

$("securityClose").addEventListener("click", closeSecurityDialog);
$("securityLink").addEventListener("click", openSecurityDialog);
securityDialog.addEventListener("click", (e) => {
  if (e.target === securityDialog) closeSecurityDialog();
});

let securityHidden = false;
try {
  securityHidden = localStorage.getItem(SECURITY_KEY) === "1";
} catch (e) {
  /* storage blocked */
}
if (!securityHidden) openSecurityDialog();

generate();
