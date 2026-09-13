/** Compact AlphaZero-style research engine, shared by browser and Node. */
import {emptyBoard,applyPair,legalMoves,pairCount,paletteCosts,solveBoard,seededRandom,validateBoard,choosePair} from './engine.js?v=9';
export const ACTIONS=[];for(let a=0;a<25;a++)for(let b=a+1;b<25;b++)ACTIONS.push([a,b]);
const INDEX=Array.from({length:25},()=>Array(25).fill(-1));ACTIONS.forEach(([a,b],i)=>{INDEX[a][b]=INDEX[b][a]=i;});
export const actionIndex=(a,b)=>INDEX[a]?.[b]??-1;
export const INPUTS=327,HIDDEN=64,VALUE_SCALE=10,FORMAT='gomulda-az-1';
// Checkpoint input contract: keep these indices stable so saved networks retain their meaning.
export const ROLE_INPUT=325,PLY_INPUT=326,WHITE_ROLE=1,BLACK_ROLE=-1;
const SHAPES={w1:INPUTS*HIDDEN,b1:HIDDEN,wp:HIDDEN*300,bp:300,wv:HIDDEN,bv:1};
// White is the first player in THIS round, not necessarily player 1 in the match.
// A positive White penalty is good for White and bad for Black.
export const turnSign=board=>pairCount(board)%2===0?WHITE_ROLE:BLACK_ROLE;
export function features(board){const out=[];for(let i=0;i<25;i++)if(board[i]<0)out.push([i,1]);ACTIONS.forEach(([a,b],i)=>{if(board[a]>=0&&board[a]===board[b])out.push([25+i,1]);});out.push([ROLE_INPUT,turnSign(board)],[PLY_INPUT,pairCount(board)/12]);return out;}
export function transformCell(i,t){let r=Math.floor(i/5),c=i%5;if(t>=4)c=4-c;for(let k=0;k<t%4;k++)[r,c]=[c,4-r];return 5*r+c;}
export function augment(example,t){const board=emptyBoard();example.board.forEach((v,i)=>board[transformCell(i,t)]=v);return {...example,board,policy:example.policy.map(([a,p])=>[actionIndex(...ACTIONS[a].map(i=>transformCell(i,t))),p])};}
function gaussian(rng){return Math.sqrt(-2*Math.log(Math.max(1e-12,rng())))*Math.cos(2*Math.PI*rng());}
function gamma(alpha,rng){if(alpha<1)return gamma(alpha+1,rng)*Math.pow(Math.max(1e-12,rng()),1/alpha);const d=alpha-1/3,c=1/Math.sqrt(9*d);while(true){let x=gaussian(rng),v=1+c*x;if(v<=0)continue;v=v**3;const u=rng();if(u<1-.0331*x**4||Math.log(u)<.5*x*x+d*(1-v+Math.log(v)))return d*v;}}
export function createModel({seed=1,extraCost=25}={}){paletteCosts(extraCost);const rng=seededRandom(seed),m={format:FORMAT,extraCost,seed,games:0,updates:0,createdAt:new Date().toISOString()};for(const[k,n]of Object.entries(SHAPES)){m[k]=new Float32Array(n);if(k[0]==='w'){const scale=k==='w1'?.12:.025;for(let i=0;i<n;i++)m[k][i]=gaussian(rng)*scale;}}return m;}
export function trainingStats(m){
 const stats=m.trainingStats??{selfPlay:m.games,searchWhite:0,searchBlack:0};
 if(['selfPlay','searchWhite','searchBlack'].some(k=>!Number.isSafeInteger(stats[k])||stats[k]<0)||stats.selfPlay+stats.searchWhite+stats.searchBlack!==m.games)throw Error('Invalid training role counters.');
 return {...stats};
}
export function packModel(m){const out={format:m.format,extraCost:m.extraCost,seed:m.seed,games:m.games,updates:m.updates,createdAt:m.createdAt,trainingStats:trainingStats(m)};for(const k of Object.keys(SHAPES))out[k]=Array.from(m[k]);return out;}
export function loadModel(raw){if(!raw||raw.format!==FORMAT)throw Error('This is not a compatible Gomulda learning checkpoint.');paletteCosts(raw.extraCost);for(const k of ['games','updates'])if(!Number.isSafeInteger(raw[k])||raw[k]<0)throw Error('Invalid training counters.');const m={format:FORMAT,extraCost:raw.extraCost,seed:raw.seed??1,games:raw.games,updates:raw.updates,createdAt:raw.createdAt,trainingStats:trainingStats(raw)};for(const[k,n]of Object.entries(SHAPES)){if(!raw[k]||raw[k].length!==n||Array.from(raw[k]).some(v=>!Number.isFinite(v)||Math.abs(v)>1000))throw Error(`Invalid model weights: ${k}.`);m[k]=Float32Array.from(raw[k]);}return m;}
export function predict(m,board){
 const x=features(board),h=Float32Array.from(m.b1);for(const[i,v]of x)for(let j=0;j<HIDDEN;j++)h[j]+=m.w1[i*HIDDEN+j]*v;for(let j=0;j<HIDDEN;j++)h[j]=Math.max(0,h[j]);
 const legal=legalMoves(board).map(([a,b])=>actionIndex(a,b)),p=new Float64Array(300);let max=-Infinity;
 for(const a of legal){let z=m.bp[a];for(let j=0;j<HIDDEN;j++)z+=h[j]*m.wp[j*300+a];p[a]=z;max=Math.max(max,z);}let sum=0;for(const a of legal){p[a]=Math.exp(p[a]-max);sum+=p[a];}for(const a of legal)p[a]/=sum;
 let value=m.bv[0];for(let j=0;j<HIDDEN;j++)value+=h[j]*m.wv[j];return {policy:p,value,legal,h,x};
}
const zeros=()=>Object.fromEntries(Object.entries(SHAPES).map(([k,n])=>[k,new Float32Array(n)]));
export function lossAndGradients(m,batch){const g=zeros();let policyLoss=0,valueLoss=0;
 for(const ex of batch){const f=predict(m,ex.board),target=new Float64Array(300),dh=new Float64Array(HIDDEN);for(const[a,p]of ex.policy)target[a]=p;
  for(const a of f.legal){if(target[a])policyLoss-=target[a]*Math.log(Math.max(1e-12,f.policy[a]));const dz=f.policy[a]-target[a];g.bp[a]+=dz;for(let j=0;j<HIDDEN;j++){g.wp[j*300+a]+=f.h[j]*dz;dh[j]+=m.wp[j*300+a]*dz;}}
  const error=f.value-ex.value;valueLoss+=Math.abs(error)<=1?error*error/2:Math.abs(error)-.5;const dv=Math.max(-1,Math.min(1,error));g.bv[0]+=dv;
  for(let j=0;j<HIDDEN;j++){g.wv[j]+=dv*f.h[j];dh[j]+=dv*m.wv[j];if(f.h[j]<=0)dh[j]=0;g.b1[j]+=dh[j];}for(const[i,v]of f.x)for(let j=0;j<HIDDEN;j++)g.w1[i*HIDDEN+j]+=dh[j]*v;
 }
 for(const a of Object.values(g))for(let i=0;i<a.length;i++)a[i]/=batch.length;
 return {gradients:g,policyLoss:policyLoss/batch.length,valueLoss:valueLoss/batch.length};
}
export function createOptimizer(){return {step:0,m:zeros(),v:zeros()};}
export function trainBatch(model,batch,optimizer,rate=.001){
 if(!batch.length)throw Error('A training batch cannot be empty.');const result=lossAndGradients(model,batch);optimizer.step++;const t=optimizer.step;
 let norm=0;for(const a of Object.values(result.gradients))for(const x of a)norm+=x*x;const clip=Math.min(1,5/Math.sqrt(norm||1));
 for(const k of Object.keys(SHAPES))for(let i=0;i<model[k].length;i++){const g=result.gradients[k][i]*clip;optimizer.m[k][i]=.9*optimizer.m[k][i]+.1*g;optimizer.v[k][i]=.999*optimizer.v[k][i]+.001*g*g;model[k][i]-=rate*((optimizer.m[k][i]/(1-.9**t))/(Math.sqrt(optimizer.v[k][i]/(1-.999**t))+1e-8)+.0001*model[k][i]);}
 model.updates++;return {policyLoss:result.policyLoss,valueLoss:result.valueLoss,gradientNorm:Math.sqrt(norm)};
}
export function neuralSearch(board,model,{simulations=96,timeMs,noise=false,temperature=0,seed=1,onProgress}={}){
 if(timeMs===undefined&&(!Number.isInteger(simulations)||simulations<2))throw Error('At least two simulations are required.');if(timeMs!==undefined&&(!Number.isFinite(timeMs)||timeMs<=0))throw Error('Invalid search time.');validateBoard(board);if(pairCount(board)>=12)throw Error('Pairing has finished.');const started=performance.now(),rng=seededRandom(seed),costs=paletteCosts(model.extraCost);let evaluations=0,terminals=0;
 const node=b=>({board:b,sign:turnSign(b),visits:0,edges:null,terminal:pairCount(b)===12,value:null});const root=node(board);
 function expand(n){if(n.terminal){if(n.value===null){n.value=solveBoard(n.board,costs).penalty/VALUE_SCALE;terminals++;}return n.value;}const f=predict(model,n.board);evaluations++;n.edges=f.legal.map(a=>({action:a,prior:f.policy[a],visits:0,total:0,child:null}));return f.value*n.sign;}
 expand(root);if(noise){const values=root.edges.map(()=>gamma(10/root.edges.length,rng)),sum=values.reduce((a,b)=>a+b,0);root.edges.forEach((e,i)=>e.prior=.75*e.prior+.25*values[i]/sum);}
 let count=0,lastReport=started,maxTreeDepth=0;const limit=timeMs===undefined?simulations:Infinity;
 while(count<limit&&(timeMs===undefined||count<2||performance.now()-started<timeMs)){
  let n=root;const path=[],nodes=[root];
  while(n.edges){let best=null,bestScore=-Infinity;for(const e of n.edges){const q=e.visits?e.total/e.visits:0;const score=n.sign*q+2.5*e.prior*Math.sqrt(n.visits+1)/(e.visits+1);if(score>bestScore){bestScore=score;best=e;}}path.push(best);if(!best.child)best.child=node(applyPair(n.board,ACTIONS[best.action]));n=best.child;nodes.push(n);}
  maxTreeDepth=Math.max(maxTreeDepth,path.length);const v=expand(n);for(const e of path){e.visits++;e.total+=v;}for(const p of nodes)p.visits++;count++;
  if(onProgress&&performance.now()-lastReport>250){lastReport=performance.now();onProgress({iterations:count,evaluated:terminals,neuralEvaluations:evaluations,maxTreeDepth,elapsedMs:performance.now()-started});}
 }
 const policy=root.edges.map(e=>[e.action,e.visits/count]),best=root.edges.reduce((a,b)=>a.visits>=b.visits?a:b);let chosen=best;
 if(temperature>0){const ws=root.edges.map(e=>Math.pow(e.visits,1/temperature)),sum=ws.reduce((a,b)=>a+b,0);let pick=rng()*sum;for(let i=0;i<ws.length;i++){pick-=ws[i];if(pick<=0){chosen=root.edges[i];break;}}}
 return {move:ACTIONS[chosen.action].slice(),policy:policy.filter(([,p])=>p>0),value:best.visits?best.total/best.visits*VALUE_SCALE:0,exact:false,method:'Neural PUCT',iterations:count,evaluated:terminals,neuralEvaluations:evaluations,maxTreeDepth,maxExactDepth:0,remainingPlies:12-pairCount(board),budgetMs:timeMs??null,elapsedMs:performance.now()-started};
}
export function validateTrainingOptions({mode='selfplay',simulations=96,searchTimeMs=150}={}){
 if(!['selfplay','search'].includes(mode))throw Error('Choose self-play or training against Search.');
 if(!Number.isInteger(simulations)||simulations<2||simulations>100000)throw Error('Invalid training simulations.');
 if(!Number.isFinite(searchTimeMs)||searchTimeMs<10||searchTimeMs>3000)throw Error('Search training time must be between 10 and 3000 ms.');
}
export function playTrainingRound(model,{simulations=96,seed=1,mode='selfplay',learnerRole='white',searchTimeMs=150,onMove}={}){
 validateTrainingOptions({mode,simulations,searchTimeMs});if(!['white','black'].includes(learnerRole))throw Error('Invalid learner role.');
 let board=emptyBoard();const examples=[],moves=[],costs=paletteCosts(model.extraCost);
 for(let ply=0;ply<12;ply++){
  const isZero=mode==='selfplay'||(ply%2===0)===(learnerRole==='white');
  const s=isZero?neuralSearch(board,model,{simulations,seed:seed+ply*701,noise:true,temperature:ply<8?1:.25}):choosePair(board,{timeMs:searchTimeMs,costs,seed:seed+ply*701});
  // Only Zero's own visit distributions are policy targets. Search is a fixed opponent, not an imitation label.
  if(isZero)examples.push({board:board.slice(),policy:s.policy,sign:turnSign(board)});
  moves.push(s.move);board=applyPair(board,s.move);onMove?.({ply:ply+1,board:board.slice(),engine:isZero?'zero':'search'});
 }
 const solution=solveBoard(board,costs);for(const ex of examples){ex.value=ex.sign*solution.penalty/VALUE_SCALE;delete ex.sign;}
 return {examples,board,moves,penalty:solution.penalty,colours:solution.colours,mode,learnerRole:mode==='search'?learnerRole:'both'};
}
export function createSession(model=createModel()){return {model,optimizer:createOptimizer(),replay:[],history:[]};}
export function trainRound(session,{simulations=96,seed=1,updates=8,batchSize=32,mode='selfplay',searchTimeMs=150,onMove}={}){
 validateTrainingOptions({mode,simulations,searchTimeMs});if(!Number.isInteger(updates)||updates<1||!Number.isInteger(batchSize)||batchSize<1)throw Error('Invalid training batch settings.');
 const stats=trainingStats(session.model),learnerRole=stats.searchWhite<=stats.searchBlack?'white':'black';
 const round=playTrainingRound(session.model,{simulations,seed,mode,learnerRole,searchTimeMs,onMove});session.replay.push(...round.examples);if(session.replay.length>4096)session.replay.splice(0,session.replay.length-4096);const rng=seededRandom(seed+424242);let loss;
 for(let i=0;i<updates;i++){const batch=Array.from({length:batchSize},()=>augment(session.replay[Math.floor(rng()*session.replay.length)],Math.floor(rng()*8)));loss=trainBatch(session.model,batch,session.optimizer);}
 stats[mode==='selfplay'?'selfPlay':learnerRole==='white'?'searchWhite':'searchBlack']++;session.model.games++;session.model.trainingStats=stats;
 const result={game:session.model.games,penalty:round.penalty,mode,learnerRole:round.learnerRole,searchTimeMs:mode==='search'?searchTimeMs:null,...loss,updates:session.model.updates,replaySize:session.replay.length};session.history.push(result);if(session.history.length>500)session.history.shift();return {...result,board:round.board,colours:round.colours};
}
export function evaluateMatch(model,{seed=800000,timeMs=150,opponentModel=null}={}){
 // Both colours play the same seeded two-pair opening. These seeds are separate from training.
 const rng=seededRandom(seed);let opening=emptyBoard();for(let n=0;n<2;n++){const moves=legalMoves(opening);opening=applyPair(opening,moves[Math.floor(rng()*moves.length)]);}const scores=[];
 for(const learnerWhite of [true,false]){let b=opening.slice();for(let ply=2;ply<12;ply++){const learner=(ply%2===0)===learnerWhite;const searchSeed=seed+ply*97;
  let move;if(learner)move=neuralSearch(b,model,{timeMs,seed:searchSeed}).move;else if(opponentModel)move=neuralSearch(b,opponentModel,{timeMs,seed:searchSeed}).move;else move=choosePair(b,{timeMs,costs:paletteCosts(model.extraCost),seed:searchSeed}).move;b=applyPair(b,move);}
  scores.push(solveBoard(b,paletteCosts(model.extraCost)).penalty);
 }return {seed,learnerWhite:scores[0],opponentWhite:scores[1],margin:scores[0]-scores[1],timeMs,opponent:opponentModel?'checkpoint':'search'};
}
export function summarizeArena(matches){const n=matches.length;if(!n)return null;const mean=matches.reduce((s,m)=>s+m.margin,0)/n,variance=n>1?matches.reduce((s,m)=>s+(m.margin-mean)**2,0)/(n-1):0,se=Math.sqrt(variance/n);return {matches:n,wins:matches.filter(m=>m.margin>0).length,draws:matches.filter(m=>m.margin===0).length,losses:matches.filter(m=>m.margin<0).length,meanMargin:mean,standardError:se,lowerApprox95:n>=8?mean-2.365*se:null,strongerEvidence:n>=8&&mean-2.365*se>0};}
export function packSession(s){return {model:packModel(s.model),replay:s.replay,history:s.history,optimizer:{step:s.optimizer.step,m:Object.fromEntries(Object.entries(s.optimizer.m).map(([k,v])=>[k,Array.from(v)])),v:Object.fromEntries(Object.entries(s.optimizer.v).map(([k,v])=>[k,Array.from(v)]))}};}
export function loadSession(raw){const s=createSession(loadModel(raw.model??raw));if(!raw.model)return s;
 if(raw.replay){if(!Array.isArray(raw.replay)||raw.replay.length>4096)throw Error('Invalid replay buffer.');for(const e of raw.replay){validateBoard(e.board);if(pairCount(e.board)>=12||!Number.isFinite(e.value)||Math.abs(e.value)>1e8||!Array.isArray(e.policy)||!e.policy.length)throw Error('Invalid replay example.');let sum=0;const seen=new Set();for(const[a,p]of e.policy){if(!Number.isInteger(a)||a<0||a>=300||seen.has(a)||!Number.isFinite(p)||p<0||ACTIONS[a].some(i=>e.board[i]>=0))throw Error('Invalid replay policy.');seen.add(a);sum+=p;}if(Math.abs(sum-1)>1e-5)throw Error('Invalid replay probability total.');}s.replay=raw.replay;}
 if(raw.optimizer){if(!Number.isSafeInteger(raw.optimizer.step)||raw.optimizer.step<0)throw Error('Invalid optimizer step.');s.optimizer.step=raw.optimizer.step;for(const kind of ['m','v'])for(const[k,n]of Object.entries(SHAPES)){const a=raw.optimizer[kind]?.[k];if(!a||a.length!==n||Array.from(a).some(v=>!Number.isFinite(v)||Math.abs(v)>1e6||kind==='v'&&v<0))throw Error('Invalid optimizer state.');s.optimizer[kind][k]=Float32Array.from(a);}}
 s.history=Array.isArray(raw.history)?raw.history.filter(r=>Number.isFinite(r.valueLoss)&&Number.isFinite(r.policyLoss)&&Number.isSafeInteger(r.game)).slice(-500):[];return s;
}
