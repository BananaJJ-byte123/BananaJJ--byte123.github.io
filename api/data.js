const { json, listRecords, handleError } = require("../lib/_feishu");

const allowed = new Set(["anchors", "brands", "templates", "declarations", "schedules", "notifications"]);

module.exports = async function handler(req, res) {
  try {
    const url = new URL(req.url, `https://${req.headers.host || "localhost"}`);
    const type = url.searchParams.get("type");
    if (!allowed.has(type)) return json(res, 400, { ok: false, error: "Invalid type" });
    const records = await listRecords(type);
    json(res, 200, { ok: true, type, records });
  } catch (error) {
    handleError(res, error);
  }
};
