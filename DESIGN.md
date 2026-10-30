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
typography:
  display:
    fontFamily: "Space, Segoe UI, sans-serif"
    fontSize: "32px"
    fontWeight: 500
    letterSpacing: "-0.04em"
  title:
    fontFamily: "Space, Segoe UI, sans-serif"
    fontSize: "20px"
    fontWeight: 500
  heading:
    fontFamily: "Space, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 500
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
  tab: "3px"
  field: "4px"
  control: "5px"
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
    rounded: "{rounded.field}"
    padding: "9px 10px"
  terminal-tab-active:
    backgroundColor: "{colors.surface}"
    height: "40px"
  terminal-count:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.muted}"
    rounded: "{rounded.field}"
    padding: "3px 6px"
---

# Design System: MCode Space

## Overview

**Creative North Star: "Área de trabalho MCode"**

Interface de trabalho que herda a identidade oficial MCode. A marca aparece no cabeçalho, no estado vazio e nas ações principais; as áreas de código permanecem discretas. O conteúdo e os controles usam português, com densidade de ferramenta desktop e superfícies contínuas.

**Key Characteristics:**
- Identidade oficial MCode e verde neon funcional.
- Planos escuros, divisórias discretas e controles compactos.
- Tipografia local: Space Grotesk na interface e Geist Mono no código.

## Colors

### Primary

Verde neon nas ações principais, foco, cursor e indicadores ativos; verde claro no hover da ação principal. A seleção de texto usa verde translúcido; árvore e alternador ativos usam um preenchimento ainda mais discreto.

### Secondary

Azul, âmbar e rosa identificam sessões, junto com verde. A cor acompanha o ponto e o sublinhado da aba; o nome editável continua visível. Essas cores também participam da saída ANSI e não representam novas cores de marca.

### Neutral

Preto profundo nos terminais, verde escuro no chrome e no editor, superfície elevada para controles, branco suave no texto e cinza esverdeado em metadados. A saída do terminal tem um foreground próprio, distinto do texto da interface.

O tema ANSI configurado em `src/app.js` mapeia black → raised, red → ansi-red, green → primary, yellow → session-amber, blue → session-blue, magenta → session-pink, cyan → ansi-cyan, white → foreground e brightBlack → muted. As outras variantes bright são herdadas do xterm, sem redefinição de marca. O fundo, cursor e seleção usam background, primary e selection.

**The Identificação Rule.** Cor de sessão acompanha nome e indicação de estado; nunca substitui o texto.

## Typography

**Body Font:** Space Grotesk local, registrada como `Space`, com Segoe UI e sans-serif de fallback.
**Label/Mono Font:** Geist Mono local, registrada como `Geist`; editor e terminal incluem Consolas como fallback.

A marca usa o SVG oficial. O título do estado vazio usa display e cai para 28px no breakpoint compacto. Nome do aplicativo e título do diálogo usam title; apenas o nome do aplicativo recebe o tracking de display. Títulos de áreas usam heading, texto geral usa body, abas e filtros usam label. Cabeçalhos de painéis usam caption; status e rodapé do editor usam status. Caminhos e atalhos usam mono-label; contagem de terminais usa Geist a 11px. Código e números de linha usam code, enquanto o terminal usa terminal, com entrelinha mais curta. O texto introdutório tem entrelinha 1.8, mensagens da árvore 1.7 e avisos 1.6. Não há fonte de display adicional.

## Layout

Cabeçalho de 74px; explorador lateral inicialmente com 260px e ajustável de 190 a 480px; editor acima dos terminais quando aberto; status inferior de 29px. O editor começa em 42% da área disponível, tem mínimo de 160px e, ao ajustar, preserva 230px abaixo dele. Divisores medem 4px. Setas horizontais alteram a lateral em passos de 16px; setas verticais alteram o editor em passos de 20px.

Terminais podem ocupar uma única aba, até três colunas com mínimo de 300px por coluna, ou grade de duas colunas com linhas de no mínimo 230px. O modo de aba tem linhas de no mínimo 210px. As barras de seção têm 56px; abas de terminal, 40px; cabeçalho de painel, 34px; linhas de arquivo, 30px. A janela mínima é de 900 × 620px.

Até 1100px, a regra CSS da lateral passa a 220px, os atalhos dos botões são ocultados, os controles e paddings ficam mais estreitos e o título vazio diminui. A largura inline restaurada ou ajustada da lateral tem precedência sobre esse default CSS. Não há transformação para navegação móvel. Espaçamento usa frequentemente 8, 16 e 24px, com ajustes compactos conforme cada controle.

## Elevation & Depth

Planos separados por tom e divisórias de 1px. Sombras externas apenas no diálogo (`0 15px 50px #0008`) e nos avisos flutuantes (`0 8px 28px #0006`); o backdrop do diálogo é `#0009`. As linhas inset verdes em painel, editor e aba ativa indicam estado, sem elevar a superfície. Não há animação decorativa; a preferência de movimento reduzido desativa transições e suavização de rolagem.

## Shapes

Áreas de trabalho retas e contínuas. Controles com cantos de 4–5px, diálogo com 8px. Ícones SVG lineares de traço consistente.

## Components

### Buttons

Ação principal verde, texto escuro e cantos de controle; secundária em raised; sutil transparente com texto muted. Todos usam hover em raised, exceto a principal, que usa primary-hover. Botões desabilitados têm opacidade 0.4 e cursor de indisponibilidade. Ícones são SVG de traço 1.6, geralmente 18px; botões de ícone medem 30px, ou 22px nas abas.

### Inputs / Fields

Fundo escuro, borda de 1px em divider e raio de campo. O filtro usa padding próprio; campos do diálogo usam 10px. O foco de teclado nos controles e elementos com tabindex usa contorno verde de 2px, deslocado -2px. O textarea do editor remove esse contorno e aplica à área de código uma linha inset de 1px em `#a3ff1220`; o cursor continua verde. Não registrar esse foco discreto como substituto geral do contorno.

### Navigation

Árvore de arquivos com recuo inicial de 10px e acréscimo de 15px por nível. O arquivo ativo recebe selected-surface e foreground. Abas ativas têm aria-selected e indicação inferior: 2px na cor da sessão para terminal, 1px verde para arquivo. Arraste entre abas reorganiza terminais; botões com setas e Ctrl+Shift+ArrowLeft/ArrowRight oferecem alternativas.

### Terminal panels

Superfícies contínuas, sem cartões arredondados; linhas de 1px separam painéis. Cada painel traz nome, cor e caminho inicial. Terminal focado usa linha inset em `#a3ff1230`; sessão encerrada usa ponto muted e texto explícito. O xterm recebe padding de 12px 8px 8px 16px, garantindo que seu cálculo de encaixe considere o espaço interno.

### Editor and resizing

O editor mostra alterações não salvas e exige confirmação para descarte. Divisores respondem a ponteiro e teclado, usam cursor de redimensionamento e ficam verdes no hover. Destinos de arraste mostram contorno verde tracejado de 2px, deslocado -6px no terminal e -5px no editor; aba de destino usa contorno verde de 1px, deslocado -1px.

## Do's and Don'ts

### Do:
- **Do** preservar proporções e cores dos logos oficiais.
- **Do** usar verde nas ações e nos estados de interação.
- **Do** acompanhar cor de sessão com nome e estado textual.
- **Do** preservar foco de teclado e alternativas ao arraste.

### Don't:
- **Don't** adicionar brilhos, gradientes ou animações decorativas.
- **Don't** redigitar o logo como tipografia da interface.
- **Don't** inserir afirmações fictícias sobre trabalho executado.
