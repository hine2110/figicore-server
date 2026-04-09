const fs = require('fs');
const content = fs.readFileSync('src/orders/orders.service.ts', 'utf8');
let balance = 0;
let lineNum = 1;
for (let i = 0; i < content.length; i++) {
    if (content[i] === '{') balance++;
    if (content[i] === '}') balance--;
    if (content[i] === '\n') lineNum++;
    if (balance < 0) {
        console.log(`NEGATIVE BALANCE at line ${lineNum}: ${balance}`);
        // break; // keep going to see if it recovers
    }
}
console.log(`Final balance: ${balance}`);
