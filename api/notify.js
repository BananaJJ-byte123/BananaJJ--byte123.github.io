const { json, readJson, sendBotText, createRecords, handleError } = require("../lib/_feishu");

const F = {
  id: "\u901a\u77e5ID",
  title: "\u6807\u9898",
  content: "\u5185\u5bb9",
  time: "\u65f6\u95f4",
  status: "\u72b6\u6001"
};

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });
  try {
    const body = await readJson(req);
    const text = body.content || body.text || "";
    const bot = text ? await sendBotText(text) : { skipped: true };
    const created = await createRecords("notifications", [{
      [F.id]: body.notificationId || `N${Date.now()}`,
      [F.title]: body.title || "\u7cfb\u7edf\u901a\u77e5",
      [F.content]: text,
      [F.time]: new Date().toISOString(),
      [F.status]: bot.skipped ? "\u672a\u914d\u7f6e\u673a\u5668\u4eba" : "\u5df2\u53d1\u9001"
    }]);
    json(res, 200, { ok: true, bot, record: created[0] || null });
  } catch (error) {
    handleError(res, error);
  }
};
