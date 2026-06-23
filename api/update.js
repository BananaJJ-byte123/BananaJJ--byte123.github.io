const { json, readJson, updateRecords, sendBotText, handleError } = require("../lib/_feishu");
const { audit } = require("../lib/_audit");

const F = {
  status: "\u72b6\u6001", reason: "\u539f\u56e0", originalShift: "\u539f\u73ed\u6b21", start: "\u5f00\u59cb\u65f6\u95f4", end: "\u7ed3\u675f\u65f6\u95f4",
  date: "\u65e5\u671f", declarationType: "\u7533\u62a5\u7c7b\u578b", anchorName: "\u4e3b\u64ad\u59d3\u540d", note: "\u5907\u6ce8",
  anchorStatus: "\u72b6\u6001", brandStatus: "\u72b6\u6001", templateStatus: "\u72b6\u6001"
};

const writable = {
  declarations: new Set([F.status, F.reason, F.originalShift, F.start, F.end, F.date, F.declarationType, F.anchorName]),
  schedules: new Set([F.status, F.note, F.anchorName]),
  anchors: new Set([F.anchorStatus]),
  brands: new Set([F.brandStatus]),
  templates: new Set([F.templateStatus])
};

function clean(type, fields = {}) {
  const set = writable[type];
  if (!set) return {};
  return Object.fromEntries(Object.entries(fields).filter(([key]) => set.has(key)));
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });
  try {
    const body = await readJson(req);
    const fields = clean(body.type, body.fields);
    if (!body.type || !body.recordId || !Object.keys(fields).length) return json(res, 400, { ok: false, error: "Missing update payload" });
    const updated = await updateRecords(body.type, [{ record_id: body.recordId, fields }]);
    await audit("\u8bb0\u5f55\u66f4\u65b0", `type=${body.type}; record=${body.recordId}; fields=${JSON.stringify(fields)}`);
    if (body.notifyText) await sendBotText(body.notifyText);
    json(res, 200, { ok: true, record: updated[0] || null });
  } catch (error) {
    handleError(res, error);
  }
};
