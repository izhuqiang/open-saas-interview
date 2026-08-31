import { prisma } from "wasp/server";
import type { ProcessVideoExportJob } from "wasp/server/jobs";
import puppeteer from "puppeteer";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import fs from "fs";
import path from "path";
import os from "os";

// 绑定 ffmpeg 的可执行路径
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export const processVideoExportJob: ProcessVideoExportJob<{ jobId: string }, void> = async (args, context) => {
  const { jobId } = args;

  // 1. 标记任务状态为处理中
  await prisma.videoExportJob.update({
    where: { id: jobId },
    data: { status: "processing" },
  });

  let browser;
  let tempDir = "";

  try {
    const jobRecord = await prisma.videoExportJob.findUnique({
      where: { id: jobId },
    });

    if (!jobRecord) throw new Error("Job not found");

    const htmlContent = jobRecord.htmlContent;
    
    // 准备临时工作目录
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `video-export-${jobId}-`));
    const htmlFilePath = path.join(tempDir, "index.html");
    const framesDir = path.join(tempDir, "frames");
    const outputVideoPath = path.join(tempDir, "output.mp4");
    
    fs.writeFileSync(htmlFilePath, htmlContent);
    fs.mkdirSync(framesDir);

    console.log(`[Job ${jobId}] Launching Puppeteer...`);
    
    // 2. 启动无头浏览器
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    
    // 设置视口大小 (1080p)
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
    
    // 3. 加载 HTML 内容
    await page.goto(`file://${htmlFilePath}`, { waitUntil: "networkidle0" });
    
    // 假设我们要录制 3 秒钟的视频，帧率 30fps = 总共 90 帧
    const fps = 30;
    const durationSeconds = 3;
    const totalFrames = fps * durationSeconds;
    
    console.log(`[Job ${jobId}] Capturing ${totalFrames} frames...`);
    
    // 捕获帧 (通过按顺序截图)
    for (let i = 1; i <= totalFrames; i++) {
      const framePath = path.join(framesDir, `frame-${String(i).padStart(4, "0")}.png`);
      await page.screenshot({ path: framePath });
      // 模拟等待下一帧的时间 (简单实现)
      await new Promise(resolve => setTimeout(resolve, 1000 / fps));
    }

    console.log(`[Job ${jobId}] Encoding video with FFmpeg...`);
    
    // 4. 使用 FFmpeg 将帧序列压制为 MP4
    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(path.join(framesDir, "frame-%04d.png"))
        .inputFPS(fps)
        .outputOptions([
          "-c:v libx264",        // 视频编码器 H.264
          "-pix_fmt yuv420p",    // 像素格式 (兼容性最好)
          "-crf 23",             // 画质参数
        ])
        .save(outputVideoPath)
        .on("end", () => {
          resolve();
        })
        .on("error", (err) => {
          console.error("FFmpeg Error:", err);
          reject(err);
        });
    });

    console.log(`[Job ${jobId}] Video generated at ${outputVideoPath}`);

    // 检查视频文件是否真实存在并且大小大于0
    if (!fs.existsSync(outputVideoPath) || fs.statSync(outputVideoPath).size === 0) {
       throw new Error("FFmpeg output video is missing or empty.");
    }

    // 5. 将生成的 MP4 移动到 public 目录下以便前端可以直接下载
    // 注意：Wasp 的构建机制要求静态文件放在根目录的 public 文件夹，但运行时会被复制到 .wasp/out/public
    // 为了确保前端能够访问到，我们需要将文件放到最终运行时提供静态服务的地方
    // Wasp server 默认在项目根目录运行，所以 public/ 应该能被拦截到
    const publicVideoDir = path.join(process.cwd(), "public", "exports");
    if (!fs.existsSync(publicVideoDir)) {
      fs.mkdirSync(publicVideoDir, { recursive: true });
    }
    
    const finalVideoFileName = `export_${jobId}.mp4`;
    const finalVideoPath = path.join(publicVideoDir, finalVideoFileName);
    
    // 复制文件到 public 目录
    fs.copyFileSync(outputVideoPath, finalVideoPath);

    // 6. 返回相对路径的 URL
    const realVideoUrl = `/exports/${finalVideoFileName}`;

    // 7. 标记任务完成
    await prisma.videoExportJob.update({
      where: { id: jobId },
      data: { 
        status: "completed",
        videoUrl: realVideoUrl
      },
    });

    console.log(`[Job ${jobId}] Successfully completed.`);

  } catch (error: any) {
    console.error(`[Job ${jobId}] Failed:`, error);
    // 7. 异常时标记为失败
    await prisma.videoExportJob.update({
      where: { id: jobId },
      data: { 
        status: "failed",
        error: error.message || "Unknown error"
      },
    });
  } finally {
    // 8. 清理资源
    if (browser) {
      await browser.close();
    }
    // 可以选择性删除临时文件 fs.rmSync(tempDir, { recursive: true, force: true });
  }
};