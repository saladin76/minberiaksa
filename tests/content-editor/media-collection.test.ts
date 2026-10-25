import test from "node:test";
import assert from "node:assert/strict";
import { saveWorkspaceRelations } from "../../lib/content-editor/workspace-relations";
import type { Store, Delegate } from "../../lib/content-editor/service";
import type { ContentRecord } from "../../lib/content-editor/contracts";
const parentId = "111111111111111111111111", childId = "222222222222222222222222";
function mock() {
  const calls: Array<{ action: string; args: ContentRecord }> = [];
  const delegate = {
    update: async (args: ContentRecord) => { calls.push({ action: "update", args }); return { id: childId }; },
    create: async (args: ContentRecord) => { calls.push({ action: "create", args }); return { id: "333333333333333333333333" }; },
    deleteMany: async (args: ContentRecord) => { calls.push({ action: "deleteMany", args }); return {}; },
  } as unknown as Delegate;
  return { calls, db: { model: () => delegate } as unknown as Store };
}
test("media collections reject foreign and duplicate child ids before updating those children", async () => {
  for (const videos of [[{ id: childId, url: "https://youtu.be/dQw4w9WgXcQ" }], [{ id: "foreign", url: "https://youtu.be/dQw4w9WgXcQ" }]]) {
    const { db, calls } = mock();
    await assert.rejects(() => saveWorkspaceRelations(db, "playlists", parentId, { videos: [] }, { videos }), /لا تنتمي/);
    assert.equal(calls.length, 0);
  }
});
test("YouTube, Vimeo and MP4 episodes retain order and normalize their provider", async () => {
  const { db, calls } = mock();
  await saveWorkspaceRelations(db, "courses", parentId, { videos: [] }, { videos: [
    { url: "https://youtu.be/dQw4w9WgXcQ", title: "YouTube" },
    { url: "https://vimeo.com/123456789", title: "Vimeo" },
    { url: "https://example.org/video.mp4", title: "MP4" },
  ] });
  assert.deepEqual(calls.map((call) => (call.args.data as ContentRecord).order), [0, 1, 2]);
  assert.equal((calls[0].args.data as ContentRecord).youtubeId, "dQw4w9WgXcQ");
  assert.equal((calls[1].args.data as ContentRecord).youtubeId, "");
  assert.equal("isActive" in (calls[0].args.data as ContentRecord), false);
});
test("removing an episode is scoped to the current parent and never deletes another collection", async () => {
  const { db, calls } = mock();
  await saveWorkspaceRelations(db, "playlists", parentId, { videos: [{ id: childId }] }, { videos: [] });
  assert.deepEqual(calls[0], { action: "deleteMany", args: { where: { id: { in: [childId] }, playlistId: parentId } } });
});
