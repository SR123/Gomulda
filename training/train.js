import {mkdirSync,existsSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createSession,createModel,loadSession,trainRound,packModel,packSession,evaluateMatch,summarizeArena,validateTrainingOptions,trainingStats} from '../dist/learning.js';
const args=process.argv.slice(2),arg=(name,fallback)=>{const i=args.indexOf('--'+name);return i<0?fallback:args[i+1];};
const games=Number(arg('games',256)),simulations=Number(arg('simulations',128)),out=resolve(arg('out','training/runs/pilot')),resume=arg('resume',''),seed=Number(arg('seed',9132026));
const mode=arg('mode','selfplay'),searchTimeMs=Number(arg('search-ms',150));validateTrainingOptions({mode,simulations,searchTimeMs});
if(!Number.isInteger(games)||games<1||games>1000000||!Number.isInteger(simulations)||simulations<2||simulations>100000)throw Error('Invalid training size.');
mkdirSync(out,{recursive:true});
let session=createSession(createModel({seed,extraCost:Number(arg('extra-cost',25))}));
if(resume)session=loadSession(JSON.parse(readFileSync(resolve(resume),'utf8')));
const encodeSession=()=>packSession(session);
function save(){const tmp=join(out,'resume.tmp');writeFileSync(tmp,JSON.stringify(encodeSession()));renameSync(tmp,join(out,'resume.json'));writeFileSync(join(out,'model.json'),JSON.stringify(packModel(session.model)));writeFileSync(join(out,'history.json'),JSON.stringify(session.history,null,2));}
const config={games,simulations,mode,searchTimeMs:mode==='search'?searchTimeMs:null,seed,extraCost:session.model.extraCost,startedAt:new Date().toISOString(),startGames:session.model.games,startTrainingStats:trainingStats(session.model)};writeFileSync(join(out,'config.json'),JSON.stringify(config,null,2));
console.log(mode==='search'?'Training Gomulda Zero against fixed Search, alternating White and Black.':'Training Gomulda Zero from self-play. Search remains a separate unchanged engine.');
for(let i=0;i<games;i++){const r=trainRound(session,{simulations,mode,searchTimeMs,seed:seed+session.model.games*1543});if((i+1)%16===0||i===games-1){save();console.log(JSON.stringify({games:r.game,mode:r.mode,learnerRole:r.learnerRole,trainingStats:trainingStats(session.model),updates:r.updates,policyLoss:r.policyLoss,valueLoss:r.valueLoss,penalty:r.penalty}));}}
const matches=[];for(let i=0;i<Number(arg('arena-matches',0));i++){const r=evaluateMatch(session.model,{seed:900000000+i*881,timeMs:Number(arg('arena-ms',100))});matches.push(r);console.log(JSON.stringify({arena:i+1,...r}));writeFileSync(join(out,'arena.json'),JSON.stringify({results:matches,summary:summarizeArena(matches),modelGames:session.model.games},null,2));}
console.log(JSON.stringify({saved:out,games:session.model.games,arena:summarizeArena(matches)}));
