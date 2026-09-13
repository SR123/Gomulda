import {initBookLab} from './book-ui.js?v=9';
import {initLearningLab} from './learning-ui.js?v=9';
import {COLOUR_NAMES,COLOUR_HEX,coord,pairCount,paletteCosts,inspectColouring} from './engine.js?v=9';
import {newGame,whitePlayer,activePlayer,isAI,commitPair,paintCountry,applyColouring,finishRound,nextRound,undo,restoreGame,SEARCH_LEVELS,validateTimeBudgets,searchBudget,nextWatchMatch} from './game.js?v=9';
const $=id=>document.getElementById(id),STORAGE='gomulda.match.v1';
let legacyTimeMs=3000;try{const value=Number(localStorage.getItem('gomulda.strength'));if(Object.hasOwn(SEARCH_LEVELS,value))legacyTimeMs=value;}catch{}
let game;try{const raw=localStorage.getItem(STORAGE);game=raw?restoreGame(raw,{legacyTimeMs}):newGame({timeBudgets:[legacyTimeMs,legacyTimeMs]});if(raw&&JSON.parse(raw).extraCost!==25){try{localStorage.setItem('gomulda.match.before-fixed-rule',raw);}catch{}}}catch{game=newGame();}
let learnerManager=null,bookManager=null;
const engineFor=p=>game.engines?.[p]??'search';
const engineName=p=>({search:'Gomulda Search',zero:'Gomulda Zero',book:'Gomulda Search + book'})[engineFor(p)];
let selection=[],selectedCountry=null,selectedColour=0,pencilColour=0,busy=false,worker=null,job=null,requestId=0,autoTimer=null,note=game.ruleNotice??'',hintSquares=[];
function setStrength(value,player){const times=game.timeBudgets.slice();if(player===undefined)times.fill(Number(value));else {if(![0,1].includes(player))throw Error('Choose Player 1 or Player 2.');times[player]=Number(value);}game.timeBudgets=validateTimeBudgets(times);save();render();}
const playerName=p=>game.mode==='ai'?(p===0?'You':engineName(p)):game.mode==='watch'?`${engineName(p)} ${p+1}`:`Player ${p+1}`;
const costs=()=>paletteCosts(game.extraCost);
function save(){try{localStorage.setItem(STORAGE,JSON.stringify(game));}catch{note='This browser could not save the match. Keep this page open to continue.';}}
function stopWork(){clearTimeout(autoTimer);autoTimer=null;worker?.terminate();worker=null;busy=false;requestId++;job?.reject(new Error('Cancelled'));job=null;}
function runWorker(kind){
 if(busy)return Promise.reject(new Error('The AI is already thinking.'));const actor=activePlayer(game),timeMs=searchBudget(game,actor);const book=kind==='pair'&&engineFor(activePlayer(game))==='book'?bookManager?.getBook(game.extraCost):null;if(kind==='pair'&&engineFor(activePlayer(game))==='book'&&!book)return Promise.reject(Error('The book is still loading.'));busy=true;const id=++requestId;worker=new Worker(new URL('./worker.js?v=9',import.meta.url),{type:'module'});render();$('search-progress').textContent=kind==='pair'?`${playerName(actor)} · ${SEARCH_LEVELS[timeMs]} · up to ${timeMs/1000} seconds per move`:'Solving the colouring exactly…';
 return new Promise((resolve,reject)=>{job={resolve,reject};worker.onmessage=({data})=>{if(data.id!==requestId)return;if(data.progress){const p=data.progress,depth=Math.max(p.maxTreeDepth??0,p.maxExactDepth??0);$('search-progress').textContent=`${(p.elapsedMs/1000).toFixed(1)} / ${timeMs/1000} s · ${p.iterations.toLocaleString()} simulations · deepest branch ${depth} pair moves`;return;}if(data.book)bookManager.accept(data.book);worker.terminate();worker=null;busy=false;job=null;if(data.error)reject(Error(data.error));else resolve(data.result);};worker.onerror=()=>{worker?.terminate();worker=null;busy=false;job=null;reject(Error('The AI could not complete its search. Please try again.'));};worker.postMessage({id,kind,board:game.board.slice(),costs:costs(),timeMs,engine:engineFor(actor),model:game.zeroModel,book});});
}
function scheduleAI(){clearTimeout(autoTimer);autoTimer=null;if(busy)return;if(game.mode==='watch'&&game.watch){
 if(game.phase==='matchEnd'&&!game.watch.recorded){game.watch.completed++;game.watch.results.push(game.scores.slice());game.watch.recorded=true;save();render();}
 if(game.watch.paused)return;
 if(['roundEnd','matchEnd'].includes(game.phase)){if(game.phase==='matchEnd'&&game.watch.completed>=game.watch.target)return;autoTimer=setTimeout(()=>advanceWatch(),1800);return;}}
 if(['pair','colour'].includes(game.phase)&&isAI(game))autoTimer=setTimeout(()=>performAI(false,false),350);}
function advanceWatch(){if(game.phase==='roundEnd'){nextRound(game);}else if(game.phase==='matchEnd'&&game.watch.completed<game.watch.target){game=nextWatchMatch(game);}selection=[];selectedCountry=null;note='';stateChanged();}

function stateChanged(){hintSquares=[];save();render();scheduleAI();}
function commit(move){if(busy)throw Error('Wait for the current search.');commitPair(game,move);selection=[];selectedCountry=game.phase==='colour'?0:null;note='';stateChanged();}
async function performAI(hintOnly=false,manual=true){
 clearTimeout(autoTimer);autoTimer=null;if(busy||!['pair','colour'].includes(game.phase))return;
 const phase=game.phase,actor=activePlayer(game);note='';
 try{
  const result=await runWorker(phase==='pair'?'pair':'colour');
  if(phase==='pair'){
   game.lastSearch={engine:engineFor(actor),role:pairCount(game.board)%2===0?'White':'Black',round:game.round,country:pairCount(game.board),method:result.method,exact:result.exact,bookHits:result.bookHits??0,iterations:result.iterations,evaluated:result.evaluated,neuralEvaluations:result.neuralEvaluations??0,maxTreeDepth:result.maxTreeDepth,maxExactDepth:result.maxExactDepth,remainingPlies:result.remainingPlies,budgetMs:result.budgetMs,requestedBudgetMs:searchBudget(game,actor),elapsedMs:result.elapsedMs};
   const explanation=result.method==='Solved book position'||result.method==='Book proof search'?`Proven book value: ${result.value} penalty points with optimal play.`:result.method==='Opening book estimate'?`Stored opening-book suggestion. Estimated penalty ${result.value.toFixed(2)}; the opening is not proved.`:result.method==='Neural PUCT'?`Gomulda Zero evaluated ${result.neuralEvaluations.toLocaleString()} neural positions. Estimated penalty ${result.value.toFixed(1)}; learned estimate, not a proven value.`:result.exact?`Exact endgame search: ${result.value} penalty points with best play on both sides.`:`${result.evaluated.toLocaleString()} completed maps examined. Estimated penalty ${result.value.toFixed(1)}; this is a search estimate, not a guaranteed score.`;
   if(hintOnly){selection=result.move;hintSquares=result.move;note=`Suggested pair: ${result.move.map(coord).join(' + ')}. ${explanation}`;save();render();}
   else{commitPair(game,result.move);selection=[];selectedCountry=game.phase==='colour'?0:null;note=`${playerName(actor)} paired ${result.move.map(coord).join(' + ')}. ${explanation}`;save();render();scheduleAI();}
  }else{
   game.solution=result;
   if(hintOnly){note=`The proven minimum is ${result.penalty}. Your map has ${inspectColouring(game.board,game.colours,costs()).penalty} points so far. “Let AI colour” fills an optimal solution for you.`;save();render();}
   else{applyColouring(game,result.colours);note=`Proven minimum: ${result.penalty} penalty points. All shared borders checked.`;if(!manual)finishRound(game);save();render();scheduleAI();}
  }
 }catch(error){if(error.message!=='Cancelled'){busy=false;worker?.terminate();worker=null;note=error.message;render();}}
}
function chooseCell(i){
 if(busy)return;
 if(game.phase==='pair'){
  if($('pencil-toggle').checked){const c=game.board[i];game.board.forEach((v,j)=>{if(c<0?j===i:v===c)game.pencils[j]=pencilColour;});save();render();return;}
  if(isAI(game)||game.board[i]>=0)return;
  selection=selection.includes(i)?selection.filter(n=>n!==i):selection.length<2?[...selection,i]:[i];note='';hintSquares=[];render();
 }else if(game.phase==='colour'&&!isAI(game)){selectedCountry=game.board[i];paintCountry(game,selectedCountry,selectedColour);note='';save();render();}
 else{selectedCountry=game.board[i];render();}
}
function makeColourButton(c,pencil=false){const b=document.createElement('button');b.className='colour-button';b.classList.toggle('active',(pencil?pencilColour:selectedColour)===c);b.setAttribute('aria-pressed',String((pencil?pencilColour:selectedColour)===c));b.setAttribute('aria-label',c<0?'Erase colour':`${COLOUR_NAMES[c]}, ${costs()[c]} per square`);if(c>=0){const sw=document.createElement('i');sw.className='swatch';sw.style.backgroundColor=COLOUR_HEX[c];b.append(sw);}const label=document.createElement('span');label.textContent=c<0?'Erase':COLOUR_NAMES[c];b.append(label);if(!pencil&&c>=0){const small=document.createElement('small');small.textContent=String(costs()[c]);b.append(small);}b.disabled=busy||!pencil&&(game.phase!=='colour'||isAI(game));b.onclick=()=>{if(pencil)pencilColour=c;else selectedColour=c;render();};return b;}
function render(){
 for(let p=0;p<2;p++){$(`strength-${p}`).value=String(game.timeBudgets[p]);$(`strength-${p}`).disabled=busy;$(`strength-label-${p}`).textContent=`Player ${p+1} · ${playerName(p)}`;}const last=game.lastSearch;if(last){const depth=Math.max(last.maxTreeDepth,last.maxExactDepth),work=last.exact?`${last.iterations.toLocaleString()} search nodes`:last.engine==='zero'?`${last.iterations.toLocaleString()} simulations, ${last.neuralEvaluations.toLocaleString()} neural positions`:`${last.iterations.toLocaleString()} simulations, ${last.evaluated.toLocaleString()} completed maps`;$('search-depth').textContent=`Last analysis · ${last.role}, country ${last.country}, round ${last.round}: ${(last.elapsedMs/1000).toFixed(2)} s (budget ${(last.requestedBudgetMs??last.budgetMs)/1000} s). ${work}. ${last.exact?`Solved all ${last.remainingPlies} remaining pair moves with optimal play.`:`Deepest explored branch: ${depth} of ${last.remainingPlies} remaining pair moves. This does not mean every branch was searched to that depth.${last.engine==='search'?' Random completions continue to the end.':''}`}`;if(last.bookHits)$('search-depth').textContent+=` ${last.bookHits} solved/book lookup${last.bookHits===1?'':'s'} used.`;if(last.method==='Opening book estimate')$('search-depth').textContent=`Stored opening estimate used for ${last.role}, country ${last.country}. No new tree search; this is not a proof.`;if(last.method==='Solved book position')$('search-depth').textContent=`Verified book value used for ${last.role}, country ${last.country}: solved through the remaining ${last.remainingPlies} pair moves.`;}else $('search-depth').textContent='Search depth and work appear here after an AI move or hint.';
 const n=pairCount(game.board),pair=game.phase==='pair',colour=game.phase==='colour',end=['roundEnd','matchEnd'].includes(game.phase),white=whitePlayer(game),actor=activePlayer(game),ai=isAI(game),whiteTurn=pair&&n%2===0;
 const info=pair?null:inspectColouring(game.board,game.colours,costs()),bad=new Set(info?.conflicts.flat()??[]),focused=document.activeElement?.dataset?.square;
 $('board').replaceChildren();
 for(let i=0;i<25;i++){
  const c=game.board[i],paint=c>=0?game.colours[c]:-1,b=document.createElement('button');b.className='cell';b.dataset.square=i;for(const [cls,on]of Object.entries({empty:c<0,assigned:c>=0,selected:selection.includes(i),'country-active':!pair&&selectedCountry===c,conflict:bad.has(c),hinted:hintSquares.includes(i)}))b.classList.toggle(cls,on);
  if(c>=0){b.textContent=String(c);const small=document.createElement('small');small.textContent=c===12?'SINGLE':'PAIR';b.append(small);}if(!pair&&paint>=0){b.style.backgroundColor=COLOUR_HEX[paint];b.dataset.colour=paint;}if(pair&&game.pencils[i]>=0){const dot=document.createElement('i');dot.className='pencil';dot.style.backgroundColor=COLOUR_HEX[game.pencils[i]];b.append(dot);}
  b.setAttribute('aria-label',`${coord(i)}, ${c<0?'empty':`country ${c}${c===12?', single square':''}`}${!pair&&paint>=0?`, ${COLOUR_NAMES[paint]}`:''}${bad.has(c)?', border conflict':''}${selection.includes(i)?', selected':''}`);b.setAttribute('aria-pressed',String(pair?selection.includes(i):selectedCountry===c));b.onclick=()=>chooseCell(i);
  b.onpointerenter=()=>{if(c>=0)$('board').querySelectorAll('.cell').forEach((el,j)=>el.classList.toggle('partner',game.board[j]===c));};b.onpointerleave=()=>$('board').querySelectorAll('.partner').forEach(el=>el.classList.remove('partner'));
  b.onkeydown=e=>{const delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-5,ArrowDown:5}[e.key];if(delta){e.preventDefault();$('board').children[Math.max(0,Math.min(24,i+delta))].focus();}};$('board').append(b);
 }
 if(focused!==undefined)$('board').children[Number(focused)]?.focus({preventScroll:true});
 $('board-caption').textContent=`ROUND ${game.round} OF 2 · ${pair?'PAIRING':end?'COMPLETE':'COLOURING'}`;$('pair-count').textContent=pair?`${n} / 12 pairs`:`${info.filled} / 13 countries`;$('round-label').textContent=`Round ${game.round} / 2`;
 $('phase-pair').classList.toggle('active',pair);$('phase-colour').classList.toggle('active',!pair);
 $('headline').innerHTML=pair?'Make a world.<br><em>Make it difficult.</em>':end?'Every country counts.<br><em>Every colour matters.</em>':'One map. Many colours.<br><em>Find the fewest points.</em>';
 $('intro-text').textContent=pair?'Two squares make a country. Two minds shape the map.':end?'A shared world, shaped by both players.':`${playerName(1-white)} colours the countries. The penalty belongs to ${playerName(white)}.`;
 for(let p=0;p<2;p++){const el=$(`player-${p}`);el.querySelector('strong').textContent=playerName(p);el.querySelector('small').textContent=p===white?'White · make it difficult':'Black · make it economical';el.querySelector('.role-disc').className=`role-disc ${p===white?'white':'black'}`;el.querySelector('.score').textContent=game.scores[p]===null?'—':String(game.scores[p]);}
 let resultText='';if(game.phase==='matchEnd'){const [a,b]=game.scores;resultText=a===b?`A draw · ${a}–${b}`:`${playerName(a>b?0:1)} ${game.mode==='ai'&&a>b?'win':'wins'} · ${Math.max(a,b)}–${Math.min(a,b)}`;}
 $('turn-label').textContent=end?(game.phase==='matchEnd'?'MATCH COMPLETE':'ROUND COMPLETE'):`${ai?'AI TURN':game.mode==='ai'?'YOUR TURN':playerName(actor).toUpperCase()} · ${whiteTurn?'WHITE':'BLACK'}`;
 $('turn-title').textContent=pair?(busy?'Considering the map…':`Create country ${n}`):end?(resultText||`${info.penalty} points to ${playerName(white)}`):busy?'Finding the minimum…':'Colour the countries';
 $('turn-description').textContent=pair?(busy?'The search considers both players’ choices and solves the resulting maps.':whiteTurn?'Choose any two empty squares. Aim to make the final map expensive to colour.':'Choose any two empty squares. Aim to make the final map economical to colour.'):end?(game.phase==='roundEnd'?'Now switch sides and build a fresh map. The other player will score as White.':'Both players have played White. The higher White score wins.'):'Choose a colour below the board, then click either square of a country. You can revise colours until you finish.';
 $('thinking').hidden=!busy;if(!busy)$('search-progress').textContent='Exploring possible maps…';
 $('mobile-confirm').hidden=!pair||ai||busy||selection.length!==2;$('mobile-confirm').textContent=`Pair ${selection.map(coord).join(' + ')} ↗`;$('confirm-pair').hidden=!pair;$('confirm-pair').disabled=busy||ai||selection.length!==2;$('submit-colours').hidden=!colour;$('submit-colours').disabled=busy||ai||!info?.valid;
 $('next-round').hidden=!end;$('next-round').textContent=game.phase==='matchEnd'?'Play another match ↗':'Swap roles · Round 2 ↗';
 $('hint').disabled=busy||ai||end;$('ai-move').disabled=busy||end;$('hint').textContent=pair?'◇ Suggest a move':'◇ Check minimum';$('ai-move').textContent=pair?'Let AI play':'Let AI colour';$('hint').parentElement.hidden=end;
 $('analysis-note').textContent=note;$('penalty-summary').hidden=pair||end;$('penalty-summary').replaceChildren();if(!pair){$('penalty-summary').append(document.createTextNode(String(info.penalty)));const small=document.createElement('small');small.textContent=`penalty points · ${info.filled}/13 coloured`;$('penalty-summary').append(small);}
 $('board-help').textContent=pair?($('pencil-toggle').checked?'Planning mode: click a square to add an erasable colour note.':selection.length===2?`${selection.map(coord).join(' + ')} selected. Confirm to create country ${n}.`:ai?'The AI is choosing a pair.':`Select two empty squares to make country ${n}.`):info.conflicts.length?`${info.conflicts.length} shared-border conflicts. Marked countries need different colours.`:end?'Hover over a square to find the rest of its country.':`${COLOUR_NAMES[selectedColour]??'Erase'} selected. Click a country to ${selectedColour<0?'clear':'colour'} both squares.`;
 $('undo').disabled=end||!game.history.length;$('pencil-panel').hidden=!pair;$('pencil-palette').hidden=!$('pencil-toggle').checked;$('pencil-palette').replaceChildren(...[0,1,2,3,4,-1].map(c=>makeColourButton(c,true)));
 $('palette').hidden=pair||end;const visible=Math.max(6,Math.max(...game.colours)+2);$('palette').replaceChildren(...[...Array(Math.min(13,visible)).keys(),-1].map(c=>makeColourButton(c)));
 $('board').setAttribute('aria-busy',String(busy));renderWatch();document.querySelector('.card-foot').textContent=end?'Each player scores once as White. Higher score wins.':game.round===1?'Your score is earned as White. Roles swap after this round.':'Final round: both players will have scored as White. Higher score wins.';
}
function showError(error){note=error.message;render();}
$('confirm-pair').onclick=()=>{try{commit(selection);}catch(e){showError(e);}};
$('mobile-confirm').onclick=$('confirm-pair').onclick;
$('hint').onclick=()=>performAI(true,true);$('ai-move').onclick=()=>performAI(false,!isAI(game));
$('submit-colours').onclick=()=>{try{finishRound(game);selection=[];stateChanged();}catch(e){showError(e);}};
$('next-round').onclick=()=>{clearTimeout(autoTimer);if(game.mode==='watch'&&game.watch&&game.phase==='roundEnd'){advanceWatch();return;}if(game.phase==='matchEnd'){openSetup();return;}nextRound(game);selection=[];selectedCountry=null;note='';$('pencil-toggle').checked=false;stateChanged();};
$('undo').onclick=()=>{stopWork();undo(game);selection=[];selectedCountry=null;note='Move undone.';stateChanged();};
$('pencil-toggle').onchange=()=>{selection=[];render();};
for(let p=0;p<2;p++)$(`strength-${p}`).onchange=()=>setStrength($(`strength-${p}`).value,p);
function renderSetup(){const mode=$('mode').value;$('watch-setup').hidden=mode!=='watch';$('first-role-label').textContent=mode==='ai'?'Your role in the first round':'Player 1’s role in the first round';}
function openSetup(mode=game.mode){$('mode').value=mode;$('first-role').value=game.firstWhite===0?'white':'black';for(let p=0;p<2;p++){$(`new-strength-${p}`).value=String(game.timeBudgets[p]);$(`engine-${p}`).value=engineFor(p);}$('setup-error').textContent='';renderSetup();$('new-dialog').showModal();}
$('new-open').onclick=()=>openSetup();$('rules-open').onclick=()=>$('rules-dialog').showModal();
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
function startMatch({mode,firstWhite,engines,timeBudgets,matches=1}){
 if(!Array.isArray(engines)||engines.length!==2||engines.some(e=>!['search','zero','book'].includes(e))||!Number.isInteger(matches)||matches<1||matches>10)throw Error('Invalid match settings.');
 const fresh=newGame({mode,firstWhite,timeBudgets});let zeroModel=null;
 if(engines.includes('book')){if(!bookManager)throw Error('The opening book is still loading.');bookManager.getBook(25);}
 if(engines.includes('zero')){if(!learnerManager)throw Error('Gomulda Zero is still loading.');zeroModel=learnerManager.getModel(25);}
 Object.assign(fresh,{engines:engines.slice(),zeroModel});
 if(mode==='watch')fresh.watch={target:matches,completed:0,results:[],paused:false,recorded:false};
 stopWork();game=fresh;selection=[];selectedCountry=null;selectedColour=0;note='';$('pencil-toggle').checked=false;$('new-dialog').close();stateChanged();
}
function beginMatch(){try{startMatch({mode:$('mode').value,firstWhite:$('first-role').value==='white'?0:1,engines:[$('engine-0').value,$('engine-1').value],timeBudgets:[Number($('new-strength-0').value),Number($('new-strength-1').value)],matches:Number($('watch-count').value)});}catch(e){$('setup-error').textContent=e.message;}}
$('start-match').onclick=beginMatch;
$('watch-open').onclick=()=>openSetup('watch');
$('mode').onchange=renderSetup;
$('book-open').onclick=()=>{$('book-lab').hidden=false;$('book-lab').scrollIntoView({behavior:'smooth'});$('book-lab').focus({preventScroll:true});};
$('book-close').onclick=()=>{$('book-lab').hidden=true;$('book-open').focus();};
$('learning-open').onclick=()=>{$('learning-lab').hidden=false;$('learning-lab').scrollIntoView({behavior:'smooth'});$('learning-lab').focus({preventScroll:true});};
$('learning-close').onclick=()=>{$('learning-lab').hidden=true;$('learning-open').focus();};
$('watch-pause').onclick=()=>{game.watch.paused=!game.watch.paused;stopWork();stateChanged();};
$('watch-step').onclick=()=>{if(busy)return;if(['roundEnd','matchEnd'].includes(game.phase))advanceWatch();else performAI(false,false);};
function renderWatch(){const watch=game.watch;$('watch-controls').hidden=game.mode!=='watch'||!watch;if(!watch)return;$('watch-budgets').textContent=game.timeBudgets.map((ms,p)=>`Player ${p+1}: ${engineName(p)}, ${ms/1000} s/move`).join(' · ');const done=game.phase==='matchEnd'&&watch.completed>=watch.target;
 $('watch-status').textContent=done?`${watch.completed} self-play matches complete.`:`Match ${Math.min(watch.target,watch.completed+1)} of ${watch.target} · Round ${game.round}${watch.paused?' · paused':''}`;if(watch.previousRuleCost)$('watch-status').textContent+=` Earlier series results used sixth-colour cost ${watch.previousRuleCost}.`;
 $('watch-pause').textContent=watch.paused?'Resume':'Pause';$('watch-pause').disabled=done;$('watch-step').hidden=!watch.paused||done;$('watch-step').disabled=busy;
 const t=document.createElement('table');if(watch.results.length){const h=t.insertRow();['Match','Player 1','Player 2'].forEach(x=>h.insertCell().textContent=x);watch.results.forEach((scores,i)=>{const r=t.insertRow();[i+1,...scores].forEach(x=>r.insertCell().textContent=x);});}$('watch-results').replaceChildren(t);
}
initBookLab({currentPosition:()=>({board:game.board,extraCost:game.extraCost})}).then(manager=>{bookManager=manager;scheduleAI();}).catch(e=>{$('book-status').textContent=e.message;});
initLearningLab({onChange:()=>{}}).then(manager=>{learnerManager=manager;}).catch(e=>{$('learn-progress-text').textContent=e.message;});
// Agent tools share the visible interface's actions and validation.
const context=document.modelContext;
if(context?.registerTool){
 const lifecycle=new AbortController();window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
 const read=()=>({phase:game.phase,round:game.round,board:game.board.slice(),colours:game.colours.slice(),scores:game.scores.slice(),whitePlayer:whitePlayer(game),activePlayer:activePlayer(game),busy,costs:costs(),engines:game.engines??['search','search'],selfPlay:game.watch??null,zeroCheckpointGames:game.zeroModel?.games??null,searchLevels:game.timeBudgets.map((timeMs,player)=>({player,name:SEARCH_LEVELS[timeMs],timeMs})),activeBudgetMs:searchBudget(game),lastSearch:game.lastSearch??null});
 const tools=[
 {name:'read_gomulda_book',description:'Read opening-book size, proof counts and the studied position. Does not change the game.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>bookManager?.read()??{ready:false}},
 {name:'grow_gomulda_book',description:'Explore a bounded number of opening lines and solve reached endgames. Stores completed work on this device; does not replace a match or train Zero.',inputSchema:{type:'object',properties:{lines:{type:'integer',enum:[1,5,20]}},required:['lines'],additionalProperties:false},execute:input=>{if(!bookManager)throw Error('The book is loading.');$('book-lab').hidden=false;return bookManager.grow(input.lines);}},
 {name:'set_gomulda_search_level',description:'Set AI thinking time for one player (0 or 1), or both when player is omitted. The budget stays with the player after role swaps. Training settings are separate. Cannot change during a search.',inputSchema:{type:'object',properties:{timeMs:{type:'integer',enum:[800,3000,10000,30000]},player:{type:'integer',enum:[0,1]}},required:['timeMs'],additionalProperties:false},execute:input=>{if(busy)throw Error('Wait for the current search to finish.');setStrength(input.timeMs,input.player);return read();}},
 {name:'read_gomulda_learning',description:'Read Gomulda Zero training counters and strength-test results. Does not start training.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>learnerManager?.read()??{ready:false}},
 {name:'start_gomulda_self_play',description:'Replace the current match with 1–10 watched self-play matches. Select an engine and time budget independently for each player. Player 1 starts White; both players swap roles in round two. Watching does not train Zero; Search + book can save book analysis.',inputSchema:{type:'object',properties:{engines:{type:'array',items:{type:'string',enum:['search','zero','book']},minItems:2,maxItems:2},timeBudgets:{type:'array',items:{type:'integer',enum:[800,3000,10000,30000]},minItems:2,maxItems:2},matches:{type:'integer',minimum:1,maximum:10}},required:['engines','matches'],additionalProperties:false},execute:input=>{startMatch({mode:'watch',firstWhite:0,engines:input.engines,timeBudgets:input.timeBudgets??game.timeBudgets,matches:input.matches});return read();}},
 {name:'start_gomulda_zero_training',description:'Train the separate Gomulda Zero engine in a bounded local run: selfplay (default), or search to alternate roles against fixed Gomulda Search. Read training progress with read_gomulda_learning. Existing match checkpoints stay fixed.',inputSchema:{type:'object',properties:{rounds:{type:'integer',enum:[5,25,100,500]},mode:{type:'string',enum:['selfplay','search']},searchTimeMs:{type:'integer',enum:[50,150,500,1500]}},required:['rounds'],additionalProperties:false},execute:input=>{if(![5,25,100,500].includes(input.rounds))throw Error('Choose 5, 25, 100 or 500 rounds.');const mode=input.mode??'selfplay',searchTimeMs=input.searchTimeMs??150;if(!['selfplay','search'].includes(mode)||![50,150,500,1500].includes(searchTimeMs))throw Error('Invalid training opponent settings.');if(!learnerManager||learnerManager.read().running)throw Error('Learning is unavailable or already running.');$('learn-rounds').value=String(input.rounds);$('learn-mode').value=mode;$('learn-search-ms').value=String(searchTimeMs);$('learning-lab').hidden=false;return learnerManager.train();}},
 {name:'read_gomulda_match',description:'Read the board, country colours, roles, costs and scores.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:read},
 {name:'pair_gomulda_squares',description:'Commit the human player’s pair during pairing. Squares are row-major indices 0–24. The AI may respond automatically.',inputSchema:{type:'object',properties:{squares:{type:'array',items:{type:'integer',minimum:0,maximum:24},minItems:2,maxItems:2}},required:['squares'],additionalProperties:false},execute:input=>{if(isAI(game))throw Error('It is the AI’s turn.');commit(input.squares);return read();}},
 {name:'colour_gomulda_countries',description:'Assign or revise human Black country colours. Does not submit the round. Read the match for colour costs; -1 erases.',inputSchema:{type:'object',properties:{assignments:{type:'array',items:{type:'object',properties:{country:{type:'integer',minimum:0,maximum:12},colour:{type:'integer',minimum:-1,maximum:12}},required:['country','colour'],additionalProperties:false}}},required:['assignments'],additionalProperties:false},execute:input=>{if(busy||isAI(game)||game.phase!=='colour')throw Error('Human colouring is not active.');if(!Array.isArray(input.assignments)||input.assignments.some(a=>!Number.isInteger(a.country)||a.country<0||a.country>12||!Number.isInteger(a.colour)||a.colour< -1||a.colour>12))throw Error('Invalid assignments.');input.assignments.forEach(a=>paintCountry(game,a.country,a.colour));stateChanged();return read();}},
 {name:'submit_gomulda_colouring',description:'Submit a human Black complete legal colouring, award its penalty to White, and finish the round.',inputSchema:{type:'object',properties:{},additionalProperties:false},execute:()=>{if(busy||isAI(game))throw Error('Wait for the human colouring turn.');finishRound(game);stateChanged();return read();}}
 ];for(const tool of tools){try{Promise.resolve(context.registerTool({...tool,annotations:{readOnlyHint:false,untrustedContentHint:false,...tool.annotations}},{signal:lifecycle.signal})).catch(()=>{});}catch{}}
}
render();scheduleAI();
