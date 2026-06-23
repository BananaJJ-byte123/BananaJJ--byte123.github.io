const { createRecords } = require("./_feishu");

const F = {
  title: "\u6807\u9898",
  content: "\u5185\u5bb9",
  time: "\u65f6\u95f4",
  status: "\u72b6\u6001"
};

async function audit(title, content, status = "\u5df2\u8bb0\u5f55") {
  try {
    await createRecords("notifications", [{
      [F.title]: title,
      [F.content]: content,
      [F.time]: new Date().toISOString(),
      [F.status]: status
    }]);
  } catch (error) {
    console.warn("audit skipped", error.message);
  }
}

module.exports = { audit };
