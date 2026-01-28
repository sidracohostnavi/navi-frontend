
export type ApiErrorResponse = {
    error: string;
    code: string;
    action?: string;
    connection_id?: string;
    workspace_id?: string;
    meta?: Record<string, any>;
};

export class AppError extends Error {
    public readonly code: string;
    public readonly statusCode: number;
    public readonly action?: string;
    public readonly meta?: Record<string, any>;

    constructor(message: string, code: string, statusCode = 500, action?: string, meta?: Record<string, any>) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
        this.action = action;
        this.meta = meta;
        Object.setPrototypeOf(this, AppError.prototype);
    }
}

/**
 * Maps known error patterns (or AppErrors) to a standardized API response.
 * Sanitizes unknown errors to generic 500s for safety.
 */
export function handleError(err: any, context?: Record<string, any>): { response: ApiErrorResponse, status: number } {
    // 1. AppError (Trusted)
    if (err instanceof AppError) {
        return {
            status: err.statusCode,
            response: {
                error: err.message,
                code: err.code,
                action: err.action,
                ...context,
                meta: err.meta
            }
        };
    }

    // 2. Google API Errors (Ad-hoc mapping)
    if (err.message && (err.message.includes('invalid_grant') || err.message.includes('Token has been expired_or_revoked'))) {
        return {
            status: 401,
            response: {
                error: 'Gmail access revoked or expired. Please reconnect.',
                code: 'TOKEN_REVOKED',
                action: 'Reconnect Gmail in Settings',
                ...context
            }
        };
    }

    // 3. Unknown / Unexpected Error
    console.error('[ApiError] Unexpected Error:', err);
    return {
        status: 500,
        response: {
            error: 'An unexpected internal error occurred.',
            code: 'INTERNAL_SERVER_ERROR',
            ...context
        }
    };
}
