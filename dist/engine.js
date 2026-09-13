/** Gomulda rules and deterministic, exact weighted colouring. No UI dependencies. */
export const SIZE=5, CELLS=25, COUNTRIES=13, SIXTH_COLOUR_COST=25;
export const COLOUR_NAMES=['Blue','Green','Yellow','Red','Black','Violet','Orange','Rose','Teal','Indigo','Copper','Plum','Slate'];
export const COLOUR_HEX=['#85b7db','#a4c39b','#eed27b','#d98d82','#353936','#b4a0d5','#e2b081','#dcb0c1','#85c7c0','#9aa4d5','#c2a089','#c6a3bf','#acb8bc'];
export const EDGES=[];
for(let r=0;r<5;r++)for(let c=0;c<5;c++){let a=r*5+c;if(c<4)EDGES.push([a,a+1]);if(r<4)EDGES.push([a,a+5]);}
export const emptyBoard=()=>Array(25).fill(-1);
export const coord=i=>'ABCDE'[i%5]+(Math.floor(i/5)+1);
export function paletteCosts(extra=SIXTH_COLOUR_COST){if(extra!==SIXTH_COLOUR_COST)throw Error('Gomulda rules fix the sixth colour at 25 points per square. This saved data uses different rules.');return [0,0,0,1,5,...Array.from({length:8},(_,i)=>SIXTH_COLOUR_COST*5**i)];}
export function validateBoard(board,complete=false){
 if(!Array.isArray(board)||board.length!==25||board.some(n=>!Number.isInteger(n)||n< -1||n>12))throw Error('Invalid board.');
 const counts=Array(13).fill(0);board.forEach(n=>{if(n>=0)counts[n]++});let gap=false;
 for(let n=0;n<12;n++){if(!counts[n])gap=true;else if(gap||counts[n]!==2)throw Error('Countries 0–11 must be consecutive pairs.');}
 if(counts[12]&&(counts[12]!==1||counts.slice(0,12).some(n=>n!==2)))throw Error('Country 12 must be the last single square.');
 if(complete&&board.includes(-1))throw Error('The board is not complete.');return counts;
}
export function pairCount(board){return board.reduce((n,c)=>n+(c>=0&&c<12),0)/2;}
export function legalMoves(board){const free=[];board.forEach((c,i)=>{if(c<0)free.push(i)});const moves=[];for(let a=0;a<free.length;a++)for(let b=a+1;b<free.length;b++)moves.push([free[a],free[b]]);return moves;}
export function applyPair(board,move){
 if(!Array.isArray(move)||move.length!==2||move[0]===move[1]||move.some(i=>!Number.isInteger(i)||i<0||i>=25||board[i]!==-1))throw Error('Choose two different empty squares.');
 const next=board.slice(),n=pairCount(board);if(n>=12)throw Error('Pairing has finished.');next[move[0]]=next[move[1]]=n;if(n===11)next[next.indexOf(-1)]=12;return next;
}
export function graphFromBoard(board,complete=true){
 const weights=validateBoard(board,complete),n=Math.max(...board)+1,adj=Array(n).fill(0);
 for(const [a,b]of EDGES){const x=board[a],y=board[b];if(x>=0&&y>=0&&x!==y){adj[x]|=1<<y;adj[y]|=1<<x;}}
 return {adj,weights:weights.slice(0,n)};
}
export function inspectColouring(board,colours,costs=paletteCosts()){
 const {adj,weights}=graphFromBoard(board);if(!Array.isArray(colours)||colours.length!==13||colours.some(c=>!Number.isInteger(c)||c< -1||c>=costs.length))throw Error('Invalid colours.');
 const conflicts=[];let penalty=0,filled=0;
 for(let a=0;a<13;a++){if(colours[a]>=0){filled++;penalty+=weights[a]*costs[colours[a]];for(let b=a+1;b<13;b++)if((adj[a]&(1<<b))&&colours[a]===colours[b])conflicts.push([a,b]);}}
 return {penalty,filled,conflicts,valid:filled===13&&conflicts.length===0};
}
const popcount=n=>{n=n-((n>>>1)&0x55555555);n=(n&0x33333333)+((n>>>2)&0x33333333);return(((n+(n>>>4))&0x0f0f0f0f)*0x01010101)>>>24;};
export function solveGraph(adj,weights,costs=paletteCosts(),options={}){
 const n=adj.length;if(n>13||weights.length!==n||costs.length<n&&costs.length<1)throw Error('Invalid graph.');
 const start=performance.now(),deadline=options.deadline??Infinity,degrees=adj.map(popcount),colours=Array(n).fill(-1),uses=Array(costs.length).fill(0);let nodes=0,aborted=false;
 function available(v){let mask=0;for(let u=0;u<n;u++)if((adj[v]&(1<<u))&&colours[u]>=0)mask|=1<<colours[u];return mask;}
 function select(){let best=-1,sat=-1,deg=-1;for(let v=0;v<n;v++)if(colours[v]<0){const s=popcount(available(v));if(s>sat||s===sat&&degrees[v]>deg){best=v;sat=s;deg=degrees[v];}}return best;}
 let best=0,bestColours=null;
 for(let i=0;i<n;i++){const v=select(),mask=available(v);let c=0;while(c<costs.length&&(mask&(1<<c)))c++;if(c===costs.length){best=Infinity;break;}colours[v]=c;best+=weights[v]*costs[c];}
 if(Number.isFinite(best))bestColours=colours.slice();colours.fill(-1);
 function dfs(left,score){
  nodes++;if((nodes&255)===0&&performance.now()>deadline){aborted=true;return;}
  if(score>=best||aborted)return;if(!left){best=score;bestColours=colours.slice();return;}
  let lower=score;for(let v=0;v<n;v++)if(colours[v]<0){const mask=available(v);let c=0;while(c<costs.length&&(mask&(1<<c)))c++;if(c===costs.length)return;lower+=weights[v]*costs[c];if(lower>=best)return;}
  const v=select(),mask=available(v);
  for(let c=0;c<costs.length;c++){
   if(mask&(1<<c))continue;
   // Equal-cost unused colours are interchangeable. Canonical first use removes 3! duplicates.
   if(c>0&&costs[c]===costs[c-1]&&!uses[c-1])continue;
   const next=score+weights[v]*costs[c];if(next>=best)break;
   colours[v]=c;uses[c]++;dfs(left-1,next);uses[c]--;colours[v]=-1;if(aborted)return;
  }
 }
 if(best>0)dfs(n,0);
 return {penalty:best,colours:bestColours,optimal:!aborted,nodes,elapsedMs:performance.now()-start};
}
export function solveBoard(board,costs=paletteCosts(),options={}){const{adj,weights}=graphFromBoard(board);return solveGraph(adj,weights,costs,options);}
export function seededRandom(seed=1){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
export function randomCompletion(board,rng=Math.random){const next=board.slice(),free=[];next.forEach((c,i)=>{if(c<0)free.push(i)});for(let i=free.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[free[i],free[j]]=[free[j],free[i]];}let n=pairCount(next);while(free.length>1){next[free.pop()]=n;next[free.pop()]=n++;}if(free.length)next[free[0]]=12;return next;}
const transforms=Array.from({length:8},(_,t)=>Array.from({length:25},(_,i)=>{let r=Math.floor(i/5),c=i%5;if(t>=4)c=4-c;for(let k=0;k<t%4;k++)[r,c]=[c,4-r];return r*5+c;}));
// Country labels are immaterial to future play. Canonicalise labels and board symmetries.
export function canonicalKey(board){let best=null;for(const map of transforms){const labels=new Map();let s='';for(const i of map){const c=board[i];if(c<0)s+='.';else{if(!labels.has(c))labels.set(c,labels.size);s+=String.fromCharCode(65+labels.get(c));}}if(best===null||s<best)best=s;}return best;}
function shuffled(a,rng){for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function distinctMoves(board,rng){const seen=new Set();return shuffled(legalMoves(board),rng).filter(m=>{const key=canonicalKey(applyPair(board,m));if(seen.has(key))return false;seen.add(key);return true;});}
export function choosePair(board,options={}){
 validateBoard(board);const start=performance.now(),budget=Math.max(10,options.timeMs??3000),deadline=start+budget,costs=options.costs??paletteCosts(),rng=seededRandom(options.seed??Math.floor(Math.random()*2**32));
 const n=pairCount(board);if(n>=12)throw Error('No pairing moves remain.');const rootMoves=distinctMoves(board,rng),maximise=n%2===0;let evaluated=0,solverNodes=0,maxExactDepth=0,maxTreeDepth=0,bookHits=0;const terminalCache=new Map();
 const terminal=(b)=>{const key=b.join(',');if(terminalCache.has(key))return terminalCache.get(key);const s=solveBoard(b,costs);evaluated++;solverNodes+=s.nodes;terminalCache.set(key,s.penalty);return s.penalty;};
 let exactAttempt=null;
 if(n>=8){
  const exactDeadline=n>=9?deadline:start+budget*.45,tt=new Map();let stopped=false,visited=0;
  function search(b,alpha,beta){
   if(performance.now()>exactDeadline){stopped=true;return 0;}visited++;const count=pairCount(b);maxExactDepth=Math.max(maxExactDepth,count-n);if(count===12)return terminal(b);
   const solved=options.lookupSolved?.(b);if(solved){bookHits++;return solved.value;}
   const key=canonicalKey(b),entry=tt.get(key),oldAlpha=alpha,oldBeta=beta;if(entry){if(entry.flag==='exact')return entry.value;if(entry.flag==='lower')alpha=Math.max(alpha,entry.value);else beta=Math.min(beta,entry.value);if(alpha>=beta)return entry.value;}
   const isMax=count%2===0;let value=isMax?-Infinity:Infinity;
   for(const move of distinctMoves(b,rng)){const v=search(applyPair(b,move),alpha,beta);if(stopped)return 0;if(isMax){value=Math.max(value,v);alpha=Math.max(alpha,value);}else{value=Math.min(value,v);beta=Math.min(beta,value);}if(alpha>=beta||!isMax&&value===0)break;}
   tt.set(key,{value,flag:value<=oldAlpha?'upper':value>=oldBeta?'lower':'exact'});return value;
  }
  let bestValue=maximise?-Infinity:Infinity,bestMove=rootMoves[0],finished=0;
  for(const move of rootMoves){const value=search(applyPair(board,move),maximise?bestValue:-Infinity,maximise?Infinity:bestValue);if(stopped)break;finished++;if(maximise?value>bestValue:value<bestValue){bestValue=value;bestMove=move;}if(!maximise&&bestValue===0){finished=rootMoves.length;break;}}
  if(finished===rootMoves.length)return {move:bestMove,value:bestValue,exact:true,method:'Exact minimax',evaluated,iterations:visited,maxTreeDepth,maxExactDepth,bookHits,remainingPlies:12-n,budgetMs:budget,elapsedMs:performance.now()-start,solverNodes};
  exactAttempt={move:bestMove,value:bestValue,finished};
 }
 // Monte Carlo tree search. Alternating UCB objectives model a resisting opponent.
 const node=(b,move=null,parent=null)=>({board:b,move,parent,visits:0,total:0,children:[],untried:null});const root=node(board);root.untried=rootMoves.slice();let iterations=0,lastReport=start;
 while(performance.now()<deadline||iterations<rootMoves.length){
  let cur=root;const path=[cur];
  while(pairCount(cur.board)<12){
   if(cur.untried===null)cur.untried=shuffled(legalMoves(cur.board),rng);
   const width=cur===root?rootMoves.length:Math.max(2,Math.floor(2.5*Math.sqrt(cur.visits+1)));
   if(cur.untried.length&&cur.children.length<width){const move=cur.untried.pop(),child=node(applyPair(cur.board,move),move,cur);cur.children.push(child);cur=child;path.push(cur);break;}
   const sign=pairCount(cur.board)%2===0?1:-1;let best=-Infinity,pick=null;
   for(const c of cur.children){const score=sign*c.total/c.visits+2.2*Math.sqrt(Math.log(cur.visits+1)/c.visits);if(score>best){best=score;pick=c;}}cur=pick;path.push(cur);
  }
  maxTreeDepth=Math.max(maxTreeDepth,path.length-1);const solved=options.lookupSolved?.(cur.board);if(solved)bookHits++;const value=solved?solved.value:terminal(randomCompletion(cur.board,rng));for(const p of path){p.visits++;p.total+=value;}iterations++;
  const now=performance.now();if(options.onProgress&&now-lastReport>250){lastReport=now;options.onProgress({iterations,evaluated,maxTreeDepth,maxExactDepth,elapsedMs:now-start});}
 }
 const sorted=root.children.sort((a,b)=>b.visits-a.visits||(maximise?-1:1)*(a.total/a.visits-b.total/b.visits)),best=sorted[0];
 return {move:best.move,value:best.total/best.visits,exact:false,method:'Monte Carlo tree search',iterations,evaluated,maxTreeDepth,maxExactDepth,bookHits,remainingPlies:12-n,budgetMs:budget,elapsedMs:performance.now()-start,solverNodes,alternatives:sorted.slice(0,4).map(c=>({move:c.move,visits:c.visits,value:c.total/c.visits})),exactAttempt:exactAttempt?.finished?exactAttempt:undefined};
}
