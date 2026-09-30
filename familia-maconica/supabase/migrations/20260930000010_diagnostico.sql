-- =====================================================================
-- Diagnóstico da instalação: a página Admin → Diagnóstico confere, sem
-- mostrar dado pessoal, se as atualizações do banco foram aplicadas, se os
-- agendamentos (pg_cron) estão rodando e se a fila de avisos anda.
-- Só números, nomes de agendamento e status. O comando dos agendamentos
-- (que contém o CRON_SECRET) e o corpo das respostas HTTP nunca saem.
-- =====================================================================
create or replace function public.diagnostico_instalacao()
returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_cron jsonb;
  v_http jsonb;
begin
  if not app.eh_admin() then
    raise exception 'Apenas administradores.' using errcode = '42501';
  end if;

  -- pg_cron e pg_net só existem no Supabase (e não nos testes locais).
  if to_regclass('cron.job') is not null then
    execute $q$
      select coalesce(jsonb_agg(jsonb_build_object(
               'nome', j.jobname, 'agenda', j.schedule, 'ativo', j.active,
               'ultima_status', d.status, 'ultima_em', d.start_time)
             order by j.jobname), '[]')
        from cron.job j
        left join lateral (select status, start_time from cron.job_run_details r
                            where r.jobid = j.jobid order by start_time desc limit 1) d on true
       where j.jobname in ('despachar-notificacoes', 'limpar-dados-antigos')
    $q$ into v_cron;
  end if;

  if to_regclass('net._http_response') is not null then
    execute $q$
      select jsonb_build_object('status', status_code, 'em', created, 'erro', error_msg is not null or timed_out)
        from net._http_response order by created desc limit 1
    $q$ into v_http;
  end if;

  return jsonb_build_object(
    'funcoes', jsonb_build_object(
      'exportar_dados',       to_regprocedure('public.exportar_dados(uuid)') is not null,
      'limpar_dados_antigos', to_regprocedure('public.limpar_dados_antigos(integer,integer,integer)') is not null,
      'configurar_lembretes', to_regprocedure('public.configurar_lembretes(uuid,integer[])') is not null,
      'metricas_piloto',      to_regprocedure('public.metricas_piloto()') is not null),
    'cargos_escudeiros', (select count(*) from cargo
                           where tipo_organizacao = 'castelo_escudeiros' and organizacao_id is null),
    'cron', v_cron,
    'ultima_resposta_http', v_http,
    'fila', jsonb_build_object(
      'pendentes', (select count(*) from notificacao where enviada_em is null and descartada_em is null),
      'atrasadas', (select count(*) from notificacao
                     where enviada_em is null and descartada_em is null
                       and agendada_para < now() - interval '15 minutes'),
      'ultima_enviada_em', (select max(enviada_em) from notificacao),
      'erros_24h', (select count(*) from notificacao
                     where erro is not null and coalesce(descartada_em, criado_em) > now() - interval '1 day')),
    'estrutura', jsonb_build_object(
      'administradores', (select count(*) from administrador),
      'administradores_com_login', (select count(*) from administrador a join pessoa p on p.id = a.pessoa_id
                                     where p.auth_user_id is not null),
      'nucleos', (select count(*) from nucleo),
      'locais', (select count(*) from local),
      'organizacoes', (select count(*) from organizacao),
      'organizacoes_com_secretaria', (select count(distinct organizacao_id) from vinculo
                                       where secretaria and ativo),
      'pessoas_com_login', (select count(*) from pessoa where auth_user_id is not null))
  );
end $$;

revoke all on function public.diagnostico_instalacao() from public, anon, authenticated;
grant execute on function public.diagnostico_instalacao() to authenticated;
