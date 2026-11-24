import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadBundledSkills, selectBundledSkills } from "./skill-library.ts";

const SKILL_DIR = join(process.cwd(), "skills", "kinetic-type-video");

describe("kinetic-type-video skill", () => {
  const skills = loadBundledSkills(join(process.cwd(), "skills"));
  const guide = skills.find((skill) => skill.manifest.id === "kinetic-type-video")?.instructions ?? "";
  const ids = (text: string) => selectBundledSkills(text, [], skills).map((skill) => skill.manifest.id);

  it("mounts when asked for a motion or kinetic type video, and stays out of unrelated requests", () => {
    for (const text of ["Make a kinetic typography video about our launch", "make a tiktok explaining brand identity",
      "سويلي فيديو موشن عن الهوية البصرية", "I want a faceless video with voiceover", "build a reels video like this"]) {
      expect(ids(text), text).toContain("kinetic-type-video");
    }
    for (const text of ["fix the video player bug", "what is kinetic energy", "type check the server", "schedule a meeting"]) {
      expect(ids(text), text).not.toContain("kinetic-type-video");
    }
  });

  it("ships every file the guide tells the agent to run", () => {
    for (const file of ["voice.mjs", "align.mjs", "render.mjs", "stage.js", "example.json", "package.json"]) {
      expect(guide, file).toContain(file);
      expect(existsSync(join(SKILL_DIR, file)), file).toBe(true);
    }
  });

  it("keeps the example spec to item types the engine draws", () => {
    const engine = readFileSync(join(SKILL_DIR, "stage.js"), "utf8");
    const example = JSON.parse(readFileSync(join(SKILL_DIR, "example.json"), "utf8")) as { scenes: Array<{ items: Array<{ type?: string; id?: string }> }> };
    for (const item of example.scenes.flatMap((scene) => scene.items)) {
      const type = item.type ?? "text";
      expect(engine, type).toMatch(new RegExp(`\\b${type}: build`, "i"));
      if (item.id) expect(item.id).toMatch(/^\w+$/);
    }
  });
});
