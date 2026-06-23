const { json, readJson, createRecords, handleError } = require("../lib/_feishu");
const { audit } = require("../lib/_audit");

const F = {
  anchorId: "\u4e3b\u64adID", name: "\u59d3\u540d", english: "\u82f1\u6587\u540d", feishuUser: "\u98de\u4e66\u7528\u6237",
  language: "\u8bed\u8a00", country: "\u56fd\u5bb6", timezone: "\u65f6\u533a", category: "\u64c5\u957f\u7c7b\u76ee",
  level: "\u7b49\u7ea7", targetHours: "\u6708\u76ee\u6807\u5de5\u65f6", maxDaily: "\u6bcf\u65e5\u6700\u591a\u573a\u6b21", status: "\u72b6\u6001",
  brandId: "\u54c1\u724cID", brandName: "\u54c1\u724c\u540d", needLanguage: "\u9700\u8981\u8bed\u8a00", roomName: "\u76f4\u64ad\u95f4\u540d\u79f0", priority: "\u4f18\u5148\u7ea7",
  shiftId: "\u73ed\u6b21ID", shiftName: "\u73ed\u6b21\u540d\u79f0", start: "\u5f00\u59cb\u65f6\u95f4", end: "\u7ed3\u675f\u65f6\u95f4", duration: "\u9ed8\u8ba4\u65f6\u957f"
};

const allowed = new Set(["anchors", "brands", "templates"]);
const writableFields = {
  anchors: new Set([F.anchorId, F.name, F.english, F.feishuUser, F.language, F.country, F.timezone, F.category, F.level, F.targetHours, F.maxDaily, F.status]),
  brands: new Set([F.brandId, F.brandName, F.category, F.needLanguage, F.roomName, F.priority, F.status]),
  templates: new Set([F.shiftId, F.shiftName, F.start, F.end, F.duration, F.status])
};

function cleanFields(type, fields = {}) {
  const allowedFields = writableFields[type];
  return Object.fromEntries(Object.entries(fields).filter(([key, value]) => allowedFields.has(key) && value !== ""));
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });
  try {
    const body = await readJson(req);
    if (!allowed.has(body.type)) return json(res, 400, { ok: false, error: "Invalid admin data type" });
    const fields = cleanFields(body.type, body.fields);
    if (!Object.keys(fields).length) return json(res, 400, { ok: false, error: "No valid fields" });
    const created = await createRecords(body.type, [fields]);
    await audit("\u57fa\u7840\u6570\u636e\u65b0\u589e", `type=${body.type}; fields=${JSON.stringify(fields)}`);
    json(res, 200, { ok: true, record: created[0] || null });
  } catch (error) {
    handleError(res, error);
  }
};
