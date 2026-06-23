const { json, listRecords, tableEnvMap, handleError } = require("../lib/_feishu");

function envStatus() {
  const env = {
    FEISHU_APP_ID: Boolean(process.env.FEISHU_APP_ID),
    FEISHU_APP_SECRET: Boolean(process.env.FEISHU_APP_SECRET),
    FEISHU_BASE_TOKEN: Boolean(process.env.FEISHU_BASE_TOKEN),
    FEISHU_BOT_WEBHOOK_URL: Boolean(process.env.FEISHU_BOT_WEBHOOK_URL)
  };
  for (const key of Object.values(tableEnvMap)) env[key] = Boolean(process.env[key]);
  return env;
}

module.exports = async function handler(req, res) {
  try {
    const [anchors, brands, templates, declarations, schedules] = await Promise.all([
      listRecords("anchors"),
      listRecords("brands"),
      listRecords("templates"),
      listRecords("declarations"),
      listRecords("schedules")
    ]);
    json(res, 200, {
      ok: true,
      env: envStatus(),
      records: { anchors, brands, templates, declarations, schedules }
    });
  } catch (error) {
    handleError(res, error);
  }
};
