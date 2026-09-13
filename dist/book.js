/** Symmetry-aware opening book and proof graph. Estimates never establish bounds. */
import {emptyBoard,validateBoard,pairCount,legalMoves,applyPair,paletteCosts,graphFromBoard,solveGraph,solveBoard,choosePair} from './engine.js?v=9';
export const BOOK_FORMAT='gomulda-book-1',BOOK_LIMIT=50000;
const transforms=Array.from({length:8},(_,t)=>Array.from({length:25},(_,i)=>{let r=Math.floor(i/5),c=i%5;if(t>=4)c=4-c;for(let n=0;n<t%4;n++)[r,c]=[c,4-r];return 5*r+c;}));
export function canonicalPosition(board){
 validateBoard(board);let best=null;
 for(const fromCanonical of transforms){const labels=new Map();const b=fromCanonical.map(i=>{const c=board[i];if(c<0||c===12)return c;if(!labels.has(c))labels.set(c,labels.size);return labels.get(c);});const key=b.map(c=>c<0?'.':String.fromCharCode(65+c)).join('');
  if(!best||key<best.key){const toCanonical=[];fromCanonical.forEach((src,dst)=>toCanonical[src]=dst);best={key,board:b,toCanonical,fromCanonical};}}
 return best;
}
export function bookChildren(board){const children=new Map();for(const move of legalMoves(board)){const child=canonicalPosition(applyPair(board,move));if(!children.has(child.key))children.set(child.key,{key:child.key,board:child.board,move});}return [...children.values()];}
export function createBook(extraCost=25){const costs=paletteCosts(extraCost);return {format:BOOK_FORMAT,extraCost,cap:2*costs.slice(0,12).reduce((a,b)=>a+b,0)+costs[12],entries:Object.create(null),size:0,lines:0};}
function ensure(book,board){const c=canonicalPosition(board);let e=book.entries[c.key];if(!e){if(book.size>=BOOK_LIMIT)throw Error('The book has reached 50,000 positions. Export it before starting a separate book.');const ply=pairCount(c.board),costs=paletteCosts(book.extraCost);const g=graphFromBoard(c.board,ply===12),baseLower=solveGraph(g.adj,g.weights,costs).penalty;e={board:c.board,ply,baseLower,lower:baseLower,upper:ply===12?baseLower:book.cap,move:null,analysis:null};book.entries[c.key]=e;book.size++;}return {entry:e,position:c};}
function update(book,e){if(e.ply===12)return;const children=bookChildren(e.board),white=e.ply%2===0;
 // Already formed countries remain an induced subgraph: their optimal colouring is a lower bound.
 let lower=white?e.baseLower:Infinity,upper=white?0:book.cap;
 for(const c of children){const child=book.entries[c.key],lo=child?.lower??e.baseLower,hi=child?.upper??book.cap;lower=white?Math.max(lower,lo):Math.min(lower,lo);upper=white?Math.max(upper,hi):Math.min(upper,hi);}
 e.lower=lower;e.upper=upper;e.move=null;
 if(lower===upper){const witness=children.find(c=>{const v=book.entries[c.key];return white?(v?.lower??e.baseLower)>=lower:(v?.upper??book.cap)<=upper;});if(!witness)throw Error('A solved position is missing its move witness.');e.move=witness.move;}
}
export function refreshBook(book){Object.values(book.entries).sort((a,b)=>b.ply-a.ply).forEach(e=>update(book,e));return book;}
export function lookupBook(book,board){const c=canonicalPosition(board),e=book.entries[c.key];if(!e)return null;const mapMove=m=>m?.map(i=>c.fromCanonical[i]).sort((a,b)=>a-b)??null;return {...e,key:c.key,move:mapMove(e.move),analysis:e.analysis?{...e.analysis,move:mapMove(e.analysis.move)}:null,exact:e.lower===e.upper};}
export function recordAnalysis(book,board,result){const {entry:e,position:c}=ensure(book,board);if(!result?.move||!Number.isFinite(result.value)||result.value<0)throw Error('Invalid book analysis.');applyPair(board,result.move);
 const analysis={move:result.move.map(i=>c.toCanonical[i]).sort((a,b)=>a-b),value:result.value,iterations:result.iterations??0,timeMs:result.budgetMs??result.elapsedMs??0};
 if(!e.analysis||analysis.timeMs>=e.analysis.timeMs)e.analysis=analysis;return e;
}
export function solveIntoBook(book,board,{timeMs=3000,maxNewPositions=10000}={}){
 if(!Number.isFinite(timeMs)||timeMs<=0||!Number.isInteger(maxNewPositions)||maxNewPositions<1)throw Error('Invalid proof search limit.');
 const started=performance.now(),deadline=started+timeMs,startSize=book.size;let nodes=0,stopped=false;
 function visit(b){if(performance.now()>=deadline||book.size-startSize>=maxNewPositions){stopped=true;return;}
  const {entry:e}=ensure(book,b);nodes++;if(e.lower===e.upper)return;
  const children=bookChildren(e.board);if(e.analysis){const preferred=canonicalPosition(applyPair(e.board,e.analysis.move)).key;children.sort((a,b)=>(b.key===preferred)-(a.key===preferred));}
  for(const child of children){visit(child.board);if(stopped)break;update(book,e);if(e.lower===e.upper)break;}
  update(book,e);
 }
 visit(board);refreshBook(book);const found=lookupBook(book,board);return {exact:found?.exact??false,value:found?.exact?found.lower:null,lower:found?.lower??0,upper:found?.upper??book.cap,move:found?.move??null,nodes,stopped,elapsedMs:performance.now()-started};
}
export function analyzeBookPosition(book,board,{timeMs=800,seed=1}={}){
 if(pairCount(board)===12){ensure(book,board);return {exact:true};}
 const existing=lookupBook(book,board);if(existing?.exact)return {exact:true,cached:true};
 // A bounded proof expansion is valuable close to the end. Earlier analysis stays explicitly estimated.
 if(pairCount(board)>=8)return solveIntoBook(book,board,{timeMs,maxNewPositions:4000});
 const result=choosePair(board,{timeMs,seed,costs:paletteCosts(book.extraCost),lookupSolved:b=>{const e=lookupBook(book,b);return e?.exact?{value:e.lower,move:e.move}:null;}});recordAnalysis(book,board,result);refreshBook(book);return {exact:false,value:result.value};
}
export function growBookLine(book,{timeMs=150,seed=1}={}){
 const openings=bookChildren(emptyBoard()),opening=openings[book.lines%openings.length];let board=applyPair(emptyBoard(),opening.move);ensure(book,emptyBoard());const trace=[];
 for(let ply=1;ply<9;ply++){const r=choosePair(board,{timeMs,seed:seed+ply*701,costs:paletteCosts(book.extraCost)});recordAnalysis(book,board,r);trace.push(r.move);board=applyPair(board,r.move);}
 const proof=solveIntoBook(book,board,{timeMs:Math.max(1000,timeMs*4),maxNewPositions:2000});book.lines++;refreshBook(book);return {opening:opening.move,moves:trace,proof,lines:book.lines};
}
export function bookStats(book){const entries=Object.values(book.entries);return {positions:entries.length,solved:entries.filter(e=>e.lower===e.upper&&e.ply<12).length,terminals:entries.filter(e=>e.ply===12).length,estimates:entries.filter(e=>e.analysis&&e.lower!==e.upper).length,lines:book.lines,extraCost:book.extraCost,initialSolved:lookupBook(book,emptyBoard())?.exact??false};}
export function packBook(book){return {format:BOOK_FORMAT,extraCost:book.extraCost,lines:book.lines,entries:Object.fromEntries(Object.entries(book.entries).map(([key,e])=>[key,{board:e.board,analysis:e.analysis}]))};}
export function mergeBook(book,other){if(book.extraCost!==other.extraCost)throw Error('Books with different colour costs cannot be merged.');for(const r of Object.values(other.entries)){const {entry:e}=ensure(book,r.board);if(r.analysis&&(!e.analysis||r.analysis.timeMs>=e.analysis.timeMs))e.analysis=r.analysis;}book.lines=Math.max(book.lines,other.lines);return refreshBook(book);}
export function loadBook(raw){
 if(!raw||raw.format!==BOOK_FORMAT||!raw.entries||Array.isArray(raw.entries)||typeof raw.entries!=='object'||Object.keys(raw.entries).length>BOOK_LIMIT)throw Error('Invalid Gomulda book.');const book=createBook(raw.extraCost);
 if(!Number.isSafeInteger(raw.lines)||raw.lines<0)throw Error('Invalid book line count.');book.lines=raw.lines;
 for(const [key,r]of Object.entries(raw.entries)){const c=canonicalPosition(r.board);if(key!==c.key||JSON.stringify(c.board)!==JSON.stringify(r.board))throw Error('Invalid book position key.');const {entry:e}=ensure(book,r.board);if(r.analysis){const a=r.analysis;if(e.ply===12||!Number.isFinite(a.value)||a.value<0||a.value>book.cap||!Number.isSafeInteger(a.iterations)||a.iterations<0||!Number.isFinite(a.timeMs)||a.timeMs<0)throw Error('Invalid book estimate.');applyPair(e.board,a.move);e.analysis={move:a.move.slice(),value:a.value,iterations:a.iterations,timeMs:a.timeMs};}}
 // Never trust imported exact/bound flags: recompute leaf colourings and all proof implications.
 return refreshBook(book);
}
export function chooseBookPair(book,board,{timeMs=3000,seed,onProgress}={}){
 const started=performance.now();let known=lookupBook(book,board);
 if(known?.exact&&known.move)return {move:known.move,value:known.lower,exact:true,method:'Solved book position',iterations:0,evaluated:0,bookHits:1,maxTreeDepth:0,maxExactDepth:0,remainingPlies:12-pairCount(board),budgetMs:timeMs,elapsedMs:performance.now()-started};
 if(pairCount(board)>=9){const proof=solveIntoBook(book,board,{timeMs,maxNewPositions:2000});known=lookupBook(book,board);if(known?.exact)return {move:known.move,value:known.lower,exact:true,method:'Book proof search',iterations:proof.nodes,evaluated:0,bookHits:0,maxTreeDepth:0,maxExactDepth:0,remainingPlies:12-pairCount(board),budgetMs:timeMs,elapsedMs:performance.now()-started};}
 // Estimated book moves are used only when their recorded search budget meets the selected level.
 if(known?.analysis&&known.analysis.timeMs>=timeMs)return {move:known.analysis.move,value:known.analysis.value,exact:false,method:'Opening book estimate',iterations:0,evaluated:0,bookHits:1,maxTreeDepth:0,maxExactDepth:0,remainingPlies:12-pairCount(board),budgetMs:timeMs,elapsedMs:performance.now()-started};
 const result=choosePair(board,{timeMs:Math.max(10,timeMs-(performance.now()-started)),seed,onProgress,costs:paletteCosts(book.extraCost),lookupSolved:b=>{const e=lookupBook(book,b);return e?.exact?{value:e.lower,move:e.move}:null;}});result.budgetMs=timeMs;result.elapsedMs=performance.now()-started;recordAnalysis(book,board,result);
 return result;
}
