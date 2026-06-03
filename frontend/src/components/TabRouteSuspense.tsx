import { Suspense, type ReactNode } from 'react'

/** Keeps Layout + tab bar visible while a lazy tab chunk loads (no full-screen boot splash). */
export default function TabRouteSuspense({ children }: { children: ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>
}
