import type { OrgRole } from "@prisma/client";

export interface AuthenticatedRequest {
  user: {
    id: string;
    email: string;
    organizationId: string;
    role: OrgRole;
  };
}
