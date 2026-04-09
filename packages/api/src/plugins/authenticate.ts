import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';

declare module 'fastify' {
  interface FastifyRequest {
    parentId: string;
  }
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'missing_token' });
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as jwt.JwtPayload;
    if (typeof payload.sub !== 'string' || !payload.sub) {
      return reply.status(401).send({ error: 'invalid_token' });
    }
    request.parentId = payload.sub;
  } catch {
    return reply.status(401).send({ error: 'invalid_token' });
  }
}
