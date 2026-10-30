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
