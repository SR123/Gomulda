import {emptyBoard,paletteCosts,applyPair,inspectColouring,pairCount,validateBoard} from './engine.js?v=9';
export const SEARCH_LEVELS=Object.freeze({800:'Quick',3000:'Thoughtful',10000:'Deep',30000:'Extended'});
export function validateTimeBudgets(values){if(!Array.isArray(values)||values.length!==2||values.some(v=>!Number.isInteger(v)||!Object.hasOwn(SEARCH_LEVELS,v)))throw Error('Choose a thinking time for each player: 0.8, 3, 10 or 30 seconds.');return values.slice();}
export function newGame({mode='ai',firstWhite=0,extraCost=25,timeBudgets=[3000,3000]}={}){if(!['ai','local','watch'].includes(mode)||![0,1].includes(firstWhite))throw Error('Invalid match settings.');paletteCosts(extraCost);return {version:1,mode,firstWhite,extraCost,timeBudgets:validateTimeBudgets(timeBudgets),round:1,scores:[null,null],phase:'pair',board:emptyBoard(),colours:Array(13).fill(-1),pencils:Array(25).fill(-1),history:[],roundRecords:[],solution:null};}
export const whitePlayer=g=>g.round===1?g.firstWhite:1-g.firstWhite;
export const activePlayer=g=>g.phase==='pair'?(pairCount(g.board)%2===0?whitePlayer(g):1-whitePlayer(g)):1-whitePlayer(g);
export const isAI=(g,p=activePlayer(g))=>g.mode==='watch'||g.mode==='ai'&&p===1;
export const searchBudget=(g,p=activePlayer(g))=>g.timeBudgets[p];
export function nextWatchMatch(g){if(g.mode!=='watch'||g.phase!=='matchEnd'||!g.watch||g.watch.completed>=g.watch.target)throw Error('There is no next self-play match.');return Object.assign(newGame({mode:'watch',firstWhite:g.firstWhite,timeBudgets:g.timeBudgets}),{engines:g.engines?.slice(),zeroModel:g.zeroModel,watch:{...g.watch,recorded:false}});}
function remember(g){g.history.push({board:g.board.slice(),colours:g.colours.slice(),pencils:g.pencils.slice(),phase:g.phase});if(g.history.length>100)g.history.shift();}
export function commitPair(g,move){if(g.phase!=='pair')throw Error('Pairing is not active.');const board=applyPair(g.board,move);remember(g);g.board=board;g.solution=null;if(pairCount(board)===12){g.phase='colour';g.pencils.fill(-1);g.colours.fill(-1);}return g;}
export function paintCountry(g,country,colour){if(g.phase!=='colour')throw Error('Colouring starts after all countries are paired.');if(!Number.isInteger(country)||country<0||country>=13||!Number.isInteger(colour)||colour< -1||colour>=13)throw Error('Invalid country or colour.');if(g.colours[country]===colour)return g;remember(g);g.colours[country]=colour;return g;}
export function applyColouring(g,colours){if(g.phase!=='colour')throw Error('Colouring is not active.');if(!inspectColouring(g.board,colours,paletteCosts(g.extraCost)).valid)throw Error('The proposed colouring is not legal and complete.');remember(g);g.colours=colours.slice();return g;}
export function finishRound(g){if(g.phase!=='colour')throw Error('There is no colouring to submit.');const info=inspectColouring(g.board,g.colours,paletteCosts(g.extraCost));if(!info.valid)throw Error('Colour every country and resolve all shared-border conflicts first.');g.scores[whitePlayer(g)]=info.penalty;g.roundRecords.push({round:g.round,white:whitePlayer(g),penalty:info.penalty,board:g.board.slice(),colours:g.colours.slice()});g.phase=g.round===1?'roundEnd':'matchEnd';return info;}
export function nextRound(g){if(g.phase!=='roundEnd')throw Error('Complete the first round before switching roles.');g.round=2;g.phase='pair';g.board=emptyBoard();g.colours.fill(-1);g.pencils.fill(-1);g.history=[];g.solution=null;return g;}
export function undo(g){if(!['pair','colour'].includes(g.phase)||!g.history.length)return false;Object.assign(g,g.history.pop());g.solution=null;if(g.mode==='ai')while(g.phase==='pair'&&isAI(g)&&g.history.length)Object.assign(g,g.history.pop());return true;}
export function restoreGame(raw,{legacyTimeMs=3000}={}){
 const g=JSON.parse(raw);
 if(g.version!==1||!['ai','local','watch'].includes(g.mode)||![0,1].includes(g.firstWhite)||![1,2].includes(g.round)||!['pair','colour','roundEnd','matchEnd'].includes(g.phase))throw Error('Invalid saved match.');
 // Preserve old boards and submitted colourings when adopting the fixed rule.
 if(!Number.isInteger(g.extraCost)||g.extraCost<6||g.extraCost>1000)throw Error('Invalid saved colour cost.');
 const oldCost=g.extraCost;g.extraCost=25;
 g.timeBudgets=validateTimeBudgets(g.timeBudgets??[legacyTimeMs,legacyTimeMs]);
 validateBoard(g.board,g.phase!=='pair');if(g.phase==='pair'&&pairCount(g.board)>=12)throw Error('Invalid pairing phase.');
 if(!Array.isArray(g.scores)||g.scores.length!==2||g.scores.some(s=>s!==null&&(!Number.isFinite(s)||s<0)))throw Error('Invalid score.');
 if(!Array.isArray(g.colours)||g.colours.length!==13||g.colours.some(c=>!Number.isInteger(c)||c< -1||c>=13))throw Error('Invalid colours.');
 if(g.phase!=='pair')inspectColouring(g.board,g.colours);
 if(!Array.isArray(g.pencils)||g.pencils.length!==25)g.pencils=Array(25).fill(-1);
 if(!Array.isArray(g.history))g.history=[];
 g.history=g.history.filter(s=>{try{validateBoard(s.board,s.phase!=='pair');return ['pair','colour'].includes(s.phase)&&s.colours?.length===13&&s.pencils?.length===25;}catch{return false;}}).slice(-100);
 g.roundRecords=Array.isArray(g.roundRecords)?g.roundRecords:[];
 if(oldCost!==25){
  for(const r of g.roundRecords){const info=inspectColouring(r.board,r.colours);if(!info.valid||![0,1].includes(r.white))throw Error('Invalid saved round.');r.penalty=info.penalty;g.scores[r.white]=r.penalty;}
  if(['roundEnd','matchEnd'].includes(g.phase))g.scores[whitePlayer(g)]=inspectColouring(g.board,g.colours).penalty;
  g.solution=null;g.lastSearch=null;
  if(g.zeroModel?.extraCost!==25){g.zeroModel=null;g.engines=g.engines?.map(e=>e==='zero'?'search':e);}
  // Previous series scores used different rules; retain them with their rule label.
  if(g.watch){g.watch.previousRuleCost=oldCost;g.watch.paused=true;}
  g.ruleNotice='The sixth colour now costs 25 per square. Your board and colours were kept, and submitted round scores recalculated.';
 }
 return g;
}
