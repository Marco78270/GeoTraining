create or replace function public.can_read_collection_clue(
  target_collection_id uuid,
  target_status public.clue_status
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    public.can_administer_collection(target_collection_id)
    or (
      public.is_collection_public(target_collection_id)
      and target_status = 'published'
    )
    or public.is_collection_member(target_collection_id),
    false
  );
$$;

revoke all on function public.can_read_collection_clue(uuid, public.clue_status) from public, anon;
grant execute on function public.can_read_collection_clue(uuid, public.clue_status) to authenticated;
