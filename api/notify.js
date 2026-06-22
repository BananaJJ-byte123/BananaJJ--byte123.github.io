const { json, readJson, sendBotText, createRecords, handleError } = require("./_feishu");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });
  try {
    const body = await readJson(req);
    const text = body.text || "排班系统通知";
    const result = await sendBotText(text);
    await createRecords("notifications", [{
      "通知ID": `N-${Date.now()}`,
      "类型": body.type || "系统通知",
      "接收对象": body.target || "主管群",
      "内容": text,
      "发送时间": new Date().toISOString(),
      "状态": result.skipped ? "跳过" : "已发送"
    }]).catch(() => []);
    json(res, 200, { ok: true, result });
  } catch (error) {
    handleError(res, error);
  }
};
