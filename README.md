# MCode Space

Aplicativo desktop para organizar terminais e editar arquivos, com a identidade visual MCode.

## Executar

No Windows 10/11, com Node.js 22 ou superior:

```powershell
npm ci
npm start
```

Para distribuir uma versão portátil:

```powershell
npm run dist
```

O executável fica em `release/MCode-Space-0.7.0.exe`. O pacote não tem assinatura digital.

O visual da versão 0.2 herda a composição de pôster tecnológico da referência fornecida: tipografia Anton, recortes diagonais, linhas finas, símbolo oficial amostrado em ASCII e halftone discreto. A paleta continua sendo a da MCode. A textura fica na apresentação e na assinatura lateral; editor e terminais mantêm fundos planos.

## Trabalhar

- Abra uma pasta com `Ctrl+O` ou o botão de pasta com +. Cada pasta ganha sua própria aba, preservando arquivos, rascunhos e shells ao alternar. Até oito pastas podem ficar abertas.
- No menu do botão direito de uma subpasta, escolha **Abrir em nova aba** ou **Novo terminal aqui**.
- Crie até 12 terminais no total: PowerShell, PowerShell 7 (quando instalado) ou Prompt de Comando. Cada terminal é um processo real, com entrada, saída, cores e redimensionamento.
- Organize em abas, lado a lado ou grade. Arraste as abas para reordenar, use as setas de cada aba ou `Ctrl+Shift+←/→`.
- Em **Mosaico**, selecione: equilibrado, duas colunas, três colunas, empilhados, uma linha, destaque à esquerda ou destaque no topo. Painéis maiores usam rolagem interna; o modelo é salvo por aba de pasta.
- Clique duas vezes no nome da aba ou use seu lápis para renomear e escolher uma cor. Enter salva; Cancelar e Esc mantêm o nome anterior. F2 funciona com o nome da aba em foco.
- Clique em arquivos para editar; `Ctrl+S` salva. Vários arquivos podem ficar abertos em abas.
- Em arquivos `.md` ou `.markdown`, use o ícone **código** para editar e o **olho** para visualizar o rascunho atual. A prévia mostra títulos, listas, tabelas, código, links e imagens raster locais de até 8 MB. Scripts, HTML ativo e imagens externas não são carregados. Links HTTP/HTTPS abrem no navegador somente quando clicados.
- Arraste arquivos do explorador para o editor ou um painel para abri-los. Arraste pastas para um painel para criar um terminal nessa pasta. O botão direito numa pasta também inicia um terminal nela.
- Para mover itens no disco, arraste-os para uma pasta na própria lateral, ou para o nome da pasta raiz acima da árvore. O destino recebe contorno tracejado, o rótulo “Mover aqui” e a indicação do caminho. O explorador atualiza o arquivo aberto sem perder seu rascunho. Nomes já existentes no destino não são substituídos; links e pastas que contêm repositórios Git não podem ser movidos.
- Arraste os divisores para ajustar a largura do explorador e a altura do editor. As setas do teclado também funcionam quando o divisor está em foco.
- O explorador verifica mudanças automaticamente a cada **750 ms** com a janela visível. Lê somente a raiz e as pastas expandidas; a árvore só é redesenhada se a estrutura mudou. O filtro atua nos arquivos já visíveis.
- Recolha o explorador pelo botão no cabeçalho lateral; o botão ao lado da marca ou `Ctrl+B` permite mostrá-lo novamente. O outro botão lateral recolhe os diretórios expandidos.
- A barra inferior mostra a branch e a quantidade de alterações do Git quando a pasta está em um repositório. O app apenas consulta o Git; commits e outras operações podem ser feitos nos terminais.

## Atalhos

| Atalho | Ação |
| --- | --- |
| Ctrl+O | Abrir pasta |
| Ctrl+S | Salvar arquivo ativo |
| Ctrl+B | Mostrar/ocultar explorador |
| Ctrl+Shift+T | Novo terminal |
| Ctrl+Shift+W | Encerrar terminal ativo, com confirmação |
| Ctrl+Shift+G | Alternar grade/abas |
| Ctrl+Shift+←/→ | Reordenar terminal ativo |

## Organização e arquivos

As pastas abertas, a aba ativa, nomes, cores, shells, ordem dos terminais, mosaico e largura do explorador são salvos no perfil local do aplicativo (`%APPDATA%/mcode-space/workspace.json` em desenvolvimento). O formato anterior de uma única pasta é importado automaticamente. Na próxima abertura, novos processos são iniciados nas pastas iniciais salvas. Comandos, histórico visual e processos anteriores não são restaurados. Durante o uso, trocar abas preserva processos e rascunhos. Rascunhos não são persistidos ao encerrar o aplicativo; fechar uma aba de pasta ou o app pede confirmação quando há alterações ou processos.

O editor aceita arquivos UTF-8 de até 2 MB, preserva BOM e o padrão LF/CRLF e impede salvamento quando o conteúdo mudou no disco. Para resolver um conflito, feche a aba descartando a versão local e abra novamente o arquivo; copie primeiro qualquer trecho que queira manter. Arquivos binários e metadados internos `.git` não são editáveis. Links que saem da pasta aberta são recusados pelo explorador/editor.

Os shells têm as permissões do usuário e podem acessar o sistema e executar comandos normalmente. A pasta aberta limita o explorador/editor; ela não é uma sandbox para comandos. Arrastar entre pastas da lateral move o item no disco; arrastar ao editor ou aos terminais abre o item. Pastas em uso por processos podem ter a movimentação bloqueada pelo Windows. Fechar um terminal encerra seus processos. Fechar o app ou uma aba de pasta pede confirmação se há sessões abertas.

Uma pasta que esteja aberta em outra aba precisa ser fechada antes de ser movida. Cada operação de arquivo informa sua raiz autorizada, para que uma troca de aba não redirecione salvamentos ou terminais a outro projeto.

## Desenvolvimento

- `electron/`: processo principal, acesso a arquivos, PTY e ponte IPC isolada.
- `src/`: interface sem framework, xterm.js e editor de texto com abas e numeração de linhas.
- `src/icons.js`: seleção de ícones do [Lucide](https://lucide.dev), sem SVGs funcionais desenhados manualmente.
- `src/layouts.mjs`: sete organizações do mosaico.
- `src/markdown.js`: renderização com Marked e sanitização DOMPurify.
- `assets/`: cópias dos logos oficiais e fontes locais com licenças OFL.
- `scripts/build.mjs`: bundle com esbuild.
- `tests/`: testes de arquivos e limites de acesso.
- `electron/smoke.cjs`: teste integrado com Electron, shell, editor e capturas.

```powershell
npm test
npm run test:smoke
```

O smoke usa uma pasta temporária e um perfil separado em `test-results/`, sem alterar a pasta de trabalho do usuário. Gera `desktop.png` e `compact.png`. Os binários N-API Windows de node-pty são usados diretamente; o empacotador não recompila a dependência. Plataformas sem binários compatíveis podem exigir ferramentas nativas. Windows é a plataforma validada desta versão.

O build limpa somente `dist/`, minifica a interface e incorpora suas bibliotecas. Fontes são emitidas uma única vez, licenças são preservadas e o portátil exclui source maps, símbolos de depuração e binários de outras plataformas. `node_modules/` fica local para desenvolvimento e não entra no Git.

A sincronização com o Supabase atende às contas, perfis e financeiro. Não há sincronização de arquivos, gerenciamento de extensões, análise de linguagem, autocomplete ou depurador nesta versão. O editor é de texto simples com prévia Markdown.

## Repositório

Este projeto mantém seu próprio Git. Não modificar, mover ou inicializar repositórios nas pastas pai ou nos outros projetos da MCode. Veja `AGENTS.md`, `PRODUCT.md` e `DESIGN.md` antes de alterar a implementação.

## Editor expandido e financeiro

Ao recolher o explorador, o botão inverso permanece na faixa esquerda para reabri-lo. **Expandir editor** ocupa toda a altura do espaço de trabalho, tanto na edição quanto na prévia Markdown. **Voltar aos terminais** restaura a divisão e mantém os shells em execução.

O botão **Financeiro** alterna a lateral esquerda entre arquivos e um menu próprio MCode. Resumo mensal, movimentos, gastos fixos e clientes usam formulários nativos e dados compartilhados entre todas as contas autenticadas no Supabase. O mês selecionado filtra os movimentos. O painel consulta os dados a cada 5 segundos enquanto visível e permite atualização manual. Trocar de conta limpa os dados e rascunhos financeiros em memória; respostas antigas são descartadas. Pagamentos usam ID estável e versão para evitar sobrescrever alterações simultâneas.

## Conta e perfil

**Minha conta** oferece criação e login por email/senha, Google e GitHub. Os logins sociais abrem no navegador do sistema com PKCE e retornam por `http://127.0.0.1:47831/auth/callback/*`. Fechar a janela da conta cancela um login pendente. Email exige confirmação; o app aceita o código do email quando o template contém `{{ .Token }}`. A conta pode editar nome, usuário único e stack (até 20 tecnologias), além de enviar uma foto PNG/JPG/WebP de até 8 MB, convertida para PNG e reduzida antes do envio.

A chave pública do projeto vem em `electron/supabase-config.json`; ela depende das políticas RLS e não é uma chave administrativa. Tokens ficam criptografados no perfil do Windows e nunca são expostos ao renderer. As fotos ficam em um bucket privado, por pasta de usuário. Perfis e fotos são individuais. Caixa, clientes, gastos fixos e tarefas são compartilhados entre todas as contas autenticadas. Pessoas sem login não acessam esses dados. As migrações em `supabase/migrations` criam as tabelas e políticas.

Google e GitHub precisam estar habilitados no painel do Supabase com seus respectivos Client ID e Client Secret. O projeto Supabase foi reativado e a estrutura antiga `onefoot` foi removida após confirmação explícita. A integração Google Sheets foi retirada do aplicativo; o arquivo existente no Drive não foi alterado. Veja [Configuração do Supabase](docs/SUPABASE.md).

## Personalizar terminais

Em modo Abas, os controles ficam na aba. Em Colunas e Mosaico, ficam no cabeçalho de cada painel, sem a barra de abas. Clique no lápis para alterar nome, cor e ícone Lucide (terminal, código, Git, pasta, servidor, banco de dados ou projeto). A configuração é restaurada ao abrir o aplicativo. As setas do cabeçalho reordenam os painéis. O terminal selecionado tem contorno verde com pulso suave; o movimento é desativado quando o sistema prefere movimento reduzido. O nome fica no cabeçalho somente nos modos de painéis.

## Tarefas da equipe

**Tarefas** abre a mesma lateral usada pelo explorador e pelo financeiro. A lista é única para todas as contas autenticadas. Crie tarefas com título, notas, prioridade e prazo, edite pelo lápis, marque como concluídas ou reabra pelo checkbox. Os filtros mostram pendentes, concluídas ou todas; prazos vencidos são destacados. Excluir pede confirmação e remove a tarefa para toda a equipe.

O painel ativo consulta o Supabase a cada cinco segundos e oferece sincronização manual. Não há gravação offline. Edições usam id e updated_at para impedir que uma conta sobrescreva silenciosamente a alteração feita por outra. As colunas de autor são registradas pelo usuário autenticado, mas não limitam a visibilidade. Registros compartilhados sobrevivem à remoção do autor. Contas novas passam a ter acesso ao caixa e às tarefas compartilhadas após autenticação.

## Agentes e monitor de uso (0.7)

No seletor de novo terminal, escolha **Codex**, **Hermes Agent**, **OpenCode** ou **Claude**. O aplicativo detecta CLIs instalados no PATH e nos diretórios usuais do Windows; opções ausentes ficam identificadas e desabilitadas. Instale e autentique o CLI separadamente e reinicie o Space após instalar. Cada agente abre diretamente na pasta ativa, com suas permissões e confirmações normais. Nenhum prompt é enviado automaticamente.

Ao iniciar um agente, surge **Monitor de uso** ao lado de Explorador, Financeiro e Tarefas. O painel usa o mesmo visual MCode e mostra entrada, saída, cache, sessões abertas e encerradas e atalho para voltar ao terminal. Atualiza a cada 3 segundos quando visível. Os números são agrupados por agente e pasta, considerando sessões locais novas desde a primeira abertura desse agente no Space; sessões externas nessa mesma pasta também entram na contagem. O cache pode estar incluído nos tokens de entrada e não é somado a um total artificial.

- **Codex:** contadores cumulativos e limites registrados nos eventos `token_count` do histórico JSONL; barras mostram percentuais e renovação de cada janela. Os limites são o último registro do CLI, não uma consulta em tempo real ao faturamento.
- **Hermes:** contadores de sessões CLI em `state.db`, somente leitura.
- **OpenCode:** contadores por sessão em `opencode.db`, somente leitura.
- **Claude:** uso das mensagens do histórico JSONL, deduplicado por ID. O CLI não está instalado nesta máquina, portanto a abertura real não foi validada aqui.

Hermes, OpenCode e Claude não fornecem limites de assinatura nesses históricos: o painel informa a indisponibilidade, sem inferir cotas a partir de tokens. Formatos de versões incompatíveis e históricos ausentes mostram um aviso. A leitura de logs é limitada para evitar travar a interface; quando o limite é excedido, a contagem aparece como parcial. Nenhuma credencial ou conversa é enviada à nuvem ou ao renderer; somente metadados locais de sessão e métricas numéricas são retornados. Não é necessário entrar na conta Supabase para usar agentes ou monitor.

A organização salva restaura agentes como shells comuns, sem repetir comandos nem reiniciar agentes automaticamente.
