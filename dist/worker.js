import {choosePair,solveBoard} from './engine.js?v=9';
import {loadModel,neuralSearch} from './learning.js?v=9';
import {loadBook,chooseBookPair} from './book.js?v=9';
self.onmessage=({data})=>{const{id,kind,board,costs,timeMs,seed,engine='search',model}=data;try{const onProgress=progress=>self.postMessage({id,progress});let result,book;
 if(kind==='pair'&&engine==='zero'){const m=loadModel(model);if(m.extraCost!==costs[5])throw Error('The Zero checkpoint uses different colour costs.');result=neuralSearch(board,m,{timeMs,seed:seed??1,onProgress});}
 else if(kind==='pair'&&engine==='book'){book=loadBook(data.book);if(book.extraCost!==costs[5])throw Error('The book uses different colour costs.');result=chooseBookPair(book,board,{timeMs,seed,onProgress});}
 else result=kind==='pair'?choosePair(board,{costs,timeMs,seed,onProgress}):solveBoard(board,costs);
 self.postMessage({id,result,book});}catch(error){self.postMessage({id,error:error.message});}};
