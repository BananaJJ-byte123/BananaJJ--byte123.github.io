const { json, readJson, listRecords, createRecords, updateRecords, sendBotText, handleError } = require("./_feishu");
const { audit } = require("./_audit");

function f(record, name, fallback = "") {
  const value = record.fields?.[name];
  if (Array.isArray(value)) return value.map((item) => item.text || item.name || item).join(",");
  return value == null ? fallback : String(value);
}

async function releaseLeaveShift(fields) {
  if (fields["申报类型"] !== "请假") return null;
  const schedules = await listRecords("schedules");
  const target = schedules.find((item) =>
    f(item, "主播姓名") === fields["主播姓名"] &&
    f(item, "日期") === fields["日期"] &&
    (!fields["开始时间"] || f(item, "开始时间") === fields["开始时间"]) &&
    (!fields["结束时间"] || f(item, "结束时间") === fields["结束时间"])
  );
  if (!target) return null;
  await updateRecords("schedules", [{
    record_id: target.record_id,
    fields: { "主播姓名": "", "状态": "缺人", "备注": `请假自动释放：${fields["主播姓名"]}` }
  }]);
  return target;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });
  try {
    const body = await readJson(req);
    const fields = {
      "申报ID": body.declarationId || `D-${Date.now()}`,
      "主播姓名": body.anchorName || "",
      "申报类型": body.type || "请假",
      "日期": body.date || "",
      "开始时间": body.startTime || "",
      "结束时间": body.endTime || "",
      "原班次": body.originalShift || "",
      "原因": body.reason || "",
      "状态": "待处理"
    };
    const created = await createRecords("declarations", [fields]);
    const released = await releaseLeaveShift(fields);
    await sendBotText(`主播申报：${fields["主播姓名"]} 提交了 ${fields["申报类型"]}，日期 ${fields["日期"]} ${fields["开始时间"]}-${fields["结束时间"]}。`);
    await audit("主播申报", `${fields["主播姓名"]} 提交 ${fields["申报类型"]}；${fields["日期"]} ${fields["开始时间"]}-${fields["结束时间"]}${released ? "；已自动释放班次" : ""}`);
    json(res, 200, { ok: true, record: created[0] || null, releasedSchedule: released?.record_id || null });
  } catch (error) {
    handleError(res, error);
  }
};
