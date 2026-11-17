# 智能任务管理系统（练习二）

Node.js（Express 后端）+ Supabase（PostgreSQL 云数据库）实现的任务清单，代码已按《练习二：智能任务管理系统-开发部署操作手册》的数据库字段和部署流程配好，可以直接上传 GitHub 并用 Vercel 上线。

## 一、功能

- 输入框写标题 + 下拉选优先级（高 / 中 / 低），回车或点「添加任务」入库
- 列表按创建时间倒序，最新在最上面
- 每条显示标题、优先级标签、创建时间
- 每条两个操作：完成 / 未完成切换、删除
- 已完成任务加删除线、颜色变淡
- 顶部按优先级筛选：全部 / 高 / 中 / 低（带数量）
- 关掉浏览器再打开数据还在（存在 Supabase 里）

## 二、目录结构

```
task-manager/
├─ server.js              # 本地启动入口（npm start）
├─ api/index.js           # Vercel 部署入口（同一套代码）
├─ lib/app.js             # Express 路由（页面 + REST 接口）
├─ lib/store.js           # 数据访问层（Supabase / 本地演示）
├─ public/                # 前端：index.html / style.css / app.js
├─ supabase/schema.sql    # 建表 + RLS 策略，一次性粘进 SQL Editor
├─ vercel.json            # Vercel 构建配置（已写好，不用改）
├─ .env.example           # 环境变量模板
├─ .npmrc                 # 国内 npm 镜像
├─ 启动.bat               # 双击启动（自动装依赖）
└─ README.md
```

## 三、本地运行

1. 复制 `.env.example` 为 `.env`，填入 Supabase 的 `SUPABASE_URL` 和 `SUPABASE_ANON_KEY`
2. 双击 `启动.bat`（或命令行 `npm install` → `npm start`）
3. 浏览器打开 `http://localhost:3020`

> 想先看界面不连数据库：在 `.env` 里写 `DATA_MODE=demo`，数据存到 `data/tasks.json`。

## 四、Supabase 建库

把 `supabase/schema.sql` 全部内容粘到 SQL Editor 执行一次，会完成三件事：

1. 建 `public.tasks` 表（字段与手册 4.2 节一致）
2. 打开 RLS 并建四条读写策略（手册 4.3 节，不做这步写不进数据）
3. 建两个索引

表结构：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | bigint 自增主键 | 任务编号 |
| `title` | text | 标题 |
| `priority` | text | 只能是 `高` / `中` / `低`，默认 `中` |
| `completed` | boolean | 是否完成，默认 `false` |
| `created_at` | timestamptz | 创建时间，默认 `now()` |

## 五、部署到 Vercel

1. 代码推到 GitHub（Public 仓库，别传 `.env`）
2. Vercel → Add New → Project → Import 这个仓库
3. 环境变量加两条：

| Name | Value |
| --- | --- |
| `SUPABASE_URL` | `https://你的项目ID.supabase.co` |
| `SUPABASE_ANON_KEY` | `sb_publishable_你的key` |

4. 点 Deploy，等 1~3 分钟，得到 `https://xxx.vercel.app`

`vercel.json` 已经把「所有请求交给 Express」的规则写好了，不用在 Vercel 里改构建命令或输出目录。

## 六、接口

| 方法 | 路径 | 作用 | 参数 |
| --- | --- | --- | --- |
| GET | `/api/health` | 健康检查 | — |
| GET | `/api/tasks` | 列表（时间倒序） | `?priority=all\|高\|中\|低` |
| POST | `/api/tasks` | 新建 | `{ "title": "写周报", "priority": "高" }` |
| PATCH | `/api/tasks/:id` | 切换完成 | `{ "completed": true }` |
| DELETE | `/api/tasks/:id` | 删除 | — |

出错统一返回 `{ "error": "中文提示" }`。

## 七、常见问题

| 现象 | 解决 |
| --- | --- |
| 红条：数据库还没配置 | `.env` 没建/没填，或文件名变成了 `.env.txt` |
| 红条：数据表 tasks 还不存在 | 没执行 `schema.sql` |
| 红条：被 RLS 策略拦截 | 回手册 4.3 节，四条 policy 的 SQL 重跑一遍 |
| 红条：Supabase 密钥无效 | key 复制不全，或用了 `sb_secret_` 开头的那把（要用 `sb_publishable_`） |
| 红条：连不上 Supabase | `SUPABASE_URL` 结尾多了 `/`，或网络问题 |
| 端口被占用 | `.env` 里加 `PORT=3021` |
| `npm install` 很慢 | 项目自带 `.npmrc` 走国内镜像；也可删掉它重试 |
| Vercel 部署失败 | 看 Deployments → Build Logs；多是环境变量漏配或名字拼错，改完 Redeploy |

> 当前 RLS 策略是「任何人可读写」，只适合教学演示。要正式使用，应改成登录用户只能操作自己的数据（加 `owner_id` + `auth.uid()` 策略）。
