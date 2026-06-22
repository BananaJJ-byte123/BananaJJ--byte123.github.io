const { json, readJson, listRecords, createRecords, sendBotText, handleError } = require("./_feishu");

function f(record, name, fallback = "") {
  const value = record.fields?.[name];
  if (Array.isArray(value)) return value.map((item) => item.text || item.name || item).join(",");
  return value == null ? fallback : String(value);
}

function buildDateRange(startDate, days) {
  const result = [];
  const [year, month, day] = startDate.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, day));
  for (let i = 0; i < days; i += 1) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + i);
    result.push(date.toISOString().slice(0, 10));
  }
  return result;
}

function hasDeclarationBlock(anchorName, date, declarations) {
  return declarations.some((item) => {
    const type = f(item, "申报类型");
    const status = f(item, "状态");
    return f(item, "主播姓名") === anchorName && f(item, "日期") === date && status !== "驳回" && ["请假", "不可上班"].includes(type);
  });
}

function pickAnchor({ anchors, brand, date, template, declarations, assigned }) {
  const language = f(brand, "需要语言");
  const category = f(brand, "类目");
  const start = Number(f(template, "开始时间", "09:00").slice(0, 2));
  const candidates = anchors
    .filter((anchor) => f(anchor, "状态", "正常") !== "停用")
    .filter((anchor) => f(anchor, "语言") === language)
    .filter((anchor) => !hasDeclarationBlock(f(anchor, "姓名"), date, declarations))
    .map((anchor) => {
      const name = f(anchor, "姓名");
      const sameDay = assigned.filter((item) => item.anchorName === name && item.date === date);
      if (sameDay.length >= Number(f(anchor, "每日最多场次", "2"))) return null;
      for (const item of sameDay) {
        if (Math.abs(start - item.startHour) < 6) return null;
      }
      let score = 0;
      if (f(anchor, "擅长类目").includes(category)) score += 40;
      if (f(anchor, "等级") === "A") score += 20;
      if (f(anchor, "等级") === "B") score += 10;
      score -= assigned.filter((item) => item.anchorName === name).length * 3;
      return { anchor, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
  return candidates[0]?.anchor || null;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });
  try {
    const body = await readJson(req);
    const startDate = body.startDate || new Date().toISOString().slice(0, 10);
    const days = Math.max(1, Math.min(31, Number(body.days || 7)));

    const [anchors, brands, templates, declarations] = await Promise.all([
      listRecords("anchors"),
      listRecords("brands"),
      listRecords("templates"),
      listRecords("declarations")
    ]);

    const dates = buildDateRange(startDate, days);
    const assigned = [];
    const schedules = [];
    let missing = 0;

    for (const date of dates) {
      for (const brand of brands) {
        for (const template of templates) {
          const anchor = pickAnchor({ anchors, brand, date, template, declarations, assigned });
          const startTime = f(template, "开始时间");
          const endTime = f(template, "结束时间");
          if (anchor) {
            assigned.push({ anchorName: f(anchor, "姓名"), date, startHour: Number(startTime.slice(0, 2)) });
          } else {
            missing += 1;
          }
          schedules.push({
            "排班ID": `S-${date}-${f(brand, "品牌ID", f(brand, "品牌名"))}-${f(template, "班次ID", f(template, "班次名称"))}`.replace(/\s+/g, ""),
            "日期": date,
            "班次": f(template, "班次名称"),
            "开始时间": startTime,
            "结束时间": endTime,
            "主播姓名": anchor ? f(anchor, "姓名") : "",
            "品牌": f(brand, "品牌名"),
            "直播间": f(brand, "直播间名称"),
            "状态": anchor ? "草稿" : "缺人",
            "备注": anchor ? "自动生成" : "无符合条件主播"
          });
        }
      }
    }

    const created = await createRecords("schedules", schedules);
    await sendBotText(`排班草稿已生成：${startDate} 起 ${days} 天，共 ${schedules.length} 条，缺人 ${missing} 条。请主管查看排班结果表。`);
    json(res, 200, { ok: true, count: schedules.length, missing, created: created.length });
  } catch (error) {
    handleError(res, error);
  }
};
