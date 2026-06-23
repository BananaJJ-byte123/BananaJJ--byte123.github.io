const { json, tableEnvMap } = require("../lib/_feishu");

module.exports = async function handler(req, res) {
  const env = {
    FEISHU_APP_ID: Boolean(process.env.FEISHU_APP_ID),
    FEISHU_APP_SECRET: Boolean(process.env.FEISHU_APP_SECRET),
    FEISHU_BASE_TOKEN: Boolean(process.env.FEISHU_BASE_TOKEN),
    FEISHU_BOT_WEBHOOK_URL: Boolean(process.env.FEISHU_BOT_WEBHOOK_URL)
  };
  for (const key of Object.values(tableEnvMap)) env[key] = Boolean(process.env[key]);
  json(res, 200, { ok: true, env });
};
