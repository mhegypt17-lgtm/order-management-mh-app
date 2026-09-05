// Cache-tag helper for the complaint attachments lazy-load endpoint
// (/api/complaints/[id]/attachments). Mirrors src/lib/photosCache.ts —
// any write to a complaint's `attachments` column must call
// `revalidateTag(complaintAttachmentsTag(id))` right after so the next
// "عرض المرفقات" view reads fresh data instead of a stale cached one.
export function complaintAttachmentsTag(complaintId: string): string {
  return `complaint-attachments-${complaintId}`
}
