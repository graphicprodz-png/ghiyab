// تعمية كود الواجهة قبل بناء الـ APK: كل <script> داخلي يُحوَّل إلى كود غير مقروء.
// الأسماء العامة (الدوال المستعملة في onclick) تبقى كما هي حتى يعمل التطبيق.
import { readFileSync, writeFileSync } from 'node:fs';
import JavaScriptObfuscator from 'javascript-obfuscator';
const file = process.argv[2];
let html = readFileSync(file, 'utf8');
let n = 0, before = 0, after = 0;
html = html.replace(/<script>([\s\S]*?)<\/script>/g, (m, code) => {
  if (code.trim().length < 200) return m;
  const out = JavaScriptObfuscator.obfuscate(code, {
    compact: true,
    target: 'browser',
    renameGlobals: false,
    identifierNamesGenerator: 'hexadecimal',
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.15,
    deadCodeInjection: false,
    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayThreshold: 0.75,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    splitStrings: false,
    transformObjectKeys: false,
    unicodeEscapeSequence: false,
    selfDefending: false,
    disableConsoleOutput: false,
  }).getObfuscatedCode();
  n++; before += code.length; after += out.length;
  return '<script>' + out.replace(/<\/script/gi, '<\\/script') + '</script>';
});
writeFileSync(file, html);
console.log(`obfuscated ${n} script(s): ${before} -> ${after} chars`);
