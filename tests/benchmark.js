import {writeFileSync} from 'node:fs';
import {emptyBoard,legalMoves,applyPair,seededRandom,choosePair,solveBoard} from '../dist/engine.js';
const matches=Number(process.argv[2]??16),timeMs=Number(process.argv[3]??150),results=[];
for(let m=0;m<matches;m++){
 const scores=[],boards=[];
 for(const aiWhite of [true,false]){let b=emptyBoard();const rng=seededRandom(10000+m);for(let n=0;n<12;n++){const ai=(n%2===0)===aiWhite;const moves=ai?null:legalMoves(b);const move=ai?choosePair(b,{timeMs,seed:100000+m*30+n}).move:moves[Math.floor(rng()*moves.length)];b=applyPair(b,move);}scores.push(solveBoard(b).penalty);boards.push(b);}
 results.push({match:m+1,aiWhite:scores[0],randomWhite:scores[1],boards});console.log(JSON.stringify(results.at(-1)));
}
const wins=results.filter(r=>r.aiWhite>r.randomWhite).length,draws=results.filter(r=>r.aiWhite===r.randomWhite).length;
console.log(JSON.stringify({matches,timeMs,wins,draws,losses:matches-wins-draws,meanAIWhite:results.reduce((s,r)=>s+r.aiWhite,0)/matches,meanRandomWhite:results.reduce((s,r)=>s+r.randomWhite,0)/matches,method:'Two rounds per match; both sides always colour optimally. Baseline pairs uniformly at random. Fixed random seeds; time-limited AI remains hardware-dependent.'},null,2));

writeFileSync(new URL('./benchmark-results.json',import.meta.url),JSON.stringify({matches,timeMs,results},null,2)+'\n');
