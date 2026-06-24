const { json, listRecords, handleError } = require("../lib/_feishu");

const F = {
  anchorId: "\u4e3b\u64adID", name: "\u59d3\u540d", language: "\u8bed\u8a00", level: "\u7b49\u7ea7", target: "\u6708\u76ee\u6807\u5de5\u65f6",
  scheduleDate: "\u65e5\u671f", scheduleAnchor: "\u4e3b\u64ad\u59d3\u540d", start: "\u5f00\u59cb\u65f6\u95f4", end: "\u7ed3\u675f\u65f6\u95f4", status: "\u72b6\u6001"
};

function val(record, key) {
  const value = record && record.fields ? record.fields[key] : "";
  if (Array.isArray(value)) return value.map((item) => item.text || item.name || item).join(",");
  if (value && typeof value === "object") return value.text || value.name || JSON.stringify(value);
  return value == null ? "" : String(value);
}

function minutes(time) {
  const [h, m] = String(time || "0:0").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function hours(schedule) {
  return Math.max(0, (minutes(val(schedule, F.end)) - minutes(val(schedule, F.start))) / 60);
}

function isActiveSchedule(schedule) {
  return !["\u5386\u53f2", "\u5df2\u53d6\u6d88"].includes(val(schedule, F.status));
}

module.exports = async function handler(req, res) {
  try {
    const url = new URL(req.url, "http://localhost");
    const month = url.searchParams.get("month") || new Date().toISOString().slice(0, 7);
    const [anchors, schedules] = await Promise.all([listRecords("anchors"), listRecords("schedules")]);
    const records = anchors.map((anchor) => {
      const name = val(anchor, F.name);
      const ownSchedules = schedules.filter((item) => isActiveSchedule(item) && val(item, F.scheduleAnchor) === name && val(item, F.scheduleDate).startsWith(month));
      const actualHours = ownSchedules.reduce((sum, item) => sum + hours(item), 0);
      const targetHours = Number(val(anchor, F.target)) || 0;
      return {
        anchorId: val(anchor, F.anchorId),
        name,
        language: val(anchor, F.language),
        level: val(anchor, F.level),
        targetHours,
        actualHours,
        gapHours: actualHours - targetHours,
        shiftCount: ownSchedules.length
      };
    });
    json(res, 200, { ok: true, month, records });
  } catch (error) {
    handleError(res, error);
  }
};
