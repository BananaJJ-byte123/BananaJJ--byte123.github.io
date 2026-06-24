const { json, readJson, createRecords, sendBotText, handleError } = require("../lib/_feishu");
const { audit } = require("../lib/_audit");

const F = {
  declarationId: "\u7533\u62a5ID", anchorName: "\u4e3b\u64ad\u59d3\u540d", type: "\u7533\u62a5\u7c7b\u578b", date: "\u65e5\u671f",
  start: "\u5f00\u59cb\u65f6\u95f4", end: "\u7ed3\u675f\u65f6\u95f4", originalShift: "\u539f\u73ed\u6b21", reason: "\u539f\u56e0", status: "\u72b6\u6001",
  scheduleAnchor: "\u4e3b\u64ad\u59d3\u540d", scheduleDate: "\u65e5\u671f", scheduleStart: "\u5f00\u59cb\u65f6\u95f4", scheduleEnd: "\u7ed3\u675f\u65f6\u95f4", scheduleStatus: "\u72b6\u6001", note: "\u5907\u6ce8"
};

function val(record, key) {
  const value = record && record.fields ? record.fields[key] : "";
  if (Array.isArray(value)) return value.map((item) => item.text || item.name || item).join(",");
  if (value && typeof value === "object") return value.text || value.name || JSON.stringify(value);
  return value == null ? "" : String(value);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });
  try {
    const body = await readJson(req);
    if (!body.anchorName) return json(res, 400, { ok: false, error: "Missing anchorName" });
    const incoming = Array.isArray(body.records) ? body.records : [body];
    const fieldsList = incoming.map((item, index) => ({
      [F.declarationId]: item.declarationId || `D${Date.now()}-${index + 1}`,
      [F.anchorName]: body.anchorName,
      [F.type]: item.type || body.type || "\u7a7a\u95f2\u65f6\u95f4",
      [F.date]: item.date || body.date || "",
      [F.start]: item.startTime || body.startTime || "",
      [F.end]: item.endTime || body.endTime || "",
      [F.originalShift]: item.originalShift || body.originalShift || "",
      [F.reason]: item.reason ?? body.reason ?? "",
      [F.status]: item.status || body.status || "\u5f85\u5904\u7406"
    })).filter((fields) => fields[F.date] && fields[F.start] && fields[F.end]);
    if (!fieldsList.length) return json(res, 400, { ok: false, error: "Missing declaration time records" });
    const created = await createRecords("declarations", fieldsList);
    await audit("\u4e3b\u64ad\u7533\u62a5", `${body.anchorName} ${fieldsList.length} records`);
    await sendBotText(`\u3010\u4e3b\u64ad\u7533\u62a5\u3011${body.anchorName} \u63d0\u4ea4 ${fieldsList.length} \u6761\u7a7a\u95f2\u65f6\u95f4`);
    json(res, 200, { ok: true, count: created.length, records: created });
  } catch (error) {
    handleError(res, error);
  }
};
