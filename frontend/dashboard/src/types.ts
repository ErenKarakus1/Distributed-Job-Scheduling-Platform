export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: string;
};

export type AuthResponse = {
  user: AuthUser;
  token: string;
};

export type AuditEvent = {
  id: string;
  actorType: string;
  actorLabel?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  requestId?: string | null;
  metadata?: unknown;
  createdAt: string;
};

export type PageState = {
  limit: number;
  offset: number;
  total: number;
};
