-- =====================================================================
-- Acesso e portabilidade (LGPD art. 18, II e V): o titular, ou o responsável
-- legal por ele, baixa os dados guardados sobre a pessoa num arquivo JSON.
-- Dados de terceiros entram só pelo nome (responsáveis, organizações, eventos).
-- Chaves de push e senhas nunca saem. Cada exportação fica no log de auditoria.
-- =====================================================================
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

revoke all on function public.exportar_dados(uuid) from public, anon, authenticated;
grant execute on function public.exportar_dados(uuid) to authenticated;
