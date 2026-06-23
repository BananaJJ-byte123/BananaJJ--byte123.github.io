const { json, readJson, createRecords, handleError } = require("./_feishu");
const { audit } = require("./_audit");

const allowed = new Set(["anchors", "brands", "templates"]);
const writableFields = {
  anchors: new Set(["主播ID", "姓名", "英文名", "飞书用户", "语言", "国家", "时区", "擅长类目", "等级", "月目标工时", "每日最多场次", "状态"]),
  brands: new Set(["品牌ID", "品牌名", "类目", "需要语言", "直播间名称", "优先级", "状态"]),
  templates: new Set(["班次ID", "班次名称", "开始时间", "结束时间", "默认时长", "状态"])
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
    await audit("基础数据新增", `类型：${body.type}；内容：${JSON.stringify(fields)}`);
    json(res, 200, { ok: true, record: created[0] || null });
  } catch (error) {
    handleError(res, error);
  }
};
