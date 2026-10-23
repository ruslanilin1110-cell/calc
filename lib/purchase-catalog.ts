import type {Ledger} from './ledger';
import {cargoProducts} from './cargo-cost';
import {purchaseItemSchema,type Purchase,type PurchaseItem} from './procurement';
export type CatalogItem={key:string;name:string;unit:string;price?:number;currency:PurchaseItem['currency'];weight?:number};
const normalize=(s:string)=>s.normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('ru-RU');
export const catalogKey=(name:string,unit:string)=>JSON.stringify([normalize(name),normalize(unit)]);
export function purchaseCatalog(state:Ledger,requests:Purchase[]):CatalogItem[]{
 const result=new Map<string,CatalogItem>();
 function put(p:Omit<CatalogItem,'key'>){if(!p.name.trim())return;const key=catalogKey(p.name,p.unit),old=result.get(key);result.set(key,{...old,...p,key,price:p.price??old?.price,currency:p.price!==undefined?p.currency:old?.currency||p.currency,weight:p.weight??old?.weight});}
 for(const s of [...state.shipments].sort((a,b)=>a.ordered.localeCompare(b.ordered)))for(const p of cargoProducts(s))put({name:p.name,unit:p.unit,price:p.price,currency:s.currency,weight:p.weight===undefined?undefined:p.weight*(p.weightUnit==='g'?.001:1)/(p.weightMode==='total'?p.quantity:1)});
 for(const r of [...requests].sort((a,b)=>a.updatedAt.localeCompare(b.updatedAt)))for(const p of r.items)put({name:p.name,unit:p.unit,price:p.price,currency:p.currency,weight:p.weight});
 return [...result.values()].sort((a,b)=>a.name.localeCompare(b.name,'ru'));
}
export function addPurchasePosition(items:PurchaseItem[],product:Omit<CatalogItem,'key'>,quantity:number,urgencyId:string,id:string){
 const next=purchaseItemSchema.parse({...product,id,quantity,urgencyId});
 const same=items.findIndex(x=>catalogKey(x.name,x.unit)===catalogKey(next.name,next.unit)&&x.urgencyId===urgencyId);
 if(same>=0)return items.map((x,i)=>i===same?purchaseItemSchema.parse({...x,quantity:x.quantity+next.quantity}):x);
 if(items.length>=100)throw Error('В одной заявке может быть не более 100 позиций');
 return [...items,next];
}
