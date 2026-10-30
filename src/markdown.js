import { marked, Renderer } from 'marked';
import DOMPurify from 'dompurify';

export function renderMarkdown(text) {
  const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  const renderer=new Renderer();
  renderer.image=({href,text})=>`<span data-markdown-image="${encodeURIComponent(href)}">${escape(text||'Imagem')}</span>`;
  return DOMPurify.sanitize(marked.parse(text, { gfm:true, breaks:false, renderer }), {
    USE_PROFILES: { html:true },
    FORBID_TAGS: ['style','iframe','form','input','button','textarea','img','audio','video','object','embed'],
    FORBID_ATTR: ['style','src','srcset','target'],
  });
}
