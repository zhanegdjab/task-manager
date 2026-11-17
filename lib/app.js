'use strict';

/**
 * Express 应用（路由层）
 * 本地由 server.js 监听端口启动；部署到 Vercel 时由 api/index.js 直接导出，无需监听端口。
 */

const path = require('path');
const express = require('express');

// 读取 .env（Vercel 上环境变量由平台注入，这里读不到文件也不会报错）
try {
  require('dotenv').config();
} catch (e) {
  /* dotenv 未安装时直接使用系统环境变量 */
}

const store = require('./store');

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

/** 把 async 路由里抛出的错误交给统一错误处理 */
const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

/* ------------------------------- 接口 ------------------------------- */

// 健康检查：告诉前端当前连的是 Supabase 还是本地演示存储
app.get(
  '/api/health',
  wrap(async (req, res) => {
    res.json({ ok: true, storage: store.describe() });
  })
);

// 任务列表：?priority=all|高|中|低（已按 created_at 倒序）
app.get(
  '/api/tasks',
  wrap(async (req, res) => {
    const priority = String(req.query.priority || 'all').trim();
    const tasks = await store.list(priority);
    res.json({ tasks });
  })
);

// 新建任务
app.post(
  '/api/tasks',
  wrap(async (req, res) => {
    const title = String((req.body && req.body.title) || '').trim();
    const priority = String((req.body && req.body.priority) || store.DEFAULT_PRIORITY).trim();

    if (!title) return res.status(400).json({ error: '任务标题不能为空' });
    if (title.length > 200) return res.status(400).json({ error: '任务标题不能超过 200 个字' });
    if (!store.PRIORITIES.includes(priority)) {
      return res.status(400).json({ error: '优先级只能是 高 / 中 / 低' });
    }

    const task = await store.create({ title, priority });
    res.status(201).json({ task });
  })
);

// 切换完成状态：{ "completed": true | false }
app.patch(
  '/api/tasks/:id',
  wrap(async (req, res) => {
    const completed = req.body && req.body.completed;
    if (typeof completed !== 'boolean') {
      return res.status(400).json({ error: '请求格式不对，需要 { "completed": true } 或 { "completed": false }' });
    }
    const task = await store.setCompleted(req.params.id, completed);
    res.json({ task });
  })
);

// 删除任务
app.delete(
  '/api/tasks/:id',
  wrap(async (req, res) => {
    await store.remove(req.params.id);
    res.status(204).end();
  })
);

// 没匹配到的接口
app.use('/api', (req, res) => res.status(404).json({ error: '接口不存在' }));

/* ---------------------------- 错误处理 ---------------------------- */

app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: '请求内容不是合法的 JSON' });
  }
  const { status, message } = store.friendlyError(err);
  if (status >= 500) console.error('[task-manager]', err && (err.detail || err.message || err));
  res.status(status).json({ error: message });
});

module.exports = app;
