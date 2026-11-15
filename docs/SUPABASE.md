# Supabase — contas, equipes e dados compartilhados

O MCode Space funciona sem conta para arquivos, editor, terminais, agentes e auto-work. Contas, equipes, caixa e tarefas usam um projeto Supabase. Há duas formas de usar:

1. **Projeto padrão do build oficial.** É multiempresa: cada organização cria a própria equipe, e o RLS isola os dados entre equipes. A URL e a publishable key estão em `electron/supabase-config.json`.
2. **Seu próprio projeto** (Supabase Cloud, auto-hospedado com domínio próprio ou `supabase start` local). Em **Minha conta → Conexão Supabase**, informe a URL e a chave **publishable/anon**. A configuração fica no userData e substitui a embarcada. Forks podem trocar `electron/supabase-config.json`.

Nunca use `service_role`, chaves `sb_secret_…` ou secrets OAuth no aplicativo ou no repositório. O app recusa chaves com papel diferente de `anon`.

## Montar um projeto

1. Crie o projeto e aplique **todas** as migrations de `supabase/migrations`, em ordem (`supabase db push` ou SQL Editor).
2. Em Authentication → URL Configuration → Redirect URLs, cadastre `http://127.0.0.1:47831/auth/callback/*`.
3. Configure SMTP para uso real. O email padrão do Supabase é só para testes. Mantenha a confirmação de email ativa.
4. (Opcional) Ative Google e/ou GitHub em Authentication → Sign In / Providers. A URL de callback do provedor é `https://<seu-projeto>.supabase.co/auth/v1/callback`. Os secrets ficam só no painel.
5. Ative a proteção contra senhas vazadas em Authentication → Passwords.

Se já existe um projeto, inspecione o schema remoto antes de aplicar uma migration nova (nomes de constraints e policies podem divergir).

## Modelo de dados

| Tabela | Conteúdo | Acesso |
| --- | --- | --- |
| `mcode_profiles` | nome, usuário único, stack, caminho da foto | a própria conta; membros de uma mesma equipe veem nome e usuário |
| `mcode_teams` | equipes (organizações) | membros leem; dono e admin renomeiam; só o dono exclui |
| `mcode_team_members` | papel `owner`, `admin` ou `member` | membros leem; alterações só por RPC |
| `mcode_team_invites` | convites com validade e número de usos; o banco guarda só o SHA-256 do código | dono e admin |
| `mcode_clients`, `mcode_fixed_expenses`, `mcode_transactions` | caixa da equipe | membros da equipe (`team_id`) |
| `mcode_todos` | tarefas da equipe | membros da equipe (`team_id`) |
| bucket `avatars` | fotos PNG privadas, na pasta `auth.uid()` | só o dono da foto |

RPCs (`security definer`, executáveis só por `authenticated`):

- `mcode_create_team(team_name)`: cria a equipe e torna quem criou dono. Limite de 20 equipes criadas por conta.
- `mcode_create_invite(team, invite_role, valid_days, uses_allowed)`: devolve um código de 32 caracteres hexadecimais, que só aparece nesse momento. Admins convidam membros; donos convidam também admins.
- `mcode_accept_invite(invite_code)`: entra na equipe; recusa códigos expirados, revogados ou já esgotados.
- `mcode_set_member_role(team, member, new_role)`: só donos. A equipe nunca fica sem dono.
- `mcode_remove_member(team, member)`: o dono remove qualquer membro, o admin remove membros comuns, e qualquer um pode sair. O último dono precisa transferir a posse ou excluir a equipe antes de sair.

Ao aplicar `20261115120000_teams.sql` num banco que já tem dados, tudo que era compartilhado entre todas as contas vai para uma **Equipe inicial**. A conta mais antiga vira dona, e as demais, administradoras. O acesso dessas contas continua igual; depois, o dono ajusta os papéis.

`owner_id`/`created_by` registram o autor e não filtram leituras. `team_id` não pode ser alterado depois da criação. Códigos de cliente são únicos por equipe, e lançamentos só referenciam clientes da mesma equipe.

## No aplicativo

O SDK roda só no processo principal (`electron/account.cjs`, `teams.cjs`, `finance.cjs`, `todos.cjs`). A sessão fica criptografada em `supabase-session.bin`, e a equipe ativa de cada conta é lembrada em `teams.json`, ambos no userData. O renderer recebe somente dados sanitizados, nunca tokens.

A equipe ativa é escolhida em **Minha conta → Equipes**, e o nome aparece no botão da conta. Trocar de equipe ou de conta limpa caixa e tarefas em memória e descarta respostas antigas. Marcar pago, editar ou excluir exige a mesma versão `updated_at`, o que evita sobrescrever alterações simultâneas. Arquivos, terminais, histórico de shell e auto-work nunca vão para o Supabase.

## Validação

- `npm test`: validação de conta/perfil, configuração (Cloud, auto-hospedado e local), sessão, equipes (equipe ativa por conta, permissões de admin), filtragem por equipe em caixa e tarefas e controle de versão.
- RLS e RPCs num Postgres embutido, sem tocar em nenhum projeto remoto:

  ```powershell
  npm i --no-save @electric-sql/pglite@0.3.14
  node supabase/tests/rls-check.mjs
  ```

  O script aplica todas as migrations com stubs mínimos de `auth`/`storage` e confere o isolamento entre equipes, convites (uso único, hash ilegível, papéis), remoção, saída, exclusão em cascata e a visibilidade dos perfis.

Referências: [PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow), [Google](https://supabase.com/docs/guides/auth/social-login/auth-google), [GitHub](https://supabase.com/docs/guides/auth/social-login/auth-github), [SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [senhas vazadas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
