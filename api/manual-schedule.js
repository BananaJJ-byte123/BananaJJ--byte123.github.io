const { json, readJson, createRecords, sendBotText, handleError } = require("../lib/_feishu");
const { audit } = require("../lib/_audit");

const F = {
  scheduleId: "\u6392\u73edID", date: "\u65e5\u671f", shift: "\u73ed\u6b21", start: "\u5f00\u59cb\u65f6\u95f4", end: "\u7ed3\u675f\u65f6\u95f4",
  anchorName: "\u4e3b\u64ad\u59d3\u540d", brand: "\u54c1\u724c", room: "\u76f4\u64ad\u95f4", status: "\u72b6\u6001", note: "\u5907\u6ce8"
};

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });
  try {
    const body = await readJson(req);
    const required = ["date", "shift", "startTime", "endTime", "anchorName", "brand", "room"];
    const missing = required.filter((key) => !body[key]);
    if (missing.length) return json(res, 400, { ok: false, error: `Missing fields: ${missing.join(", ")}` });
    const fields = {
      [F.scheduleId]: body.scheduleId || `M${Date.now()}`,
      [F.date]: body.date,
      [F.shift]: body.shift,
      [F.start]: body.startTime,
      [F.end]: body.endTime,
      [F.anchorName]: body.anchorName,
      [F.brand]: body.brand,
      [F.room]: body.room,
      [F.status]: body.status || "\u8349\u7a3f",
      [F.note]: body.note || "\u4e3b\u7ba1\u624b\u52a8\u6307\u5b9a"
    };
    const created = await createRecords("schedules", [fields]);
    await audit("\u624b\u52a8\u6307\u5b9a\u6392\u73ed", `${body.date} ${body.shift} ${body.anchorName} -> ${body.brand}`);
    await sendBotText(`\u3010\u624b\u52a8\u6392\u73ed\u3011${body.anchorName} ${body.date} ${body.shift} ${body.brand}`);
    json(res, 200, { ok: true, record: created[0] || null });
  } catch (error) {
    handleError(res, error);
  }
};
