// app/cohost/login/page.tsx
import { redirect } from 'next/navigation'

export default function CohostLoginPage() {
  redirect('/auth/login?next=/cohost')
}