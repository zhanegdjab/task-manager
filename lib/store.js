'use strict';

/**
 * 数据访问层
 * ------------------------------------------------------------------
 * 主模式：Supabase 云数据库（DATA_MODE 未设置或 = supabase）
 * 演示模式：本地 JSON 文件（DATA_MODE=demo），方便没配置 Supabase 时先看到页面效果
 * 两种模式对外暴露一致的接口：list / create / setCompleted / remove
 *
 * 表结构（与《操作手册》4.2 节一致）：
 *   id bigint 自增主键 | title text | priority '高'/'中'/'低' | completed boolean | created_at timestamptz
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TABLE = 'tasks';
const COLUMNS = 'id,title,priority,completed,created_at';
const PRIORITIES = ['高', '中', '低'];
const DEFAULT_PRIORITY = '中';

const MODE = String(process.env.DATA_MODE || 'supabase').trim().toLowerCase();
const USE_LOCAL = MODE === 'demo' || MODE === 'local';
const DATA_FILE = path.join(__dirname, '..', 'data', 'tasks.json');

/* ------------------------------ 错误处理 ------------------------------ */

function configError(message) {
  const err = new Error(
    message ||
      '数据库还没配置：请在项目根目录的 .env 文件里填写 SUPABASE_URL 和 SUPABASE_ANON_KEY（填法见 README.md）'
  );
  err.status = 503;
  err.code = 'NO_CONFIG';
  return err;
}

function dbError(action, error) {
  const err = new Error(`${action}失败：${(error && error.message) || '未知错误'}`);
  err.status = 500;
  err.code = error && error.code;
  err.detail = error && (error.details || error.hint);
  return err;
}

/** 把底层错误翻译成学生能看懂的中文 */
function friendlyError(err) {
  if (!err) return { status: 500, message: '服务出错了，请稍后再试' };

  const message = err.message || '服务出错了，请稍后再试';
  const status = err.status || 500;

  if (err.code === 'NO_CONFIG') return { status: 503, message };
  if (err.code === '42P01' || /relation .* does not exist/i.test(message)) {
    return {
      status: 500,
      message: '数据表 tasks 还不存在。去 Supabase 的 SQL Editor 里执行 supabase/schema.sql，然后刷新页面。'
    };
  }
  if (err.code === '42501' || /row-level security policy/i.test(message)) {
    return {
      status: 500,
      message: '被 RLS 行级安全策略拦截了。回到手册 4.3 节，把四条 create policy 的 SQL 重新跑一遍。'
    };
  }
  if (err.code === 'PGRST301' || /invalid api key|invalid jwt|jwt malformed/i.test(message)) {
    return { status: 500, message: 'Supabase 密钥无效。检查 .env 里的 SUPABASE_ANON_KEY 是否复制完整（新格式以 sb_publishable_ 开头）。' };
  }
  if (err.code === '401' || /unauthorized|no apikey/i.test(message)) {
    return { status: 500, message: 'Supabase 拒绚了请求：没带上有效的 key，或这个 key 已失效（被 rotate 过）。' };
  }
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|getaddrinfo|network/i.test(message)) {
    return { status: 503, message: '连不上 Supabase。检查 SUPABASE_URL 是否写对（https://xxxx.supabase.co，结尾别加斜杠），以及网络是否正常。' };
  }
  return { status, message };
}

/* ------------------------------ 数据整形 ------------------------------ */

function toTask(row) {
  return {
    id: row.id,
    title: row.title,
    priority: PRIORITIES.includes(row.priority) ? row.priority : DEFAULT_PRIORITY,
    completed: Boolean(row.completed),
    createdAt: row.created_at || row.createdAt || new Date().toISOString()
  };
}

function sortByCreatedDesc(list) {
  return list.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/* ------------------------------ Supabase ------------------------------ */

let client = null;

function supabase() {
  if (client) return client;

  const url = String(process.env.SUPABASE_URL || '').trim();
  const key = String(process.env.SUPABASE_ANON_KEY || '').trim();

  if (!url || !key) throw configError();
  if (!/^https?:\/\//i.test(url)) {
    throw configError('SUPABASE_URL 格式不对，应该长这样：https://abcdefgh.supabase.co');
  }

  let createClient;
  try {
    ({ createClient } = require('@supabase/supabase-js'));
  } catch (e) {
    throw configError('缺少依赖：请先在项目目录里执行 npm install');
  }

  try {
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  } catch (e) {
    throw configError('Supabase 客户端初始化失败：请检查 SUPABASE_URL 是否填写正确');
  }

  return client;
}

const supabaseStore = {
  async list(priority) {
    let query = supabase().from(TABLE).select(COLUMNS).order('created_at', { ascending: false });
    if (PRIORITIES.includes(priority)) query = query.eq('priority', priority);

    const { data, error } = await query;
    if (error) throw dbError('读取任务', error);
    return (data || []).map(toTask);
  },

  async create({ title, priority }) {
    const { data, error } = await supabase()
      .from(TABLE)
      .insert({ title, priority })
      .select(COLUMNS)
      .single();
    if (error) throw dbError('新建任务', error);
    return toTask(data);
  },

  async setCompleted(id, completed) {
    const { data, error } = await supabase()
      .from(TABLE)
      .update({ completed })
      .eq('id', id)
      .select(COLUMNS)
      .maybeSingle();
    if (error) throw dbError('更新任务', error);
    if (!data) {
      const err = new Error('这条任务不存在，可能已经被删除了');
      err.status = 404;
      throw err;
    }
    return toTask(data);
  },

  async remove(id) {
    const { error } = await supabase().from(TABLE).delete().eq('id', id);
    if (error) throw dbError('删除任务', error);
  }
};

/* --------------------------- 本地 JSON 演示模式 --------------------------- */

let writeQueue = Promise.resolve();

function withLock(fn) {
  const run = writeQueue.then(fn, fn);
  writeQueue = run.catch(() => {});
  return run;
}

async function readLocal() {
  try {
    const raw = await fs.promises.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(toTask) : [];
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    if (e instanceof SyntaxError) return []; // 文件被手动改坏了，当作空列表重新开始
    throw e;
  }
}

async function writeLocal(list) {
  await fs.promises.mkdir(path.dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.${process.pid}.tmp`;
  await fs.promises.writeFile(tmp, JSON.stringify(list, null, 2), 'utf8');
  await fs.promises.rename(tmp, DATA_FILE);
}

const localStore = {
  async list(priority) {
    const all = sortByCreatedDesc(await readLocal());
    return PRIORITIES.includes(priority) ? all.filter((t) => t.priority === priority) : all;
  },

  async create({ title, priority }) {
    return withLock(async () => {
      const all = await readLocal();
      const maxId = all.reduce((max, t) => Math.max(max, Number(t.id) || 0), 0);
      const task = {
        id: maxId + 1,
        title,
        priority,
        completed: false,
        createdAt: new Date().toISOString()
      };
      await writeLocal([task, ...all]);
      return task;
    });
  },

  async setCompleted(id, completed) {
    return withLock(async () => {
      const all = await readLocal();
      const index = all.findIndex((t) => String(t.id) === String(id));
      if (index === -1) {
        const err = new Error('这条任务不存在，可能已经被删除了');
        err.status = 404;
        throw err;
      }
      all[index].completed = completed;
      await writeLocal(all);
      return all[index];
    });
  },

  async remove(id) {
    return withLock(async () => {
      const all = await readLocal();
      await writeLocal(all.filter((t) => String(t.id) !== String(id)));
    });
  }
};

const store = USE_LOCAL ? localStore : supabaseStore;

store.describe = () =>
  USE_LOCAL
    ? { mode: 'demo', label: '本地演示存储（data/tasks.json）' }
    : { mode: 'supabase', label: 'Supabase 云数据库' };

store.PRIORITIES = PRIORITIES;
store.DEFAULT_PRIORITY = DEFAULT_PRIORITY;
store.friendlyError = friendlyError;

module.exports = store;
