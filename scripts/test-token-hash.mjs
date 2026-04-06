import crypto from 'crypto';

const token = crypto.randomBytes(32).toString('hex');
const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
const tokenLast4 = token.slice(-4);

console.log('Original Token:', token);
console.log('Last 4:', tokenLast4);
console.log('Original Hash (stored in DB):', tokenHash);

// Simulate Accept Route logic
const acceptToken = token;
const acceptTokenHash = crypto.createHash('sha256').update(acceptToken).digest('hex');

console.log('Accept Hash (computed at accept):', acceptTokenHash);
console.log('Match?', tokenHash === acceptTokenHash);
