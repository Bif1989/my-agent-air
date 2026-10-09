create index if not exists request_targets_capability_idx on public.request_targets (capability_id) where capability_id is not null;
