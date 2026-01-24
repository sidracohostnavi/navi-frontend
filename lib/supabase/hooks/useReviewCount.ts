// lib/supabase/hooks/useReviewCount.ts
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Hook to fetch the count of pending review items for the user's workspace.
 * Used to display a badge indicator in the header.
 */
export function useReviewCount() {
    const [count, setCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const supabase = createClient();

    const fetchCount = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            // BYPASS: Direct fetch to match Page logic
            // Rely on RLS or implicit access, just like the ReviewPage
            const { count: reviewCount, error: countError } = await supabase
                .from('enrichment_review_items')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'pending');

            if (countError) throw countError;

            setCount(reviewCount || 0);
        } catch (err) {
            console.error('[useReviewCount] Error:', err);
            setError(err instanceof Error ? err.message : 'Failed to fetch review count');
            setCount(0);
        } finally {
            setLoading(false);
        }
    }, [supabase]);

    useEffect(() => {
        fetchCount();

        // Set up real-time subscription for changes
        const channel = supabase
            .channel('review_items_changes')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'enrichment_review_items'
                },
                () => {
                    // Refetch count on any change
                    fetchCount();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [fetchCount, supabase]);

    return { count, loading, error, refresh: fetchCount };
}
