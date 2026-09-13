import test from 'node:test';import assert from 'node:assert/strict';
import {ACTIONS,actionIndex,features,ROLE_INPUT,WHITE_ROLE,BLACK_ROLE,augment,createModel,packModel,loadModel,predict,lossAndGradients,trainBatch,createOptimizer,neuralSearch,playTrainingRound,createSession,trainRound,summarizeArena,trainingStats,packSession,loadSession,evaluateMatch} from '../dist/learning.js';
import {emptyBoard,applyPair,legalMoves,pairCount,randomCompletion,seededRandom,solveBoard} from '../dist/engine.js';
import {newGame,activePlayer,whitePlayer,commitPair,applyColouring,finishRound,nextRound} from '../dist/game.js';
test('dedicated role input reaches the network and follows current roles across the round swap',()=>{
 const g=newGame({mode:'local',firstWhite:1}),m=createModel();
 // Isolate the role-to-value path: all other features have zero influence in this probe network.
 for(const v of Object.values(m))if(v instanceof Float32Array)v.fill(0);
 m.w1[ROLE_INPUT*64]=1;m.wv[0]=1;
 for(let round=1;round<=2;round++){
  assert.equal(whitePlayer(g),round===1?1:0);
  for(let ply=0;ply<12;ply++){
   const white=activePlayer(g)===whitePlayer(g);
   assert.equal(new Map(features(g.board)).get(ROLE_INPUT),white?WHITE_ROLE:BLACK_ROLE);
   assert.equal(predict(m,g.board).value,white?1:0);
   commitPair(g,legalMoves(g.board)[0]);
  }
  applyColouring(g,solveBoard(g.board).colours);finishRound(g);if(round===1)nextRound(g);
 }
});
test('White neural search maximizes against a minimizing Black reply and reports actual depth',()=>{
 const b=randomCompletion(emptyBoard(),seededRandom(9)).map(c=>c<10?c:-1);
 const minimaxAfter=move=>{const child=applyPair(b,move);return Math.min(...legalMoves(child).map(reply=>solveBoard(applyPair(child,reply)).penalty));};
 const values=legalMoves(b).map(minimaxAfter),r=neuralSearch(b,createModel(),{simulations:4000,seed:11});
 assert(new Set(values).size>1);assert.equal(minimaxAfter(r.move),Math.max(...values));assert.equal(r.maxTreeDepth,2);assert.equal(r.remainingPlies,2);assert.equal(r.exact,false);
 const shallow=neuralSearch(emptyBoard(),createModel(),{simulations:2});assert(shallow.maxTreeDepth>=1&&shallow.maxTreeDepth<=2);assert.equal(shallow.remainingPlies,12);
});
test('all 300 unordered actions and label-independent encoding',()=>{assert.equal(ACTIONS.length,300);ACTIONS.forEach(([a,b],i)=>{assert.equal(actionIndex(a,b),i);assert.equal(actionIndex(b,a),i);});let b=applyPair(applyPair(emptyBoard(),[0,24]),[1,23]);assert.deepEqual(features(b),features(b.map(x=>x<0?x:1-x)));});
test('all eight symmetries preserve legal policy targets',()=>{const b=applyPair(emptyBoard(),[0,4]),ex={board:b,policy:[[actionIndex(1,24),1]],value:.2};for(let t=0;t<8;t++){const e=augment(ex,t);assert.doesNotThrow(()=>applyPair(e.board,ACTIONS[e.policy[0][0]]));assert.equal(e.value,.2);}});
test('network masks illegal moves and checkpoint roundtrip is exact',()=>{const b=applyPair(emptyBoard(),[0,1]),m=createModel(),f=predict(m,b);assert(Math.abs([...f.policy].reduce((a,b)=>a+b,0)-1)<1e-10);for(let i=0;i<300;i++)if(ACTIONS[i].includes(0)||ACTIONS[i].includes(1))assert.equal(f.policy[i],0);assert.deepEqual(predict(loadModel(packModel(m)),b).policy,f.policy);assert.throws(()=>loadModel({...packModel(m),w1:[0]}));});
test('backprop agrees with numerical finite differences for every parameter family',()=>{const m=createModel({seed:13}),b=applyPair(emptyBoard(),[0,1]),ex={board:b,policy:[[actionIndex(2,3),1]],value:.8},g=lossAndGradients(m,[ex]);const loss=()=>{const x=lossAndGradients(m,[ex]);return x.policyLoss+x.valueLoss;};for(const k of ['w1','b1','wp','bp','wv','bv']){const idx=k==='w1'?2*64:k==='wp'?actionIndex(2,3):k==='bp'?actionIndex(2,3):0;const old=m[k][idx],eps=.001;m[k][idx]=old+eps;const p=loss();m[k][idx]=old-eps;const q=loss();m[k][idx]=old;assert(Math.abs((p-q)/(2*eps)-g.gradients[k][idx])<.004,k);}});
test('Adam actually updates weights and reduces a fixed batch loss',()=>{const m=createModel(),ex={board:emptyBoard(),policy:[[17,1]],value:.4},before=lossAndGradients(m,[ex]),opt=createOptimizer();for(let i=0;i<50;i++)trainBatch(m,[ex],opt);const after=lossAndGradients(m,[ex]);assert(after.policyLoss+after.valueLoss<.3*(before.policyLoss+before.valueLoss));assert.equal(m.updates,50);});
test('PUCT visit probabilities are normalized and Black minimizes terminal penalties',()=>{const m=createModel();const b=randomCompletion(emptyBoard(),seededRandom(10)).map(c=>c<11?c:-1),s=neuralSearch(b,m,{simulations:500});const values=legalMoves(b).map(move=>solveBoard(applyPair(b,move)).penalty);assert.equal(solveBoard(applyPair(b,s.move)).penalty,Math.min(...values));assert(Math.abs(s.policy.reduce((v,[,p])=>v+p,0)-1)<1e-10);assert.equal(s.iterations,500);assert(!s.exact);});
test('real self-play yields 12 search targets and signed exact values',()=>{const m=createModel(),r=playTrainingRound(m,{simulations:16,seed:7});assert.equal(r.examples.length,12);assert.equal(r.penalty,solveBoard(r.board).penalty);r.examples.forEach((e,i)=>assert.equal(e.value,(i%2===0?1:-1)*r.penalty/10));const session=createSession(m);const old=m.w1.slice();trainRound(session,{simulations:16,updates:2});assert.equal(m.games,1);assert.equal(session.replay.length,12);assert.notDeepEqual(m.w1,old);});
test('arena does not claim strength from tiny or losing samples',()=>{assert.equal(summarizeArena([{margin:10}]).strongerEvidence,false);assert.equal(summarizeArena(Array(8).fill({margin:-2})).strongerEvidence,false);assert.equal(summarizeArena(Array(8).fill({margin:2})).strongerEvidence,true);});
test('full session checkpoints preserve replay and optimizer for continuation',async()=>{const {packSession,loadSession}=await import('../dist/learning.js');const s=createSession();trainRound(s,{simulations:16,updates:1});const restored=loadSession(JSON.parse(JSON.stringify(packSession(s))));assert.equal(restored.model.games,1);assert.equal(restored.optimizer.step,s.optimizer.step);assert.deepEqual(restored.optimizer.m.w1,s.optimizer.m.w1);assert.deepEqual(restored.replay,s.replay);trainRound(restored,{simulations:16,updates:1});assert.equal(restored.model.games,2);const raw=packSession(s);raw.replay[0].policy=[[999,1]];assert.throws(()=>loadSession(raw));});
test('Search opponent training records only Zero decisions with correct rewards in both roles',()=>{
 const m=createModel();
 for(const learnerRole of ['white','black']){
  const engines=[];const r=playTrainingRound(m,{mode:'search',learnerRole,simulations:16,searchTimeMs:10,seed:61,onMove:move=>engines.push(move.engine)});
  assert.equal(r.examples.length,6);assert.equal(r.penalty,solveBoard(r.board).penalty);
  for(let i=0;i<12;i++)assert.equal(engines[i],(i%2===0)===(learnerRole==='white')?'zero':'search');
  r.examples.forEach(e=>{assert.equal(pairCount(e.board)%2,learnerRole==='white'?0:1);assert.equal(e.value,(learnerRole==='white'?1:-1)*r.penalty/10);assert(Math.abs(e.policy.reduce((s,[,p])=>s+p,0)-1)<1e-10);});
 }
 assert.equal(m.updates,0);assert.equal(m.games,0);
});
test('opponent roles alternate across odd runs, self-play and checkpoint resume',()=>{
 let s=createSession();const opts={mode:'search',simulations:16,searchTimeMs:10,updates:1,batchSize:8};
 assert.equal(trainRound(s,opts).learnerRole,'white');assert.equal(s.replay.length,6);
 s=loadSession(JSON.parse(JSON.stringify(packSession(s))));
 trainRound(s,{simulations:16,updates:1,batchSize:8});
 assert.equal(trainRound(s,opts).learnerRole,'black');assert.equal(trainRound(s,opts).learnerRole,'white');
 assert.deepEqual(trainingStats(s.model),{selfPlay:1,searchWhite:2,searchBlack:1});assert.equal(s.model.games,4);assert.equal(s.model.updates,4);
 assert.deepEqual(trainingStats(loadModel(packModel(s.model))),trainingStats(s.model));
 const legacy=packModel(s.model);delete legacy.trainingStats;assert.deepEqual(trainingStats(loadModel(legacy)),{selfPlay:4,searchWhite:0,searchBlack:0});
 assert.throws(()=>loadModel({...packModel(s.model),trainingStats:{selfPlay:4,searchWhite:1,searchBlack:0}}));
});
test('invalid opponent settings cannot partially train and arena never mutates model',()=>{
 const s=createSession(),before=packSession(s);
 for(const options of [{mode:'bad'},{mode:'search',searchTimeMs:0},{mode:'search',simulations:0},{updates:0}])assert.throws(()=>trainRound(s,options));
 assert.deepEqual(packSession(s),before);
 const result=evaluateMatch(s.model,{timeMs:10,seed:880011});assert(Number.isFinite(result.margin));assert.deepEqual(packSession(s),before);
});
