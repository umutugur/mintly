import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    requestStartedAt?: number;
    user?: {
      id: string;
      email: string;
    };
  }
}
