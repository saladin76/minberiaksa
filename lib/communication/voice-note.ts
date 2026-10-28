import "server-only";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Browser WebM is converted to the OGG/Opus format required for a native voice message. */
export async function prepareVoiceNote(file: Blob): Promise<Blob> {
  if (!file.size || file.size > 16 * 1024 * 1024) throw new Error("VOICE_INVALID_SIZE");
  const directory = await mkdtemp(join(tmpdir(), "minber-voice-"));
  const input = join(directory, "recording"), output = join(directory, "voice.ogg");
  try {
    await writeFile(input, Buffer.from(await file.arrayBuffer()), { mode: 0o600 });
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.env.FFMPEG_PATH || "ffmpeg", ["-nostdin", "-hide_banner", "-loglevel", "error", "-protocol_whitelist", "file,pipe", "-threads", "1", "-i", input, "-map", "0:a:0", "-vn", "-t", "300", "-ar", "48000", "-ac", "1", "-c:a", "libopus", "-b:a", "32k", "-f", "ogg", output], { stdio: "ignore" });
      const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("VOICE_CONVERSION_TIMEOUT")); }, 20000);
      child.once("error", () => { clearTimeout(timer); reject(new Error("VOICE_CONVERSION_UNAVAILABLE")); });
      child.once("exit", code => { clearTimeout(timer); if (code === 0) resolve(); else reject(new Error("VOICE_CONVERSION_FAILED")); });
    });
    const data = await readFile(output); if (!data.length || data.length > 16 * 1024 * 1024 || data.subarray(0,4).toString() !== "OggS") throw new Error("VOICE_CONVERSION_FAILED");
    return new Blob([data], { type: "audio/ogg" });
  } finally { await rm(directory, { recursive: true, force: true }); }
}
