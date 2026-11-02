import { copyFileSync } from 'node:fs';
copyFileSync('public/config.xml','dist/config.xml');
console.log('Tizen config copied to dist/');
