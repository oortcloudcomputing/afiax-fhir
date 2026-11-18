// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { escapeHtml, renderEmail, renderTemplate } from './templates';

describe('Email templates', () => {
  test('Variables', () => {
    expect(renderTemplate('Hello {{name}}!', { name: 'Akinyi' }, false)).toBe('Hello Akinyi!');
    expect(renderTemplate('Hello {{ name }}!', { name: 'Akinyi' }, false)).toBe('Hello Akinyi!');
    expect(renderTemplate('[{{missing}}]', {}, false)).toBe('[]');
    expect(renderTemplate('{{a.b}}', { a: { b: 'deep' } }, false)).toBe('deep');
  });

  test('Escapes in HTML only', () => {
    const view = { name: `<b>"Tom" & 'Jerry'</b>` };
    expect(renderTemplate('{{name}}', view, true)).toBe('&lt;b&gt;&quot;Tom&quot; &amp; &#39;Jerry&#39;&lt;/b&gt;');
    expect(renderTemplate('{{name}}', view, false)).toBe(view.name);
    expect(escapeHtml('a&b')).toBe('a&amp;b');
  });

  test('Sections and inverted sections', () => {
    const t = '{{#on}}yes{{/on}}{{^on}}no{{/on}}';
    expect(renderTemplate(t, { on: true }, false)).toBe('yes');
    expect(renderTemplate(t, { on: false }, false)).toBe('no');
    expect(renderTemplate(t, {}, false)).toBe('no');
    expect(renderTemplate(t, { on: '' }, false)).toBe('no');
    expect(renderTemplate(t, { on: [] }, false)).toBe('no');
  });

  test('Lists and nested scope', () => {
    const t = '{{#items}}{{name}} of {{org}};{{/items}}';
    expect(renderTemplate(t, { org: 'Clinic', items: [{ name: 'a' }, { name: 'b' }] }, false)).toBe(
      'a of Clinic;b of Clinic;'
    );
    expect(renderTemplate('{{#list}}<{{.}}>{{/list}}', { list: ['x', 'y'] }, false)).toBe('<x><y>');
    expect(renderTemplate('{{#who}}{{name}}{{/who}}', { who: { name: 'Jane' } }, false)).toBe('Jane');
  });

  test('Standalone tag lines are removed', () => {
    const t = 'a\n{{#on}}\n  b\n{{/on}}\n{{! note }}\nc\n';
    expect(renderTemplate(t, { on: true }, false)).toBe('a\n  b\nc\n');
    expect(renderTemplate(t, { on: false }, false)).toBe('a\nc\n');
  });

  test('Rejects unsupported or broken templates', () => {
    expect(() => renderTemplate('{{{raw}}}', {}, true)).toThrow('Unsupported');
    expect(() => renderTemplate('{{> partial}}', {}, true)).toThrow('Unsupported');
    expect(() => renderTemplate('{{#a}}x', {}, true)).toThrow('Unclosed');
    expect(() => renderTemplate('{{#a}}x{{/b}}', {}, true)).toThrow('Unexpected closing');
  });

  test('Invite email', () => {
    const view = {
      firstName: 'Akinyi',
      email: 'akinyi@example.com',
      projectName: 'Nairobi West <Clinic>',
      roleLabel: 'Clinician',
      inviterName: 'Jane Wanjiku',
      inviterEmail: 'jane@example.com',
      newUser: true,
      setPasswordUrl: 'https://app.example.com/setpassword/1/abc?x=1&y=2',
      signInUrl: 'https://app.example.com/signin',
      signInHost: 'app.example.com/signin',
      mfaRequired: true,
      isStaff: true,
      supportEmail: 'support@example.com',
    };

    const email = renderEmail('invite', view);
    expect(email.subject).toBe('Jane Wanjiku invited you to Nairobi West <Clinic> on Afiax');
    expect(email.html).toContain('Nairobi West &lt;Clinic&gt;');
    expect(email.html).not.toContain('<Clinic>');
    expect(email.html).toContain('href="https://app.example.com/setpassword/1/abc?x=1&amp;y=2"');
    expect(email.html).toContain('Set up two-step sign-in');
    expect(email.html).not.toContain('{{');
    expect(email.text).toContain('https://app.example.com/setpassword/1/abc?x=1&y=2');
    expect(email.text).toContain('Invited by:          Jane Wanjiku <jane@example.com>');
    expect(email.text).not.toMatch(/\n\n\n/);
    expect(email.text).not.toContain('{{');

    const existing = renderEmail('invite', {
      ...view,
      newUser: false,
      setPasswordUrl: undefined,
      inviterName: undefined,
      mfaRequired: false,
    });
    expect(existing.subject).toBe('You now have access to Nairobi West <Clinic> on Afiax');
    expect(existing.html).toContain('Sign in to Afiax');
    expect(existing.html).not.toContain('Create my password');
    expect(existing.html).not.toContain('Invited by');
    expect(existing.text).toContain('Choose Nairobi West <Clinic>');
  });
});
