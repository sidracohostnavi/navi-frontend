const fs = require('fs');
const path = require('path');

function generateTree(dir, prefix = '', ignore = ['node_modules', '.git', '.next', '.vercel']) {
    let result = '';
    
    let files;
    try {
        files = fs.readdirSync(dir);
    } catch (e) {
        return '';
    }
    
    // Filter ignored
    files = files.filter(f => !ignore.includes(f));
    
    // Sort so folders and files are somewhat grouped or just alphabetically
    files.sort((a, b) => {
        const aStat = fs.statSync(path.join(dir, a));
        const bStat = fs.statSync(path.join(dir, b));
        if (aStat.isDirectory() && !bStat.isDirectory()) return -1;
        if (!aStat.isDirectory() && bStat.isDirectory()) return 1;
        return a.localeCompare(b);
    });

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const isLast = i === files.length - 1;
        const fullPath = path.join(dir, file);
        const stats = fs.statSync(fullPath);
        
        const marker = isLast ? '└── ' : '├── ';
        
        if (stats.isDirectory()) {
            result += `${prefix}${marker}${file}/\n`;
            result += generateTree(fullPath, prefix + (isLast ? '    ' : '│   '), ignore);
        } else {
            result += `${prefix}${marker}${file}\n`;
        }
    }
    return result;
}

const tree = `.\n${generateTree('.')}`;
fs.writeFileSync('tree_output.txt', tree);
console.log("Tree generated to tree_output.txt");
