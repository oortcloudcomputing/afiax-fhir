// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { EmailTemplateName } from './templates.generated';
import { emailTemplates } from './templates.generated';

/*
 * Renders the branded emails built in the oortcloud-email-templates repository.
 *
 * The templates use a small subset of Mustache, which that repository's build enforces:
 *   {{name}}               insert a value (HTML-escaped in the HTML part)
 *   {{#name}}...{{/name}}  show if set; repeat for each item if a list
 *   {{^name}}...{{/name}}  show if not set
 *   {{! note }}            comment
 * A line holding only a section, closing or comment tag is removed whole, as in Mustache,
 * so the plain-text parts don't fill up with blank lines.
 */

export type EmailView = Record<string, unknown>;

export interface RenderedEmail {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

type Token =
  | { readonly type: 'text'; readonly value: string }
  | { readonly type: 'name'; readonly name: string }
  | { readonly type: 'section' | 'inverted'; readonly name: string; readonly children: Token[] };

const TAG = /\{\{([#^/!]?)\s*([^}]*?)\s*\}\}/g;
const STANDALONE = /(?<=^|\n)[ \t]*(\{\{[#^/!][^}]*\}\})[ \t]*(?:\r?\n|$)/g;
const NAME = /^(\.|[A-Za-z_][\w-]*(\.[A-Za-z_][\w-]*)*)$/;

const parsed = new Map<string, Token[]>();

export function parseTemplate(template: string): Token[] {
  const cached = parsed.get(template);
  if (cached) {
    return cached;
  }

  const source = template.replace(STANDALONE, '$1');
  const root: Token[] = [];
  const open: { token: Extract<Token, { children: Token[] }>; parent: Token[] }[] = [];
  let current = root;
  let last = 0;

  for (const match of source.matchAll(TAG)) {
    const index = match.index;
    if (index > last) {
      current.push({ type: 'text', value: source.slice(last, index) });
    }
    last = index + match[0].length;

    const [, sigil, name] = match;
    if (sigil === '!') {
      continue;
    }
    if (!NAME.test(name)) {
      throw new Error(`Unsupported email template tag: ${match[0]}`);
    }
    if (sigil === '#' || sigil === '^') {
      const section: Extract<Token, { children: Token[] }> = {
        type: sigil === '#' ? 'section' : 'inverted',
        name,
        children: [],
      };
      current.push(section);
      open.push({ token: section, parent: current });
      current = section.children;
    } else if (sigil === '/') {
      const top = open.pop();
      if (top?.token.name !== name) {
        throw new Error(`Unexpected closing tag in email template: ${match[0]}`);
      }
      current = top.parent;
    } else {
      current.push({ type: 'name', name });
    }
  }

  if (open.length > 0) {
    throw new Error(`Unclosed section in email template: {{#${open[open.length - 1].token.name}}}`);
  }
  if (last < source.length) {
    current.push({ type: 'text', value: source.slice(last) });
  }

  parsed.set(template, root);
  return root;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function lookup(stack: readonly unknown[], name: string): unknown {
  if (name === '.') {
    return stack[stack.length - 1];
  }
  const [first, ...rest] = name.split('.');
  for (let i = stack.length - 1; i >= 0; i--) {
    const scope = stack[i];
    if (scope && typeof scope === 'object' && first in scope) {
      let value: unknown = (scope as Record<string, unknown>)[first];
      for (const key of rest) {
        value = value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined;
      }
      return value;
    }
  }
  return undefined;
}

/**
 * Converts a value for printing. Only plain values print; objects, lists and missing values print nothing.
 * @param value - The looked-up value.
 * @returns The text to insert.
 */
function toText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return value.toString();
  }
  return '';
}

function isEmpty(value: unknown): boolean {
  return !value || (Array.isArray(value) && value.length === 0);
}

function renderTokens(tokens: readonly Token[], stack: unknown[], escape: boolean): string {
  let out = '';
  for (const token of tokens) {
    if (token.type === 'text') {
      out += token.value;
    } else if (token.type === 'name') {
      const value = toText(lookup(stack, token.name));
      out += escape ? escapeHtml(value) : value;
    } else {
      const value = lookup(stack, token.name);
      if (token.type === 'inverted') {
        if (isEmpty(value)) {
          out += renderTokens(token.children, stack, escape);
        }
      } else if (Array.isArray(value)) {
        for (const item of value) {
          out += renderTokens(token.children, [...stack, item], escape);
        }
      } else if (!isEmpty(value)) {
        out += renderTokens(token.children, typeof value === 'object' ? [...stack, value] : stack, escape);
      }
    }
  }
  return out;
}

/**
 * Fills a template with values.
 * @param template - The template source.
 * @param view - The values.
 * @param escape - Whether to HTML-escape inserted values (true for HTML, false for text).
 * @returns The filled template.
 */
export function renderTemplate(template: string, view: EmailView, escape: boolean): string {
  return renderTokens(parseTemplate(template), [view], escape);
}

/**
 * Renders a branded email: subject, HTML part and plain-text part.
 * @param name - The template name, as built by oortcloud-email-templates.
 * @param view - The values the template's spec asks for.
 * @returns The subject line and both message parts.
 */
export function renderEmail(name: EmailTemplateName, view: EmailView): RenderedEmail {
  const template = emailTemplates[name];
  const subject = renderTemplate(template.subject, view, false).replaceAll(/\s+/g, ' ').trim();
  return {
    subject,
    // The page title is what some mail apps show for the message: keep it the subject.
    html: renderTemplate(template.html, view, true).replace(
      /<title>[\s\S]*?<\/title>/,
      () => `<title>${escapeHtml(subject)}</title>`
    ),
    text:
      renderTemplate(template.text, view, false)
        .replaceAll(/\n{3,}/g, '\n\n')
        .trim() + '\n',
  };
}
