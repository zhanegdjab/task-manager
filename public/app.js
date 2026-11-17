'use strict';

/* 智能任务管理 · 前端逻辑
   所有交互都走本项目自己的 /api 接口，浏览器不直接连 Supabase */

const els = {
  form: document.getElementById('add-form'),
  title: document.getElementById('title'),
  priority: document.getElementById('priority'),
  addBtn: document.getElementById('add-btn'),
  formHint: document.getElementById('form-hint'),
  filters: document.getElementById('filters'),
  progress: document.getElementById('progress'),
  progressFill: document.getElementById('progress-fill'),
  list: document.getElementById('task-list'),
  empty: document.getElementById('empty'),
  emptyTitle: document.getElementById('empty-title'),
  emptyText: document.getElementById('empty-text'),
  alert: document.getElementById('alert'),
  toast: document.getElementById('toast'),
  storageChip: document.getElementById('storage-chip')
};

const PRIORITY = {
  高: { label: '高优先级', pill: 'pill-high' },
  中: { label: '中优先级', pill: 'pill-medium' },
  低: { label: '低优先级', pill: 'pill-low' }
};

const state = {
  tasks: [],
  filter: 'all',
  loading: true,
  adding: false,
  focusAfterRender: null
};

/* ------------------------------ 工具函数 ------------------------------ */

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    ...options
  });

  if (res.status === 204) return null;

  let data = {};
  try {
    data = await res.json();
  } catch (e) {
    data = {};
  }

  if (!res.ok) {
    throw new Error(data.error || `请求失败（HTTP ${res.status}）`);
  }
  return data;
}

function sortByCreatedDesc(list) {
  return list.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

const pad2 = (n) => String(n).padStart(2, '0');

function formatTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff >= 0 && diff < 60 * 1000) return '刚刚';
  if (diff >= 0 && diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} 分钟前`;

  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return `今天 ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;

  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (date.toDateString() === yesterday.toDateString()) {
    return `昨天 ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  }

  const md = `${date.getMonth() + 1}月${date.getDate()}日`;
  if (date.getFullYear() === now.getFullYear()) return md;
  return `${date.getFullYear()}年${md}`;
}

function formatFullTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(
    date.getHours()
  )}:${pad2(date.getMinutes())}`;
}

let toastTimer = null;

function toast(message, type = 'info') {
  els.toast.textContent = message;
  els.toast.hidden = false;
  els.toast.classList.toggle('is-error', type === 'error');

  requestAnimationFrame(() => els.toast.classList.add('is-show'));

  clearTimeout(toastTimer);
  toastTimer = setTimeout(
    () => {
      els.toast.classList.remove('is-show');
      setTimeout(() => {
        els.toast.hidden = true;
      }, 240);
    },
    type === 'error' ? 3200 : 1800
  );
}

/* ------------------------------ 渲染 ------------------------------ */

function buildTaskItem(task) {
  const li = document.createElement('li');
  li.className = 'task' + (task.completed ? ' is-done' : '');
  li.dataset.id = String(task.id);

  const circle = document.createElement('button');
  circle.type = 'button';
  circle.className = 'task-toggle';
  circle.dataset.action = 'toggle';
  circle.setAttribute('aria-label', task.completed ? '标记为未完成' : '标记为已完成');
  circle.setAttribute('aria-pressed', String(task.completed));
  circle.textContent = '✓';

  const body = document.createElement('div');
  body.className = 'task-body';

  const title = document.createElement('div');
  title.className = 'task-title';
  title.textContent = task.title;

  const meta = document.createElement('div');
  meta.className = 'task-meta';

  const info = PRIORITY[task.priority] || PRIORITY['中'];
  const pill = document.createElement('span');
  pill.className = `pill ${info.pill}`;
  pill.textContent = info.label;

  const time = document.createElement('span');
  time.className = 'task-time';
  time.textContent = formatTime(task.createdAt);
  time.title = formatFullTime(task.createdAt);

  meta.append(pill, time);
  body.append(title, meta);

  const actions = document.createElement('div');
  actions.className = 'task-actions';

  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'ghost toggle-label';
  toggleBtn.dataset.action = 'toggle';
  toggleBtn.textContent = task.completed ? '标记未完成' : '标记完成';

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'ghost danger';
  delBtn.dataset.action = 'delete';
  delBtn.textContent = '删除';
  delBtn.setAttribute('aria-label', `删除任务：${task.title}`);

  actions.append(toggleBtn, delBtn);
  li.append(circle, body, actions);

  return li;
}

function buildSkeletons(count) {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i += 1) {
    const li = document.createElement('li');
    li.className = 'skeleton';
    frag.appendChild(li);
  }
  return frag;
}

function render() {
  const total = state.tasks.length;
  const doneCount = state.tasks.filter((t) => t.completed).length;
  const counts = {
    all: total,
    高: state.tasks.filter((t) => t.priority === '高').length,
    中: state.tasks.filter((t) => t.priority === '中').length,
    低: state.tasks.filter((t) => t.priority === '低').length
  };

  els.progress.textContent = state.loading ? '加载中…' : `共 ${total} 项 · 已完成 ${doneCount} 项`;
  els.progressFill.style.width = total === 0 ? '0%' : `${Math.round((doneCount / total) * 100)}%`;

  els.filters.querySelectorAll('.filter').forEach((btn) => {
    const active = btn.dataset.filter === state.filter;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', String(active));
  });

  els.filters.querySelectorAll('[data-count]').forEach((span) => {
    span.textContent = String(counts[span.dataset.count] || 0);
  });

  els.list.replaceChildren();

  if (state.loading) {
    els.empty.hidden = true;
    els.list.appendChild(buildSkeletons(3));
    return;
  }

  const visible = state.filter === 'all' ? state.tasks : state.tasks.filter((t) => t.priority === state.filter);

  els.empty.hidden = visible.length > 0;
  if (visible.length === 0) {
    if (total === 0) {
      els.emptyTitle.textContent = '还没有任务';
      els.emptyText.textContent = '在上面输入框里写下第一件要做的事吧';
    } else {
      const label = PRIORITY[state.filter] ? PRIORITY[state.filter].label : '当前筛选';
      els.emptyTitle.textContent = `「${label}」下没有任务`;
      els.emptyText.textContent = '点上面的「全部」看看其他任务';
    }
  }

  const frag = document.createDocumentFragment();
  visible.forEach((task) => frag.appendChild(buildTaskItem(task)));
  els.list.appendChild(frag);

  if (state.focusAfterRender) {
    const { id, action } = state.focusAfterRender;
    state.focusAfterRender = null;
    const target = els.list.querySelector(`.task[data-id="${id}"] [data-action="${action}"]`);
    if (target) target.focus();
  }
}

/* ------------------------------ 数据操作 ------------------------------ */

function setBusy(id, busy) {
  const li = els.list.querySelector(`.task[data-id="${id}"]`);
  if (!li) return;
  li.classList.toggle('is-busy', busy);
}

async function loadTasks() {
  state.loading = true;
  render();

  try {
    const data = await api('/api/tasks');
    state.tasks = sortByCreatedDesc(data.tasks || []);
    els.alert.hidden = true;
  } catch (err) {
    state.tasks = [];
    els.alert.textContent = err.message;
    els.alert.hidden = false;
  } finally {
    state.loading = false;
    render();
  }
}

async function loadStorageInfo() {
  try {
    const data = await api('/api/health');
    const storage = data.storage || {};
    els.storageChip.hidden = false;
    if (storage.mode === 'demo') {
      els.storageChip.textContent = '演示模式 · 本地存储';
      els.storageChip.classList.add('is-demo');
    } else {
      els.storageChip.textContent = '已连接 Supabase';
    }
  } catch (err) {
    els.storageChip.hidden = true;
  }
}

async function toggleTask(id) {
  const task = state.tasks.find((t) => String(t.id) === String(id));
  if (!task) return;

  setBusy(id, true);
  try {
    const data = await api(`/api/tasks/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ completed: !task.completed })
    });
    const updated = data.task;
    state.tasks = state.tasks.map((t) => (String(t.id) === String(id) ? updated : t));
    state.focusAfterRender = { id, action: 'toggle' };
    render();
    toast(updated.completed ? '已标记为完成' : '已标记为未完成');
  } catch (err) {
    setBusy(id, false);
    toast(err.message, 'error');
  }
}

async function deleteTask(id) {
  const task = state.tasks.find((t) => String(t.id) === String(id));
  if (!task) return;

  if (!window.confirm(`确定删除「${task.title}」吗？`)) return;

  setBusy(id, true);
  try {
    await api(`/api/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' });
    state.tasks = state.tasks.filter((t) => String(t.id) !== String(id));
    render();
    toast('已删除任务');
  } catch (err) {
    setBusy(id, false);
    toast(err.message, 'error');
  }
}

/* ------------------------------ 事件绑定 ------------------------------ */

els.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (state.adding) return;

  const title = els.title.value.trim();
  const priority = els.priority.value;

  els.formHint.textContent = '';

  if (!title) {
    els.formHint.textContent = '请先输入任务标题';
    els.title.focus();
    return;
  }

  state.adding = true;
  els.addBtn.disabled = true;
  els.addBtn.textContent = '添加中…';

  try {
    const data = await api('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ title, priority })
    });

    state.tasks = sortByCreatedDesc([data.task, ...state.tasks]);
    state.filter = 'all'; // 新建后回到「全部」，保证刚添加的任务一定看得见
    els.title.value = '';
    els.title.focus();
    render();
    toast('已添加任务');
  } catch (err) {
    els.formHint.textContent = err.message;
  } finally {
    state.adding = false;
    els.addBtn.disabled = false;
    els.addBtn.textContent = '添加任务';
  }
});

els.filters.addEventListener('click', (event) => {
  const btn = event.target.closest('.filter');
  if (!btn) return;
  const next = btn.dataset.filter;
  if (next === state.filter) return;
  state.filter = next;
  render();
});

els.list.addEventListener('click', (event) => {
  const btn = event.target.closest('[data-action]');
  if (!btn) return;

  const li = btn.closest('.task');
  if (!li) return;

  const id = li.dataset.id;
  const action = btn.dataset.action;

  if (action === 'toggle') toggleTask(id);
  else if (action === 'delete') deleteTask(id);
});

/* ------------------------------ 启动 ------------------------------ */

loadStorageInfo();
loadTasks();
