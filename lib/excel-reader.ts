import {read,utils} from '@e965/xlsx';
import {parseExcelRows,type ExcelSheet} from './excel-import';
export function readOrderWorkbook(buffer:ArrayBuffer){
 const b=new Uint8Array(buffer);if(b.byteLength>5*1024*1024)throw Error('Размер файла — не более 5 МБ.');
 const ole=b[0]===208&&b[1]===207&&b[2]===17&&b[3]===224,zip=b[0]===80&&b[1]===75&&b[2]===3&&b[3]===4;
 if(!ole&&!zip)throw Error('Нужен Excel .xls или .xlsx. Пересохраните файл в Excel и попробуйте снова.');
 const book=read(buffer,{type:'array',dense:true,sheetRows:2001,cellFormula:false,cellHTML:false,cellStyles:false,bookVBA:false,bookDeps:false});
 if(book.SheetNames.length>30)throw Error('В файле слишком много листов. Оставьте лист с заказом.');
 const sheets:ExcelSheet[]=[],errors:string[]=[];
 for(const name of book.SheetNames){const sheet=book.Sheets[name];const range=utils.decode_range(sheet['!fullref']||sheet['!ref']||'A1');if(range.e.r>2000||range.e.c>100){errors.push(`${name}: таблица больше 2000 строк или 100 столбцов.`);continue;}try{sheets.push(parseExcelRows(utils.sheet_to_json<unknown[]>(sheet,{header:1,raw:true,defval:'',blankrows:true}),name))}catch(e){errors.push(`${name}: ${e instanceof Error?e.message:'Не удалось прочитать лист'}`)}}
 if(!sheets.length)throw Error(errors[0]||'Файл не содержит таблиц заказа.');
 return {sheets,warnings:errors};
}
