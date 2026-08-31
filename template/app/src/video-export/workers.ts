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

    // 5. 模拟上传到 S3 / 云存储 (这里我们直接返回一个模拟的或者本地的假链接，在真实的 SaaS 中需要使用 aws-sdk 上传)
    // 注意：因为是本地测试，我们先给个占位链接。如果要有真实文件，可以将其拷贝到 public 目录下。
    const mockVideoUrl = "https://www.w3schools.com/html/mov_bbb.mp4";

    // 6. 标记任务完成
    await prisma.videoExportJob.update({
      where: { id: jobId },
      data: { 
        status: "completed",
        videoUrl: mockVideoUrl
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