import crypto from 'crypto';
import { NextResponse } from 'next/server';

export async function GET() {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const rehash = crypto.createHash('sha256').update(token).digest('hex');

    const manualToken = '0b617a268800bd353a27f6734c71ef62ecbb80a71be7addac2cedb3f9479dce6';
    const manualHash = crypto.createHash('sha256').update(manualToken).digest('hex');

    return NextResponse.json({ token, tokenHash, rehash, manualToken, manualHash });
}
