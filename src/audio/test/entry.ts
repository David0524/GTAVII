/** ?audio=1 -> interactive test scene; ?audio=offline -> headless render harness. */
export async function startAudioTest(params: URLSearchParams) {
  if (params.get('audio') === 'offline') { (await import('./offline')).startOffline(); return; }
  (await import('./scene')).startScene(params);
}
