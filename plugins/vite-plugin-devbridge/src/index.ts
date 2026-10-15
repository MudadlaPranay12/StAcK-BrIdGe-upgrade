import type { Plugin } from 'vite';
import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';
import generateModule from '@babel/generator';
import * as t from '@babel/types';
import crypto from 'node:crypto';
import path from 'node:path';
import type { DevIdentityRecord } from '@devbridge/protocol';

// Safely unwrap CJS/ESM default exports in Node 22+
// (traverseModule.default can itself be { default: [Function] } under ESM interop)
function unwrapDefault(mod: any): any {
  let curr = mod;
  while (curr && typeof curr === 'object' && 'default' in curr) {
    curr = curr.default;
  }
  return curr;
}

const traverse = unwrapDefault(traverseModule);
const generate = unwrapDefault(generateModule);

export interface DevBridgePluginOptions {
  agentUrl?: string;
  agentToken?: string;
}

export function devbridgePlugin(options: DevBridgePluginOptions = {}): Plugin {
  const agentUrl = options.agentUrl || 'http://127.0.0.1:4321';
  const agentToken = options.agentToken || process.env.DEVBRIDGE_TOKEN || 'devbridge-local-secret';
  let projectRoot = process.cwd();

  return {
    name: 'vite-plugin-devbridge',
    enforce: 'pre',
    apply: 'serve', // strictly dev-only; never runs in production build

    configResolved(config) {
      projectRoot = config.root;
    },

    // Official Vite HTML tag injection (guaranteed to run before app code,
    // immune to <head> string-replace ordering issues with e.g. Tailwind CDN)
    transformIndexHtml() {
      return [
        {
          tag: 'script',
          attrs: { type: 'module' },
          injectTo: 'head-prepend',
          children: `
            window.__DEVBRIDGE_LAST_DEV_ID__ = null;
            window.addEventListener('pointerdown', (e) => {
              const el = e.target?.closest?.('[data-dev-id]');
              if (el) {
                window.__DEVBRIDGE_LAST_DEV_ID__ = el.getAttribute('data-dev-id');
              }
            }, true);
            window.addEventListener('click', (e) => {
              const el = e.target?.closest?.('[data-dev-id]');
              if (el) {
                window.__DEVBRIDGE_LAST_DEV_ID__ = el.getAttribute('data-dev-id');
              }
            }, true);

            const origFetch = window.fetch;
            window.fetch = async function(input, init = {}) {
              const devId = window.__DEVBRIDGE_LAST_DEV_ID__;
              const traceId = 'trc_' + Math.random().toString(36).slice(2, 10);
              const headers = new Headers(init.headers || {});
              if (devId) headers.set('X-DevBridge-Dev-Id', devId);
              headers.set('X-DevBridge-Trace-Id', traceId);
              return origFetch.call(this, input, { ...init, headers });
            };
            console.log('[DevBridge Runtime] Fetch & DOM tracker active');
          `,
        },
      ];
    },

    async transform(code, id) {
      const cleanId = id.split('?')[0];
      if (cleanId.includes('node_modules') || !/\.(tsx|jsx)$/.test(cleanId)) {
        return null;
      }

      try {
        const relFile = path.relative(projectRoot, cleanId).replace(/\\/g, '/');

      const ast = parse(code, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript'],
      });

      const records: DevIdentityRecord[] = [];
      let currentComponent = 'Anonymous';

      traverse(ast, {
        FunctionDeclaration(p: any) {
          if (p.node.id?.name && /^[A-Z]/.test(p.node.id.name)) {
            currentComponent = p.node.id.name;
          }
        },
        VariableDeclarator(p: any) {
          if (t.isIdentifier(p.node.id) && /^[A-Z]/.test(p.node.id.name)) {
            currentComponent = p.node.id.name;
          }
        },
        JSXElement(p: any) {
          const element = p.node as t.JSXElement;
          const node = element.openingElement as t.JSXOpeningElement;
          if (!node.loc || !element.loc) return;

          // Skip React Fragments
          let tagName = 'unknown';
          if (t.isJSXIdentifier(node.name)) {
            tagName = node.name.name;
          } else if (t.isJSXMemberExpression(node.name)) {
            tagName = 'MemberExpression';
          }
          if (tagName === 'Fragment' || tagName === 'React.Fragment') return;

          // Skip if already has data-dev-id
          const hasAttr = node.attributes.some(
            (attr) => t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name, { name: 'data-dev-id' })
          );
          if (hasAttr) return;

          const { start, end } = element.loc;
          const rawKey = `${relFile}:${start.line}:${start.column}:${currentComponent}:${tagName}`;
          const hash = crypto.createHash('sha1').update(rawKey).digest('hex').slice(0, 8);
          const devId = `dvi_${hash}`;

          // Check for static className attribute to allow surgical Tailwind editing
          let classNameRange: DevIdentityRecord['classNameRange'] | undefined;
          const stringProps: NonNullable<DevIdentityRecord['stringProps']> = [];
          for (const attr of node.attributes) {
            if (
              t.isJSXAttribute(attr) &&
              t.isJSXIdentifier(attr.name) &&
              t.isStringLiteral(attr.value as any) &&
              (attr.value as t.StringLiteral).loc
            ) {
              const lit = attr.value as t.StringLiteral;
              const range = {
                rawValue: lit.value,
                start: { line: lit.loc!.start.line, column: lit.loc!.start.column },
                end: { line: lit.loc!.end.line, column: lit.loc!.end.column },
              };
              if (attr.name.name === 'className') {
                classNameRange = range;
              } else {
                stringProps.push({ name: attr.name.name as string, ...range });
              }
            }
          }

          // Capture single static text child for surgical innerText editing
          // Supports: <button>Label</button> and <button>{"Label"}</button>
          let textRange: DevIdentityRecord['textRange'] | undefined;
          const meaningful = element.children.filter((c) => {
            if (t.isJSXText(c)) return c.value.trim() !== '';
            if (
              t.isJSXExpressionContainer(c) &&
              !t.isJSXEmptyExpression(c.expression) &&
              !t.isJSXElement(c.expression as any) &&
              !t.isJSXFragment(c.expression as any)
            )
              return true;
            if (t.isJSXElement(c) || t.isJSXFragment(c)) return true;
            return false;
          });
          if (meaningful.length === 1) {
            const only = meaningful[0];
            if (t.isJSXText(only) && only.loc) {
              textRange = {
                rawValue: only.value.trim().replace(/\s+/g, ' '),
                start: { line: only.loc.start.line, column: only.loc.start.column },
                end: { line: only.loc.end.line, column: only.loc.end.column },
              };
            } else if (
              t.isJSXExpressionContainer(only) &&
              t.isStringLiteral(only.expression as any) &&
              (only.expression as t.StringLiteral).loc
            ) {
              const lit = only.expression as t.StringLiteral;
              textRange = {
                rawValue: lit.value,
                start: { line: lit.loc!.start.line, column: lit.loc!.start.column },
                end: { line: lit.loc!.end.line, column: lit.loc!.end.column },
              };
            }
          }

          // Inject data-dev-id="dvi_..." into JSX AST
          node.attributes.push(
            t.jsxAttribute(t.jsxIdentifier('data-dev-id'), t.stringLiteral(devId))
          );

          records.push({
            id: devId,
            componentName: currentComponent,
            tagName,
            file: relFile,
            start: { line: start.line, column: start.column },
            end: { line: end.line, column: end.column },
            classNameRange,
            textRange,
            stringProps: stringProps.length > 0 ? stringProps : undefined,
          });
        },
      });

      if (records.length === 0) return null;

        console.log(`[DevBridge Vite] Stamped ${records.length} elements in ${relFile}`);

        // Sync records to the Local Agent asynchronously
        fetch(`${agentUrl}/api/v1/identities/batch`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-DevBridge-Token': agentToken,
          },
          body: JSON.stringify({ records }),
        }).catch((err) => {
          console.error('[DevBridge Vite] Failed to sync identities to agent:', (err as Error).message);
        });

        const output = generate(ast, { retainLines: true, sourceMaps: true }, code);
        return {
          code: output.code,
          map: output.map,
        };
      } catch (err) {
        console.error(`[DevBridge Vite] AST Transform error in ${cleanId}:`, err);
        return null;
      }
    },
  };
}
