# MCode Space

- Repositório independente em `mcode/mcode-space`. Nunca executar Git na pasta `mcode` nem alterar o Git do portfólio.
- Ler README.md, PRODUCT.md e DESIGN.md. Aplicativo desktop Electron para Windows, com interface JavaScript nativa, xterm.js e node-pty.
- Instalar com `npm ci`; executar com `npm start`; validar com `npm test` e `npm run test:smoke`; gerar portátil com `npm run dist`.
- Manter `contextIsolation`, `sandbox` e a API explícita do preload. Não expor IPC genérico nem Node.js ao renderer. Não carregar páginas externas na janela privilegiada.
- Validar o remetente de cada IPC. Caminhos do editor/explorador passam por realpath e devem permanecer na pasta aberta; `.git` é protegido.
- Salvar arquivos exige revisão do conteúdo para detectar mudanças externas. Não remover essa proteção nem executar comandos automaticamente a partir do workspace salvo.
- Os terminais são processos reais com permissões do usuário, não uma sandbox. Encerramento e descarte de alterações exigem confirmação.
- Preservar logos originais e fontes com suas licenças. Não depender de assets fora deste repositório.
- Não versionar node_modules, dist, release, test-results, credenciais ou configurações pessoais.
- Pastas são abas independentes. Toda operação de arquivo e criação de terminal informa a raiz autorizada; nunca usar a pasta ativa global para operações iniciadas em outra aba.
- Atualização do explorador: 750ms, somente raiz e pastas expandidas, sem renderizar quando não há diferenças ou durante arraste. Não voltar com botão manual de atualizar.
- Ícones funcionais vêm do Lucide em src/icons.js. Não escrever paths SVG próprios para controles; os logos oficiais são preservados.
- Markdown usa Marked e DOMPurify. Nunca inserir HTML não sanitizado. Imagens raster locais passam pela validação de raiz/tamanho; links externos aceitam somente HTTP/HTTPS.
- Supabase: account.cjs gerencia Auth (email, Google/GitHub com PKCE), perfis e Storage. Login social usa navegador do sistema e callback com nonce no caminho em 127.0.0.1:47831. Não expor access/refresh tokens, credenciais administrativas ou cliente SDK ao renderer. A configuração embarcada contém SOMENTE URL e publishable key.
- Sessões são criptografadas no userData. Avatar é escolhido pelo diálogo nativo, validado e reencodado em PNG; bucket avatars privado com pasta auth.uid(). Perfis e fotos exigem RLS por usuário. Caixa e tarefas são compartilhados entre TODAS as contas autenticadas, com RLS negando acesso anônimo. Qualquer migração remota exige inspecionar o schema existente primeiro; nunca reutilizar service_role no aplicativo.
- Financeiro: interface própria em src/finance.js alterna com explorador à esquerda. electron/finance.cjs usa tabelas mcode_* e a sessão Supabase, sem Google Sheets. owner_id registra o criador, não deve filtrar leituras do caixa. Preservar proteção contra respostas de outra conta e atualização concorrente por id/updated_at. Não enviar arquivos, pastas ou histórico de shell à nuvem.
- Personalização dos terminais usa glyph Lucide validado e color predefinida, persistidos em settings.cjs. Abas visíveis somente em layout tabs; em columns/grid, os controles ficam no cabeçalho. Borda ativa verde animada deve respeitar prefers-reduced-motion.

- Laterais: src/sidebars.js coordena Explorador, Financeiro e Tarefas, com um painel visível por vez. src/todos.js e electron/todos.cjs usam mcode_todos compartilhada, prazos, prioridades e atualização por id/updated_at. As laterais ativas sincronizam a cada 5 segundos.

- Agentes: electron/agents.cjs permite somente Codex, Hermes, OpenCode e Claude, resolvidos em diretórios absolutos. Nunca executar scripts de workspace como atalhos, instalar CLIs ou acrescentar flags de aprovação automática. A restauração salva deve continuar iniciando apenas shells comuns.
- Monitor de tokens local: electron/agent-usage.cjs lê somente campos numéricos de logs e bancos SQLite em modo readOnly/query_only. Não retornar mensagens, credenciais, configurações ou conteúdo bruto ao renderer nem ao Supabase. Contagem agrupada por agente/pasta desde a abertura; não duplicar o mesmo consumo em múltiplos terminais. Limites só aparecem quando fornecidos pela fonte, com data do último registro. Preservar limites de leitura e indicação de contagem parcial.
