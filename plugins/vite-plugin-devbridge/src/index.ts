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
              try {
                const response = await origFetch.call(this, input, { ...init, headers });
                if (!response.ok) {
                  window.postMessage({ source: 'devbridge-runtime', type: 'NETWORK_FAILURE', url: String(input), statusCode: response.status, traceId, devId }, '*');
                }
                return response;
              } catch (error) {
                window.postMessage({ source: 'devbridge-runtime', type: 'NETWORK_FAILURE', url: String(input), statusCode: 0, traceId, devId, errorMessage: error && error.message ? error.message : 'Network request failed' }, '*');
                throw error;
              }
            };
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
        if (!relFile || relFile.startsWith('../') || path.isAbsolute(relFile)) return null;

      const ast = parse(code, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript'],
        sourceFilename: cleanId,
      });

      const records: DevIdentityRecord[] = [];
      let currentComponent = 'Anonymous';
      // Ancestor data-dev-id stack for Component Tree nesting (parentId)
      const elementStack: string[] = [];
      const pushedElements = new WeakSet<object>();

      // className="..." OR className={cn("...", ...)} / clsx(...) OR className={`...`}
      // returns the first statically-editable string range found.
      function extractClassName(
        attr: t.JSXAttribute
      ): DevIdentityRecord['classNameRange'] | undefined {
        if (t.isStringLiteral(attr.value as any) && (attr.value as t.StringLiteral).loc) {
          const lit = attr.value as t.StringLiteral;
          return {
            rawValue: lit.value,
            syntax: 'quoted',
            start: { line: lit.loc!.start.line, column: lit.loc!.start.column },
            end: { line: lit.loc!.end.line, column: lit.loc!.end.column },
          };
        }
        if (!t.isJSXExpressionContainer(attr.value)) return undefined;
        const expr = attr.value.expression;
        // cn("bg-blue-600", cond && "px-4") / clsx(...) / twMerge(...) — first static string wins
        if (t.isCallExpression(expr)) {
          const callee = expr.callee;
          const name = t.isIdentifier(callee)
            ? callee.name
            : t.isMemberExpression(callee) && t.isIdentifier(callee.property)
              ? (callee.property.name as string)
              : '';
          if (!/^(cn|clsx|clsxm|twMerge|twJoin)$/.test(name)) return undefined;
          const firstStrArg = expr.arguments.find((arg) => t.isStringLiteral(arg)) as
            | t.StringLiteral
            | undefined;
          if (firstStrArg?.loc) {
            return {
              rawValue: firstStrArg.value,
              syntax: 'quoted',
              start: { line: firstStrArg.loc.start.line, column: firstStrArg.loc.start.column },
              end: { line: firstStrArg.loc.end.line, column: firstStrArg.loc.end.column },
            };
          }
          return undefined;
        }
        // className={`bg-blue-600`} — static template literal without expressions
        if (t.isTemplateLiteral(expr) && expr.expressions.length === 0 && expr.quasis.length === 1) {
          const quasi = expr.quasis[0];
          if (quasi.loc) {
            return {
              rawValue: quasi.value.cooked ?? quasi.value.raw,
              syntax: 'template',
              start: { line: quasi.loc.start.line, column: quasi.loc.start.column },
              end: { line: quasi.loc.end.line, column: quasi.loc.end.column },
            };
          }
        }
        return undefined;
      }

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
        JSXElement: {
          enter(p: any) {
          const element = p.node as t.JSXElement;
          const node = element.openingElement as t.JSXOpeningElement;
          if (!node.loc || !element.loc) return;

          // Skip React Fragments
          let tagName = 'unknown';
           if (t.isJSXIdentifier(node.name)) {
             tagName = node.name.name;
           } else if (t.isJSXMemberExpression(node.name)) {
             const memberParts: string[] = [];
             let member: any = node.name;
             while (t.isJSXMemberExpression(member)) {
               memberParts.unshift(member.property.name);
               member = member.object;
             }
             if (t.isJSXIdentifier(member)) memberParts.unshift(member.name);
             tagName = memberParts.join('.') || 'MemberExpression';
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
          const parentId = elementStack.length > 0 ? elementStack[elementStack.length - 1] : undefined;

          // Static className, cn()/clsx() first string, or static template literal
          let classNameRange: DevIdentityRecord['classNameRange'] | undefined;
          const stringProps: NonNullable<DevIdentityRecord['stringProps']> = [];
          for (const attr of node.attributes) {
            if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name)) continue;
            if (attr.name.name === 'className') {
              classNameRange = extractClassName(attr) ?? classNameRange;
              continue;
            }
            if (
              t.isStringLiteral(attr.value as any) &&
              (attr.value as t.StringLiteral).loc
            ) {
              const lit = attr.value as t.StringLiteral;
              stringProps.push({
                name: attr.name.name as string,
                rawValue: lit.value,
                start: { line: lit.loc!.start.line, column: lit.loc!.start.column },
                end: { line: lit.loc!.end.line, column: lit.loc!.end.column },
              });
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
            parentId,
            classNameRange,
            textRange,
            stringProps: stringProps.length > 0 ? stringProps : undefined,
           });
           elementStack.push(devId);
           pushedElements.add(element);
           },
          exit(p: any) {
            if (pushedElements.has(p.node)) elementStack.pop();
          },
        },
      });

      if (records.length === 0) return null;

        console.log(`[DevBridge Vite] Stamped ${records.length} elements in ${relFile}`);

        // Sync records to the Local Agent asynchronously (file key lets the
        // agent evict stale identities from this file on HMR re-transforms)
        fetch(`${agentUrl}/api/v1/identities/batch`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-DevBridge-Token': agentToken,
          },
          body: JSON.stringify({ file: relFile, records }),
        }).catch((err) => {
          console.error('[DevBridge Vite] Failed to sync identities to agent:', (err as Error).message);
        });

        const output = generate(ast, { retainLines: true, sourceMaps: true, sourceFileName: cleanId }, code);
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
