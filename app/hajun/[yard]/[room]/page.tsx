'use client';
import { useParams } from 'next/navigation';
import ContextRoom from '@/components/hajun/ContextRoom';
import ProductRoom from '@/components/hajun/ProductRoom';

const PRODUCT_YARDS = new Set(['product_validation', 'product_listing']);

export default function RoomPage() {
  const params = useParams();
  const yardKey = params.yard as string;
  const roomKey = params.room as string;

  if (PRODUCT_YARDS.has(yardKey)) {
    return <ProductRoom yardKey={yardKey} roomKey={roomKey} />;
  }
  return <ContextRoom yardKey={yardKey} roomKey={roomKey} />;
}
