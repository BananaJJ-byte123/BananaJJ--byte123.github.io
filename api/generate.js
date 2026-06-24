const { json, readJson, listRecords, createRecords, updateRecords, sendBotText, handleError } = require("../lib/_feishu");
const { audit } = require("../lib/_audit");

const F = {
  anchorId: "\u4e3b\u64adID", anchorName: "\u59d3\u540d", language: "\u8bed\u8a00", category: "\u64c5\u957f\u7c7b\u76ee", level: "\u7b49\u7ea7", target: "\u6708\u76ee\u6807\u5de5\u65f6", maxDaily: "\u6bcf\u65e5\u6700\u591a\u573a\u6b21", anchorStatus: "\u72b6\u6001",
  brandName: "\u54c1\u724c\u540d", brandCategory: "\u7c7b\u76ee", needLanguage: "\u9700\u8981\u8bed\u8a00", room: "\u76f4\u64ad\u95f4\u540d\u79f0", priority: "\u4f18\u5148\u7ea7", brandStatus: "\u72b6\u6001",
  shiftName: "\u73ed\u6b21\u540d\u79f0", start: "\u5f00\u59cb\u65f6\u95f4", end: "\u7ed3\u675f\u65f6\u95f4", duration: "\u9ed8\u8ba4\u65f6\u957f", templateStatus: "\u72b6\u6001",
  scheduleId: "\u6392\u73edID", date: "\u65e5\u671f", shift: "\u73ed\u6b21", scheduleAnchor: "\u4e3b\u64ad\u59d3\u540d", brand: "\u54c1\u724c", scheduleRoom: "\u76f4\u64ad\u95f4", scheduleStatus: "\u72b6\u6001", note: "\u5907\u6ce8",
  declarationAnchor: "\u4e3b\u64ad\u59d3\u540d", declarationType: "\u7533\u62a5\u7c7b\u578b", declarationDate: "\u65e5\u671f", declarationStatus: "\u72b6\u6001"
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

function monthDays(month) {
  const [year, m] = month.split("-").map(Number);
  return new Date(year, m, 0).getDate();
}

function minutes(time) {
  const [h, m] = String(time || "0:0").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function shiftHours(template) {
  const preset = Number(val(template, F.duration));
  if (preset) return preset;
  return Math.max(0, (minutes(val(template, F.end)) - minutes(val(template, F.start))) / 60);
}

function isLeave(anchorName, date, declarations) {
  return declarations.some((item) =>
    val(item, F.declarationAnchor) === anchorName &&
    val(item, F.declarationType) === "\u8bf7\u5047" &&
    val(item, F.declarationDate) === date &&
    val(item, F.declarationStatus) !== "\u5df2\u62d2\u7edd"
  );
}

function isInactiveSchedule(record) {
  return ["\u5386\u53f2", "\u5df2\u53d6\u6d88"].includes(val(record, F.scheduleStatus));
}

function duplicateKey(record) {
  return [
    val(record, F.date),
    val(record, F.start),
    val(record, F.end),
    val(record, F.brand),
    val(record, F.scheduleRoom)
  ].join("|");
}

async function cleanupDuplicateSchedules() {
  const schedules = await listRecords("schedules", { fresh: true });
  const groups = new Map();
  for (const record of schedules) {
    if (isInactiveSchedule(record)) continue;
    const key = duplicateKey(record);
    if (!key.replace(/\|/g, "")) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }

  const updates = [];
  for (const records of groups.values()) {
    if (records.length < 2) continue;
    const keep = records[records.length - 1];
    for (const record of records) {
      if (record.record_id === keep.record_id) continue;
      updates.push({
        record_id: record.record_id,
        fields: {
          [F.scheduleStatus]: "\u5386\u53f2",
          [F.note]: `${val(record, F.note) || ""}\n\u91cd\u590d\u6392\u73ed\u6e05\u7406\uff1a\u4fdd\u7559\u540c\u5c97\u4f4d\u6700\u65b0\u8bb0\u5f55 ${keep.record_id}`.trim()
        }
      });
    }
  }

  if (updates.length) await updateRecords("schedules", updates);
  await audit("\u6e05\u7406\u91cd\u590d\u6392\u73ed", `marked ${updates.length} records as history`);
  return { scanned: schedules.length, groups: groups.size, markedHistory: updates.length };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });
  try {
    const body = await readJson(req);
    if (body.action === "cleanup-duplicates") {
      const result = await cleanupDuplicateSchedules();
      return json(res, 200, { ok: true, ...result });
    }
    const startDate = body.month ? `${body.month}-01` : body.startDate;
    const days = body.month ? monthDays(body.month) : Math.max(1, Math.min(31, Number(body.days || 7)));
    if (!startDate) return json(res, 400, { ok: false, error: "Missing startDate or month" });

    const [anchorsRaw, brandsRaw, templatesRaw, declarations] = await Promise.all([
      listRecords("anchors"),
      listRecords("brands"),
      listRecords("templates"),
      listRecords("declarations")
    ]);
    const anchors = anchorsRaw.filter((item) => val(item, F.anchorStatus) !== "\u505c\u7528");
    const brands = brandsRaw.filter((item) => val(item, F.brandStatus) !== "\u505c\u7528").sort((a, b) => Number(val(a, F.priority) || 9) - Number(val(b, F.priority) || 9));
    const templates = templatesRaw.filter((item) => val(item, F.templateStatus) !== "\u505c\u7528");
    const monthlyHours = new Map();
    const dailyCount = new Map();
    const output = [];

    for (let day = 0; day < days; day++) {
      const date = addDays(startDate, day);
      for (const template of templates) {
        for (const brand of brands) {
          const candidates = anchors
            .filter((anchor) => val(anchor, F.language) === val(brand, F.needLanguage))
            .filter((anchor) => !val(anchor, F.category) || !val(brand, F.brandCategory) || val(anchor, F.category).includes(val(brand, F.brandCategory)))
            .filter((anchor) => !isLeave(val(anchor, F.anchorName), date, declarations))
            .filter((anchor) => (dailyCount.get(`${date}|${val(anchor, F.anchorName)}`) || 0) < (Number(val(anchor, F.maxDaily)) || 2))
            .sort((a, b) => (monthlyHours.get(val(a, F.anchorName)) || 0) - (monthlyHours.get(val(b, F.anchorName)) || 0));
          const anchor = candidates[0];
          const anchorName = anchor ? val(anchor, F.anchorName) : "";
          const hours = shiftHours(template);
          if (anchorName) {
            monthlyHours.set(anchorName, (monthlyHours.get(anchorName) || 0) + hours);
            dailyCount.set(`${date}|${anchorName}`, (dailyCount.get(`${date}|${anchorName}`) || 0) + 1);
          }
          output.push({
            [F.scheduleId]: `SCH-${date.replace(/-/g, "")}-${val(template, F.shiftName)}-${val(brand, F.brandName)}-${output.length + 1}`,
            [F.date]: date,
            [F.shift]: val(template, F.shiftName),
            [F.start]: val(template, F.start),
            [F.end]: val(template, F.end),
            [F.scheduleAnchor]: anchorName,
            [F.brand]: val(brand, F.brandName),
            [F.scheduleRoom]: val(brand, F.room),
            [F.scheduleStatus]: anchorName ? "\u8349\u7a3f" : "\u7f3a\u4eba",
            [F.note]: anchorName ? "\u81ea\u52a8\u6392\u73ed" : "\u6682\u65e0\u5339\u914d\u4e3b\u64ad"
          });
        }
      }
    }
    const created = await createRecords("schedules", output);
    await audit("\u81ea\u52a8\u6392\u73ed", `${startDate} for ${days} days, created ${created.length}`);
    await sendBotText(`\u3010\u6392\u73ed\u751f\u6210\u3011${startDate} \u8d77 ${days} \u5929\uff0c\u5171 ${created.length} \u6761`);
    json(res, 200, { ok: true, count: created.length, created: created.length, missing: output.filter((item) => !item[F.scheduleAnchor]).length, schedules: created });
  } catch (error) {
    handleError(res, error);
  }
};
