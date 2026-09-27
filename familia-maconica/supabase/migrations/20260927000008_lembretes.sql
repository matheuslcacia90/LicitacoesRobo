-- =====================================================================
-- Lembretes configuráveis por organização (dossiê, seção 8-D: "24 horas
-- antes e 2 horas antes (configurável por organização)").
-- Até 3 lembretes, entre 1 e 168 horas antes; vazio = sem lembretes.
-- Os eventos futuros da organização são reagendados com a nova regra.
-- =====================================================================
create or replace function public.configurar_lembretes(p_org uuid, p_horas int[])
returns int[] language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_horas int[];
  v_evento uuid;
begin
  perform app.exigir_secretaria(p_org);
  select coalesce(array_agg(distinct h order by h desc), '{}') into v_horas
    from unnest(coalesce(p_horas, '{}')) h where h is not null;
  if cardinality(v_horas) > 3 then
    raise exception 'No máximo 3 lembretes por evento.';
  end if;
  if exists (select 1 from unnest(v_horas) h where h < 1 or h > 168) then
    raise exception 'Cada lembrete deve ser de 1 a 168 horas (7 dias) antes.';
  end if;

  update organizacao set lembretes_horas = v_horas where id = p_org;

  for v_evento in
    select id from evento where organizacao_id = p_org and cancelado_em is null and inicio > now()
  loop
    perform app.descartar_pendentes(v_evento, 'lembretes reconfigurados', true);
    perform app.agendar_lembretes(v_evento);
  end loop;
  return v_horas;
end $$;

revoke all on function public.configurar_lembretes(uuid, int[]) from public, anon, authenticated;
grant execute on function public.configurar_lembretes(uuid, int[]) to authenticated;
