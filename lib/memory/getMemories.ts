// lib/memory/getMemories.ts
import { createServerSupabaseClient } from '@/lib/supabase/authServer'
import { SupabaseClient } from '@supabase/supabase-js'

export type MemoryDomain = 'cohost' | 'mom' | 'orakl' | 'global'
export type MemoryType = 'fact' | 'preference' | 'event' | 'constraint'
export type MemorySource = 'user' | 'system' | 'derived'

export interface Memory {
    id: string
    workspace_id: string
    domain: MemoryDomain
    scope_type: string
    scope_id: string | null
    memory_type: MemoryType
    content: string
    source: MemorySource
    confidence: number
    created_at: string
}

export interface GetMemoriesOptions {
    workspaceId: string
    domain: MemoryDomain
    scopeType?: string
    scopeId?: string
    limit?: number
}

/**
 * Retrieve memories for a specific domain + global memories.
 * STRICTLY enforces domain isolation by always filtering by (domain OR 'global').
 */
export async function getMemories({
    workspaceId,
    domain,
    scopeType,
    scopeId,
    limit = 20
}: GetMemoriesOptions): Promise<Memory[]> {
    try {
        const supabase = await createServerSupabaseClient()

        let query = supabase
            .from('memories')
            .select('*')
            .eq('workspace_id', workspaceId)
            // Critical security logic: Allow requested domain OR global
            .or(`domain.eq.${domain},domain.eq.global`)
            .order('created_at', { ascending: false })
            .limit(limit)

        // Optional filters
        if (scopeType) {
            query = query.eq('scope_type', scopeType)
        }

        if (scopeId) {
            query = query.eq('scope_id', scopeId)
        }

        const { data, error } = await query

        if (error) {
            console.error('Error fetching memories:', error)
            return []
        }

        return data as Memory[]
    } catch (error) {
        console.error('Failed to get memories:', error)
        return []
    }
}

export interface StoreMemoryInput {
    workspaceId: string
    domain: MemoryDomain
    scopeType: string
    scopeId?: string
    memoryType: MemoryType
    content: string
    source?: MemorySource
    confidence?: number
}

/**
 * Store a new memory.
 */
export async function storeMemory(input: StoreMemoryInput): Promise<Memory | null> {
    try {
        const supabase = await createServerSupabaseClient()

        const { data, error } = await supabase
            .from('memories')
            .insert({
                workspace_id: input.workspaceId,
                domain: input.domain,
                scope_type: input.scopeType,
                scope_id: input.scopeId || null,
                memory_type: input.memoryType,
                content: input.content,
                source: input.source || 'user',
                confidence: input.confidence ?? 0.8
            })
            .select()
            .single()

        if (error) {
            console.error('Error storing memory:', error)
            return null
        }

        return data as Memory
    } catch (error) {
        console.error('Failed to store memory:', error)
        return null
    }
}
