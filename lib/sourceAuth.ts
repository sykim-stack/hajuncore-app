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
    const { data, error } = await supabase
      .schema('corehub')
      .from('auth_owner_links')
      .select('owner_key')
      .eq('auth_user_id', authUserId)
      .is('revoked_at', null);

    if (error) {
      return { ok: false, error: 'principal_mapping_unavailable', status: 503 };
    }

    const hasActiveOwnerLink = (data || []).some(
      (row: { owner_key?: unknown }) =>
        typeof row.owner_key === 'string' && row.owner_key.trim().length > 0,
    );
    if (!hasActiveOwnerLink) {
      return { ok: false, error: 'owner_not_linked', status: 403 };
    }
  } catch {
    return { ok: false, error: 'principal_mapping_unavailable', status: 503 };
  }

  return { ok: true, authUserId };
}
