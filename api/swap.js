const {
  json,
  readJson,
  listRecords,
  createRecords,
  updateRecords,
  sendBotText,
  handleError
} = require("./_feishu");

function f(record, name, fallback = "") {
  const value = record.fields?.[name];
  if (Array.isArray(value)) return value.map((item) => item.text || item.name || item).join(",");
  return value == null ? fallback : String(value);
}

function minutes(time) {
  const [hour, minute] = String(time || "00:00").split(":").map(Number);
  return hour * 60 + (minute || 0);
}

function durationHours(schedule) {
  return Math.max(0, (minutes(f(schedule, "结束时间")) - minutes(f(schedule, "开始时间"))) / 60);
}

function parseMeta(text = "") {
  if (!text.startsWith("SWAP_REQUEST|")) return null;
  const meta = {};
  for (const part of text.split("|").slice(1)) {
    const index = part.indexOf("=");
    if (index > -1) meta[part.slice(0, index)] = decodeURIComponent(part.slice(index + 1));
  }
  return meta;
}

function buildMeta(data) {
  return `SWAP_REQUEST|from=${encodeURIComponent(data.from)}|to=${encodeURIComponent(data.to)}|target=${encodeURIComponent(data.target || "")}|note=${encodeURIComponent(data.note || "")}`;
}

function findById(records, recordId) {
  return records.find((record) => record.record_id === recordId);
}

function findAnchor(anchors, name) {
  return anchors.find((anchor) => f(anchor, "姓名") === name);
}

function brandForSchedule(brands, schedule) {
  return brands.find((brand) => f(brand, "品牌名") === f(schedule, "品牌"));
}

function anchorMatchesBrand(anchor, brand) {
  if (!anchor || !brand) return { ok: false, reason: "主播或品牌不存在" };
  if (f(anchor, "状态", "正常") === "停用") return { ok: false, reason: "主播已停用" };
  if (f(anchor, "语言") !== f(brand, "需要语言")) return { ok: false, reason: "语言不匹配" };
  if (!f(anchor, "擅长类目").includes(f(brand, "类目"))) return { ok: false, reason: "擅长类目不匹配" };
  return { ok: true };
}

function validateWorkload(anchor, schedule, schedules) {
  const name = f(anchor, "姓名");
  const date = f(schedule, "日期");
  const maxSessions = Number(f(anchor, "每日最多场次", "2")) || 2;
  const daySchedules = schedules
    .filter((item) => f(item, "主播姓名") === name && f(item, "日期") === date)
    .sort((a, b) => minutes(f(a, "开始时间")) - minutes(f(b, "开始时间")));

  if (daySchedules.length > maxSessions) return { ok: false, reason: `超过每日最多场次 ${maxSessions}` };

  for (let i = 1; i < daySchedules.length; i += 1) {
    const prev = daySchedules[i - 1];
    const curr = daySchedules[i];
    if (minutes(f(curr, "开始时间")) < minutes(f(prev, "结束时间"))) {
      return { ok: false, reason: "同日班次时间冲突" };
    }
  }

  let continuous = 0;
  for (let i = 0; i < daySchedules.length; i += 1) {
    if (i === 0 || minutes(f(daySchedules[i], "开始时间")) > minutes(f(daySchedules[i - 1], "结束时间"))) {
      continuous = durationHours(daySchedules[i]);
    } else {
      continuous += durationHours(daySchedules[i]);
    }
    if (continuous >= 6) return { ok: false, reason: "可能连续直播 6 小时或以上" };
  }
  return { ok: true };
}

function swapPreview(schedules, fromScheduleId, toScheduleId, fromAnchorName, toAnchorName) {
  return schedules.map((record) => {
    if (record.record_id === fromScheduleId) return { ...record, fields: { ...record.fields, "主播姓名": toAnchorName } };
    if (record.record_id === toScheduleId) return { ...record, fields: { ...record.fields, "主播姓名": fromAnchorName } };
    return record;
  });
}

function validateSwap({ anchors, brands, schedules, fromSchedule, toSchedule, fromAnchorName, toAnchorName }) {
  const fromAnchor = findAnchor(anchors, fromAnchorName);
  const toAnchor = findAnchor(anchors, toAnchorName);
  const fromBrand = brandForSchedule(brands, fromSchedule);
  const toBrand = brandForSchedule(brands, toSchedule);
  const checks = [
    { label: `${fromAnchorName} 接 ${f(toSchedule, "品牌")} 班`, result: anchorMatchesBrand(fromAnchor, toBrand) },
    { label: `${toAnchorName} 接 ${f(fromSchedule, "品牌")} 班`, result: anchorMatchesBrand(toAnchor, fromBrand) }
  ];
  const preview = swapPreview(schedules, fromSchedule.record_id, toSchedule.record_id, fromAnchorName, toAnchorName);
  checks.push({ label: `${fromAnchorName} 工时`, result: validateWorkload(fromAnchor, findById(preview, toSchedule.record_id), preview) });
  checks.push({ label: `${toAnchorName} 工时`, result: validateWorkload(toAnchor, findById(preview, fromSchedule.record_id), preview) });
  const failed = checks.find((check) => !check.result.ok);
  return failed ? { ok: false, reason: `${failed.label}：${failed.result.reason}` } : { ok: true };
}

async function loadBase() {
  const [anchors, brands, schedules, declarations] = await Promise.all([
    listRecords("anchors"),
    listRecords("brands"),
    listRecords("schedules"),
    listRecords("declarations")
  ]);
  return { anchors, brands, schedules, declarations };
}

async function requestSwap(body) {
  const { anchors, brands, schedules } = await loadBase();
  const fromSchedule = findById(schedules, body.fromScheduleId);
  const toSchedule = findById(schedules, body.toScheduleId);
  if (!fromSchedule || !toSchedule) return { status: 400, data: { ok: false, error: "换班班次不存在" } };

  const fromAnchorName = body.anchorName || f(fromSchedule, "主播姓名");
  const toAnchorName = body.targetAnchorName || f(toSchedule, "主播姓名");
  if (!fromAnchorName || !toAnchorName) return { status: 400, data: { ok: false, error: "缺少换班主播" } };
  if (f(fromSchedule, "主播姓名") !== fromAnchorName) return { status: 400, data: { ok: false, error: "发起人不是原班次主播" } };
  if (fromAnchorName === toAnchorName) return { status: 400, data: { ok: false, error: "不能和自己换班" } };

  const preview = swapPreview(schedules, fromSchedule.record_id, toSchedule.record_id, fromAnchorName, toAnchorName);
  const fromAnchor = findAnchor(anchors, fromAnchorName);
  const toBrand = brandForSchedule(brands, toSchedule);
  const preCheck = anchorMatchesBrand(fromAnchor, toBrand);
  if (!preCheck.ok) return { status: 400, data: { ok: false, error: `前置校验失败：${preCheck.reason}` } };
  const workload = validateWorkload(fromAnchor, findById(preview, toSchedule.record_id), preview);
  if (!workload.ok) return { status: 400, data: { ok: false, error: `前置校验失败：${workload.reason}` } };

  const fields = {
    "申报ID": `SW-${Date.now()}`,
    "主播姓名": fromAnchorName,
    "申报类型": "换班",
    "日期": f(fromSchedule, "日期"),
    "开始时间": f(fromSchedule, "开始时间"),
    "结束时间": f(fromSchedule, "结束时间"),
    "原班次": `${f(fromSchedule, "班次")} -> ${f(toSchedule, "班次")}`,
    "原因": buildMeta({ from: fromSchedule.record_id, to: toSchedule.record_id, target: toAnchorName, note: body.reason || "" }),
    "状态": "待处理"
  };
  const created = await createRecords("declarations", [fields]);
  await sendBotText(`【换班请求】${fromAnchorName} 申请与 ${toAnchorName} 互换 ${f(fromSchedule, "日期")} ${f(fromSchedule, "班次")} / ${f(toSchedule, "班次")}。`);
  return { status: 200, data: { ok: true, record: created[0] || null } };
}

async function acceptSwap(body) {
  const { anchors, brands, schedules, declarations } = await loadBase();
  const declaration = findById(declarations, body.declarationRecordId);
  if (!declaration || f(declaration, "申报类型") !== "换班") return { status: 404, data: { ok: false, error: "换班申请不存在" } };
  if (f(declaration, "状态") !== "待处理") return { status: 400, data: { ok: false, error: "换班申请不是待处理状态" } };

  const meta = parseMeta(f(declaration, "原因"));
  if (!meta) return { status: 400, data: { ok: false, error: "旧换班申请缺少可执行信息，请重新发起" } };
  const fromSchedule = findById(schedules, meta.from);
  const toSchedule = findById(schedules, meta.to);
  if (!fromSchedule || !toSchedule) return { status: 400, data: { ok: false, error: "换班对应班次不存在" } };

  const fromAnchorName = f(declaration, "主播姓名");
  const toAnchorName = body.anchorName || meta.target || f(toSchedule, "主播姓名");
  if (meta.target && toAnchorName !== meta.target) return { status: 403, data: { ok: false, error: "只有被邀请主播可以同意这个换班" } };
  if (f(toSchedule, "主播姓名") !== toAnchorName) return { status: 400, data: { ok: false, error: "同意人不是目标班次当前主播" } };

  const validation = validateSwap({ anchors, brands, schedules, fromSchedule, toSchedule, fromAnchorName, toAnchorName });
  if (!validation.ok) return { status: 400, data: { ok: false, error: `二次校验失败：${validation.reason}` } };

  const updates = [
    {
      record_id: fromSchedule.record_id,
      fields: { "主播姓名": toAnchorName, "状态": "已发布", "备注": `已与 ${fromAnchorName} 完成换班` }
    },
    {
      record_id: toSchedule.record_id,
      fields: { "主播姓名": fromAnchorName, "状态": "已发布", "备注": `已与 ${toAnchorName} 完成换班` }
    }
  ];
  const [scheduleUpdates, declarationUpdates] = await Promise.all([
    updateRecords("schedules", updates),
    updateRecords("declarations", [{ record_id: declaration.record_id, fields: { "状态": "已同意" } }])
  ]);
  await sendBotText(`【换班动态】主播 ${fromAnchorName} 与主播 ${toAnchorName} 已完成 ${f(fromSchedule, "日期")} 班次互换，请知悉。`);
  return { status: 200, data: { ok: true, schedules: scheduleUpdates.length, declarations: declarationUpdates.length } };
}

async function rejectSwap(body) {
  const updated = await updateRecords("declarations", [{ record_id: body.declarationRecordId, fields: { "状态": "已拒绝" } }]);
  return { status: 200, data: { ok: true, updated: updated.length } };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });
  try {
    const body = await readJson(req);
    const action = body.action || "request";
    const result = action === "accept"
      ? await acceptSwap(body)
      : action === "reject"
        ? await rejectSwap(body)
        : await requestSwap(body);
    json(res, result.status, result.data);
  } catch (error) {
    handleError(res, error);
  }
};
