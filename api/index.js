'use strict';

/**
 * Vercel Serverless 入口
 * Vercel 会把这个文件当成一个函数：所有请求（含页面和 /api 接口）都交给 Express 处理。
 */

module.exports = require('../lib/app');
