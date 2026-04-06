'use client';

import { useEffect, use } from 'react';
import { useRouter } from 'next/navigation';

export default function PropertyRootRedirect({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();

    useEffect(() => {
        router.replace(`/cohost/properties/${id}/settings`);
    }, [id, router]);

    return null;
}
