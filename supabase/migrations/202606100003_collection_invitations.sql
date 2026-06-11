create function public.accept_collection_invitation(raw_token text)
returns table (collection_id uuid, collection_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.collection_invitations%rowtype;
  authenticated_email text;
  target_collection_name text;
begin
  if auth.uid() is null then
    raise exception using
      errcode = 'P0001',
      message = 'invitation_auth_required';
  end if;

  if raw_token is null or char_length(raw_token) < 32 then
    raise exception using
      errcode = 'P0001',
      message = 'invitation_invalid';
  end if;

  authenticated_email := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
  if authenticated_email = '' then
    raise exception using
      errcode = 'P0001',
      message = 'invitation_email_required';
  end if;

  select candidate.*
  into invitation
  from public.collection_invitations as candidate
  where candidate.token_hash = encode(
    extensions.digest(convert_to(raw_token, 'UTF8'), 'sha256'),
    'hex'
  )
  for update;

  if invitation.id is null then
    raise exception using
      errcode = 'P0001',
      message = 'invitation_invalid';
  end if;

  if invitation.status <> 'pending' then
    raise exception using
      errcode = 'P0001',
      message = 'invitation_not_pending';
  end if;

  if invitation.expires_at <= now() then
    raise exception using
      errcode = 'P0001',
      message = 'invitation_expired';
  end if;

  if lower(invitation.email::text) <> authenticated_email then
    raise exception using
      errcode = 'P0001',
      message = 'invitation_email_mismatch';
  end if;

  insert into public.collection_members (collection_id, user_id, role)
  values (invitation.collection_id, auth.uid(), 'editor')
  on conflict (collection_id, user_id) do nothing;

  update public.collection_invitations
  set status = 'accepted', accepted_by = auth.uid()
  where id = invitation.id;

  select collection.name
  into target_collection_name
  from public.collections as collection
  where collection.id = invitation.collection_id;

  return query
  select invitation.collection_id, target_collection_name;
end;
$$;

revoke all on function public.accept_collection_invitation(text) from public;
grant execute on function public.accept_collection_invitation(text) to authenticated;
