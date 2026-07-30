export const LANGUAGE_OVERRIDES: Record<string, string> = {
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

export const COMMON_LANGUAGES = [
  'astro', 'bash', 'c', 'cpp', 'clojure', 'csharp', 'css', 'dart', 'dockerfile', 'elixir',
  'erlang', 'fsharp', 'go', 'graphql', 'haskell', 'html', 'java', 'javascript', 'json', 'jsonc',
  'jsx', 'julia', 'kotlin', 'latex', 'less', 'lua', 'markdown', 'mdx', 'nim', 'ocaml', 'perl', 'php',
  'plaintext', 'powershell', 'python', 'r', 'ruby', 'rust', 'sass', 'scala', 'scss', 'shellscript',
  'solidity', 'sql', 'svelte', 'swift', 'toml', 'typescript', 'tsx', 'vue', 'xml', 'yaml', 'zig',
];

export function detectLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return LANGUAGE_OVERRIDES[ext] ?? ext ?? 'text';
}

export function getLanguageExtension(language: string): string | undefined {
  const map = Object.entries(LANGUAGE_OVERRIDES).reduce<Record<string, string>>(
    (acc, [ext, lang]) => {
      if (!acc[lang]) acc[lang] = ext;
      return acc;
    },
    {}
  );
  map.bash = 'sh';
  map.dockerfile = 'Dockerfile';
  map.java = 'java';
  map.makefile = 'Makefile';
  map.perl = 'pl';
  map.plaintext = 'txt';
  map.text = 'txt';
  return map[language] ?? language;
}
