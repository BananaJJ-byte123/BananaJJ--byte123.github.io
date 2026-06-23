const { json, listRecords, createRecords, handleError } = require("../lib/_feishu");

const F = {
  title: "\u6807\u9898", content: "\u5185\u5bb9", time: "\u65f6\u95f4", status: "\u72b6\u6001"
};

function val(record, key) {
  const value = record && record.fields ? record.fields[key] : "";
  if (Array.isArray(value)) return value.map((item) => item.text || item.name || item).join(",");
  if (value && typeof value === "object") return value.text || value.name || JSON.stringify(value);
  return value == null ? "" : String(value);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

module.exports = async function handler(req, res) {
  try {
    const url = new URL(req.url, "http://localhost");
    const from = url.searchParams.get("from") || new Date().toISOString().slice(0, 10);
    const to = addDays(from, 7);
    const logs = await listRecords("notifications");
    const rows = logs
      .filter((item) => {
        const time = val(item, F.time).slice(0, 10);
        return time >= from && time < to;
      })
      .map((item) => `${val(item, F.time)} | ${val(item, F.title)} | ${val(item, F.content)} | ${val(item, F.status)}`);
    const content = rows.length ? rows.join("\n") : "\u672c\u5468\u6682\u65e0\u7559\u75d5\u8bb0\u5f55";
    const created = await createRecords("notifications", [{
      [F.title]: `Audit Trail ${from} - ${to}`,
      [F.content]: content,
      [F.time]: new Date().toISOString(),
      [F.status]: "\u5df2\u751f\u6210"
    }]);
    json(res, 200, { ok: true, from, to, count: rows.length, record: created[0] || null });
  } catch (error) {
    handleError(res, error);
  }
};
