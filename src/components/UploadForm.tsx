import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import type { FormEvent, ChangeEvent, MouseEvent } from 'react';
import { nanoid } from 'nanoid';
import { Plus, X, AlertCircle, Copy, Check, ExternalLink, RefreshCw, ListTree, MessageSquarePlus } from 'lucide-react';
import { useShikiHighlighter } from 'react-shiki';

interface UploadResult {
  slug: string;
  cid: string;
  filename: string;
  mime: string;
  size: number;
  url: string;
  directUrl: string;
}

interface Tab {
  id: string;
  filename: string;
  code: string;
  language: string;
  manualLanguage: boolean;
}

interface TodoItem {
  id: string;
  tabId: string;
  filename: string;
  tag: string;
  text: string;
  line: number;
  column: number;
}

const TODO_TAGS = ['TODO', 'FIXME', 'BUG'];

const TODO_COLORS: Record<string, string> = {
  TODO: 'rgba(255,255,64,0.25)',
  FIXME: 'rgba(255,80,80,0.35)',
  BUG: 'rgba(255,140,0,0.35)',
};

const TODO_TEXT_COLORS: Record<string, string> = {
  TODO: '#0b0f19',
  FIXME: '#0b0f19',
  BUG: '#0b0f19',
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

const LANGUAGE_OVERRIDES: Record<string, string> = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  tsx: 'tsx',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  cpp: 'cpp',
  cc: 'cpp',
  hpp: 'cpp',
  c: 'c',
  h: 'c',
  cs: 'csharp',
  php: 'php',
  swift: 'swift',
  kt: 'kotlin',
  kts: 'kotlin',
  scala: 'scala',
  r: 'r',
  sh: 'shellscript',
  bash: 'bash',
  zsh: 'zsh',
  fish: 'fish',
  ps1: 'powershell',
  ps: 'powershell',
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  sass: 'sass',
  less: 'less',
  json: 'json',
  jsonc: 'jsonc',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  xml: 'xml',
  svg: 'svg',
  md: 'markdown',
  mdx: 'mdx',
  vue: 'vue',
  svelte: 'svelte',
  astro: 'astro',
  sql: 'sql',
  graphql: 'graphql',
  gql: 'graphql',
  dockerfile: 'dockerfile',
  make: 'makefile',
  mk: 'makefile',
  lua: 'lua',
  vim: 'vimscript',
  elixir: 'elixir',
  ex: 'elixir',
  exs: 'elixir',
  erl: 'erlang',
  clj: 'clojure',
  cljs: 'clojure',
  hs: 'haskell',
  lhs: 'haskell',
  groovy: 'groovy',
  matlab: 'matlab',
  perl: 'perl',
  pl: 'perl',
  pm: 'perl',
  tex: 'latex',
  latex: 'latex',
  sol: 'solidity',
  nim: 'nim',
  dart: 'dart',
  fs: 'fsharp',
  fsx: 'fsharp',
  ml: 'ocaml',
  mli: 'ocaml',
  julia: 'julia',
  jl: 'julia',
};

const COMMON_LANGUAGES = [
  'astro', 'bash', 'c', 'cpp', 'clojure', 'csharp', 'css', 'dart', 'dockerfile', 'elixir',
  'erlang', 'fsharp', 'go', 'graphql', 'haskell', 'html', 'java', 'javascript', 'json', 'jsonc',
  'jsx', 'julia', 'kotlin', 'latex', 'less', 'lua', 'markdown', 'mdx', 'nim', 'ocaml', 'perl', 'php',
  'plaintext', 'powershell', 'python', 'r', 'ruby', 'rust', 'sass', 'scala', 'scss', 'shellscript',
  'solidity', 'sql', 'svelte', 'swift', 'toml', 'typescript', 'tsx', 'vue', 'xml', 'yaml', 'zig',
];

const LANGUAGE_EXTENSION: Record<string, string> = Object.entries(LANGUAGE_OVERRIDES).reduce(
  (acc, [ext, lang]) => {
    if (!acc[lang]) acc[lang] = ext;
    return acc;
  },
  {} as Record<string, string>
);
LANGUAGE_EXTENSION.bash = 'sh';
LANGUAGE_EXTENSION.dockerfile = 'Dockerfile';
LANGUAGE_EXTENSION.java = 'java';
LANGUAGE_EXTENSION.makefile = 'Makefile';
LANGUAGE_EXTENSION.perl = 'pl';
LANGUAGE_EXTENSION.plaintext = 'txt';
LANGUAGE_EXTENSION.text = 'txt';

const CODE_HINTS: [string, RegExp, number][] = [
  ['html', /<![Dd][Oo][Cc][Tt][Yy][Pp][Ee]\s+html/i, 8],
  ['html', /<html\b/i, 7],
  ['html', /<[a-z][a-z0-9]*[^>]*>[^<]*<\/[a-z][a-z0-9]*>/i, 4],
  ['css', /@media|@import|@keyframes/i, 3],
  ['css', /[.#][\w-]+\s*\{[^}]*:[^};]+;/, 3],
  ['javascript', /\b(const|let|var|function)\s+\w+[\s=(]/, 4],
  ['javascript', /\bconsole\.log|require\(|module\.exports|document\.|window\./, 5],
  ['javascript', /^import\s+.*\s+from\s+['"]/m, 5],
  ['javascript', /=>|\bexport\s+(default\s+)?(const|let|function|class)\b/, 4],
  ['typescript', /\binterface\s+\w+\s*[<{]/, 8],
  ['typescript', /\btype\s+\w+\s*[=<]/, 6],
  ['typescript', /:\s*(string|number|boolean|any|unknown|never|void)\b/, 4],
  ['python', /\bdef\s+\w+\s*\(/, 3],
  ['python', /\bimport\s+\w+/, 2],
  ['python', /if\s+__name__\s*==\s*['"]__main__['"]:/, 5],
  ['python', /:\s*$/, 1],
  ['ruby', /\bdef\s+\w+(\s|\()/, 3],
  ['ruby', /\bputs\s|attr_accessor\b/, 2],
  ['ruby', /^\s*end\s*$/m, 2],
  ['ruby', /\belsif\b/, 2],
  ['go', /^package\s+\w+$/m, 5],
  ['go', /\bfunc\s+\w+\s*\(/, 3],
  ['go', /:=\s/, 2],
  ['rust', /\bfn\s+\w+\s*\(/, 3],
  ['rust', /\blet\s+mut\b/, 3],
  ['rust', /\bimpl\s|Option<|Result<|unsafe\b/, 2],
  ['cpp', /#include\s*<[^>]+>/, 3],
  ['cpp', /\bstd::|using\s+namespace\s+std\b/, 3],
  ['cpp', /\bcout\s*<<|cin\s*>>|nullptr\b/, 3],
  ['c', /\bprintf\(|malloc\(|int\s+main\s*\(/, 3],
  ['c', /\bstruct\s+\w+\s*\{|typedef\s+\w+\s+\w+;/, 2],
  ['csharp', /^\s*using\s+System;/m, 4],
  ['csharp', /\bnamespace\s+\w+|public\s+class\b/, 2],
  ['java', /^\s*import\s+java\./m, 4],
  ['java', /^\s*public\s+class\s+\w+/m, 3],
  ['java', /\bpublic\s+static\s+void\s+main|System\.out\.println\b/, 4],
  ['php', /<\?php/, 5],
  ['php', /\$\w+/, 2],
  ['shellscript', /^\s*echo\s/m, 1],
  ['shellscript', /^\s*if\s+\[/m, 2],
  ['shellscript', /^\s*fi\s*$/m, 2],
  ['shellscript', /^\s*done\s*$/m, 2],
  ['bash', /^\s*#!.*bash/m, 5],
  ['zsh', /^\s*#!.*zsh/m, 5],
  ['powershell', /Write-Host|Get-ChildItem|Set-Location|Where-Object|\$PSVersionTable/, 3],
  ['sql', /\bSELECT\s+[\w*\s,]+\s+FROM\s+\w+/i, 3],
  ['sql', /\b(INSERT INTO|UPDATE\s+\w+\s+SET|CREATE TABLE|DELETE FROM|JOIN\s+\w+\s+ON)\b/i, 3],
  ['json', /^\s*[\[{][\s\S]*[\]}]\s*$/m, 8],
  ['json', /"[\w-]+"\s*:\s*(true|false|null|-?\d+(\.\d+)?|"[^"]*")/, 4],
  ['yaml', /^---\s*$/m, 6],
  ['yaml', /^\w[\w-]*:\s*\S/m, 4],
  ['markdown', /^#{2,6}\s+\S/m, 3],
  ['markdown', /^\[.+\]\(.+\)$/m, 2],
  ['xml', /<\?xml\b/, 5],
  ['xml', /<[\w:-]+[^>]*>[^<]*<\/[\w:-]+>/, 2],
  ['dockerfile', /^FROM\s+\S+/m, 4],
  ['makefile', /^\.PHONY:/m, 4],
  ['graphql', /\btype\s+\w+\s*\{/, 3],
  ['graphql', /\b(query|mutation)\s+\w*\s*\{/, 2],
  ['vue', /<template>/, 3],
  ['vue', /<script.*>.*export\s+default/s, 3],
  ['svelte', /\{#if|\{#each|\{@html/, 3],
  ['lua', /\blocal\s+\w+/, 2],
  ['lua', /^\s*end\s*$/m, 2],
  ['haskell', /\bmodule\s+\w+\s+where\b/, 4],
  ['haskell', /::|->|<-/, 2],
  ['elixir', /\bdefmodule\s+\w+/, 4],
  ['elixir', /\bdef\s+\w+(\s|\()do/, 3],
  ['clojure', /\(defn\s/, 3],
  ['clojure', /\(ns\s/, 3],
  ['perl', /^\s*#!.*perl/m, 5],
  ['latex', /\\documentclass|\\begin\{|\\section\{/, 4],
  ['dart', /^import\s+['"](dart:|package:)/m, 4],
  ['kotlin', /\bfun\s+\w+\s*\(/, 3],
  ['kotlin', /\bval\s+\w+|\bvar\s+\w+/, 2],
  ['swift', /\bimport\s+(UIKit|SwiftUI|Foundation)/, 3],
  ['swift', /\bfunc\s+\w+\s*\(|\bguard\s+let/, 2],
  ['scala', /\bobject\s+\w+|\bdef\s+\w+\s*\(/, 3],
  ['r', /[\w\s]+\s*<-\s*/, 2],
  ['r', /\blibrary\(|data\.frame\(/, 2],
];

function detectCodeLanguage(code: string): string | null {
  const sample = code.trim().slice(0, 1500);
  if (!sample) return null;

  if (/^\s*[\[{][\s\S]*[\]}]\s*$/.test(sample)) {
    try {
      JSON.parse(sample);
      return 'json';
    } catch {
      // Continue with the other language heuristics for JSON-like code.
    }
  }

  const shebang = sample.match(/^#!.*\/(?:env\s+)?(\w+)(?:\d+)?(?:\s|$)/m);
  if (shebang) {
    const cmd = shebang[1].replace(/\d+$/, '').toLowerCase();
    const map: Record<string, string> = {
      node: 'javascript',
      python: 'python',
      ruby: 'ruby',
      php: 'php',
      perl: 'perl',
      bash: 'bash',
      sh: 'shellscript',
      zsh: 'zsh',
      fish: 'fish',
    };
    if (map[cmd]) return map[cmd];
  }

  const scores: Record<string, number> = {};
  for (const [lang, regex, weight] of CODE_HINTS) {
    if (regex.test(sample)) scores[lang] = (scores[lang] || 0) + weight;
  }

  const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (!entries.length || entries[0][1] < 3) return null;
  if (entries.length > 1 && entries[0][1] === entries[1][1]) return null;
  let best = entries[0][0];

  const hasJsxTag = /<[A-Z][\w]*\s*\/?>/.test(sample);
  if (hasJsxTag && (best === 'javascript' || best === 'typescript')) {
    best = best === 'typescript' ? 'tsx' : 'jsx';
  }

  return best;
}

const EXPIRY_OPTIONS = [
  { label: 'Never', value: 0 },
  { label: '1 hour', value: 3600 },
  { label: '6 hours', value: 21600 },
  { label: '12 hours', value: 43200 },
  { label: '1 day', value: 86400 },
  { label: '3 days', value: 259200 },
  { label: '1 week', value: 604800 },
  { label: '3 weeks', value: 1814400 },
  { label: '1 month', value: 2592000 },
  { label: '3 months', value: 7776000 },
  { label: '6 months', value: 15552000 },
  { label: '1 year', value: 31536000 },
];

const PASSPHRASE_WORDS = [
  'active', 'amber', 'anchor', 'apple', 'arrow', 'autumn', 'beach', 'berry', 'black', 'blue',
  'book', 'brick', 'bright', 'bronze', 'cactus', 'camel', 'canoe', 'castle', 'cedar', 'cherry',
  'cloud', 'cobalt', 'coral', 'crimson', 'crystal', 'delta', 'diamond', 'drum', 'eagle', 'echo',
  'emerald', 'evening', 'falcon', 'flame', 'forest', 'fossil', 'frost', 'galaxy', 'garden', 'gate',
  'gentle', 'glacier', 'golden', 'granite', 'grape', 'green', 'harbor', 'hazel', 'hill', 'honest',
  'horizon', 'ice', 'ink', 'iron', 'ivory', 'jade', 'jazz', 'jet', 'jungle', 'karma', 'kettle',
  'lantern', 'large', 'lemon', 'lily', 'lime', 'lotus', 'lunar', 'maple', 'marine', 'meadow',
  'mint', 'mist', 'modern', 'moon', 'moss', 'music', 'night', 'noble', 'oasis', 'ocean', 'olive',
  'onyx', 'opal', 'orange', 'orbit', 'palm', 'peach', 'pearl', 'pine', 'pixel', 'plum', 'prism',
  'quiet', 'rain', 'rapid', 'result', 'river', 'robin', 'rose', 'royal', 'ruby', 'rust', 'sage',
  'sand', 'sapphire', 'shadow', 'silence', 'silver', 'sky', 'snow', 'solar', 'space', 'spring',
  'star', 'storm', 'summer', 'sun', 'swift', 'tango', 'teal', 'thunder', 'tiger', 'topaz',
  'travel', 'tree', 'truth', 'turquoise', 'valley', 'violet', 'voice', 'warm', 'water', 'wave',
  'whale', 'whisper', 'white', 'wild', 'willow', 'wind', 'winter', 'wolf', 'wood', 'zen',
];

function getRandomInt(max: number): number {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return arr[0] % max;
  }
  return Math.floor(Math.random() * max);
}

function generatePassphrase(): string {
  const words: string[] = [];
  for (let i = 0; i < 3; i += 1) {
    words.push(PASSPHRASE_WORDS[getRandomInt(PASSPHRASE_WORDS.length)]);
  }
  return words.join(' ');
}

const INDENT_COLORS = [
  'rgba(255,255,64,0.12)',
  'rgba(127,255,127,0.12)',
  'rgba(255,127,255,0.12)',
  'rgba(79,236,236,0.12)',
];
const INDENT_ERROR_COLOR = 'rgba(128,32,32,0.6)';
const INDENT_TAB_MIX_COLOR = 'rgba(128,32,96,0.6)';
const INDENT_TAB_SIZE = 2;

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const LINE_COMMENT_PREFIXES: Record<string, string> = {
  python: '#',
  ruby: '#',
  shellscript: '#',
  bash: '#',
  zsh: '#',
  yaml: '#',
  perl: '#',
  dockerfile: '#',
  makefile: '#',
};

const BLOCK_COMMENT_WRAPPERS: Record<string, [string, string]> = {
  html: ['<!-- ', ' -->'],
  xml: ['<!-- ', ' -->'],
  astro: ['{/* ', ' */}'],
  svelte: ['<!-- ', ' -->'],
  vue: ['<!-- ', ' -->'],
  mdx: ['{/* ', ' */}'],
  markdown: ['<!-- ', ' -->'],
  css: ['/* ', ' */'],
  scss: ['/* ', ' */'],
  sass: ['/* ', ' */'],
  less: ['/* ', ' */'],
};

function getCommentPrefix(language: string): string {
  if (LINE_COMMENT_PREFIXES[language]) return LINE_COMMENT_PREFIXES[language];
  if (['lua', 'haskell', 'latex'].includes(language)) return '--';
  if (language === 'latex') return '%';
  return '//';
}

function buildTodoComment(tag: string, text: string, language: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  const body = clean ? ` ${clean}` : '';
  const wrappers = BLOCK_COMMENT_WRAPPERS[language];
  if (wrappers) {
    return `${wrappers[0]}${tag}:${body}${wrappers[1]}`;
  }
  return `${getCommentPrefix(language)} ${tag}:${body}`;
}

function extractTodos(code: string, tabId: string, filename: string): TodoItem[] {
  const todos: TodoItem[] = [];
  const tagPattern = TODO_TAGS.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const regex = new RegExp(`^(?:[ \\t]*)(?://|#|;|--|/\\*|<!--)(\\s*)(${tagPattern})\\b(.*)$`);
  const lines = code.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const m = lines[i].match(regex);
    if (m) {
      const tag = m[2];
      const text = m[3].trim().replace(/^(?:\s*:?\s*)/, '');
      const column = lines[i].indexOf(tag) + 1;
      todos.push({
        id: `${tabId}-${i}`,
        tabId,
        filename,
        tag,
        text,
        line: i + 1,
        column,
      });
    }
  }
  return todos;
}

function renderIndentHtml(leading: string): string {
  if (!leading) return '';

  const hasSpace = leading.includes(' ');
  const hasTab = leading.includes('\t');

  if (hasSpace && hasTab) {
    return `<span style="background-color:${INDENT_TAB_MIX_COLOR}">${escapeHtml(leading)}</span>`;
  }

  let html = '';
  if (hasTab) {
    for (let i = 0; i < leading.length; i += 1) {
      const color = INDENT_COLORS[i % INDENT_COLORS.length];
      html += `<span style="background-color:${color}">\t</span>`;
    }
  } else {
    const fullUnits = Math.floor(leading.length / INDENT_TAB_SIZE);
    const remainder = leading.length % INDENT_TAB_SIZE;
    for (let i = 0; i < fullUnits; i += 1) {
      const color = INDENT_COLORS[i % INDENT_COLORS.length];
      html += `<span style="background-color:${color}">${' '.repeat(INDENT_TAB_SIZE)}</span>`;
    }
    if (remainder > 0) {
      html += `<span style="background-color:${INDENT_ERROR_COLOR}">${escapeHtml(leading.slice(fullUnits * INDENT_TAB_SIZE))}</span>`;
    }
  }

  return html;
}

function highlightTodoInLine(text: string): string {
  const tagPattern = TODO_TAGS.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const regex = new RegExp(`^(?://|#|;|--|/\\*|<!--)(\\s*)(${tagPattern})\\b(.*)$`);
  const m = text.match(regex);
  if (!m) return escapeHtml(text);

  const marker = m[1];
  const spaces = m[2];
  const tag = m[3];
  const rest = m[4];
  const color = TODO_COLORS[tag] || 'rgba(255,255,255,0.2)';
  const todo = marker + spaces + tag + rest;

  return `<span style="background-color:${color};color:var(--color-main);padding:0 2px;border-radius:2px;">${escapeHtml(todo)}</span>`;
}

function renderEditorOverlay(code: string, showTodos: boolean): string {
  return code
    .split('\n')
    .map((line) => {
      const match = line.match(/^(\s*)(.*)$/);
      const leading = match ? match[1] : '';
      const rest = match ? match[2] : line;
      const indentHtml = renderIndentHtml(leading);
      const contentHtml = showTodos ? highlightTodoInLine(rest) : escapeHtml(rest);
      return indentHtml + contentHtml;
    })
    .join('\n');
}

function detectLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (LANGUAGE_OVERRIDES[ext]) return LANGUAGE_OVERRIDES[ext];
  if (ext) return ext;
  return 'text';
}

function createTab(filename = 'Main', code = ''): Tab {
  return {
    id: nanoid(),
    filename,
    code,
    language: detectLanguage(filename),
    manualLanguage: false,
  };
}

export default function CodeEditor() {
  const [tabs, setTabs] = useState<Tab[]>([createTab('Main', '')]);
  const [activeId, setActiveId] = useState<string>(tabs[0].id);
  const [isUploading, setIsUploading] = useState(false);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const [author, setAuthor] = useState('');
  const [password, setPassword] = useState('');
  const [expiresIn, setExpiresIn] = useState('0');
  const [publishPublic, setPublishPublic] = useState(false);
  const [showTodos, setShowTodos] = useState(true);
  const [newTodoTag, setNewTodoTag] = useState('TODO');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [detected, setDetected] = useState<{ language: string; extension: string; tabId: string } | null>(null);
  const [forkFromUrl, setForkFromUrl] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLPreElement>(null);
  const shikiRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const current = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
    setTheme(current);
  }, []);

  useEffect(() => {
    const forkSlug = new URLSearchParams(window.location.search).get('fork');
    if (!forkSlug) return;

    let cancelled = false;
    fetch(`/api/files/${encodeURIComponent(forkSlug)}.json`)
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load the bin');
        return (await response.json()) as { filename: string; url: string; hasPassword: boolean };
      })
      .then(async (metadata) => {
        if (cancelled || metadata.hasPassword) return;
        const response = await fetch(`/raw/${encodeURIComponent(forkSlug)}`);
        if (!response.ok) throw new Error('Could not load the bin content');
        const code = await response.text();
        if (cancelled) return;
        const forkedTab = createTab(metadata.filename, code);
        setTabs([forkedTab]);
        setActiveId(forkedTab.id);
        setForkFromUrl(metadata.url.replace('/raw/', '/f/'));
        window.history.replaceState({}, '', '/');
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the bin');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const allTodos = useMemo(
    () => tabs.flatMap((tab) => extractTodos(tab.code, tab.id, tab.filename)),
    [tabs]
  );

  const handleScroll = useCallback(() => {
    const textarea = textareaRef.current;
    const overlay = overlayRef.current;
    const shiki = shikiRef.current;
    if (!textarea) return;
    if (overlay) {
      overlay.scrollTop = textarea.scrollTop;
      overlay.scrollLeft = textarea.scrollLeft;
    }
    if (shiki) {
      shiki.scrollTop = textarea.scrollTop;
      shiki.scrollLeft = textarea.scrollLeft;
    }
  }, []);

  const activeTab = useMemo(
    () => tabs.find((t) => t.id === activeId) ?? tabs[0],
    [tabs, activeId]
  );

  const shikiLanguage = activeTab.language === 'text' ? 'plaintext' : activeTab.language;
  const shikiTheme = theme === 'dark' ? 'github-dark' : 'github-light';
  const shikiHtml = useShikiHighlighter(activeTab.code, shikiLanguage, shikiTheme, {
    outputFormat: 'html',
    rootStyle: false,
    tabindex: false,
  });

  useEffect(() => {
    if (activeTab.manualLanguage || !activeTab.code.trim()) {
      setDetected(null);
      return;
    }
    const timer = setTimeout(() => {
      const detectedLang = detectCodeLanguage(activeTab.code);
      if (detectedLang && detectedLang !== activeTab.language) {
        const extension = LANGUAGE_EXTENSION[detectedLang] || detectedLang;
        setDetected({ language: detectedLang, extension, tabId: activeTab.id });
        return;
      }
      setDetected(null);
    }, 800);
    return () => clearTimeout(timer);
  }, [activeTab.code, activeTab.language, activeTab.manualLanguage, activeTab.id]);

  const handleApplyDetected = useCallback(() => {
    if (!detected) return;
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id !== detected.tabId) return t;
        const base = t.filename.includes('.') ? t.filename.split('.').slice(0, -1).join('.') : t.filename;
        return {
          ...t,
          language: detected.language,
          filename: `${base}.${detected.extension}`,
          manualLanguage: true,
        };
      })
    );
    setDetected(null);
  }, [detected]);

  const addTab = useCallback(() => {
    const newTab = createTab('new', '');
    setTabs((prev) => [...prev, newTab]);
    setActiveId(newTab.id);
    setResults([]);
    setError(null);
  }, [tabs.length]);

  const closeTab = useCallback(
    (id: string, event: MouseEvent<HTMLSpanElement>) => {
      event.stopPropagation();
      setTabs((prev) => {
        const next = prev.filter((t) => t.id !== id);
        if (next.length === 0) {
          const fresh = createTab('Main', '');
          next.push(fresh);
          setActiveId(fresh.id);
        } else if (activeId === id) {
          setActiveId(next[0].id);
        }
        return next;
      });
    },
    [activeId]
  );

  const handleFilenameChange = useCallback(
    (id: string, value: string) => {
      setTabs((prev) =>
        prev.map((t) => {
          if (t.id !== id) return t;
          const language = t.manualLanguage ? t.language : detectLanguage(value);
          return { ...t, filename: value, language };
        })
      );
    },
    []
  );

  const handleLanguageChange = useCallback((id: string, value: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === id ? { ...t, language: value, manualLanguage: true } : t))
    );
  }, []);

  const handleCodeChange = useCallback((id: string, value: string) => {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, code: value } : t)));
  }, []);

  const handleAddTodoComment = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;
    const selected = activeTab.code.slice(start, end);
    const before = activeTab.code.slice(0, start);
    const after = activeTab.code.slice(end);

    const lineStart = before.lastIndexOf('\n') + 1;
    const lineEnd = before.indexOf('\n', start);
    const line = before.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);

    const indentMatch = line.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1] : '';
    const comment = buildTodoComment(newTodoTag, selected, activeTab.language);
    const insertion = `${indent}${comment}\n`;

    const insertAt = lineStart;
    const newCode = before.slice(0, insertAt) + insertion + before.slice(insertAt) + after;
    handleCodeChange(activeTab.id, newCode);

    setTimeout(() => {
      if (!textarea) return;
      const newPosition = insertAt + insertion.length;
      textarea.setSelectionRange(newPosition, newPosition);
      textarea.focus();
    }, 0);
  }, [activeTab, newTodoTag, handleCodeChange]);

  const handleTodoClick = useCallback(
    (todo: TodoItem) => {
      setActiveId(todo.tabId);
      setTimeout(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        const tab = tabs.find((t) => t.id === todo.tabId);
        if (!tab) return;
        const lines = tab.code.split('\n');
        let pos = 0;
        for (let i = 0; i < todo.line - 1 && i < lines.length; i += 1) {
          pos += lines[i].length + 1;
        }
        pos += Math.max(0, todo.column - 1);
        textarea.setSelectionRange(pos, pos);
        textarea.focus();
        const lineHeight = parseInt(getComputedStyle(textarea).lineHeight, 10) || 20;
        textarea.scrollTop = Math.max(0, (todo.line - 1) * lineHeight);
      }, 0);
    },
    [tabs]
  );

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedValue(text);
      setTimeout(() => {
        setCopiedValue((current) => (current === text ? null : current));
      }, 2000);
    } catch {
      // ignore
    }
  };

  const resetEditor = useCallback(() => {
    const fresh = createTab('Main', '');
    setTabs([fresh]);
    setActiveId(fresh.id);
    setResults([]);
    setError(null);
    setAuthor('');
    setPassword('');
    setExpiresIn('0');
    setPublishPublic(false);
    setForkFromUrl(null);
  }, []);

  const toggleTheme = useCallback(() => {
    const root = document.documentElement;
    const next = theme === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    localStorage.setItem('theme', next);
    setTheme(next);
  }, [theme]);

  const handleGeneratePassword = useCallback(() => {
    setPassword(generatePassphrase());
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsUploading(true);
    setError(null);
    setResults([]);
    const newResults: UploadResult[] = [];

    try {
      for (const tab of tabs) {
        if (!tab.code.trim()) continue;
        const file = new File([tab.code], tab.filename);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('author', author);
        formData.append('password', publishPublic ? '' : password);
        formData.append('expires_in', expiresIn);
        formData.append('is_public', String(publishPublic));

        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        const data = (await response.json()) as UploadResult | { error: string };

        if (!response.ok) {
          throw new Error('error' in data ? data.error : 'Upload error');
        }

        newResults.push(data as UploadResult);
      }

      setResults(newResults);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden gap-3">
      <div className="flex items-center gap-2 overflow-x-auto shrink-0">
        {tabs.map((tab) => {
          const isActive = tab.id === activeId;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveId(tab.id)}
              className={[
                'flex items-center gap-2 px-3 py-1.5 text-sm whitespace-nowrap border-b-2 transition',
                isActive
                  ? 'text-main border-primary bg-surface-light'
                  : 'text-muted border-transparent hover:text-main hover:bg-surface-light',
              ].join(' ')}
            >
              <span className="max-w-[140px] truncate">{tab.filename}</span>
              <span
                onClick={(e) => closeTab(tab.id, e)}
                className="ml-1 p-0.5 rounded text-muted hover:text-red-400 hover:bg-background transition"
              >
                <X className="h-3.5 w-3.5" />
              </span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={addTab}
          className="flex items-center gap-1 px-3 py-1.5 text-sm text-primary hover:text-secondary transition"
          title="New tab"
        >
          <Plus className="h-4 w-4" />
        </button>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              window.location.href = '/discover';
            }}
            className="p-2 rounded-lg text-muted hover:text-main hover:bg-surface-light transition"
            title="Discover public bins"
            aria-label="Discover public bins"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M0 0h24v24H0z" fill="none" />
              <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
                <path d="m10.065 12.493l-6.18 1.318a.934.934 0 0 1-1.108-.702l-.537-2.15a1.07 1.07 0 0 1 .691-1.265l13.504-4.44m-2.875 6.493l4.332-.924M16 21l-3.105-6.21" />
                <path d="M16.485 5.94a2 2 0 0 1 1.455-2.425l1.09-.272a1 1 0 0 1 1.212.727l1.515 6.06a1 1 0 0 1-.727 1.213l-1.09.272a2 2 0 0 1-2.425-1.455zM6.158 8.633l1.114 4.456M8 21l3.105-6.21" />
                <circle cx="12" cy="13" r="2" />
              </g>
            </svg>
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            className="p-2 rounded-lg text-muted hover:text-main hover:bg-surface-light transition"
            title="Switch theme"
          >
            {theme === 'dark' ? (
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 9c1.654 0 3 1.346 3 3s-1.346 3-3 3-3-1.346-3-3 1.346-3 3-3zm0-2c-2.762 0-5 2.238-5 5s2.238 5 5 5 5-2.238 5-5-2.238-5-5-5zm-4.184-.599l-3.593-3.594-1.415 1.414 3.595 3.595c.401-.537.876-1.013 1.413-1.415zm4.184-1.401c.34 0 .672.033 1 .08v-5.08h-2v5.08c.328-.047.66-.08 1-.08zm5.598 2.815l3.595-3.595-1.414-1.414-3.595 3.595c.537.402 1.012.878 1.414 1.414zm-12.598 4.185c0-.34.033-.672.08-1h-5.08v2h5.08c-.047-.328-.08-.66-.08-1zm11.185 5.598l3.594 3.593 1.415-1.414-3.594-3.593c-.403.536-.879 1.012-1.415 1.414zm-9.784-1.414l-3.593 3.593 1.414 1.414 3.593-3.593c-.536-.402-1.011-.877-1.414-1.414zm12.519-5.184c.047.328.08.66.08 1s-.033.672-.08 1h5.08v-2h-5.08zm-6.92 8c-.34 0-.672-.033-1-.08v5.08h2v-5.08c-.328.047-.66.08-1 .08z" />
              </svg>
            ) : (
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M10.719 2.082c-2.572 2.028-4.719 5.212-4.719 9.918 0 4.569 1.938 7.798 4.548 9.895-4.829-.705-8.548-4.874-8.548-9.895 0-5.08 3.808-9.288 8.719-9.918zm1.281-2.082c-6.617 0-12 5.383-12 12s5.383 12 12 12c1.894 0 3.87-.333 5.37-1.179-3.453-.613-9.37-3.367-9.37-10.821 0-7.555 6.422-10.317 9.37-10.821-1.74-.682-3.476-1.179-5.37-1.179zm0 10.999c1.437.438 2.562 1.564 2.999 3.001.44-1.437 1.565-2.562 3.001-3-1.436-.439-2.561-1.563-3.001-3-.437 1.436-1.562 2.561-2.999 2.999zm8.001.001c.958.293 1.707 1.042 2 2.001.291-.959 1.042-1.709 1.999-2.001-.957-.292-1.707-1.042-2-2-.293.958-1.042 1.708-1.999 2zm-1-9c-.437 1.437-1.563 2.562-2.998 3.001 1.438.44 2.561 1.564 3.001 3.002.437-1.438 1.563-2.563 2.996-3.002-1.433-.437-2.559-1.564-2.999-3.001z" />
              </svg>
            )}
          </button>
          <button
            type="button"
            className="p-2 rounded-lg text-primary hover:opacity-80 transition"
            title="Openbin"
          >
            <img src="/favicon.svg" alt="Openbin" className="h-5 w-5" />
          </button>
        </div>
      </div>

      {showTodos && allTodos.length > 0 && (
        <div className="shrink-1 max-h-40 overflow-y-auto rounded-lg border border-surface-light bg-surface p-2 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm font-medium text-main px-1">
            <ListTree className="h-4 w-4 text-secondary" />
            <span>Todo Tree</span>
            <span className="ml-auto text-xs text-muted">{allTodos.length}</span>
          </div>
          <div className="flex flex-col gap-1">
            {TODO_TAGS.map((tag) => {
              const items = allTodos.filter((t) => t.tag === tag);
              if (items.length === 0) return null;
              return (
                <div key={tag}>
                  <div className="px-1 text-xs font-semibold text-muted uppercase tracking-wide">{tag}</div>
                  <div className="flex flex-col">
                    {items.map((todo) => (
                      <button
                        key={todo.id}
                        type="button"
                        onClick={() => handleTodoClick(todo)}
                        className="text-left px-1 py-0.5 text-sm text-main hover:bg-surface-light rounded truncate"
                        title={`${todo.filename}:${todo.line}`}
                      >
                        <span className="text-muted text-xs">{todo.filename}</span>
                        <span className="mx-1 text-muted">·</span>
                        <span>{todo.text || tag}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 gap-2">
        {forkFromUrl && (
          <div className="flex shrink-0 items-center gap-2 border border-surface-light border-l-2 border-l-secondary bg-surface px-3 py-2 text-xs text-muted">
            <span className="font-medium text-main">Fork from:</span>
            <a
              href={forkFromUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 truncate text-secondary hover:underline"
            >
              {forkFromUrl}
            </a>
          </div>
        )}
        <div className="relative flex flex-col flex-1 min-h-1 rounded-lg bg-background overflow-hidden">
          <div
            ref={shikiRef}
            className="absolute inset-0 overflow-auto whitespace-pre p-4 font-mono text-sm leading-5 text-main"
            dangerouslySetInnerHTML={{
              __html:
                shikiHtml || `<pre class="shiki-fallback" style="margin:0;padding:0">${escapeHtml(activeTab.code)}</pre>`,
            }}
          />
          <pre
            ref={overlayRef}
            aria-hidden="true"
            className="absolute inset-0 m-0 overflow-auto whitespace-pre p-4 font-mono text-sm leading-5 text-transparent no-scrollbar pointer-events-none"
            style={{ tabSize: INDENT_TAB_SIZE, MozTabSize: INDENT_TAB_SIZE }}
            dangerouslySetInnerHTML={{ __html: renderEditorOverlay(activeTab.code, showTodos) }}
          />
          <textarea
            ref={textareaRef}
            value={activeTab.code}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => handleCodeChange(activeTab.id, e.target.value)}
            onScroll={handleScroll}
            spellCheck={false}
            className="rainbow-editor absolute inset-0 h-full w-full resize-none overflow-auto whitespace-pre bg-transparent p-4 font-mono text-sm leading-5 text-transparent caret-[var(--color-main)] focus:outline-none"
            style={{ tabSize: INDENT_TAB_SIZE, MozTabSize: INDENT_TAB_SIZE }}
          />
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 text-red-100 p-3 shrink-0">
            <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {results.length > 0 && (
          <div className="shrink-0 max-h-48 overflow-y-auto rounded-lg border border-surface-light bg-surface p-4 gap-4 flex flex-col">
            <h2 className="text-base font-semibold text-main">Uploaded files</h2>
            {results.map((result) => (
              <div key={result.slug} className="space-y-2 border-b border-surface-light last:border-0 pb-3 last:pb-0">
                <p className="text-sm text-muted">
                  {result.filename} · {formatBytes(result.size)}
                </p>
                <URLBox
                  label="Public link"
                  value={result.url}
                  copied={copiedValue === result.url}
                  onCopy={() => copyToClipboard(result.url)}
                />
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-1 px-2 py-1.5 bg-surface border-t border-surface-light shrink-0 overflow-x-auto">
          <div className="flex items-center gap-1 shrink-0">
            <input
              type="text"
              value={activeTab.filename}
              onChange={(e) => handleFilenameChange(activeTab.id, e.target.value)}
              placeholder="Main"
              title="Filename"
              className="h-7 w-24 bg-surface border border-surface-light rounded px-2 text-xs text-main placeholder:text-muted focus:outline-none focus:border-secondary"
            />
            <select
              value={activeTab.language}
              onChange={(e) => handleLanguageChange(activeTab.id, e.target.value)}
              title="Language"
              className="h-7 w-24 bg-surface border border-surface-light rounded px-1 text-xs text-main focus:outline-none focus:border-secondary"
            >
              {['text', ...COMMON_LANGUAGES].map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
          </div>

          <div className="w-px h-4 bg-surface-light shrink-0" />

          <div className="flex items-center gap-1 shrink-0">
            <label className="flex h-7 items-center gap-1.5 rounded border border-surface-light bg-surface px-2 text-xs text-muted transition hover:bg-surface-light" title="Show this bin in Discover">
              <input
                type="checkbox"
                checked={publishPublic}
                onChange={(e) => setPublishPublic(e.target.checked)}
                className="h-3.5 w-3.5 accent-primary"
              />
              <span>Public</span>
            </label>
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="author"
              title="Author"
              className="h-7 w-20 bg-surface border border-surface-light rounded px-2 text-xs text-main placeholder:text-muted focus:outline-none focus:border-secondary"
            />
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="password"
                title="Password"
                className="h-7 w-24 bg-surface border border-surface-light rounded px-2 text-xs text-main placeholder:text-muted focus:outline-none focus:border-secondary"
              />
              <button
                type="button"
                onClick={handleGeneratePassword}
                className="h-7 w-7 flex items-center justify-center rounded text-muted hover:text-main hover:bg-surface-light transition"
                title="Generate password"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
            <select
              value={expiresIn}
              onChange={(e) => setExpiresIn(e.target.value)}
              title="Expiration"
              className="h-7 w-24 bg-surface border border-surface-light rounded px-1 text-xs text-main focus:outline-none focus:border-secondary"
            >
              {EXPIRY_OPTIONS.map((option) => (
                <option key={option.value} value={String(option.value)}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="w-px h-4 bg-surface-light shrink-0" />

          <div className="flex items-center gap-1 ml-auto shrink-0">
            <label
              className="flex items-center gap-1.5 h-7 px-2 rounded border border-surface-light bg-surface hover:bg-surface-light text-xs text-muted cursor-pointer select-none transition"
              title="Show/hide TODOs"
            >
              <input
                type="checkbox"
                checked={showTodos}
                onChange={(e) => setShowTodos(e.target.checked)}
                className="h-3.5 w-3.5 accent-primary"
              />
              <ListTree className="h-3.5 w-3.5" />
              <span>TODOs</span>
            </label>

            <select
              value={newTodoTag}
              onChange={(e) => setNewTodoTag(e.target.value)}
              title="Comment tag"
              className="h-7 w-16 bg-surface border border-surface-light rounded px-1 text-xs text-main focus:outline-none focus:border-secondary"
            >
              {TODO_TAGS.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleAddTodoComment}
              className="h-7 w-7 flex items-center justify-center rounded text-muted hover:text-main hover:bg-surface-light transition"
              title="Add comment with selected text"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
            </button>

            <button
              type="submit"
              disabled={isUploading}
              className="h-7 px-3 bg-primary text-white text-xs font-medium rounded hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isUploading ? 'Uploading...' : 'Open bin!'}
            </button>
            {results.length > 0 && (
              <button
                type="button"
                onClick={resetEditor}
                className="h-7 w-7 flex items-center justify-center rounded border border-surface-light text-muted hover:bg-surface-light hover:text-main transition-colors"
                title="Clear"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </form>

      {detected && (
        <div className="fixed bottom-16 left-4 z-50 flex w-[min(25rem,calc(100vw-2rem))] items-center gap-3 border border-surface-light border-l-2 border-l-primary bg-surface px-3 py-2 shadow-md">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center bg-primary/10 text-primary">
            <span className="text-[10px] font-semibold">{detected.language.slice(0, 2).toUpperCase()}</span>
          </div>
          <p className="min-w-0 flex-1 text-xs leading-5 text-muted">
            Detected language: <span className="font-medium text-main">{detected.language}</span>
          </p>
          <button
            type="button"
            onClick={handleApplyDetected}
            className="h-6 shrink-0 border border-primary bg-primary px-2.5 text-xs font-medium text-white transition-colors hover:bg-primary/90"
          >
            Apply
          </button>
          <button
            type="button"
            onClick={() => setDetected(null)}
            className="flex h-6 w-6 shrink-0 items-center justify-center text-muted transition-colors hover:bg-surface-light hover:text-main"
            title="Discard"
            aria-label="Discard detection"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

function URLBox({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="space-y-2">
      <label className="block text-xs uppercase tracking-wide text-muted">{label}</label>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={value}
          className="flex-1 bg-surface border border-surface-light rounded-md px-3 py-2 text-sm text-main min-w-0 focus:outline-none focus:border-secondary"
        />
        <button
          onClick={onCopy}
          className="p-2 rounded-md bg-secondary text-white hover:bg-secondary/90 transition-colors"
          title="Copy"
          type="button"
        >
          {copied ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
        </button>
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 rounded-md bg-secondary text-white hover:bg-secondary/90 transition-colors"
          title="Open"
        >
          <ExternalLink className="h-5 w-5" />
        </a>
      </div>
    </div>
  );
}
