# Família Maçônica — hub do núcleo local

PWA que reúne, num só lugar, a **Loja** e as organizações que ela patrocina (**Capítulo DeMolay**, **Castelo de
Escudeiros**, **Bethel de Filhas de Jó**, Colmeia opcional): cadastro individual, agenda única do templo e quadro de
cargos de cada gestão.

Implementa o escopo da versão 1 descrito no dossiê (seção 8). Não substitui o SISDM nem os sistemas de Loja: guarda
apenas o ID oficial como referência.

## O que está pronto

| Área | O que faz | Onde a regra é garantida |
|---|---|---|
| **Perfis** | Administrador da plataforma, Secretaria, membro adulto, responsável legal, membro menor | RLS + funções no banco |
| **Isolamento** | Cada Secretaria só vê e administra os vínculos da própria organização; o administrador não vê dados de membros | `pode_ver_pessoa`, políticas RLS |
| **Uma conta, vários vínculos** | Cadastro pelo mesmo e-mail reaproveita a pessoa; cada Secretaria ativa/desativa só o seu vínculo; a conta fica inativa sem vínculo ativo | `cadastrar_membro`, `conta_ativa` |
| **Convite de primeiro acesso** | A pessoa cria a própria senha pelo link; a Secretaria nunca vê senhas; reenvio de convite | Supabase Auth + `/auth/confirmar` |
| **Login** | E-mail + senha (mín. 8, letras e números), bloqueio de 15 min após 5 erros, recuperação por e-mail | `registrar_falha_login` |
| **Duas etapas (TOTP)** | Obrigatória para Secretarias e administrador, opcional para os demais | `app/(app)/layout.tsx` |
| **Menores** | Conta só ativa após aprovação do responsável, com registro do consentimento (data, versão do termo, forma); revogação suspende a conta; foto só com autorização | `aprovar_conta_menor`, `revogar_consentimento` |
| **Faixas etárias** | < 12: só agenda e convites da própria organização; 12–15: + cargos, responsável recebe cópia de tudo; 16–17: + lista de membros, responsável recebe cópia fora do calendário regular | `app.faixa`, `agenda`, `quadro_cargos`, `enfileirar` |
| **Desativação** | Preserva histórico; **bloqueada** se a pessoa ocupa cargo vigente nesta organização; tela oferece "Transferir cargo" e **nomeação interina** | `desativar_vinculo`, `transferir_cargo`, `efetivar_interino` |
| **Cargos e gestões** | Catálogo por tipo de organização + cargos próprios; gestões sem sobreposição; vagas; cargos exclusivos de adultos; histórico de gestões | `atribuir_cargo`, constraint `mandato_sem_sobreposicao` |
| **Agenda** | Reunião, atividade conjunta, individual, convite, evento; séries semanais; **conflito de templo bloqueado** (mostra qual organização ocupa) | constraint `evento_sem_conflito_local` |
| **Atividade conjunta em 2 etapas** | Secretaria convidada aceita; só então seus membros são avisados. Nenhuma Secretaria notifica membros de outra organização | `responder_participacao` |
| **Notificações** | Push (PWA) + e-mail; lembretes 24h e 2h antes (cada Secretaria escolhe até 3, e os eventos já marcados são reagendados); cancelamento e mudança de horário imediatos; **menores sem notificação 22h–7h**; reuniões e cancelamentos não podem ser silenciados | `enfileirar`, `configurar_lembretes`, `/api/notificacoes/despachar` |
| **Presença** | Membro confirma; responsável confirma pelo menor; Secretaria vê as presenças dos seus membros | `responder_evento`, `presencas_do_evento` |
| **Eventos públicos** | Link aberto sem login + arquivo `.ics` + **cartaz A4** para imprimir ou salvar em PDF, com QR code para o link | `evento_publico`, `/e/[id]`, `/e/[id]/cartaz` |
| **Métricas do piloto** | Painel por organização com as metas da seção 10: agenda lançada, cargos da gestão (100% em 15 dias), menores com consentimento (≥ 70%) e uso semanal dos adultos (≥ 50%). Só números, para o administrador e as Secretarias; o uso guarda só o dia do acesso, apagado após 90 dias | `metricas_piloto`, `registrar_acesso`, `/metricas` |
| **Auditoria** | Toda criação/alteração/exclusão com autor e hora; para `pessoa`, só os nomes das colunas (sem cópia de dado pessoal) | trigger `app.auditar` |
| **Acesso e portabilidade (LGPD)** | "Baixar meus dados" no Perfil (e na tela de conta inativa): JSON com cadastro, vínculos, cargos, consentimentos, respostas e avisos; o responsável baixa os do dependente; sem chaves de push nem senha; cada exportação é auditada | `exportar_dados`, `/meus-dados` |
| **Limpeza automática (LGPD)** | Todo dia: apaga avisos enviados há mais de 90 dias, registros de acesso com mais de 90 dias e tentativas de login encerradas. Prontas, mas desligadas até o parecer: anonimizar contas sem vínculo há X meses e apagar auditoria antiga | `limpar_dados_antigos`, job `limpar-dados-antigos` do pg_cron |
| **Exclusão (LGPD)** | A pedido do titular ou do responsável: anonimiza o cadastro, remove o login, mantém histórico anônimo | `anonimizar_pessoa` |

Fora da v1 (como no dossiê): tesouraria, mensalidades, atas, conteúdo ritualístico, chat, WhatsApp.

## Arquitetura

- **Next.js 16** (App Router, Server Actions) como PWA, sem app nativo.
- **Supabase** (PostgreSQL + Auth). **Todas as escritas passam por funções `security definer`** com as regras de
  negócio; as tabelas só recebem `SELECT` filtrado por RLS. Se a tela errar, o banco ainda recusa.
- O service worker **não guarda páginas em cache** (dados sensíveis, aparelhos compartilhados). Ele só recebe push.

```
supabase/
  migrations/   esquema, acesso (RLS), operações (RPC) e catálogo de cargos
  tests/        stub do Supabase + testes de regras (103 verificações)
  templates/    e-mails de convite e recuperação (apontam para /auth/confirmar)
src/
  app/          páginas: entrar, primeiro-acesso, (app)/…, secretaria/[org]/…, admin, e/[id]
  lib/          clientes Supabase, sessão, regras de apresentação, despacho de notificações
```

## Como colocar no ar

1. **Supabase**: crie um projeto na região **São Paulo (sa-east-1)**.
2. **Migrações**: `npx supabase link --project-ref <ref>` e `npx supabase db push`.
3. **Auth** (painel → Authentication):
   - URL Configuration: *Site URL* = endereço do app; *Redirect URLs* = `https://seu-app/**`.
   - Providers → Email: desligue o cadastro aberto (*Allow new users to sign up* = off). Senha mínima 8, letras e números.
   - Multi-Factor: habilite **TOTP**.
   - Email Templates: use `supabase/templates/convite.html` (Invite) e `recuperacao.html` (Reset password).
   - Configure um SMTP próprio (o SMTP padrão do Supabase tem limite baixo de envio).
4. **Primeiro administrador** (SQL Editor, uma única vez):
   ```sql
   insert into pessoa (nome, email) values ('Seu Nome', 'voce@exemplo.org.br');
   insert into administrador (pessoa_id) select id from pessoa where email = 'voce@exemplo.org.br';
   ```
   Depois, em Authentication → Users → *Invite user*, convide esse e-mail. Ao aceitar, o login é ligado à pessoa.
   No primeiro acesso, o app exige a verificação em duas etapas.
5. **Variáveis**: copie `.env.example` para `.env.local` e preencha. Gere as chaves de push com `npm run vapid`.
6. **Deploy** (ex.: Vercel, região `gru1` — São Paulo). No plano gratuito da Vercel o cron é só diário
   (`vercel.json` roda o despacho uma vez por dia, como rede de segurança). Para os avisos saírem a cada 5 minutos,
   rode `supabase/agendar-despacho.sql` no SQL Editor (usa `pg_cron` + `pg_net` do próprio Supabase para chamar
   `POST /api/notificacoes/despachar` com `Authorization: Bearer $CRON_SECRET`). O mesmo arquivo agenda a limpeza diária.
7. No app: **Admin → Novo núcleo → locais → organizações → nomear Secretarias**. Cada Secretaria cadastra seus membros.

## Desenvolvimento

```bash
npm install
npm run dev            # http://localhost:3000 (precisa de um projeto Supabase no .env.local)
npm test               # testes unitários (regras de apresentação)
npm run typecheck
PGHOST=... PGUSER=postgres npm run test:db   # aplica as migrações num PostgreSQL 15+ e roda os testes de regras
```

`npx supabase start` sobe um Supabase local com `supabase/config.toml` (auth, MFA e modelos de e-mail já configurados)
e `supabase/seed.sql` (cria `admin@exemplo.org.br` como administrador).

## Pendências antes de usar com pessoas reais

- **Parecer jurídico (LGPD art. 14 e ECA Digital)**: validar faixas etárias, forma de verificação do responsável
  (hoje: aceite no app pelo responsável autenticado por e-mail) e o **texto do termo**, que está marcado como
  provisório em `src/app/(app)/perfil/page.tsx` (`VERSAO_TERMO` em `src/lib/regras.ts`).
- **Prazo de guarda** após exclusão: hoje a anonimização é imediata. Os prazos para anonimizar contas inativas e
  apagar auditoria antiga já têm rotina (`limpar_dados_antigos`), mas ficam desligados até o parecer definir os meses.
- **Catálogo de cargos**: validar com os regulamentos. Os do **Castelo de Escudeiros** seguem a Ordem dos Escudeiros
  (migração `20260927000005_cargos_escudeiros.sql`), levantados por busca; confirmar com o regulamento vigente.
- **Sigilo**: validar com a Potência e os Grandes Conselhos o que pode constar em título/descrição de sessões. As
  notificações push passam por servidores do Google/Apple: não coloque conteúdo reservado nos títulos. O formulário de
  novo evento mostra esse aviso à Secretaria.
- **Validade do convite**: o dossiê pede 72 h, mas o Supabase limita links de e-mail a **24 h**. O app oferece
  "Reenviar convite" na lista de membros.
- **Login por CPF**: não implementado (só e-mail). Guardar CPF aumenta a exposição de dados. Avaliar se é necessário.
- **Restrição por grau** em sessões de Loja: hoje a visibilidade é por organização e por destinatários específicos.
  Grau não é modelado.

## Testes feitos

O GitHub Actions (`.github/workflows/familia-maconica.yml`) roda tudo abaixo em cada PR que mexe em
`familia-maconica/`: testes de banco num PostgreSQL 17 (mesma versão do Supabase), tipos, testes unitários e build.


- `npm run test:db`: 103 verificações das regras no banco, rodando como os papéis reais (`authenticated`, `anon`,
  `service_role`): isolamento entre organizações, contas de menores, bloqueio/transferência/interino, conflito de
  templo, atividade conjunta em duas etapas, horário silencioso, fila de envio, bloqueio de login, exportação de dados, limpeza periódica, anonimização e
  auditoria.
- `npm test`, `npm run typecheck` e `next build`.
- **Não testado ainda**: as telas contra um Supabase real (convite por e-mail, TOTP, push). Faça um roteiro de teste
  com um núcleo piloto antes de abrir para todos.
