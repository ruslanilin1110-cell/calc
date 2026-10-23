import {parseExcelRows,type ExcelSheet} from './excel-import';
export type PdfWord={str:string;x:number;y:number;width:number;height:number};
type Cell={text:string;x:number;right:number;height:number};
const key=(text:string)=>text.normalize('NFKC').toLowerCase().replace(/ё/g,'е').replace(/[\s._:()\-]/g,'');
const names=['наименование','наименованиетовара','товар','название','названиетовара','name','product'];
const quantities=['колво','количество','количествотовара','колич','quantity','qty'];
export function pdfLines(words:PdfWord[]):Cell[][]{
 const lines:{y:number;words:PdfWord[]}[]=[];
 for(const word of words.filter(w=>w.str.trim()).sort((a,b)=>b.y-a.y||a.x-b.x)){let line=lines[lines.length-1];if(!line||Math.abs(line.y-word.y)>Math.max(2,Math.min(4,word.height*.25))){line={y:word.y,words:[]};lines.push(line)}line.words.push(word)}
 return lines.map(line=>{const cells:Cell[]=[];for(const w of line.words.sort((a,b)=>a.x-b.x)){const last=cells[cells.length-1];if(last&&w.x-last.right<=Math.max(7,w.height*.6)){last.text+=' '+w.str;last.right=Math.max(last.right,w.x+w.width)}else cells.push({text:w.str.trim(),x:w.x,right:w.x+w.width,height:w.height})}return cells});
}
export function parsePdfOrder(pages:PdfWord[][]):{sheets:ExcelSheet[];warnings:string[]}{
 if(pages.length>30)throw Error('В PDF допускается не более 30 страниц. Разделите заказ.');
 if(pages.reduce((n,p)=>n+p.length,0)>50000)throw Error('Слишком большая таблица PDF. Разделите заказ.');
 if(!pages.some(page=>page.some(x=>x.str.trim())))throw Error('В PDF нет текстового слоя: это скан или фотография. Для импорта позиций загрузите Excel или текстовый PDF. Сам скан можно прикрепить в «Фото и документы заказа».');
 let columns:Cell[]|null=null,header:string[]|null=null;const rows:unknown[][]=[];
 for(const page of pages){const lines=pdfLines(page),headerAt=lines.findIndex(cells=>cells.some(c=>names.includes(key(c.text)))&&cells.some(c=>quantities.includes(key(c.text))));let ended=false;for(const cells of lines.slice(Math.max(0,headerAt))){
 const isHeader=cells.some(c=>names.includes(key(c.text)))&&cells.some(c=>quantities.includes(key(c.text)));
 if(isHeader){columns=cells;header=cells.map(c=>c.text);rows.push(header);ended=false;continue}
 if(!columns||!header||ended)continue;
 const row:string[]=columns.map(()=>'');for(const cell of cells){let column=0;for(let i=1;i<columns.length;i++)if(cell.x>=(columns[i-1].right+columns[i].x)/2)column=i;row[column]=row[column]?row[column]+' '+cell.text:cell.text}
 const nameIndex=header.findIndex(x=>names.includes(key(x))),quantityIndex=header.findIndex(x=>quantities.includes(key(x))),name=row[nameIndex]?.trim()||'';
 if(/^(итого|всего|total|subtotal|подпись|руководитель|отпустил|получил)(?:\s|:|$)/i.test(name)){ended=true;continue}
 if(!name)continue;
 // A wrapped description has no values in any other table column.
 if(!row[quantityIndex]&&row.every((value,index)=>index===nameIndex||!value)){const previous=rows[rows.length-1];if(previous&&previous!==header&&previous[quantityIndex])previous[nameIndex]=String(previous[nameIndex])+' '+name;continue}
 rows.push(row);if(rows.length>2100)throw Error('Слишком много строк в PDF. Разделите заказ.');
 }}
 if(!header)throw Error('Не найдена таблица PDF со столбцами «Наименование» и «Количество / Кол-во». Загрузите табличный PDF или Excel.');
 const sheet=parseExcelRows(rows,'Заказ из PDF');sheet.warnings.unshift('Проверьте названия, количество и цены: расположение столбцов в PDF может отличаться.');
 return {sheets:[sheet],warnings:[]};
}
