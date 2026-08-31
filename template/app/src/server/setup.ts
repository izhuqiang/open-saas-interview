import express from 'express';
import path from 'path';
import fs from 'fs';
import type { ServerSetupFn } from 'wasp/server';

export const setupFn: ServerSetupFn = async ({ app }) => {
  // Wasp 的后端是一个 Express 实例 (app)
  // 我们需要手动告诉 Express 暴露哪个文件夹作为静态资源目录
  
  const publicVideoDir = path.join(process.cwd(), 'public', 'exports');
  
  // 确保目录存在
  if (!fs.existsSync(publicVideoDir)) {
    fs.mkdirSync(publicVideoDir, { recursive: true });
  }

  // 挂载静态中间件，将 /exports 路由映射到物理文件夹
  app.use('/exports', express.static(publicVideoDir));
  
  console.log(`[Setup] Static file serving enabled for: ${publicVideoDir}`);
};
