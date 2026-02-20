export class ApiError extends Error {
    code;
    statusCode;
    details;
    constructor(params) {
        super(params.message);
        this.name = 'ApiError';
        this.code = params.code;
        this.statusCode = params.statusCode;
        this.details = params.details;
    }
}
export function toErrorPayload(params) {
    return {
        error: {
            code: params.code,
            message: params.message,
            ...(params.details !== undefined ? { details: params.details } : {}),
        },
    };
}
