/** Bound database concurrency while awaiting every started operation, including failures. */
export async function forEachTemplateSyncItem<T>(items: readonly T[], limit: number, work: (item:T)=>Promise<void>): Promise<void> {
  let cursor=0;
  let failed=false;
  let failure:unknown;
  const workers=Array.from({length:Math.min(items.length,Math.max(1,limit))},async()=>{
    while (!failed && cursor<items.length) {
      const item=items[cursor++];
      try { await work(item); } catch (error) { failed=true; failure=error; }
    }
  });
  await Promise.all(workers);
  if(failed) throw failure;
}
