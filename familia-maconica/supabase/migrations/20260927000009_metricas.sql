-- =====================================================================
-- Métricas do piloto (dossiê, seção 10). Números agregados por organização,
-- sem dado pessoal: o administrador vê todas; cada Secretaria, só a sua.
--   Reuniões lançadas pela própria organização (meta: toda organização ativa)
--   Cargos preenchidos na gestão vigente (meta: 100% em até 15 dias)
--   Menores com conta aprovada pelo responsável (meta: >= 70%)
--   Adultos que usaram o app nos últimos 7 dias (meta: >= 50%)
-- Para o uso semanal, guarda só o dia em que a pessoa abriu o app; a limpeza
-- diária apaga os registros com mais de 90 dias.
-- =====================================================================
create table public.acesso_diario (
  pessoa_id uuid not null references public.pessoa on delete cascade,
  dia       date not null,
  primary key (pessoa_id, dia)
);
alter table public.acesso_diario enable row level security;
alter table public.acesso_diario force row level security;
revoke all on public.acesso_diario from anon, authenticated;

create or replace function public.registrar_acesso()
returns void language sql security definer
set search_path = public, pg_temp as $$
  insert into acesso_diario (pessoa_id, dia)
  select app.pessoa_atual(), (now() at time zone 'America/Sao_Paulo')::date
   where app.pessoa_atual() is not null
  on conflict do nothing
$$;

create or replace function public.metricas_piloto()
returns table (
  organizacao_id uuid, organizacao text, nucleo text, tipo tipo_organizacao,
  reunioes_30d int, eventos_proximos_30d int,
  gestao text, gestao_inicio date, cargos_total int, cargos_preenchidos int,
  menores_ativos int, menores_aprovados int,
  adultos_ativos int, adultos_semana int
) language sql stable security definer
set search_path = public, pg_temp as $$
  with ativos as (
    select v.organizacao_id, v.pessoa_id, app.faixa_de(v.pessoa_id) as faixa
      from vinculo v where v.ativo
  )
  select o.id, o.nome, n.nome, o.tipo,
    (select count(*)::int from evento e
      where e.organizacao_id = o.id and e.tipo = 'reuniao' and e.criado_em >= now() - interval '30 days'),
    (select count(*)::int from evento e
      where e.cancelado_em is null and e.inicio between now() and now() + interval '30 days'
        and (e.organizacao_id = o.id
             or exists (select 1 from evento_organizacao eo
                         where eo.evento_id = e.id and eo.organizacao_id = o.id and eo.status = 'aceita'))),
    m.nome, m.inicio,
    (select count(*)::int from cargo c
      where (c.tipo_organizacao = o.tipo and c.organizacao_id is null) or c.organizacao_id = o.id),
    (select count(distinct oc.cargo_id)::int from ocupacao_cargo oc
      where oc.mandato_id = m.id and oc.fim is null),
    (select count(*)::int from ativos a where a.organizacao_id = o.id and a.faixa <> 'adulto'),
    (select count(*)::int from ativos a join pessoa p on p.id = a.pessoa_id
      where a.organizacao_id = o.id and a.faixa <> 'adulto' and p.conta_aprovada_em is not null),
    (select count(*)::int from ativos a where a.organizacao_id = o.id and a.faixa = 'adulto'),
    (select count(*)::int from ativos a
      where a.organizacao_id = o.id and a.faixa = 'adulto'
        and exists (select 1 from acesso_diario d
                     where d.pessoa_id = a.pessoa_id
                       and d.dia > (now() at time zone 'America/Sao_Paulo')::date - 7))
  from organizacao o
  join nucleo n on n.id = o.nucleo_id
  left join mandato m on m.organizacao_id = o.id and current_date between m.inicio and m.fim
  where app.eh_admin() or app.eh_secretaria(o.id)
  order by n.nome, o.nome
$$;

revoke all on function public.registrar_acesso(), public.metricas_piloto() from public, anon, authenticated;
grant execute on function public.registrar_acesso(), public.metricas_piloto() to authenticated;

-- A limpeza diária passa a apagar também os acessos com mais de 90 dias.
create or replace function public.limpar_dados_antigos(
  p_dias_notificacao int default 90,
  p_meses_inativo    int default null,
  p_meses_auditoria  int default null
) returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_notif  int;
  v_login  int;
  v_acessos int;
  v_anon   int := 0;
  v_audit  int := 0;
  v_pessoa uuid;
  v_auth   uuid;
begin
  delete from notificacao
   where coalesce(enviada_em, descartada_em) < now() - make_interval(days => p_dias_notificacao);
  get diagnostics v_notif = row_count;

  delete from tentativa_login
   where atualizado_em < now() - interval '1 day'
     and (bloqueado_ate is null or bloqueado_ate < now());
  get diagnostics v_login = row_count;

  delete from acesso_diario where dia < current_date - 90;
  get diagnostics v_acessos = row_count;

  if p_meses_inativo is not null then
    for v_pessoa in
      select p.id from pessoa p
       where p.anonimizada_em is null
         and not exists (select 1 from administrador a where a.pessoa_id = p.id)
         -- sem vínculo ativo e o último vínculo terminou antes do prazo
         and exists (select 1 from vinculo v where v.pessoa_id = p.id)
         and not exists (select 1 from vinculo v where v.pessoa_id = p.id and v.ativo)
         and (select max(v.fim) from vinculo v where v.pessoa_id = p.id)
             < current_date - make_interval(months => p_meses_inativo)
         -- nunca apaga o responsável de um dependente ainda cadastrado
         and not exists (select 1 from responsavel r join pessoa m on m.id = r.menor_id
                          where r.responsavel_id = p.id and m.anonimizada_em is null)
         and not exists (select 1 from ocupacao_cargo oc join mandato m on m.id = oc.mandato_id
                          where oc.pessoa_id = p.id and oc.fim is null and m.fim >= current_date)
    loop
      v_auth := app.anonimizar(v_pessoa);
      if v_auth is not null then
        delete from auth.users where id = v_auth;
      end if;
      v_anon := v_anon + 1;
    end loop;
  end if;

  if p_meses_auditoria is not null then
    delete from log_auditoria where em < now() - make_interval(months => p_meses_auditoria);
    get diagnostics v_audit = row_count;
  end if;

  return jsonb_build_object('notificacoes', v_notif, 'tentativas_login', v_login, 'acessos', v_acessos,
                            'contas_anonimizadas', v_anon, 'registros_auditoria', v_audit);
end $$;

revoke all on function public.limpar_dados_antigos(int, int, int) from public, anon, authenticated;
grant execute on function public.limpar_dados_antigos(int, int, int) to service_role;

-- A exportação de dados (migração 0006) passa a incluir os dias de acesso.
create or replace function public.exportar_dados(p_pessoa uuid default null)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_login uuid := app.pessoa_do_login();
  v_alvo  uuid := coalesce(p_pessoa, v_login);
  p       pessoa;
begin
  if v_login is null or not (v_alvo = v_login or app.eh_responsavel_de(v_alvo)) then
    raise exception 'Apenas o titular ou seu responsável legal podem baixar os dados.' using errcode = '42501';
  end if;
  select * into p from pessoa where id = v_alvo and anonimizada_em is null;
  if not found then
    raise exception 'Cadastro não encontrado.';
  end if;

  insert into log_auditoria (autor_id, autor_auth, acao, tabela, alvo_id, dados)
  values (v_login, auth.uid(), 'exportar', 'pessoa', v_alvo::text, null);

  return jsonb_build_object(
    'formato', 'familia-maconica/exportacao-v1',
    'gerado_em', now(),
    'pedido_por', case when v_alvo = v_login then 'titular' else 'responsável legal' end,

    'cadastro', jsonb_build_object(
      'nome', p.nome, 'data_nascimento', p.data_nascimento, 'faixa_etaria', app.faixa_de(p.id),
      'email', p.email, 'celular', p.celular, 'id_oficial', p.id_oficial,
      'foto_url', p.foto_url, 'foto_autorizada', p.foto_autorizada,
      'conta_aprovada_em', p.conta_aprovada_em, 'criado_em', p.criado_em, 'atualizado_em', p.atualizado_em),

    'responsaveis', coalesce((
      select jsonb_agg(jsonb_build_object('nome', rp.nome, 'parentesco', r.parentesco, 'desde', r.criado_em)
                       order by rp.nome)
        from responsavel r join pessoa rp on rp.id = r.responsavel_id
       where r.menor_id = p.id), '[]'),

    'dependentes', coalesce((
      select jsonb_agg(jsonb_build_object('nome', mp.nome, 'parentesco', r.parentesco, 'desde', r.criado_em)
                       order by mp.nome)
        from responsavel r join pessoa mp on mp.id = r.menor_id
       where r.responsavel_id = p.id), '[]'),

    'vinculos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'organizacao', o.nome, 'tipo', o.tipo, 'papel', v.papel, 'secretaria', v.secretaria,
               'ativo', v.ativo, 'inicio', v.inicio, 'fim', v.fim, 'motivo_desativacao', v.motivo_desativacao)
             order by v.inicio, o.nome)
        from vinculo v join organizacao o on o.id = v.organizacao_id
       where v.pessoa_id = p.id), '[]'),

    'cargos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'cargo', c.nome, 'organizacao', o.nome, 'gestao', m.nome,
               'inicio', oc.inicio, 'fim', oc.fim, 'interino', oc.interino)
             order by oc.inicio, c.ordem)
        from ocupacao_cargo oc
        join mandato m on m.id = oc.mandato_id
        join cargo c on c.id = oc.cargo_id
        join organizacao o on o.id = m.organizacao_id
       where oc.pessoa_id = p.id), '[]'),

    'consentimentos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'papel', case when k.titular_id = p.id then 'titular' else 'concedente' end,
               'titular', t.nome, 'concedido_por', cp.nome,
               'versao_termo', k.versao_termo, 'finalidade', k.finalidade,
               'forma_verificacao', k.forma_verificacao, 'concedido_em', k.concedido_em,
               'revogado_em', k.revogado_em)
             order by k.concedido_em)
        from consentimento k
        join pessoa t on t.id = k.titular_id
        join pessoa cp on cp.id = k.concedido_por_id
       where k.titular_id = p.id or k.concedido_por_id = p.id), '[]'),

    'respostas_a_eventos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'evento', e.titulo, 'organizacao', o.nome, 'inicio', e.inicio,
               'resposta', r.resposta, 'respondido_em', r.respondido_em,
               'respondido_pelo_responsavel', r.respondido_por is distinct from r.pessoa_id)
             order by e.inicio)
        from resposta r
        join evento e on e.id = r.evento_id
        join organizacao o on o.id = e.organizacao_id
       where r.pessoa_id = p.id), '[]'),

    'preferencias_de_notificacao', coalesce((
      select jsonb_agg(jsonb_build_object('tipo_evento', pn.tipo_evento, 'push', pn.push, 'email', pn.email)
                       order by pn.tipo_evento)
        from preferencia_notificacao pn
       where pn.pessoa_id = p.id), '[]'),

    'aparelhos_com_push', (select count(*) from push_inscricao where pessoa_id = p.id),

    'dias_de_acesso', coalesce((
      select jsonb_agg(d.dia order by d.dia) from acesso_diario d where d.pessoa_id = p.id), '[]'),

    'notificacoes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'titulo', n.titulo, 'corpo', n.corpo, 'motivo', n.motivo, 'criada_em', n.criado_em,
               'enviada_em', n.enviada_em, 'lida_em', n.lida_em)
             order by n.criado_em)
        from notificacao n
       where n.pessoa_id = p.id), '[]'),

    'tentativas_de_login', (
      select jsonb_build_object('falhas', t.falhas, 'bloqueado_ate', t.bloqueado_ate, 'atualizado_em', t.atualizado_em)
        from tentativa_login t
       where p.email is not null and t.email = lower(p.email)),

    'alteracoes_no_cadastro', coalesce((
      select jsonb_agg(jsonb_build_object('acao', l.acao, 'em', l.em, 'campos', l.dados -> 'colunas')
                       order by l.em)
        from log_auditoria l
       where l.tabela = 'pessoa' and l.alvo_id = p.id::text and l.acao <> 'exportar'), '[]')
  );
end $$;

