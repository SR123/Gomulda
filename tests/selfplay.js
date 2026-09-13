import {writeFileSync} from 'node:fs';
import {emptyBoard,applyPair,choosePair,solveBoard} from '../dist/engine.js';
const rounds=[];
for(let r=0;r<4;r++){let b=emptyBoard();const moves=[];for(let n=0;n<12;n++){const s=choosePair(b,{timeMs:400,seed:3300+r*12+n});b=applyPair(b,s.move);moves.push({move:s.move,value:s.value,exact:s.exact,evaluated:s.evaluated});}const solution=solveBoard(b);rounds.push({round:r+1,board:b,moves,solution});console.log(JSON.stringify({round:r+1,penalty:solution.penalty,optimal:solution.optimal}));}
writeFileSync(new URL('./selfplay-results.json',import.meta.url),JSON.stringify(rounds,null,2)+'\n');
