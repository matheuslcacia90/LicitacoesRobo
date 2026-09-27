-- =====================================================================
-- Catálogo inicial de cargos por tipo de organização.
-- ATENÇÃO: lista de partida. Validar com os regulamentos oficiais de cada
-- Potência / Supremo Conselho / Grande Conselho antes de usar. Cada
-- Secretaria pode acrescentar cargos próprios com criar_cargo().
-- =====================================================================
insert into public.cargo (tipo_organizacao, nome, ordem, vagas, para_adulto) values
  -- Loja
  ('loja', 'Venerável Mestre',        10, 1, true),
  ('loja', '1º Vigilante',            20, 1, true),
  ('loja', '2º Vigilante',            30, 1, true),
  ('loja', 'Orador',                  40, 1, true),
  ('loja', 'Secretário',              50, 1, true),
  ('loja', 'Tesoureiro',              60, 1, true),
  ('loja', 'Chanceler',               70, 1, true),
  ('loja', 'Mestre de Cerimônias',    80, 1, true),
  ('loja', 'Hospitaleiro',            90, 1, true),
  ('loja', '1º Diácono',             100, 1, true),
  ('loja', '2º Diácono',             110, 1, true),
  ('loja', 'Cobridor Interno',       120, 1, true),
  ('loja', 'Cobridor Externo',       130, 1, true),

  -- Capítulo DeMolay
  ('capitulo_demolay', 'Mestre Conselheiro',              10, 1, false),
  ('capitulo_demolay', '1º Conselheiro',                  20, 1, false),
  ('capitulo_demolay', '2º Conselheiro',                  30, 1, false),
  ('capitulo_demolay', 'Escrivão',                        40, 1, false),
  ('capitulo_demolay', 'Tesoureiro',                      50, 1, false),
  ('capitulo_demolay', 'Orador',                          60, 1, false),
  ('capitulo_demolay', '1º Diácono',                      70, 1, false),
  ('capitulo_demolay', '2º Diácono',                      80, 1, false),
  ('capitulo_demolay', '1º Mordomo',                      90, 1, false),
  ('capitulo_demolay', '2º Mordomo',                     100, 1, false),
  ('capitulo_demolay', 'Capelão',                        110, 1, false),
  ('capitulo_demolay', 'Mestre de Cerimônias',           120, 1, false),
  ('capitulo_demolay', 'Porta-Bandeira',                 130, 1, false),
  ('capitulo_demolay', 'Sentinela',                      140, 1, false),
  ('capitulo_demolay', 'Organista',                      150, 1, false),
  ('capitulo_demolay', 'Preceptor',                      160, 7, false),
  ('capitulo_demolay', 'Presidente do Conselho Consultivo', 200, 1, true),
  ('capitulo_demolay', 'Consultor',                      210, 20, true),

  -- Bethel de Filhas de Jó
  ('bethel', 'Honorável Rainha',        10, 1, false),
  ('bethel', 'Primeira Princesa',       20, 1, false),
  ('bethel', 'Segunda Princesa',        30, 1, false),
  ('bethel', 'Guia',                    40, 1, false),
  ('bethel', 'Dirigente de Cerimônias', 50, 1, false),
  ('bethel', 'Capelã',                  60, 1, false),
  ('bethel', 'Tesoureira',              70, 1, false),
  ('bethel', 'Secretária',              80, 1, false),
  ('bethel', 'Bibliotecária',           90, 1, false),
  ('bethel', 'Musicista',              100, 1, false),
  ('bethel', 'Mensageira',             110, 5, false),
  ('bethel', 'Zeladora',               120, 2, false),
  ('bethel', 'Guarda Interna',         130, 1, false),
  ('bethel', 'Guarda Externa',         140, 1, false),
  ('bethel', 'Guardiã do Bethel',      200, 1, true),
  ('bethel', 'Guardião Associado',     210, 1, true),
  ('bethel', 'Membro do Conselho Guardião', 220, 10, true),

  -- Castelo de Escudeiros — nomes provisórios, corrigidos na migração 20260927000005
  ('castelo_escudeiros', 'Escudeiro-Líder',        10, 1, false),
  ('castelo_escudeiros', 'Vice-Líder',             20, 1, false),
  ('castelo_escudeiros', 'Secretário',             30, 1, false),
  ('castelo_escudeiros', 'Tesoureiro',             40, 1, false),
  ('castelo_escudeiros', 'Responsável adulto',    200, 1, true),
  ('castelo_escudeiros', 'Conselheiro adulto',    210, 10, true),

  -- Colmeia (opcional)
  ('colmeia', 'Coordenação',                10, 1, false),
  ('colmeia', 'Responsável adulto',        200, 1, true);
