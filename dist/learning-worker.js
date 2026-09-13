import {createSession,createModel,loadModel,loadSession,trainRound,evaluateMatch,summarizeArena,validateTrainingOptions} from './learning.js?v=9';
let running=false,stop=false;
const breathe=()=>new Promise(resolve=>setTimeout(resolve,0));
self.onmessage=async({data})=>{
 if(data.command==='stop'){stop=true;return;}if(running){self.postMessage({error:'A learning job is already running.'});return;}running=true;stop=false;
 try{
  if(data.command==='train'){
   const session=data.session?loadSession(data.session):createSession(createModel({extraCost:data.extraCost??25}));
   const count=Number(data.games),simulations=Number(data.simulations);if(!Number.isInteger(count)||count<1||count>1000||!Number.isInteger(simulations)||simulations<16||simulations>1024)throw Error('Invalid training settings.');
   const mode=data.mode??'selfplay',searchTimeMs=data.searchTimeMs??150;validateTrainingOptions({mode,simulations,searchTimeMs});
   for(let i=0;i<count&&!stop;i++){const result=trainRound(session,{simulations,mode,searchTimeMs,seed:session.model.seed+session.model.games*1543});self.postMessage({kind:'training',result,session,completed:i+1,total:count});await breathe();}
   self.postMessage({kind:'done',stopped:stop});
  }else if(data.command==='evaluate'){
   const model=loadModel(data.model),results=[];for(let i=0;i<8&&!stop;i++){const result=evaluateMatch(model,{seed:900100000+i*881,timeMs:150});results.push(result);self.postMessage({kind:'evaluation',results,summary:summarizeArena(results),modelGames:model.games,completed:i+1,total:8});await breathe();}self.postMessage({kind:'done',stopped:stop});
  }else throw Error('Unknown learning command.');
 }catch(error){self.postMessage({kind:'error',error:error.message});}finally{running=false;}
};
