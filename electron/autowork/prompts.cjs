'use strict';
const { TASK_FILE } = require('./sandbox.cjs');

const list = items => items.length ? items.map(i => '- ' + i).join('\n') : '- (nenhum)';

function plan(ctx, state) {
  return `Você é o orquestrador do modo auto-work de um projeto de software. Está num worktree git isolado (branch autowork).
Pode ler arquivos (Read/Grep/Glob) se precisar, mas seja econômico: o contexto abaixo já resume o projeto.

## Regras do projeto
${ctx.agents || '(sem AGENTS.md)'}

## Produto
${ctx.product || '(sem descrição)'}

## Commits recentes
${ctx.log || '(nenhum)'}

## Arquivos
${ctx.files}

## Já feito nesta sessão
${list(state.commits.map(c => c.title))}

## Falhou nesta sessão (não repetir igual)
${list(state.failures.map(f => f.title))}

## Ideias enviadas pelo usuário (priorize)
${list(state.ideas)}

Proponha as 5 próximas tarefas mais valiosas. Cada uma deve caber num único commit revisável (idealmente < 300 linhas), ser verificável pelos testes e respeitar as regras do projeto. Prefira correções, robustez, testes e melhorias pedidas, antes de grandes features.
Responda SOMENTE com JSON, sem texto extra:
{"options":[{"title":"até 70 caracteres","why":"até 140 caracteres","size":"P|M|G"}],"recommended":0}`;
}

function spec(task, ctx) {
  return `Escreva instruções para um agente de código (modelo menor) implementar esta tarefa no projeto atual.
Tarefa: ${task.title}
Motivo: ${task.why || '-'}

Regras do projeto (resumo):
${(ctx.agents || '').slice(0, 2500)}

Leia apenas o necessário. Entregue: arquivos a alterar, passos concretos, critérios de aceite e testes a criar/ajustar. Máximo de 300 palavras, texto puro, em português.`;
}

function taskFile(task, specText, feedback) {
  return `# Tarefa auto-work
${task.title}

${specText}
${feedback ? `\n## Correções pedidas na tentativa anterior\n${feedback}\n` : ''}
## Regras obrigatórias
- Trabalhe somente nesta pasta. Não faça commit, push, rebase nem troque de branch.
- Não leia nem edite .git, .env, chaves ou credenciais. Não instale dependências novas.
- Siga AGENTS.md / CLAUDE.md quando existirem.
- Se existir script de teste, rode \`npm test\` e corrija falhas causadas pela sua mudança.
- Não edite nem apague este arquivo (${TASK_FILE}).
- Ao terminar, responda com um resumo de uma linha.`;
}

function review(task, diff, tests) {
  return `Revise a implementação da tarefa abaixo, feita por outro agente num worktree. Você pode ler arquivos para confirmar algo, mas não edite nada.
Tarefa: ${task.title}
Testes: ${tests.ran ? (tests.ok ? 'passaram' : 'FALHARAM') : 'sem script de teste'}
${tests.ran && !tests.ok ? 'Saída dos testes (final):\n' + tests.output.slice(-1500) + '\n' : ''}
Resumo: ${diff.stat}

Diff:
${diff.text}

Aprove somente se a tarefa foi cumprida, não há regressão, segurança ou violação das regras do projeto, e os testes passaram.
Responda SOMENTE com JSON:
{"approve":true|false,"feedback":"o que corrigir, até 400 caracteres","commit":"mensagem de commit convencional em pt-BR, até 72 caracteres"}`;
}

module.exports = { plan, spec, taskFile, review };
