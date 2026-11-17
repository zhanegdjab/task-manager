'use strict';

/**
 * 本地启动入口：npm start
 * 真正的路由写在 lib/app.js 里，这样本地运行和 Vercel 部署共用一套代码。
 */

const PORT = Number(process.env.PORT || 3020);

let app;
try {
  app = require('./lib/app');
} catch (e) {
  if (e && e.code === 'MODULE_NOT_FOUND' && /express|dotenv|supabase/.test(e.message)) {
    console.error('');
    console.error('  启动失败：依赖还没安装');
    console.error('  请在项目文件夹里依次执行：');
    console.error('    npm install');
    console.error('    npm start');
    console.error('  或者直接双击「启动.bat」');
    console.error('');
    process.exit(1);
  }
  throw e;
}

app.listen(PORT, () => {
  console.log('');
  console.log('  智能任务管理系统已启动');
  console.log(`  地址：http://localhost:${PORT}`);
  console.log(`  存储：${require('./lib/store').describe().label}`);
  console.log('');
});
