'use client'

import { useEffect, useState } from 'react'
import { formatCairoDateTime } from '@/lib/cairoTime'

// Read-only complaints view for branch staff — visibility only, per the
// explicit scope: branch sees ALL complaints (no owner filter) but cannot
// edit/comment/close. Reuses the same /api/complaints endpoint the CS
// ComplaintsSection uses (already windowed to 90 days, narrow columns) —
// zero new egress beyond this page's own load. Attachments are lazy-loaded
// on demand via /api/complaints/[id]/attachments, same as the CS side.

interface Attachment {
  id: string
  url: string
  caption?: string
  uploadedBy: string
  uploadedAt: string
}

interface Complaint {
  id: string
  ticketNumber: string
  channel: string
  subject: string
  description: string
  reason: string
  subReason?: string | null
  status: 'open' | 'in-progress' | 'closed'
  priority: 'low' | 'medium' | 'high'
  customerName: string | null
  customerPhone: string | null
  assignedTo: string
  complaintOwner?: string | null
  closureAction?: string | null
  createdBy: string
  compensationAmount: number
  comments: Array<{ id: string; authorName: string; text: string; createdAt: string }>
  openedAt: string
  closedAt: string | null
}

const STATUS_LABELS: Record<string, string> = { open: 'مفتوحة', 'in-progress': 'قيد المعالجة', closed: 'مغلقة' }
const STATUS_COLORS: Record<string, string> = {
  open: 'bg-red-100 border-red-300 text-red-900',
  'in-progress': 'bg-amber-100 border-amber-300 text-amber-900',
  closed: 'bg-green-100 border-green-300 text-green-900',
}
const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-blue-50 border-blue-200',
  medium: 'bg-amber-50 border-amber-200',
  high: 'bg-red-50 border-red-200',
}

export default function BranchComplaintsView() {
  const [complaints, setComplaints] = useState<Complaint[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'in-progress' | 'closed'>('all')
  const [selected, setSelected] = useState<Complaint | null>(null)
  const [attachmentsByComplaint, setAttachmentsByComplaint] = useState<Record<string, Attachment[]>>({})
  const [loadingAttachments, setLoadingAttachments] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/complaints')
        const data = await res.json()
        setComplaints(Array.isArray(data) ? data : [])
      } catch {
        setComplaints([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const ensureAttachmentsLoaded = async (complaintId: string) => {
    if (attachmentsByComplaint[complaintId]) return
    setLoadingAttachments(true)
    try {
      const res = await fetch(`/api/complaints/${complaintId}/attachments`)
      const data = await res.json()
      setAttachmentsByComplaint((prev) => ({ ...prev, [complaintId]: Array.isArray(data.attachments) ? data.attachments : [] }))
    } catch {
      setAttachmentsByComplaint((prev) => ({ ...prev, [complaintId]: [] }))
    } finally {
      setLoadingAttachments(false)
    }
  }

  const filtered = complaints.filter((c) => statusFilter === 'all' || c.status === statusFilter)

  return (
    <div className="space-y-4" dir="rtl">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">🎫 الشكاوى</h1>
        <p className="text-gray-600 mt-1">عرض فقط — للتعديل أو الرد يرجى التواصل مع خدمة العملاء</p>
      </div>

      <div className="flex gap-2">
        {(['all', 'open', 'in-progress', 'closed'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${
              statusFilter === s ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {s === 'all' ? 'الكل' : STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="p-8 text-center text-gray-500 bg-white rounded-lg border border-gray-200">⏳ جاري التحميل...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-12 text-center">
          <p className="text-lg font-medium text-gray-600">📭 لا توجد شكاوى</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => (
            <div
              key={c.id}
              onClick={() => setSelected(c)}
              className={`border-2 rounded-lg p-4 cursor-pointer transition hover:shadow-lg ${PRIORITY_COLORS[c.priority]}`}
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="font-bold text-gray-900">#{c.ticketNumber} — {c.subject}</span>
                <span className={`text-xs px-2 py-1 rounded-full border font-semibold ${STATUS_COLORS[c.status]}`}>
                  {STATUS_LABELS[c.status]}
                </span>
              </div>
              <p className="text-sm text-gray-600 mt-1">
                {c.channel} · {c.reason}{c.subReason ? ` › ${c.subReason}` : ''}
                {c.complaintOwner ? ` · المسؤول: ${c.complaintOwner}` : ''}
              </p>
              <p className="text-xs text-gray-400 mt-1">{formatCairoDateTime(c.openedAt, 'ar-EG')}</p>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">#{selected.ticketNumber} — {selected.subject}</h3>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>

            <div className="space-y-2 bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm">
              {(selected.customerName || selected.customerPhone) && (
                <p>
                  <strong className="text-gray-700">العميل:</strong>{' '}
                  <span className="text-gray-600">
                    {selected.customerName || 'غير محدد'}
                    {selected.customerPhone ? ` • 📱 ${selected.customerPhone}` : ''}
                  </span>
                </p>
              )}
              <p><strong className="text-gray-700">القناة:</strong> <span className="text-gray-600">{selected.channel}</span></p>
              <p>
                <strong className="text-gray-700">السبب:</strong>{' '}
                <span className="text-gray-600">{selected.reason}{selected.subReason ? ` › ${selected.subReason}` : ''}</span>
              </p>
              <p><strong className="text-gray-700">التفاصيل:</strong> <span className="text-gray-600 whitespace-pre-wrap">{selected.description || '—'}</span></p>
              {selected.complaintOwner && (
                <p><strong className="text-gray-700">المسؤول عن الشكوى:</strong> <span className="text-gray-600">{selected.complaintOwner}</span></p>
              )}
              {selected.closureAction && (
                <p><strong className="text-gray-700">إجراء الإغلاق:</strong> <span className="text-gray-600">{selected.closureAction}</span></p>
              )}
              <p><strong className="text-gray-700">تاريخ الفتح:</strong> <span className="text-gray-600">{formatCairoDateTime(selected.openedAt, 'ar-EG')}</span></p>
              {selected.closedAt && (
                <p><strong className="text-gray-700">تاريخ الإغلاق:</strong> <span className="text-gray-600">{formatCairoDateTime(selected.closedAt, 'ar-EG')}</span></p>
              )}
            </div>

            <div>
              <h4 className="font-semibold text-gray-900 mb-2 text-sm">📎 المرفقات</h4>
              {!attachmentsByComplaint[selected.id] ? (
                <button
                  type="button"
                  onClick={() => ensureAttachmentsLoaded(selected.id)}
                  disabled={loadingAttachments}
                  className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-xs font-semibold"
                >
                  {loadingAttachments ? '... جاري التحميل' : 'عرض المرفقات'}
                </button>
              ) : attachmentsByComplaint[selected.id].length === 0 ? (
                <p className="text-xs text-gray-500">لا توجد مرفقات</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {attachmentsByComplaint[selected.id].map((att) => (
                    <a key={att.id} href={att.url} target="_blank" rel="noreferrer">
                      <img src={att.url} alt={att.caption || 'مرفق'} className="w-full h-24 object-cover rounded border border-gray-300" />
                    </a>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h4 className="font-semibold text-gray-900 mb-2 text-sm">💬 التعليقات</h4>
              <div className="max-h-40 overflow-y-auto space-y-2">
                {selected.comments.length === 0 ? (
                  <p className="text-xs text-gray-500 text-center py-2">لا توجد تعليقات</p>
                ) : (
                  selected.comments.map((cm) => (
                    <div key={cm.id} className="bg-gray-50 border border-gray-200 rounded p-2">
                      <p className="text-xs font-medium text-gray-900">{cm.authorName}</p>
                      <p className="text-[10px] text-gray-500">{formatCairoDateTime(cm.createdAt, 'ar-EG')}</p>
                      <p className="text-xs text-gray-700 whitespace-pre-wrap">{cm.text}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
