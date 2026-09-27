-- =====================================================================
-- Cargos do Castelo de Escudeiros: troca os nomes genéricos da 0004
-- pelos da Ordem dos Escudeiros (Supremo Conselho DeMolay Brasil).
-- Fonte: páginas institucionais do DeMolay Brasil e de Grandes Capítulos
-- estaduais, via resultados de busca em 27/09/2026 — confirmar com o
-- regulamento vigente antes do uso.
--
-- Renomeia (mantém o id, então ocupações já lançadas continuam válidas)
-- e acrescenta os cargos que faltavam. Só mexe no catálogo padrão
-- (organizacao_id nulo); cargos próprios de cada Castelo ficam intactos.
-- =====================================================================
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('Escudeiro-Líder',    'Mestre Escudeiro',              10, 1,  false),
      ('Vice-Líder',         'Primeiro Escudeiro',            20, 1,  false),
      ('Secretário',         'Escrivão Escudeiro',            60, 1,  false),
      ('Tesoureiro',         'Tesoureiro Escudeiro',          70, 1,  false),
      ('Responsável adulto', 'Consultor',                    210, 1,  true),
      ('Conselheiro adulto', 'Nobre Cavaleiro',              200, 1,  true)
    ) as t(antigo, novo, ordem, vagas, para_adulto)
  loop
    update public.cargo
       set nome = r.novo, ordem = r.ordem, vagas = r.vagas, para_adulto = r.para_adulto
     where tipo_organizacao = 'castelo_escudeiros'
       and organizacao_id is null
       and nome = r.antigo;
  end loop;
end $$;

insert into public.cargo (tipo_organizacao, nome, ordem, vagas, para_adulto)
select 'castelo_escudeiros', n.nome, n.ordem, 1, n.para_adulto
  from (values
    ('Segundo Escudeiro',              30, false),
    ('Capelão Escudeiro',              40, false),
    ('Mestre de Cerimônias Escudeiro', 50, false),
    ('Sentinela',                      80, false),
    ('Organista',                      90, false),
    ('Preceptor',                     100, false)
  ) as n(nome, ordem, para_adulto)
 where not exists (
   select 1 from public.cargo c
    where c.tipo_organizacao = 'castelo_escudeiros' and c.organizacao_id is null and c.nome = n.nome);
