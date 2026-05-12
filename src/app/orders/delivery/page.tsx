'use client'

import DeliveryZonesTable from '@/components/delivery/DeliveryZonesTable'

export default function CSDeliveryPage() {
  return <DeliveryZonesTable editable={false} hideDeliveryCost={true} />
}
