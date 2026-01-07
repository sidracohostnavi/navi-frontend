// app/daily-ops/actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// Mark a task as completed
export async function markTaskDone(taskId: string) {
  const supabase = createClient()

  const { error } = await supabase
    .from('tasks')
    .update({ status: 'completed' }) // <— your chosen word
    .eq('id', taskId)

  if (error) {
    console.error('Error marking task as completed:', error)
    throw new Error('Failed to mark task as completed')
  }

  // Refresh the Daily Ops page cache
  revalidatePath('/daily-ops')
  return { success: true }
}

// Mark a task as dismissed
export async function dismissTask(taskId: string) {
  const supabase = createClient()

  const { error } = await supabase
    .from('tasks')
    .update({ status: 'dismissed' })
    .eq('id', taskId)

  if (error) {
    console.error('Error dismissing task:', error)
    throw new Error('Failed to dismiss task')
  }

  revalidatePath('/daily-ops')
  return { success: true }
}
