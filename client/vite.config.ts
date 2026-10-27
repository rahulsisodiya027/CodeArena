import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
plugins: [react()],
resolve: {
alias: [
{
find: 'monaco-editor/esm/vs/editor/editor.api.js',
replacement: path.resolve(
__dirname,
'node_modules/monaco-editor/esm/vs/editor/editor.api.js'
),
},
],
dedupe: ['monaco-editor'],
},
optimizeDeps: {
exclude: ['y-monaco'],
},
});
