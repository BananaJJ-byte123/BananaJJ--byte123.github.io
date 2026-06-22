# 飞书 H5 在线版配置教程

这一版的目标是：主播和主管都打开同一个 Vercel 网站，但所有共享数据都写进飞书多维表格，通知走飞书机器人。

## 1. 飞书自建应用

在飞书开放平台创建企业自建应用，并保存：

- `App ID`
- `App Secret`

权限建议开启：

- 多维表格读取记录
- 多维表格写入记录
- 多维表格表格读取
- 机器人发送消息或使用群机器人 Webhook

如果使用群机器人 Webhook，进入飞书群设置，添加自定义机器人，复制 Webhook 地址。

## 2. 多维表格结构

创建一个多维表格，建议命名为 `主播自动排班数据库`，并创建 6 张表。

如果你想快速试跑，可以先把 `sample-data` 文件夹里的 CSV 导入到对应表里：

- `sample-data/anchors.csv` -> `主播名单`
- `sample-data/brands.csv` -> `品牌直播间`
- `sample-data/shift-templates.csv` -> `班次模板`
- `sample-data/declarations.csv` -> `主播申报`
- `sample-data/schedules.csv` -> `排班结果`
- `sample-data/notifications.csv` -> `通知日志`

### 主播名单

字段：

- `主播ID`：文本
- `姓名`：文本
- `英文名`：文本
- `飞书用户`：文本
- `语言`：单选，选项 `English`、`Bahasa Indonesia`
- `国家`：文本
- `时区`：文本
- `擅长类目`：文本，例如 `美妆`、`服装`、`3C`
- `等级`：单选，选项 `A`、`B`、`C`
- `月目标工时`：数字
- `每日最多场次`：数字
- `状态`：单选，选项 `正常`、`停用`

### 品牌直播间

字段：

- `品牌ID`：文本
- `品牌名`：文本
- `类目`：文本
- `需要语言`：单选，选项 `English`、`Bahasa Indonesia`
- `直播间名称`：文本
- `优先级`：数字
- `状态`：单选，选项 `启用`、`停用`

### 班次模板

字段：

- `班次ID`：文本
- `班次名称`：文本
- `开始时间`：文本，例如 `09:00`
- `结束时间`：文本，例如 `12:00`
- `默认时长`：数字
- `状态`：单选，选项 `启用`、`停用`

### 主播申报

字段：

- `申报ID`：文本
- `主播姓名`：文本
- `申报类型`：单选，选项 `请假`、`换班`、`空闲时间`
- `日期`：日期或文本，推荐 `YYYY-MM-DD`
- `开始时间`：文本
- `结束时间`：文本
- `原班次`：文本
- `原因`：多行文本
- `状态`：单选，选项 `待处理`、`已同意`、`已拒绝`

### 排班结果

字段：

- `排班ID`：文本
- `日期`：日期或文本，推荐 `YYYY-MM-DD`
- `班次`：文本
- `开始时间`：文本
- `结束时间`：文本
- `主播姓名`：文本
- `品牌`：文本
- `直播间`：文本
- `状态`：单选，选项 `草稿`、`已发布`、`已确认`
- `备注`：多行文本

### 通知日志

字段：

- `通知ID`：文本
- `标题`：文本
- `内容`：多行文本
- `时间`：文本
- `状态`：文本

## 3. Vercel 环境变量

在 Vercel 项目里进入 `Settings -> Environment Variables`，添加：

- `FEISHU_APP_ID`：飞书自建应用 App ID
- `FEISHU_APP_SECRET`：飞书自建应用 App Secret
- `FEISHU_BASE_TOKEN`：多维表格 app_token
- `FEISHU_TABLE_ANCHORS`：`主播名单` table_id
- `FEISHU_TABLE_BRANDS`：`品牌直播间` table_id
- `FEISHU_TABLE_TEMPLATES`：`班次模板` table_id
- `FEISHU_TABLE_DECLARATIONS`：`主播申报` table_id
- `FEISHU_TABLE_SCHEDULES`：`排班结果` table_id
- `FEISHU_TABLE_NOTIFICATIONS`：`通知日志` table_id
- `FEISHU_BOT_WEBHOOK_URL`：飞书群机器人 Webhook，可选但推荐

保存后重新部署 Vercel。

## 4. 飞书 H5 应用地址

飞书应用后台的网页地址建议配置：

- 主管入口：`https://anchor-test26.vercel.app/manager`
- 主播入口：`https://anchor-test26.vercel.app/anchor`

如果飞书应用只能配置一个主页，就填：

- `https://anchor-test26.vercel.app/`

首页里会显示两个入口。

## 5. 验证方式

部署后先打开：

- `https://anchor-test26.vercel.app/api/health`

如果返回 `ok: true`，并且 `baseToken`、各表 `tables` 都是 `true`，说明 Vercel 环境变量配置完整。

然后测试：

1. 打开 `/anchor`，提交一条请假或空闲时间。
2. 打开 `/manager`，刷新数据，应该能看到申报。
3. 在 `/manager` 选择日期和天数，点击生成排班。
4. 多维表格的 `排班结果` 应出现新记录。
5. 如果配置了机器人 webhook，飞书群会收到通知。
