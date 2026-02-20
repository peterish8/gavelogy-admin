/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');

const targetDir = path.join(__dirname, 'src');
const skipFiles = ['src/app/auth/login/page.tsx', 'src/components/ui/'];

const isSkipped = (filePath) => skipFiles.some(skip => filePath.replace(/\\/g, '/').includes(skip));

const replacements = [
    { from: /\btext-slate-200\b/g, to: 'text-muted-foreground/40' },
    { from: /\bbg-slate-400\b/g, to: 'bg-muted-foreground' },
];

let changedFiles = 0;

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(function (file) {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(file));
        } else {
            if (file.endsWith('.tsx') || file.endsWith('.ts')) {
                results.push(file);
            }
        }
    });
    return results;
}

const files = walk(targetDir);

files.forEach(file => {
    if (isSkipped(file)) {
        return;
    }

    let content = fs.readFileSync(file, 'utf8');
    let originalContent = content;

    replacements.forEach(r => {
        content = content.replace(r.from, r.to);
    });

    if (content !== originalContent) {
        fs.writeFileSync(file, content, 'utf8');
        console.log(`Updated: ${file}`);
        changedFiles++;
    }
});

console.log(`\nSecond pass complete. Modified ${changedFiles} files.`);
