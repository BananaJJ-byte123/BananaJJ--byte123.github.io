const { json, readJson, createRecords, sendBotText, handleError } = require("./_feishu");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });
  try {
    const body = await readJson(req);
    const required = ["date", "shift", "startTime", "endTime", "anchorName", "brand", "room"];
    const missing = required.filter((key) => !String(body[key] || "").trim());
    if (missing.length) return json(res, 400, { ok: false, error: `Missing fields: ${missing.join(", ")}` });

    const fields = {
      "排班ID": body.scheduleId || `M-${body.date}-${Date.now()}`,
      "日期": body.date,
      "班次": body.shift,
      "开始时间": body.startTime,
      "结束时间": body.endTime,
      "主播姓名": body.anchorName,
      "品牌": body.brand,
      "直播间": body.room,
      "状态": body.status || "草稿",
      "备注": body.note || "主管手动指定"
    };
    const created = await createRecords("schedules", [fields]);
    await sendBotText(`【手动排班】${fields["主播姓名"]} 已被安排到 ${fields["日期"]} ${fields["开始时间"]}-${fields["结束时间"]} ${fields["品牌"]} / ${fields["直播间"]}。`);
    json(res, 200, { ok: true, record: created[0] || null });
  } catch (error) {
    handleError(res, error);
  }
};
