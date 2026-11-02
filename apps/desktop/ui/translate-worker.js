// Offline translation of the waiting message (ADR-0033): Firefox's Bergamot
// engine (vendor/bergamot-translator.js, MPL-2.0) on files Rust downloaded
// once from Mozilla. Same model setup as Firefox's translations-engine.worker.js.
'use strict';
/* global loadBergamot */
importScripts('vendor/bergamot-translator.js');

// Memory alignment the engine wants for each file kind.
const ALIGN = { model: 256, lex: 64, vocab: 64, srcvocab: 64, trgvocab: 64 };
let bergamot = null;
let service = null;
const models = {};

function start(wasmBinary) {
  return new Promise((resolve, reject) => {
    const m = loadBergamot({
      INITIAL_MEMORY: 41_943_040,
      print: () => {},
      onAbort: () => reject(new Error('le moteur de traduction n’a pas démarré')),
      onRuntimeInitialized: async () => {
        await Promise.resolve();
        resolve(m);
      },
      wasmBinary,
    });
  });
}

function config(model) {
  const c = {
    'beam-size': '1', normalize: '1.0', 'word-penalty': '0', 'max-length-break': '128', 'mini-batch-words': '1024',
    workspace: '128', 'max-length-factor': '2.0', 'skip-cost': 'true', 'cpu-threads': '0', quiet: 'true', 'quiet-translation': 'true',
    'gemm-precision': model.endsWith('intgemm8.bin') ? 'int8shiftAll' : 'int8shiftAlphaAll', alignment: 'soft',
  };
  const pad = '            ';
  return '\n' + Object.entries(c).map(([k, v]) => `${pad}${k}: ${v}\n`).join('') + pad;
}

// files: [{ kind, name, bytes }]
function load(pair, files) {
  const mem = {};
  let modelName = '';
  for (const f of files) {
    const a = new bergamot.AlignedMemory(f.bytes.byteLength, ALIGN[f.kind]);
    a.getByteArrayView().set(new Uint8Array(f.bytes));
    mem[f.kind] = a;
    if (f.kind === 'model') modelName = f.name;
  }
  const vocab = new bergamot.AlignedMemoryList();
  if (mem.vocab) vocab.push_back(mem.vocab);
  else {
    vocab.push_back(mem.srcvocab);
    vocab.push_back(mem.trgvocab);
  }
  const [from, to] = pair.split(/-(.+)/);
  const model = new bergamot.TranslationModel(from, to, config(modelName), mem.model, mem.lex ?? null, vocab, null);
  models[pair] = { model, mem: [...Object.values(mem), vocab] };
}

// A model no longer needed leaves the memory.
function unload(pair) {
  const m = models[pair];
  if (!m) return;
  delete models[pair];
  // The model took the files' memory (moved into it): deleting it frees them;
  // the emptied holders go after.
  for (const x of [m.model, ...m.mem]) {
    try {
      x.delete();
    } catch (e) { /* already freed */ }
  }
}

// One sentence; through English when the target is not English.
function translate(text, to) {
  const msgs = new bergamot.VectorString();
  const opts = new bergamot.VectorResponseOptions();
  msgs.push_back(text);
  opts.push_back({ qualityScores: false, alignment: true, html: false });
  const out = to === 'en'
    ? service.translate(models['fr-en'].model, msgs, opts)
    : service.translateViaPivoting(models['fr-en'].model, models['en-' + to].model, msgs, opts);
  const t = out.get(0).getTranslatedText();
  msgs.delete();
  opts.delete();
  out.delete();
  return t;
}

self.onmessage = async ({ data }) => {
  try {
    let result = null;
    if (data.type === 'start') {
      if (!bergamot) {
        bergamot = await start(data.wasm);
        service = new bergamot.BlockingService({ cacheSize: 0 });
      }
    } else if (data.type === 'load') {
      if (!models[data.pair]) load(data.pair, data.files);
    } else if (data.type === 'unload') {
      unload(data.pair);
    } else if (data.type === 'translate') {
      result = translate(data.text, data.to);
    }
    self.postMessage({ id: data.id, result });
  } catch (e) {
    self.postMessage({ id: data.id, error: String(e && e.message ? e.message : e) });
  }
};
