const { json, readJson, updateRecords, sendBotText, handleError } = require("./_feishu");
const { audit } = require("./_audit");

const allowed = new Set(["declarations", "schedules", "anchors", "brands", "templates"]);
const writableFields = {
  declarations: new Set(["状态", "原因", "原班次", "开始时间", "结束时间", "日期", "申报类型", "主播姓名"]),
  schedules: new Set(["状态", "备注", "主播姓名", "日期", "班次", "开始时间", "结束时间", "品牌", "直播间"]),
  anchors: new Set(["主播ID", "姓名", "英文名", "飞书用户", "语言", "国家", "时区", "擅长类目", "等级", "月目标工时", "每日最多场次", "状态"]),
  brands: new Set(["品牌ID", "品牌名", "类目", "需要语言", "直播间名称", "优先级", "状态"]),
  templates: new Set(["班次ID", "班次名称", "开始时间", "结束时间", "默认时长", "状态"])
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
    await audit("数据更新", `类型：${type}；记录数：${updates.length}；字段：${[...new Set(updates.flatMap((item) => Object.keys(item.fields)))].join(", ")}`);
    json(res, 200, { ok: true, updated: updated.length, records: updated });
  } catch (error) {
    handleError(res, error);
  }
};
