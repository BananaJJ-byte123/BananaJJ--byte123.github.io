const { json, readJson, listRecords, createRecords, updateRecords, sendBotText, handleError } = require("../lib/_feishu");
const { audit } = require("../lib/_audit");

const F = {
  declarationId: "\u7533\u62a5ID", anchorName: "\u4e3b\u64ad\u59d3\u540d", type: "\u7533\u62a5\u7c7b\u578b", date: "\u65e5\u671f",
  start: "\u5f00\u59cb\u65f6\u95f4", end: "\u7ed3\u675f\u65f6\u95f4", originalShift: "\u539f\u73ed\u6b21", reason: "\u539f\u56e0", status: "\u72b6\u6001",
  scheduleAnchor: "\u4e3b\u64ad\u59d3\u540d", scheduleDate: "\u65e5\u671f", scheduleStart: "\u5f00\u59cb\u65f6\u95f4", scheduleEnd: "\u7ed3\u675f\u65f6\u95f4", scheduleStatus: "\u72b6\u6001", note: "\u5907\u6ce8"
};

function val(record, key) {
  const value = record && record.fields ? record.fields[key] : "";
  if (Array.isArray(value)) return value.map((item) => item.text || item.name || item).join(",");
  if (value && typeof value === "object") return value.text || value.name || JSON.stringify(value);
  return value == null ? "" : String(value);
}

async function releaseLeaveShift(fields) {
  if (fields[F.type] !== "\u8bf7\u5047") return null;
  const schedules = await listRecords("schedules");
  const match = schedules.find((item) =>
    val(item, F.scheduleAnchor) === fields[F.anchorName] &&
    val(item, F.scheduleDate) === fields[F.date] &&
    (!fields[F.start] || val(item, F.scheduleStart) === fields[F.start]) &&
    (!fields[F.end] || val(item, F.scheduleEnd) === fields[F.end])
  );
  if (!match) return null;
  const updated = await updateRecords("schedules", [{
    record_id: match.record_id,
    fields: {
      [F.scheduleAnchor]: "",
      [F.scheduleStatus]: "\u7f3a\u4eba",
      [F.note]: `\u8bf7\u5047\u81ea\u52a8\u91ca\u653e\uff1a${fields[F.anchorName]}`
    }
  }]);
  return updated[0] || null;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });
  try {
    const body = await readJson(req);
    if (!body.anchorName || !body.type || !body.date) return json(res, 400, { ok: false, error: "Missing declaration fields" });
    const fields = {
      [F.declarationId]: body.declarationId || `D${Date.now()}`,
      [F.anchorName]: body.anchorName,
      [F.type]: body.type,
      [F.date]: body.date,
      [F.start]: body.startTime || "",
      [F.end]: body.endTime || "",
      [F.originalShift]: body.originalShift || "",
      [F.reason]: body.reason || "",
      [F.status]: "\u5f85\u5904\u7406"
    };
    const created = await createRecords("declarations", [fields]);
    const releasedSchedule = await releaseLeaveShift(fields);
    await audit("\u4e3b\u64ad\u7533\u62a5", `${body.anchorName} ${body.type} ${body.date}`);
    await sendBotText(`\u3010\u4e3b\u64ad\u7533\u62a5\u3011${body.anchorName} ${body.type} ${body.date}`);
    json(res, 200, { ok: true, record: created[0] || null, releasedSchedule });
  } catch (error) {
    handleError(res, error);
  }
};
