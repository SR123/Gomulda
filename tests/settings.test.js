import test from 'node:test';
import assert from 'node:assert/strict';
import {paletteCosts,legalMoves,solveBoard,inspectColouring} from '../dist/engine.js';
import {newGame,activePlayer,whitePlayer,searchBudget,commitPair,applyColouring,finishRound,nextRound,nextWatchMatch,restoreGame} from '../dist/game.js';
import {createModel,packModel,loadModel} from '../dist/learning.js';

test('fixed sixth colour charges 50 for a pair and 25 for the singleton',()=>{
 const g=newGame();while(g.phase==='pair')commitPair(g,legalMoves(g.board)[0]);
 const colours=Array(13).fill(-1);colours[0]=5;assert.equal(inspectColouring(g.board,colours).penalty,50);
 colours[0]=-1;colours[12]=5;assert.equal(inspectColouring(g.board,colours).penalty,25);
 assert.deepEqual(paletteCosts().slice(0,8),[0,0,0,1,5,25,125,625]);
 for(const value of [6,10,40,1000]){assert.throws(()=>paletteCosts(value),/25 points/);assert.throws(()=>newGame({extraCost:value}),/25 points/);}
 assert.throws(()=>loadModel({...packModel(createModel()),extraCost:40}),/25 points/);
});

test('unequal budgets follow players through both roles, colour phases, reload and another match',()=>{
 let g=newGame({mode:'watch',firstWhite:1,timeBudgets:[800,3000]});
 g.engines=['search','zero'];g.zeroModel={checkpoint:'fixed'};g.watch={target:2,completed:0,results:[],paused:true,recorded:false};
 for(let match=0;match<2;match++){
  for(let round=1;round<=2;round++){
   assert.equal(whitePlayer(g),round===1?1:0);
   for(let move=0;move<12;move++){
    const player=move%2===0?whitePlayer(g):1-whitePlayer(g);
    assert.equal(activePlayer(g),player);assert.equal(searchBudget(g),player===0?800:3000);
    commitPair(g,legalMoves(g.board)[0]);g=restoreGame(JSON.stringify(g));
   }
   assert.equal(searchBudget(g),whitePlayer(g)===0?3000:800);
   applyColouring(g,solveBoard(g.board).colours);finishRound(g);if(round===1)nextRound(g);
  }
  g.watch.completed++;g.watch.results.push(g.scores.slice());g.watch.recorded=true;
  if(match===0){g=nextWatchMatch(g);assert.equal(g.firstWhite,1);assert.deepEqual(g.engines,['search','zero']);assert.deepEqual(g.zeroModel,{checkpoint:'fixed'});assert.equal(g.watch.paused,true);assert.equal(g.watch.recorded,false);assert.equal(g.watch.results.length,1);}
 }
 assert.throws(()=>nextWatchMatch(g));
});

test('legacy shared level becomes both player budgets without changing an existing game',()=>{
 const g=newGame({mode:'local'});commitPair(g,[0,24]);delete g.timeBudgets;
 const restored=restoreGame(JSON.stringify(g),{legacyTimeMs:10000});
 assert.deepEqual(restored.timeBudgets,[10000,10000]);assert.deepEqual(restored.board,g.board);assert.deepEqual(restored.history,g.history);
});

test('invalid independent budgets are rejected before a match starts or resumes',()=>{
 for(const timeBudgets of [[],[800],[800,0],[800,Infinity],[800,'3000'],[800,3000,10000]]){
  assert.throws(()=>newGame({timeBudgets}));assert.throws(()=>restoreGame(JSON.stringify({...newGame(),timeBudgets})));
 }
});

test('legacy custom-cost match keeps board and colours, and recalculates submitted scores',()=>{
 const g=newGame({mode:'local'});while(g.phase==='pair')commitPair(g,legalMoves(g.board)[0]);
 applyColouring(g,Array.from({length:13},(_,i)=>i));finishRound(g);
 const expected=g.scores.slice();g.extraCost=40;g.scores[0]=123;g.roundRecords[0].penalty=123;g.solution={penalty:123};g.lastSearch={value:123};
 const restored=restoreGame(JSON.stringify(g));assert.equal(restored.extraCost,25);assert.deepEqual(restored.board,g.board);assert.deepEqual(restored.colours,g.colours);assert.deepEqual(restored.scores,expected);assert.equal(restored.solution,null);assert.equal(restored.lastSearch,null);assert.match(restored.ruleNotice,/recalculated/);
});
