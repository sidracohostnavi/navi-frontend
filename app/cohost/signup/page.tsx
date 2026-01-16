// app/cohost/signup/page.tsx
import { redirect } from 'next/navigation'

export default function CohostSignupPage() {
  redirect('/auth/signup?next=/cohost')
}