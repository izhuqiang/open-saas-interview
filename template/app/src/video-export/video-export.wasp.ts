import { action, query, job, route, page, type Spec } from "@wasp.sh/spec";

import { VideoExportPage } from "./VideoExportPage" with { type: "ref" };
import { createVideoExportJob, getVideoExportJobs } from "./operations" with { type: "ref" };
import { processVideoExportJob } from "./workers" with { type: "ref" };

export const videoExportSpec: Spec = [
  route("VideoExportRoute", "/video-export", page(VideoExportPage, { authRequired: true })),
  
  query(getVideoExportJobs, { entities: ["VideoExportJob"] }),
  action(createVideoExportJob, { entities: ["VideoExportJob"] }),
  
  job(processVideoExportJob, {
    executor: "PgBoss",
    entities: ["VideoExportJob"]
  }),
];