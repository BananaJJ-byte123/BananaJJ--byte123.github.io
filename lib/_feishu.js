const FEISHU_API = "https://open.feishu.cn/open-apis";

const tableEnvMap = {
  anchors: "FEISHU_TABLE_ANCHORS",
  brands: "FEISHU_TABLE_BRANDS",
  templates: "FEISHU_TABLE_TEMPLATES",
  declarations: "FEISHU_TABLE_DECLARATIONS",
  schedules: "FEISHU_TABLE_SCHEDULES",
  notifications: "FEISHU_TABLE_NOTIFICATIONS"
};

let tokenCache = { token: "", expiresAt: 0 };
const recordsCache = new Map();
const RECORDS_CACHE_TTL_MS = Number(process.env.FEISHU_RECORDS_CACHE_TTL_MS || 20_000);

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    const error = new Error(`Missing environment variable: ${name}`);
    error.statusCode = 500;
    throw error;
  }
  return value;
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

async function feishuFetch(path, options = {}) {
  const token = await getTenantAccessToken();
  const response = await fetch(`${FEISHU_API}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json; charset=utf-8",
      authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.code) {
    const message = data.msg || data.error || response.statusText;
    const error = new Error(`Feishu API error: ${message}`);
    error.statusCode = response.status || 500;
    error.details = data;
    throw error;
  }
  return data;
}

async function getTenantAccessToken() {
  const now = Date.now();
  if (tokenCache.token && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.token;
  }
  const app_id = requireEnv("FEISHU_APP_ID");
  const app_secret = requireEnv("FEISHU_APP_SECRET");
  const response = await fetch(`${FEISHU_API}/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ app_id, app_secret })
  });
  const data = await response.json();
  if (!response.ok || data.code) {
    const error = new Error(`Failed to get tenant token: ${data.msg || response.statusText}`);
    error.statusCode = response.status || 500;
    error.details = data;
    throw error;
  }
  tokenCache = {
    token: data.tenant_access_token,
    expiresAt: now + Math.max(1, data.expire - 120) * 1000
  };
  return tokenCache.token;
}

function getBaseToken() {
  return requireEnv("FEISHU_BASE_TOKEN");
}

function getTableId(type) {
  const env = tableEnvMap[type];
  if (!env) {
    const error = new Error(`Unknown table type: ${type}`);
    error.statusCode = 400;
    throw error;
  }
  return requireEnv(env);
}

function cacheKey(type) {
  return `${getBaseToken()}:${getTableId(type)}`;
}

function clearRecordsCache(type) {
  if (!type) return recordsCache.clear();
  recordsCache.delete(cacheKey(type));
}

async function listRecords(type, options = {}) {
  const key = cacheKey(type);
  const now = Date.now();
  if (!options.fresh) {
    const cached = recordsCache.get(key);
    if (cached && cached.expiresAt > now) return cached.records;
  }
  const appToken = getBaseToken();
  const tableId = getTableId(type);
  const records = [];
  let pageToken = "";
  do {
    const qs = new URLSearchParams({ page_size: "100" });
    if (pageToken) qs.set("page_token", pageToken);
    const data = await feishuFetch(`/bitable/v1/apps/${appToken}/tables/${tableId}/records?${qs}`);
    records.push(...(data.data?.items || []));
    pageToken = data.data?.page_token || "";
  } while (pageToken);
  const result = records.map((record) => ({ record_id: record.record_id, fields: record.fields || {} }));
  if (RECORDS_CACHE_TTL_MS > 0) recordsCache.set(key, { records: result, expiresAt: now + RECORDS_CACHE_TTL_MS });
  return result;
}

async function createRecords(type, fieldsList) {
  if (!fieldsList.length) return [];
  const appToken = getBaseToken();
  const tableId = getTableId(type);
  const chunks = [];
  for (let i = 0; i < fieldsList.length; i += 200) chunks.push(fieldsList.slice(i, i + 200));
  const created = [];
  for (const chunk of chunks) {
    const data = await feishuFetch(`/bitable/v1/apps/${appToken}/tables/${tableId}/records/batch_create`, {
      method: "POST",
      body: JSON.stringify({ records: chunk.map((fields) => ({ fields })) })
    });
    created.push(...(data.data?.records || []));
  }
  clearRecordsCache(type);
  return created;
}

async function updateRecords(type, recordsList) {
  if (!recordsList.length) return [];
  const appToken = getBaseToken();
  const tableId = getTableId(type);
  const chunks = [];
  for (let i = 0; i < recordsList.length; i += 200) chunks.push(recordsList.slice(i, i + 200));
  const updated = [];
  for (const chunk of chunks) {
    const data = await feishuFetch(`/bitable/v1/apps/${appToken}/tables/${tableId}/records/batch_update`, {
      method: "POST",
      body: JSON.stringify({
        records: chunk.map((record) => ({
          record_id: record.record_id,
          fields: record.fields || {}
        }))
      })
    });
    updated.push(...(data.data?.records || []));
  }
  clearRecordsCache(type);
  return updated;
}

async function sendBotText(text) {
  const webhook = process.env.FEISHU_BOT_WEBHOOK_URL;
  if (!webhook) return { skipped: true, reason: "FEISHU_BOT_WEBHOOK_URL not set" };
  const response = await fetch(webhook, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ msg_type: "text", content: { text } })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.code) {
    const error = new Error(`Feishu bot webhook failed: ${data.msg || response.statusText}`);
    error.statusCode = response.status || 500;
    error.details = data;
    throw error;
  }
  return data;
}

function handleError(res, error) {
  json(res, error.statusCode || 500, {
    ok: false,
    error: error.message,
    details: error.details
  });
}

module.exports = {
  json,
  readJson,
  requireEnv,
  listRecords,
  createRecords,
  updateRecords,
  clearRecordsCache,
  sendBotText,
  handleError,
  tableEnvMap
};
