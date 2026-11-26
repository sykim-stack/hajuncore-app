// lib/sourceAuth.ts
// Reuse the existing Supabase Auth + CoreHub owner-link identity.
// This helper does not create, merge, or mutate identities.
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY } from '@/lib/hajunApiCore';

export type SourcePrincipalResult =
  | { ok: true; authUserId: string }
  | { ok: false; error: string; status: 401 | 403 | 503 };

export async function resolveSourcePrincipal(accessToken: string): Promise<SourcePrincipalResult> {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { ok: false, error: 'auth_configuration_missing', status: 503 };
  }

  let supabase: ReturnType<typeof createClient>;
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
  } catch {
    return { ok: false, error: 'auth_client_initialization_failed', status: 503 };
  }

  let authUserId = '';
  try {
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (error || !data.user?.id) {
      return { ok: false, error: 'invalid_or_expired_session', status: 401 };
    }
    authUserId = data.user.id;
  } catch {
    return { ok: false, error: 'auth_verification_unavailable', status: 503 };
  }

  try {
    // Use PostgREST's profile header for the non-public CoreHub schema.
    // The generated Supabase client has no Database schema typing here,
    // so .schema('corehub') is rejected by TypeScript as never.
    const query = new URLSearchParams({
      select: 'owner_key',
      auth_user_id: `eq.${authUserId}`,
      revoked_at: 'is.null',
    });
    const response = await fetch(`${SUPABASE_URL}/rest/v1/auth_owner_links?${query.toString()}`, {
      method: 'GET',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Accept: 'application/json',
        'Accept-Profile': 'corehub',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      return { ok: false, error: 'principal_mapping_unavailable', status: 503 };
    }

    const rows: unknown = await response.json();
    if (!Array.isArray(rows)) {
      return { ok: false, error: 'principal_mapping_unavailable', status: 503 };
    }

    const hasActiveOwnerLink = rows.some(
      (row: { owner_key?: unknown }) =>
        typeof row?.owner_key === 'string' && row.owner_key.trim().length > 0,
    );
    if (!hasActiveOwnerLink) {
      return { ok: false, error: 'owner_not_linked', status: 403 };
    }
  } catch {
    return { ok: false, error: 'principal_mapping_unavailable', status: 503 };
  }

  return { ok: true, authUserId };
}
