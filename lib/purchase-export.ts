import {utils,write} from '@e965/xlsx';
import type {Purchase} from './procurement';
import {purchaseStatusNames} from './procurement';
export function purchaseWorkbook(p:Purchase){const sheet=utils.aoa_to_sheet([['Заявка на закупку в Китае',p.title],['Автор',p.author],['Дата',p.createdAt],['Состояние',purchaseStatusNames[p.status]],['Комментарий',p.note],[],['Наименование','Кол-во','Ед.','Срочность','Цена за единицу','Валюта','Вес 1 ед., кг'],...p.items.map(x=>[x.name,x.quantity,x.unit,x.urgencyName||x.urgencyId,x.price===undefined?'':x.price/100,x.currency,x.weight??''])]);sheet['!cols']=[{wch:55},{wch:14},{wch:12},{wch:24},{wch:20},{wch:12},{wch:18}];const book=utils.book_new();utils.book_append_sheet(book,sheet,'Заказ поставщику');return book;}
export function purchaseXlsx(p:Purchase){return write(purchaseWorkbook(p),{type:'array',bookType:'xlsx'}) as ArrayBuffer;}
