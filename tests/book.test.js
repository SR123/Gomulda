import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canonicalPosition,bookChildren,createBook,lookupBook,recordAnalysis,solveIntoBook,refreshBook,loadBook,packBook,mergeBook,chooseBookPair} from '../dist/book.js';
import {emptyBoard,legalMoves,applyPair,pairCount,paletteCosts,randomCompletion,seededRandom,solveBoard,choosePair} from '../dist/engine.js';
function oracle(board,costs=paletteCosts()){if(pairCount(board)===12)return solveBoard(board,costs).penalty;const values=legalMoves(board).map(move=>oracle(applyPair(board,move),costs));return pairCount(board)%2===0?Math.max(...values):Math.min(...values);}
function transform(board,t){const out=emptyBoard();board.forEach((c,i)=>{let r=Math.floor(i/5),col=i%5;if(t>=4)col=4-col;for(let n=0;n<t%4;n++)[r,col]=[col,4-r];out[5*r+col]=c;});return out;}
test('book canonicalization removes all eight symmetries, pairing order and preserves singleton',()=>{
 assert.equal(bookChildren(emptyBoard()).length,49);
 const b=applyPair(applyPair(emptyBoard(),[0,24]),[1,19]),key=canonicalPosition(b).key;
 for(let t=0;t<8;t++){const c=transform(b,t).map(v=>v<0?v:1-v);assert.equal(canonicalPosition(c).key,key);}
 const complete=randomCompletion(emptyBoard(),seededRandom(3));for(let t=0;t<8;t++){const c=canonicalPosition(transform(complete,t));assert.equal(c.key,canonicalPosition(complete).key);assert.equal(c.board.filter(x=>x===12).length,1);assert.equal(solveBoard(c.board).penalty,solveBoard(complete).penalty);}
});
test('estimated book moves map back to legal equivalent children under every symmetry',()=>{
 const b=applyPair(applyPair(emptyBoard(),[0,24]),[1,19]),move=[3,20],book=createBook();recordAnalysis(book,b,{move,value:2.5,iterations:100,budgetMs:800});
 const expected=canonicalPosition(applyPair(b,move)).key;
 for(let t=0;t<8;t++){const c=transform(b,t),entry=lookupBook(book,c);assert.equal(canonicalPosition(applyPair(c,entry.analysis.move)).key,expected);assert.equal(entry.exact,false);}
 const cached=chooseBookPair(book,b,{timeMs:800});assert.equal(cached.method,'Opening book estimate');assert.equal(cached.exact,false);
});
test('book proofs agree with independent full minimax and their move witnesses survive transformations',()=>{
 for(let seed=1;seed<=8;seed++){
  const ply=seed%2?9:10,b=randomCompletion(emptyBoard(),seededRandom(seed)).map(c=>c<ply?c:-1),book=createBook(),expected=oracle(b,paletteCosts(book.extraCost));
  const proof=solveIntoBook(book,b,{timeMs:3000});assert(proof.exact);assert.equal(proof.value,expected);assert.equal(oracle(applyPair(b,proof.move),paletteCosts(book.extraCost)),expected);
  const restored=loadBook(JSON.parse(JSON.stringify(packBook(book))));
  for(let t=0;t<8;t++){const board=transform(b,t),e=lookupBook(restored,board);assert(e.exact);assert.equal(e.lower,expected);assert.equal(oracle(applyPair(board,e.move),paletteCosts(book.extraCost)),expected);}
 }
});
test('partial exploration and estimates never get promoted to false exact results',()=>{
 const book=createBook(),b=emptyBoard();recordAnalysis(book,b,{move:[0,1],value:2,iterations:999999,budgetMs:30000});solveIntoBook(book,b,{timeMs:1000,maxNewPositions:1});const e=lookupBook(book,b);assert(!e.exact);assert.equal(e.lower,0);assert.equal(e.upper,book.cap);
 const raw=packBook(book);raw.entries[canonicalPosition(b).key].lower=2;raw.entries[canonicalPosition(b).key].upper=2;raw.entries[canonicalPosition(b).key].exact=true;assert(!lookupBook(loadBook(raw),b).exact);
});
test('known child proofs establish parent bounds without treating one line as the entire game',()=>{
 const b=randomCompletion(emptyBoard(),seededRandom(9)).map(c=>c<10?c:-1),moves=legalMoves(b),values=moves.map(m=>oracle(applyPair(b,m))),best=values.indexOf(Math.max(...values)),book=createBook();
 recordAnalysis(book,b,{move:moves[best],value:99,iterations:1,budgetMs:100});solveIntoBook(book,applyPair(b,moves[best]),{timeMs:1000});refreshBook(book);
 const e=lookupBook(book,b);assert.equal(e.lower,Math.max(...values));assert(!e.exact);assert(e.upper>=oracle(b));
});
test('import recomputes terminal colour values, rejects invalid keys and separates colour costs',()=>{
 const b=randomCompletion(emptyBoard(),seededRandom(6)),book=createBook();solveIntoBook(book,b);const raw=packBook(book);const key=canonicalPosition(b).key;raw.entries[key].lower=999;raw.entries[key].upper=999;assert.equal(lookupBook(loadBook(raw),b).lower,solveBoard(b).penalty);
 assert.throws(()=>loadBook({...raw,entries:{bad:raw.entries[key]}}));assert.throws(()=>loadBook({...raw,extraCost:40}),/25 points/);assert.throws(()=>createBook(40),/25 points/);
});
test('Search uses proved descendants when requested and original Search remains an independent baseline',()=>{
 const b=randomCompletion(emptyBoard(),seededRandom(9)).map(c=>c<10?c:-1),book=createBook();for(const m of legalMoves(b))solveIntoBook(book,applyPair(b,m));
 const r=choosePair(b,{timeMs:1000,lookupSolved:board=>{const e=lookupBook(book,board);return e?.exact?{value:e.lower}:null;}});assert(r.exact);assert(r.bookHits>0);assert.equal(r.value,oracle(b));
 const plain=choosePair(b,{timeMs:1000});assert(plain.exact);assert.equal(plain.bookHits,0);assert.equal(plain.value,r.value);
});
test('shipped book verifies all 49 openings and has solved continuations but no false root proof',()=>{
 const book=loadBook(JSON.parse(readFileSync(new URL('../dist/book-seed.json',import.meta.url),'utf8')));
 assert(bookChildren(emptyBoard()).every(c=>book.entries[c.key]?.analysis));assert(!lookupBook(book,emptyBoard()).exact);assert(Object.values(book.entries).some(e=>e.ply<12&&e.lower===e.upper));
});
test('deeper requested levels bypass shallow estimates and proved book positions need no fresh search',()=>{
 const book=createBook(),b=emptyBoard();recordAnalysis(book,b,{move:[0,1],value:2,iterations:1,budgetMs:10});const fresh=chooseBookPair(book,b,{timeMs:20,seed:41});assert.notEqual(fresh.method,'Opening book estimate');assert.equal(fresh.budgetMs,20);
 const late=randomCompletion(emptyBoard(),seededRandom(9)).map(c=>c<10?c:-1);solveIntoBook(book,late,{timeMs:1000});const hit=chooseBookPair(book,late,{timeMs:30000});assert.equal(hit.method,'Solved book position');assert(hit.exact);assert.equal(hit.iterations,0);assert.equal(hit.value,oracle(late));
});
