const { createRecords } = require("./_feishu");

function nowText() {
  return new Date().toISOString();
}

async function audit(title, content, status = "已记录") {
  try {
    await createRecords("notifications", [{
      "通知ID": `AUD-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      "标题": title,
      "内容": content,
      "时间": nowText(),
      "状态": status
    }]);
  } catch (error) {
    console.error("Audit log failed:", error.message);
  }
}

module.exports = { audit };
