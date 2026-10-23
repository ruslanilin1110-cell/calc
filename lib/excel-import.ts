export type ExcelItem={name:string;quantity:number;unit:string;price?:number;currency?:'KZT'|'USD'|'CNY'};
export type ExcelSheet={name:string;headerRow:number;items:ExcelItem[];warnings:string[]};
const norm=(v:unknown)=>String(v??'').normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/[\s._:()\-]/g,'');
const nameHeaders=['наименование','наименованиетовара','товар','название','названиетовара','name','product'];
const qtyHeaders=['колво','количество','количествотовара','колич','quantity','qty'];
const unitHeaders=['едизм','единицаизмерения','единицыизмерения','единица','ед','unit'];
export function excelNumber(value:unknown){if(typeof value==='number')return value;if(typeof value!=='string')return NaN;const s=value.trim().replace(/[\s\u00a0\u202f]/g,'').replace(',','.');return /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(s)?Number(s):NaN;}
function currency(value:unknown):ExcelItem['currency']{const s=norm(value);return ['cny','rmb','юань','юани','¥','юанях','元'].includes(s)?'CNY':['usd','доллар','доллары','$'].includes(s)?'USD':['kzt','тенге','тг','₸'].includes(s)?'KZT':undefined;}
function priceColumn(value:unknown){const s=norm(value);return /^(цена|ценазаштуку|ценазаединицу|закупочнаяцена|ценазакупки|price)(?:cny|rmb|usd|kzt|юань|юани|тенге|тг|доллар|доллары|¥|\$|₸)?$/.test(s);}
function headerCurrency(value:unknown){const s=String(value??'').toLowerCase();return /cny|rmb|юан|¥|元/.test(s)?'CNY':/usd|доллар|\$/.test(s)?'USD':/kzt|тенге|тг|₸/.test(s)?'KZT':undefined;}
export function parseExcelRows(rows:unknown[][],sheetName:string):ExcelSheet{
 const at=rows.slice(0,60).findIndex(row=>row.some(v=>nameHeaders.includes(norm(v)))&&row.some(v=>qtyHeaders.includes(norm(v))));
 if(at<0)throw Error('Не найдены столбцы «Наименование» и «Кол-во». Используйте выгрузку заказа из «МойСклад».');
 const header=rows[at],nameIndex=header.findIndex(v=>nameHeaders.includes(norm(v))),qtyIndex=header.findIndex(v=>qtyHeaders.includes(norm(v))),unitIndex=header.findIndex(v=>unitHeaders.includes(norm(v))),priceIndex=header.findIndex(priceColumn),currencyIndex=header.findIndex(v=>['валюта','валютацены','currency'].includes(norm(v))),items:ExcelItem[]=[],warnings:string[]=[];
 for(let i=at+1;i<rows.length;i++){
 const row=rows[i],name=String(row[nameIndex]??'').trim();
 if(!name||nameHeaders.includes(norm(name))||/^(итого|всего|количество наименований|примечание)(?:\s|:|$)/i.test(name))continue;
 const quantity=excelNumber(row[qtyIndex]);if(!Number.isFinite(quantity)||quantity<=0||quantity>1e9)throw Error(`Строка ${i+1}: проверьте количество товара «${name.slice(0,60)}».`);
 if(name.length>150)throw Error(`Строка ${i+1}: название длиннее 150 символов.`);
 const unit=unitIndex<0||!String(row[unitIndex]??'').trim()?'шт.':String(row[unitIndex]).trim();if(unit.length>30)throw Error(`Строка ${i+1}: слишком длинная единица измерения.`);
 const raw=priceIndex>=0?row[priceIndex]:undefined,hasPrice=raw!==undefined&&raw!==null&&String(raw).trim()!=='';
 const price=hasPrice?excelNumber(raw):undefined;if(price!==undefined&&(!Number.isFinite(price)||price<0||price>1e12))throw Error(`Строка ${i+1}: проверьте цену товара.`);
 const rawCurrency=currencyIndex>=0?row[currencyIndex]:undefined,goodsCurrency=currency(rawCurrency)||headerCurrency(header[priceIndex]);
 if(rawCurrency!==undefined&&String(rawCurrency).trim()&&!currency(rawCurrency))throw Error(`Строка ${i+1}: валюта ${String(rawCurrency)} не поддерживается. Доступны KZT, USD, CNY.`);
 items.push({name,quantity,unit,...(price!==undefined?{price}:{}),...(goodsCurrency?{currency:goodsCurrency}:{})});
 if(items.length>100)throw Error('В одном расчёте допускается до 100 позиций. Разделите заказ на несколько грузов.');
 }
 if(!items.length)throw Error('В таблице нет позиций с количеством.');
 const unpriced=items.filter(x=>x.price===undefined).length;if(unpriced)warnings.push(`Без цены: ${unpriced} из ${items.length}. Заполните цену закупки после импорта.`);
 if(priceIndex>=0&&items.some(x=>x.price!==undefined&&!x.currency))warnings.push('Валюта цен в файле не указана — выберите её перед импортом.');
 warnings.push('Вес введите после импорта. Строки итогов не добавляются.');
 return {name:sheetName,headerRow:at+1,items,warnings};
}
