import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createBook,loadBook,packBook,analyzeBookPosition,growBookLine,bookChildren,bookStats} from '../dist/book.js';
import {emptyBoard} from '../dist/engine.js';
const args=process.argv.slice(2),arg=(k,d)=>{const i=args.indexOf('--'+k);return i<0?d:args[i+1];};
const out=arg('out','research/runs/book.json'),resume=arg('resume',''),lines=Number(arg('lines',6)),ms=Number(arg('ms',150));
if(!Number.isInteger(lines)||lines<0||lines>10000||!Number.isFinite(ms)||ms<10||ms>30000)throw Error('Invalid book build settings.');
const book=resume?loadBook(JSON.parse(readFileSync(resume,'utf8'))):createBook(Number(arg('extra-cost',25)));
mkdirSync(out.substring(0,out.lastIndexOf('/'))||'.',{recursive:true});const save=()=>writeFileSync(out,JSON.stringify(packBook(book)));
if(!resume){analyzeBookPosition(book,emptyBoard(),{timeMs:3000,seed:1973});let i=0;for(const child of bookChildren(emptyBoard())){analyzeBookPosition(book,child.board,{timeMs:ms,seed:70000+i++});}save();console.log(JSON.stringify({openings:i,...bookStats(book)}));}
for(let i=0;i<lines;i++){growBookLine(book,{timeMs:ms,seed:72131+book.lines*1709});save();console.log(JSON.stringify(bookStats(book)));}
