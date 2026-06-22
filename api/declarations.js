const { json, readJson, createRecords, sendBotText, handleError } = require("./_feishu");

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
    await sendBotText(`主播申报：${fields["主播姓名"]} 提交了 ${fields["申报类型"]}，日期 ${fields["日期"]} ${fields["开始时间"]}-${fields["结束时间"]}。`);
    json(res, 200, { ok: true, record: created[0] || null });
  } catch (error) {
    handleError(res, error);
  }
};
