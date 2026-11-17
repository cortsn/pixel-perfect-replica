/**
 * Åbner telefonens egen del-menu (iOS/Android), så linket kan sendes via sms, WhatsApp, mail osv.
 * Uden understøttelse (fx computer) kopieres linket i stedet.
 */
export async function shareLink(data: { title: string; text: string; url: string }): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try { await navigator.share(data); return 'shared'; }
    catch (e) { if ((e as Error).name === 'AbortError') return 'cancelled'; }
  }
  try { await navigator.clipboard.writeText(`${data.text} ${data.url}`.trim()); return 'copied'; }
  catch { return 'failed'; }
}
