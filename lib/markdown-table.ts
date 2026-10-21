/** Split actual table separators while preserving pipes inside inline content. */
export function splitTableRow(line:string):string[]{
  const text=line.trim(),cells:string[]=[];let cell='',wiki=false,brackets=0,parens=0,ticks=0;
  for(let i=0;i<text.length;i++){
    const ch=text[i],next=text[i+1];
    if(ch==='\\'&&next!==undefined){cell+=next==='|'?'|':ch+next;i++;continue}
    if(wiki){if(ch===']'&&next===']'){wiki=false;cell+=']]';i++}else cell+=ch;continue}
    if(ch==='`'){let count=1;while(text[i+count]==='`')count++;cell+='`'.repeat(count);if(!ticks)ticks=count;else if(ticks===count)ticks=0;i+=count-1;continue}
    if(ticks){cell+=ch;continue}
    if(ch==='['&&next==='['){wiki=true;cell+='[[';i++;continue}
    if(parens){if(ch==='(')parens++;else if(ch===')')parens--;cell+=ch;continue}
    if(ch==='[')brackets++;
    else if(ch===']')brackets=Math.max(0,brackets-1);
    else if(ch==='('&&text[i-1]===']')parens=1;
    if(ch==='|'&&!brackets&&!parens){cells.push(cell.trim());cell=''}else cell+=ch;
  }
  cells.push(cell.trim());
  if(text.startsWith('|')&&cells[0]==='')cells.shift();
  if(text.endsWith('|')&&cells[cells.length-1]==='')cells.pop();
  return cells;
}
export function isTableSeparator(line:string){const cells=splitTableRow(line);return cells.length>0&&cells.every(cell=>/^:?-+:?$/.test(cell));}
export function isTableRow(line:string){return line.trim().startsWith('|')||splitTableRow(line).length>1;}
