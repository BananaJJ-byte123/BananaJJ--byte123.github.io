const { json, listRecords, createRecords, handleError } = require("./_feishu");

function f(record, name, fallback = "") {
  const value = record.fields?.[name];
  if (Array.isArray(value)) return value.map((item) => item.text || item.name || item).join(",");
  return value == null ? fallback : String(value);
}

function dateRange(startDate) {
  const start = startDate ? new Date(`${startDate}T00:00:00Z`) : new Date();
  if (!startDate) start.setUTCDate(start.getUTCDate() - 6);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)];
}

module.exports = async function handler(req, res) {
  try {
    const url = new URL(req.url, `https://${req.headers.host || "localhost"}`);
    const [from, to] = dateRange(url.searchParams.get("from"));
    const logs = (await listRecords("notifications", { fresh: true })).filter((item) => {
      const time = f(item, "时间").slice(0, 10);
      return time >= from && time <= to && (f(item, "通知ID").startsWith("AUD-") || f(item, "标题").includes("留痕"));
    });
    const lines = logs
      .sort((a, b) => f(a, "时间").localeCompare(f(b, "时间")))
      .map((item) => `${f(item, "时间")} | ${f(item, "标题")} | ${f(item, "内容")} | ${f(item, "状态")}`);
    const fields = {
      "通知ID": `WEEKLY-AUD-${from}`,
      "标题": `每周留痕日志 ${from}~${to}`,
      "内容": lines.join("\n") || "本周暂无留痕事件",
      "时间": new Date().toISOString(),
      "状态": "已生成"
    };
    const created = await createRecords("notifications", [fields]);
    json(res, 200, { ok: true, from, to, count: logs.length, record: created[0] || null });
  } catch (error) {
    handleError(res, error);
  }
};
