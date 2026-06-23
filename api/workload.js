const { json, listRecords, handleError } = require("./_feishu");

function f(record, name, fallback = "") {
  const value = record.fields?.[name];
  if (Array.isArray(value)) return value.map((item) => item.text || item.name || item).join(",");
  return value == null ? fallback : String(value);
}

function hours(start, end) {
  const [sh, sm] = String(start || "00:00").split(":").map(Number);
  const [eh, em] = String(end || "00:00").split(":").map(Number);
  return Math.max(0, ((eh * 60 + (em || 0)) - (sh * 60 + (sm || 0))) / 60);
}

module.exports = async function handler(req, res) {
  try {
    const url = new URL(req.url, `https://${req.headers.host || "localhost"}`);
    const month = url.searchParams.get("month") || new Date().toISOString().slice(0, 7);
    const [anchors, schedules] = await Promise.all([listRecords("anchors"), listRecords("schedules")]);
    const result = anchors.map((anchor) => {
      const name = f(anchor, "姓名");
      const target = Number(f(anchor, "月目标工时", "0")) || 0;
      const rows = schedules.filter((item) => f(item, "主播姓名") === name && f(item, "日期").startsWith(month) && f(item, "状态") !== "缺人");
      const scheduledHours = rows.reduce((sum, item) => sum + hours(f(item, "开始时间"), f(item, "结束时间")), 0);
      return {
        anchorId: f(anchor, "主播ID"),
        name,
        language: f(anchor, "语言"),
        level: f(anchor, "等级"),
        targetHours: target,
        scheduledHours,
        balanceHours: Number((target - scheduledHours).toFixed(2)),
        shifts: rows.length
      };
    });
    json(res, 200, { ok: true, month, records: result });
  } catch (error) {
    handleError(res, error);
  }
};
