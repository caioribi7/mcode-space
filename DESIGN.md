---
name: MCode Space
description: Ambiente local de arquivos e terminais da MCode
colors:
  primary: "#A3FF12"
  background: "#0B100D"
  surface: "#111A14"
  raised: "#18221B"
  foreground: "#F1F5EF"
  muted: "#9EAFA3"
  divider: "#2A332D"
  chrome: "#0E1510"
  editor: "#0D140F"
  primary-hover: "#B6FF49"
  selection: "#A3FF1240"
  selected-surface: "#A3FF1214"
  tree-text: "#C6D3CA"
  line-number: "#819789"
  terminal-foreground: "#DCE7DF"
  session-blue: "#86BAFF"
  session-amber: "#EFC67B"
  session-pink: "#ECA2CA"
  ansi-red: "#F28B82"
  ansi-cyan: "#80CBC4"
  toast: "#233027"
  scrollbar: "#3A493E"
  print-line: "#46543F"
  terminal-active: "#192416"
  editor-bar: "#101910"
  editor-path: "#ADBC9E"
  resize-divider: "#303B2B"
typography:
  display:
    fontFamily: "Anton, sans-serif"
    fontSize: "clamp(48px, 5.7vw, 88px)"
    fontWeight: 400
    lineHeight: 1.04
    letterSpacing: "-0.015em"
  brand-title:
    fontFamily: "Anton, sans-serif"
    fontSize: "32px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "0em"
  signature:
    fontFamily: "Anton, sans-serif"
    fontSize: "20px"
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: "0.01em"
  title:
    fontFamily: "Space, Segoe UI, sans-serif"
    fontSize: "20px"
    fontWeight: 500
  heading:
    fontFamily: "Space, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 600
  body:
    fontFamily: "Space, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 400
  label:
    fontFamily: "Space, Segoe UI, sans-serif"
    fontSize: "12px"
  caption:
    fontFamily: "Space, Segoe UI, sans-serif"
    fontSize: "11px"
  status:
    fontFamily: "Space, Segoe UI, sans-serif"
    fontSize: "10px"
  mono-label:
    fontFamily: "Geist, monospace"
    fontSize: "10px"
  code:
    fontFamily: "Geist, Consolas, monospace"
    fontSize: "12px"
    lineHeight: 1.7
  terminal:
    fontFamily: "Geist, Consolas, monospace"
    fontSize: "12px"
    lineHeight: 1.3
rounded:
  tab: "1px"
  filter: "1px"
  field: "4px"
  control: "1px"
  toast: "6px"
  dialog: "8px"
spacing:
  compact: "8px"
  regular: "16px"
  generous: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.background}"
    rounded: "{rounded.control}"
    padding: "8px 13px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.background}"
  button-secondary:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    padding: "8px 13px"
  input-filter:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.filter}"
    padding: "9px 10px"
  terminal-tab-active:
    backgroundColor: "{colors.terminal-active}"
    height: "40px"
  terminal-count:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.muted}"
    rounded: "{rounded.control}"
    padding: "3px 6px"
---

# Design System: MCode Space

## Overview

**Creative North Star: "Área de trabalho MCode"**

Interface de trabalho que herda a identidade oficial MCode. A marca aparece no cabeçalho, no estado vazio e nas ações principais; as áreas de código permanecem discretas. O conteúdo e os controles usam português, com densidade de ferramenta desktop e superfícies contínuas.

A linguagem de pôster tecnológico aparece na tipografia Anton, nos recortes diagonais e nas linhas verde-acinzentadas do chrome. ASCII amostrado do símbolo oficial e retícula discreta de pontos ficam na arte inicial e na assinatura lateral; editor e terminais mantêm planos lisos para leitura.

**Key Characteristics:**
- Identidade oficial MCode e verde neon funcional.
- Planos escuros, divisórias discretas e controles compactos.
- Tipografia local: Anton na expressão da marca, Space Grotesk nos controles e Geist Mono no código.
- Recortes diagonais, símbolo oficial em ASCII e halftone restrito à arte de marca.

## Colors

### Primary

Verde neon nas ações principais, foco, cursor e indicadores ativos; verde claro no hover da ação principal. A seleção de texto usa verde translúcido; árvore e alternador ativos usam um preenchimento ainda mais discreto.

### Secondary

Azul, âmbar e rosa identificam sessões, junto com verde. A cor acompanha o ponto e o sublinhado da aba; o nome editável continua visível. Essas cores também participam da saída ANSI e não representam novas cores de marca.

### Neutral

Preto profundo nos terminais, verde escuro no chrome e no editor, superfície elevada para controles, branco suave no texto e cinza esverdeado em metadados. A saída do terminal tem um foreground próprio, distinto do texto da interface. Linhas de impressão verde-acinzentadas marcam cabeçalho, arte inicial e status; os divisores ajustáveis usam um tom próprio. Abas de terminal ativas e barra do editor têm planos verdes discretos, com caminhos mais claros.

O tema ANSI configurado em `src/app.js` mapeia black → raised, red → ansi-red, green → primary, yellow → session-amber, blue → session-blue, magenta → session-pink, cyan → ansi-cyan, white → foreground e brightBlack → muted. As outras variantes bright são herdadas do xterm, sem redefinição de marca. O fundo, cursor e seleção usam background, primary e selection.

**The Identificação Rule.** Cor de sessão acompanha nome e indicação de estado; nunca substitui o texto.

## Typography

**Display Font:** Anton local, com sans-serif de fallback, apenas na expressão da marca.
**Body Font:** Space Grotesk local, registrada como `Space`, com Segoe UI e sans-serif de fallback.
**Label/Mono Font:** Geist Mono local, registrada como `Geist`; editor e terminal incluem Consolas como fallback.

A marca usa o SVG oficial. O nome Space usa brand-title; a assinatura lateral usa signature. O estado vazio usa display em caixa alta e cai para 54px quando a largura é de até 1100px ou a altura é de até 740px. A palavra Space em contorno na arte usa Anton com `clamp(58px, 6vw, 94px)`. O título do diálogo mantém title em Space; títulos de áreas usam heading, texto geral usa body, abas e filtros usam label. Cabeçalhos de painéis usam caption; status e rodapé do editor usam status. Caminhos e atalhos usam mono-label; caminho do workspace e contagem de terminais usam Geist a 11px. Código e números de linha usam code, enquanto o terminal usa terminal, com entrelinha mais curta. O texto introdutório tem entrelinha 1.8, mensagens da árvore 1.7 e avisos 1.6.

**The Tipografia de trabalho Rule.** Anton expressa a marca; controles usam Space e conteúdo de código usa Geist.

## Layout

Cabeçalho de 74px, seguido de faixa de pastas de 38px; explorador lateral inicialmente com 260px e ajustável de 190 a 480px; editor acima dos terminais quando aberto; status inferior de 29px. O editor começa em 42% da área disponível, tem mínimo de 160px e, ao ajustar, preserva 230px abaixo dele. Divisores medem 4px. Setas horizontais alteram a lateral em passos de 16px; setas verticais alteram o editor em passos de 20px.

Terminais podem ocupar uma única aba, até três colunas com mínimo de 300px por coluna, ou mosaico configurável. O mosaico equilibrado usa duas colunas, passando a três acima de quatro sessões; os modelos de duas e três colunas usam mínimo de 260px por coluna e linhas de 210px. Empilhados usa uma coluna; Em uma linha usa colunas de no mínimo 280px. Destaque à esquerda reserva uma coluna de 2fr com mínimo de 300px e uma secundária de 1fr com mínimo de 260px, com linhas secundárias de 160px. Destaque no topo reserva linha principal de 2fr com mínimo de 240px e linha secundária de 1fr com mínimo de 180px, em colunas de no mínimo 240px. O modo de aba tem linhas de no mínimo 210px. A barra do explorador tem 56px; a toolbar de terminais tem mínimo de 56px, altura automática e ações que permitem quebra de linha; abas de terminal, 40px, com largura de 215 a 290px; cabeçalho de painel, 28px; linhas de arquivo, 30px. A janela mínima é de 900 × 620px.

Até 1100px, a regra CSS da lateral passa a 220px, os atalhos dos botões são ocultados, os controles e paddings ficam mais estreitos e o título vazio diminui. A largura inline restaurada ou ajustada da lateral tem precedência sobre esse default CSS. Não há transformação para navegação móvel. Abas de pastas e terminais rolam horizontalmente; árvore, prévia Markdown e conjunto de painéis têm rolagem interna. Mosaicos preservam seus mínimos e rolam dentro da área de terminais em janelas compactas. Espaçamento usa frequentemente 8, 16 e 24px, com ajustes compactos conforme cada controle.

O estado vazio usa duas colunas (1.1fr e 1fr), texto à esquerda, arte à direita e atalhos em uma linha inferior que permite quebra. O padding varia de 24 a 64px e o intervalo de 18 a 48px; até 1100px passa a 30px e 24px. Até 740px de altura, o padding vertical é de 24px e a arte reduz sua altura mínima para 210px. A assinatura lateral tem mínimo de 94px, ou 78px na largura compacta; a faixa de status local tem 34px.

## Elevation & Depth

Planos separados por tom e divisórias de 1px. Sombras externas no diálogo (`0 15px 50px #0008`) e nos avisos flutuantes e menu contextual (`0 8px 28px #0006`); o backdrop do diálogo é `#0009`. As linhas inset verdes em painel, editor e aba ativa indicam estado, sem elevar a superfície. A retícula é feita com pontos radiais CSS e máscara linear de opacidade, apenas na arte inicial e assinatura lateral; não cria relevo. Não há animação decorativa; a preferência de movimento reduzido desativa transições e suavização de rolagem.

## Shapes

Áreas de trabalho retas e contínuas. Botões, botões de ícone, filtro, seletor, linhas de arquivo, contagem e abas de terminal usam cantos quase retos (1px). A ação principal tem o canto superior direito recortado em diagonal (9px). Campos do diálogo conservam raio de campo e o diálogo mantém seu raio próprio. Indicadores ativos do terminal e cabeçalhos de painel ficam quadrados; atalhos do estado vazio têm cantos retos. Todos os ícones funcionais usam Lucide, em SVG linear de traço 1.6. Logos oficiais preservam os arquivos e proporções originais.

## Components

### Buttons

Ação principal verde, texto escuro, cantos de controle e recorte diagonal; secundária em raised; sutil transparente com texto muted. Todos usam hover em raised, exceto a principal, que usa primary-hover. O foco visível da ação principal usa contorno escuro de 2px, deslocado -4px para permanecer dentro do recorte. Botões desabilitados têm opacidade 0.4 e cursor de indisponibilidade. Ícones funcionais são SVG Lucide de traço 1.6, geralmente 18px; botões de ícone medem 30px, ou 22px nas abas.

### Inputs / Fields

Fundo escuro e borda de 1px em divider. O filtro usa raio filter e padding próprio; campos do diálogo preservam raio field e padding de 10px. O foco de teclado nos controles e elementos com tabindex usa contorno verde de 2px, deslocado -2px; ações principais usam a exceção escura descrita em Buttons. O textarea do editor remove esse contorno e aplica à área de código uma linha inset de 1px em `#a3ff1220`; o cursor continua verde. Não registrar esse foco discreto como substituto geral do contorno.

### Navigation

Árvore de arquivos com recuo inicial de 10px e acréscimo de 15px por nível. O arquivo ativo recebe selected-surface e foreground. A raiz aberta também é destino de movimentação, com ícone de pasta e nome, altura mínima de 32px e padding de 7px 10px. Durante o arraste, a origem fica com opacidade 0.45 e contorno tracejado muted de 1px; o destino válido recebe fundo `#a3ff1226`, contorno verde tracejado de 1px e rótulo “Mover aqui”. Destinos inválidos recebem contorno âmbar tracejado de 1px. O feedback inline da lateral informa item, caminho de destino e resultado; usa texto de 12px, entrelinha 1.6, padding de 12px 14px e borda superior verde de 1px. A confirmação de sucesso permanece por 2800ms.

Mover entre pastas ou para a raiz do explorador altera o local do item no disco. Soltar arquivo no editor ou shell abre a edição; soltar pasta no shell inicia um terminal naquele diretório. Os destinos de abertura exibem texto explícito de intenção, distinguindo essas ações da movimentação lateral.

Abas ativas têm aria-selected e indicação inferior: 1px na cor da sessão para terminal, 1px verde para arquivo. Nome e cor da sessão ficam na aba. O lápis explícito, clique duplo e F2 abrem a renomeação; Enter confirma o formulário de nome e cor. Arraste entre abas reorganiza terminais; botões com setas e Ctrl+Shift+ArrowLeft/ArrowRight oferecem alternativas.

### Folder tabs and explorer controls

Faixa de pastas no plano chrome, com divisória inferior e padding horizontal de 10px. Cada aba mede de 130 a 280px, traz pasta, nome com elipse e fechar; alterações não salvas acrescentam um ponto ao nome. A ativa usa surface, linha verde inset inferior de 1px e ícone verde. Um botão de pasta com mais abre nova aba. Ao alternar, arquivos, rascunhos e shells permanecem ligados à pasta.

O botão Lucide de recolher/mostrar explorador permanece no cabeçalho e atualiza nome acessível e aria-expanded; Ctrl B oferece a mesma ação. O explorador também permite recolher sua área e recolher diretórios separadamente. O menu contextual de subpastas oferece “Abrir em nova aba” e “Novo terminal aqui”; usa raised, borda de 1px, sombra de aviso, largura mínima de 225px e padding externo de 5px. Ações usam texto de 12px, padding de 10px, ícone de 16px e selected-surface no hover/foco; Escape ou clique externo fecha o menu.

### Mosaic selector

O seletor aparece apenas no modo Mosaico e oferece Equilibrado, 2 colunas, 3 colunas, Empilhados, Em uma linha, Destaque à esquerda e Destaque no topo. A escolha é preservada por pasta e aparece no status. Usa o campo escuro existente, com largura máxima de 155px, reduzida para 140px até 1100px. A toolbar permite quebra das ações para preservar acesso aos controles.

### Markdown preview

Arquivos .md e .markdown exibem botões Lucide de código e olho na barra do editor, separados das abas por uma linha vertical. O selecionado usa verde e selected-surface, com aria-pressed. A prévia mostra o rascunho atual, ocupa a área flexível e possui rolagem própria e padding de 18px 30px 30px. Usa Space a 14px/1.75; títulos h1 de 28px/1.25, h2 de 22px/1.3, h3 de 18px e demais de 15px. Parágrafos e listas limitam a medida a 80ch. Código usa Geist a 12px/1.7; blocos têm fundo background, borda divider e padding de 14px 16px, com rolagem própria. Links usam verde e sublinhado; citações usam borda verde de 1px e texto muted; tabelas mantêm divisórias de 1px e cabeçalhos surface. Imagens locais preservam proporção, com largura máxima de 100% e altura automática.

### Terminal panels

Superfícies contínuas, sem cartões arredondados; linhas de 1px separam painéis. Cada cabeçalho de painel traz apenas ícone de pasta e caminho inicial, sem repetir nome ou cor da aba. Terminal focado usa linha inset em `#a3ff1230`; sessão encerrada usa ponto muted e texto explícito. O xterm recebe padding de 12px 8px 8px 16px, garantindo que seu cálculo de encaixe considere o espaço interno.

### Editor and resizing

O editor mostra alterações não salvas e exige confirmação para descarte. Divisores respondem a ponteiro e teclado, usam cursor de redimensionamento e ficam verdes no hover. Destinos de arraste mostram contorno verde tracejado de 2px, deslocado -6px no terminal e -5px no editor; aba de destino usa contorno verde de 1px, deslocado -1px. O overlay do terminal diz “Solte: arquivo abre no editor; pasta abre um terminal”; o do editor diz “Solte o arquivo para editar”.

### Brand artwork

O símbolo ASCII deriva do SVG oficial, amostrado em canvas de 64 × 32 células por opacidade. Os caracteres `MC0#*+` e `:` preservam a silhueta, sem substituir o logo oficial no cabeçalho. A arte e a assinatura lateral usam halftone CSS discreto; conteúdo operacional permanece sem textura.

## Do's and Don'ts

### Do:
- **Do** preservar proporções e cores dos logos oficiais.
- **Do** usar verde nas ações e nos estados de interação.
- **Do** acompanhar cor de sessão com nome e estado textual.
- **Do** preservar foco de teclado e alternativas ao arraste.
- **Do** restringir Anton, ASCII e halftone à expressão de marca, mantendo código e terminais lisos.

### Don't:
- **Don't** adicionar brilhos ou animações decorativas; as máscaras de gradiente servem apenas ao halftone de marca.
- **Don't** redigitar o logo como tipografia da interface.
- **Don't** inserir afirmações fictícias sobre trabalho executado.
    