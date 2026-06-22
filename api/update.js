const { json, readJson, updateRecords, sendBotText, handleError } = require("./_feishu");

const allowed = new Set(["declarations", "schedules"]);
const writableFields = {
  declarations: new Set(["状态", "原因", "原班次", "开始时间", "结束时间", "日期", "申报类型", "主播姓名"]),
  schedules: new Set(["状态", "备注", "主播姓名", "日期", "班次", "开始时间", "结束时间", "品牌", "直播间"])
};

function cleanFields(type, fields = {}) {
  const allowedFields = writableFields[type];
  return Object.fromEntries(Object.entries(fields).filter(([key]) => allowedFields.has(key)));
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });
  try {
    const body = await readJson(req);
    const type = body.type;
    if (!allowed.has(type)) return json(res, 400, { ok: false, error: "Invalid update type" });

    const records = Array.isArray(body.records)
      ? body.records
      : [{ record_id: body.recordId, fields: body.fields }];

    const updates = records
      .filter((record) => record.record_id)
      .map((record) => ({ record_id: record.record_id, fields: cleanFields(type, record.fields) }))
      .filter((record) => Object.keys(record.fields).length);

    if (!updates.length) return json(res, 400, { ok: false, error: "No valid update records" });

    const updated = await updateRecords(type, updates);
    if (body.notifyText) await sendBotText(body.notifyText);
    json(res, 200, { ok: true, updated: updated.length, records: updated });
  } catch (error) {
    handleError(res, error);
  }
};
