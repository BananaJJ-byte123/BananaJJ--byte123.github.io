const { json, listRecords, handleError } = require("./_feishu");

module.exports = async function handler(req, res) {
  try {
    const [anchors, schedules, declarations] = await Promise.all([
      listRecords("anchors"),
      listRecords("schedules"),
      listRecords("declarations")
    ]);
    json(res, 200, { ok: true, records: { anchors, schedules, declarations } });
  } catch (error) {
    handleError(res, error);
  }
};
