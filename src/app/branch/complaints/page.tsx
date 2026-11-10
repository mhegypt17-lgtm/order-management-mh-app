import { Suspense } from 'react'
import BranchComplaintsView from '@/components/branch/BranchComplaintsView'

export default function BranchComplaintsPage() {
  // useSearchParams (used to open a ticket from a notification link) needs a
  // Suspense boundary in the App Router.
  return (
    <Suspense fallback={null}>
      <BranchComplaintsView />
    </Suspense>
  )
}
