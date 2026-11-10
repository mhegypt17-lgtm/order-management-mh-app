// Where a complaint notification should send the user.
// Branch staff have their own read-only complaints page, which opens the
// ticket named in `?complaintId=`. Everyone else uses the CS complaints page.
export function complaintNotificationHref(role: string, complaintId: string): string {
  return role === 'branch'
    ? `/branch/complaints?complaintId=${encodeURIComponent(complaintId)}`
    : '/orders/complaints'
}
