import { useQuery, useAction } from "wasp/client/operations";
import { createVideoExportJob, getVideoExportJobs } from "wasp/client/operations";
import { useState } from "react";
import { Button } from "../client/components/ui/button";

export function VideoExportPage() {
  const { data: jobs, isLoading, error } = useQuery(getVideoExportJobs);
  const createJob = useAction(createVideoExportJob);

  const [prompt, setPrompt] = useState("");
  const [htmlContent, setHtmlContent] = useState("");

  const handleCreateJob = async () => {
    if (!prompt.trim() || !htmlContent.trim()) {
      alert("Please fill in both Prompt and HTML Content");
      return;
    }
    
    try {
      await createJob({ prompt, htmlContent });
      setPrompt("");
      setHtmlContent("");
    } catch (err) {
      console.error("Failed to create job:", err);
    }
  };

  return (
    <div className="container mx-auto py-10 space-y-8">
      <h1 className="text-3xl font-bold">Video Export (HTML to MP4)</h1>
      
      <div className="space-y-4 p-6 border rounded-lg bg-card">
        <h2 className="text-xl font-semibold">Create New Export</h2>
        <div>
          <label className="block text-sm font-medium mb-1">Prompt</label>
          <input 
            className="w-full border p-2 rounded" 
            value={prompt} 
            onChange={(e) => setPrompt(e.target.value)} 
            placeholder="e.g. A bouncing ball" 
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">HTML Content</label>
          <textarea 
            className="w-full border p-2 rounded h-32" 
            value={htmlContent} 
            onChange={(e) => setHtmlContent(e.target.value)} 
            placeholder="<html>...</html>" 
          />
        </div>
        <Button onClick={handleCreateJob}>Export to Video</Button>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Your Export Jobs</h2>
        {isLoading && <p>Loading jobs...</p>}
        {error && <p className="text-red-500">Error loading jobs: {error.message}</p>}
        
        <div className="grid gap-4">
          {jobs?.map((job) => (
            <div key={job.id} className="p-4 border rounded-lg flex justify-between items-center bg-card">
              <div>
                <p className="font-medium">Prompt: {job.prompt}</p>
                <p className="text-sm text-muted-foreground">Status: {job.status}</p>
                {job.error && <p className="text-sm text-red-500">Error: {job.error}</p>}
              </div>
              <div>
                {job.status === "completed" && job.videoUrl && (
                  <a href={job.videoUrl} target="_blank" rel="noreferrer" download={`animation_${job.id}.mp4`} className="text-blue-500 hover:underline">
                    Download Video
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}