import {loadBook,packBook,analyzeBookPosition,growBookLine,refreshBook} from './book.js?v=9';
let running=false,stop=false;
self.onmessage=async({data})=>{
 if(data.command==='stop'){stop=true;return;}if(running)return;running=true;stop=false;let book;
 try{book=loadBook(data.book);
  if(data.command==='load'){self.postMessage({kind:'done',book});return;}
  if(data.command==='analyze'){analyzeBookPosition(book,data.board,{timeMs:data.timeMs,seed:book.size+19});self.postMessage({kind:'progress',book,completed:1,total:1});}
  else if(data.command==='grow'){if(!Number.isInteger(data.lines)||data.lines<1||data.lines>20||![150,800,3000].includes(data.timeMs))throw Error('Invalid book growth settings.');for(let i=0;i<data.lines&&!stop;i++){growBookLine(book,{timeMs:data.timeMs,seed:72131+book.lines*1709});self.postMessage({kind:'progress',book,completed:i+1,total:data.lines});await new Promise(r=>setTimeout(r,0));}}
  else throw Error('Unknown book command.');
  self.postMessage({kind:'done',book,stopped:stop});
 }catch(error){if(book)refreshBook(book);self.postMessage({kind:'error',error:error.message,book});}finally{running=false;}
};
