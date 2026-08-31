import { HttpError } from "wasp/server";
import type { VideoExportJob } from "wasp/entities";
import type { CreateVideoExportJob, GetVideoExportJobs } from "wasp/server/operations";
import { processVideoExportJob } from "wasp/server/jobs";
import * as z from "zod";
import { ensureArgsSchemaOrThrowHttpError } from "../server/validation";

const createVideoExportJobInputSchema = z.object({
  prompt: z.string().nonempty(),
  htmlContent: z.string().nonempty(),
});

type CreateVideoExportJobInput = z.infer<typeof createVideoExportJobInputSchema>;

export const createVideoExportJob: CreateVideoExportJob<CreateVideoExportJobInput, VideoExportJob> = async (
  rawArgs,
  context,
) => {
  if (!context.user) {
    throw new HttpError(401, "Not authorized");
  }

  const { prompt, htmlContent } = ensureArgsSchemaOrThrowHttpError(
    createVideoExportJobInputSchema,
    rawArgs,
  );

  // 1. Create the job record in DB
  const jobRecord = await context.entities.VideoExportJob.create({
    data: {
      user: { connect: { id: context.user.id } },
      prompt,
      htmlContent,
      status: "pending",
    },
  });

  // 2. Submit to PgBoss queue
  await processVideoExportJob.submit({ jobId: jobRecord.id });

  return jobRecord;
};

export const getVideoExportJobs: GetVideoExportJobs<void, VideoExportJob[]> = async (
  _args,
  context,
) => {
  if (!context.user) {
    throw new HttpError(401, "Not authorized");
  }

  return context.entities.VideoExportJob.findMany({
    where: {
      user: {
        id: context.user.id,
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
};