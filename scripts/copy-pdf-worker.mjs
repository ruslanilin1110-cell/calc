import {copyFileSync,mkdirSync} from 'node:fs';
const output=new URL('../public/pdfjs-worker/',import.meta.url);
mkdirSync(output,{recursive:true});
copyFileSync(new URL('../node_modules/pdfjs-dist/build/pdf.worker.min.mjs',import.meta.url),new URL('pdf.worker.min.mjs',output));
