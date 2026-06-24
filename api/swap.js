const {
  json,
  readJson,
  listRecords,
  createRecords,
  updateRecords,
  sendBotText,
  handleError
} = require("../lib/_feishu");
const { audit } = require("../lib/_audit");

const LOCK_WINDOW_HOURS = 6;
const F = {
  declarationId: "\u7533\u62a5ID", declarationAnchor: "\u4e3b\u64ad\u59d3\u540d", declarationType: "\u7533\u62a5\u7c7b\u578b", declarationDate: "\u65e5\u671f",
  declarationStart: "\u5f00\u59cb\u65f6\u95f4", declarationEnd: "\u7ed3\u675f\u65f6\u95f4", originalShift: "\u539f\u73ed\u6b21", reason: "\u539f\u56e0", declarationStatus: "\u72b6\u6001",
  scheduleDate: "\u65e5\u671f", scheduleShift: "\u73ed\u6b21", scheduleStart: "\u5f00\u59cb\u65f6\u95f4", scheduleEnd: "\u7ed3\u675f\u65f6\u95f4", scheduleAnchor: "\u4e3b\u64ad\u59d3\u540d",
  scheduleBrand: "\u54c1\u724c", scheduleRoom: "\u76f4\u64ad\u95f4", scheduleStatus: "\u72b6\u6001", note: "\u5907\u6ce8",
  anchorName: "\u59d3\u540d", anchorLanguage: "\u8bed\u8a00", anchorCategory: "\u64c5\u957f\u7c7b\u76ee", brandName: "\u54c1\u724c\u540d", brandCategory: "\u7c7b\u76ee", brandLanguage: "\u9700\u8981\u8bed\u8a00"
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
  return Math.max(0, (minutes(val(schedule, F.scheduleEnd)) - minutes(val(schedule, F.scheduleStart))) / 60);
}

function isActiveSchedule(schedule) {
  return !["\u5386\u53f2", "\u5df2\u53d6\u6d88"].includes(val(schedule, F.scheduleStatus));
}

function assertNotLocked(schedule) {
  const start = new Date(`${val(schedule, F.scheduleDate)}T${val(schedule, F.scheduleStart) || "00:00"}:00`);
  if (!Number.isNaN(start.getTime()) && start.getTime() - Date.now() < LOCK_WINDOW_HOURS * 3600 * 1000) {
    const error = new Error("\u5f00\u64ad\u524d6\u5c0f\u65f6\u5185\u4e0d\u5141\u8bb8\u53d1\u8d77\u6216\u5b8c\u6210\u6362\u73ed");
    error.statusCode = 400;
    throw error;
  }
}

function findById(records, id) {
  return records.find((item) => item.record_id === id);
}

function parseMeta(reason) {
  const text = String(reason || "");
  const line = text.split("\n").find((item) => item.startsWith("SWAP|")) || "";
  const parts = line.split("|");
  return { mode: parts[1] || "exchange", from: parts[2] || "", to: parts[3] || "", target: parts[4] || "" };
}

function buildReason(mode, fromScheduleId, toScheduleId, targetAnchorName, reason) {
  return ["SWAP", mode, fromScheduleId || "", toScheduleId || "", targetAnchorName || ""].join("|") + (reason ? `\n${reason}` : "");
}

async function requestSwap(body) {
  const schedules = (await listRecords("schedules")).filter(isActiveSchedule);
  const from = findById(schedules, body.fromScheduleId);
  const to = body.toScheduleId ? findById(schedules, body.toScheduleId) : null;
  if (!from) return { status: 400, payload: { ok: false, error: "Source schedule not found" } };
  assertNotLocked(from);
  if (to) assertNotLocked(to);
  const mode = body.mode || "exchange";
  const target = mode === "cover" ? body.targetAnchorName : (to ? val(to, F.scheduleAnchor) : body.targetAnchorName);
  if (!target) return { status: 400, payload: { ok: false, error: "Missing target anchor" } };
  const fields = {
    [F.declarationId]: `SW${Date.now()}`,
    [F.declarationAnchor]: body.anchorName,
    [F.declarationType]: "\u6362\u73ed",
    [F.declarationDate]: val(from, F.scheduleDate),
    [F.declarationStart]: val(from, F.scheduleStart),
    [F.declarationEnd]: val(from, F.scheduleEnd),
    [F.originalShift]: val(from, F.scheduleShift),
    [F.reason]: buildReason(mode, body.fromScheduleId, body.toScheduleId, target, body.reason),
    [F.declarationStatus]: "\u5f85\u5904\u7406"
  };
  const created = await createRecords("declarations", [fields]);
  await audit("\u6362\u73ed\u7533\u8bf7", `${body.anchorName} -> ${target}; mode=${mode}`);
  await sendBotText(`\u3010\u6362\u73ed\u7533\u8bf7\u3011${body.anchorName} \u8bf7\u6c42 ${target} \u5904\u7406 ${val(from, F.scheduleDate)} ${val(from, F.scheduleShift)}`);
  return { status: 200, payload: { ok: true, record: created[0] || null } };
}

async function acceptSwap(body) {
  const [declarations, schedulesRaw] = await Promise.all([listRecords("declarations"), listRecords("schedules")]);
  const schedules = schedulesRaw.filter(isActiveSchedule);
  const declaration = findById(declarations, body.declarationRecordId);
  if (!declaration) return { status: 404, payload: { ok: false, error: "Swap request not found" } };
  const meta = parseMeta(val(declaration, F.reason));
  const from = findById(schedules, meta.from);
  const to = meta.to ? findById(schedules, meta.to) : null;
  if (!from) return { status: 400, payload: { ok: false, error: "Source schedule not found" } };
  assertNotLocked(from);
  if (to) assertNotLocked(to);
  const fromAnchor = val(from, F.scheduleAnchor);
  const updates = [];
  if (meta.mode === "cover") {
    const coverAnchor = meta.target || body.anchorName;
    updates.push({ record_id: from.record_id, fields: { [F.scheduleAnchor]: coverAnchor, [F.scheduleStatus]: "\u8349\u7a3f", [F.note]: `\u4ee3\u73ed\uff1a${fromAnchor} -> ${coverAnchor}` } });
  } else {
    if (!to) return { status: 400, payload: { ok: false, error: "Target schedule not found" } };
    const toAnchor = val(to, F.scheduleAnchor);
    updates.push({ record_id: from.record_id, fields: { [F.scheduleAnchor]: toAnchor, [F.note]: `\u7b49\u4ef7\u4e92\u6362\uff1a${fromAnchor} <-> ${toAnchor}` } });
    updates.push({ record_id: to.record_id, fields: { [F.scheduleAnchor]: fromAnchor, [F.note]: `\u7b49\u4ef7\u4e92\u6362\uff1a${fromAnchor} <-> ${toAnchor}` } });
  }
  const updatedSchedules = await updateRecords("schedules", updates);
  const updatedDeclaration = await updateRecords("declarations", [{ record_id: declaration.record_id, fields: { [F.declarationStatus]: "\u5df2\u540c\u610f" } }]);
  await audit("\u6362\u73ed\u5b8c\u6210", `record=${declaration.record_id}; mode=${meta.mode}`);
  await sendBotText(`\u3010\u6362\u73ed\u52a8\u6001\u3011${val(declaration, F.declarationAnchor)} \u7684\u6362\u73ed/\u4ee3\u73ed\u5df2\u5b8c\u6210\uff0c\u8bf7\u77e5\u6089\u3002`);
  return { status: 200, payload: { ok: true, declaration: updatedDeclaration[0] || null, schedules: updatedSchedules } };
}

async function rejectSwap(body) {
  const updated = await updateRecords("declarations", [{ record_id: body.declarationRecordId, fields: { [F.declarationStatus]: "\u5df2\u62d2\u7edd" } }]);
  await audit("\u6362\u73ed\u62d2\u7edd", `record=${body.declarationRecordId}`);
  return { status: 200, payload: { ok: true, declaration: updated[0] || null } };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });
  try {
    const body = await readJson(req);
    let result;
    if (body.action === "request") result = await requestSwap(body);
    else if (body.action === "accept") result = await acceptSwap(body);
    else if (body.action === "reject") result = await rejectSwap(body);
    else result = { status: 400, payload: { ok: false, error: "Invalid swap action" } };
    json(res, result.status, result.payload);
  } catch (error) {
    handleError(res, error);
  }
};
