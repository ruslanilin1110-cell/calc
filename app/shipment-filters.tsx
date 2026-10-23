'use client';
import type {Shipment,Supplier} from '../lib/ledger';

type DateField='ordered'|'expected'|'arrived';
type Filters={supplierId:string;dateField:DateField;from:string;to:string};
export const emptyShipmentFilters:Filters={supplierId:'',dateField:'ordered',from:'',to:''};
export function filterShipments(shipments:Shipment[],filters:Filters&{query:string;status:string}){
  if(filters.from&&filters.to&&filters.from>filters.to)return [];
  const query=filters.query.trim().toLowerCase();
  return shipments.filter(s=>{
    const date=s[filters.dateField];
    return (filters.status==='all'||s.status===filters.status)
      &&(!filters.supplierId||s.supplierId===filters.supplierId)
      &&`${s.name} ${s.supplier} ${s.tracking}`.toLowerCase().includes(query)
      &&(!(filters.from||filters.to)||!!date)
      &&(!filters.from||date>=filters.from)&&(!filters.to||date<=filters.to);
  });
}
export default function ShipmentFilters({value,onChange,suppliers,shipments,active,onReset}:{value:Filters;onChange:(v:Filters)=>void;suppliers:Supplier[];shipments:Shipment[];active:boolean;onReset:()=>void}){
  const options=suppliers.filter(s=>!s.deleted&&!s.archived||shipments.some(order=>order.supplierId===s.id)).sort((a,b)=>a.name.localeCompare(b.name,'ru'));
  const invalid=!!(value.from&&value.to&&value.from>value.to);
  return <div className="shipment-filter-panel">
    <div className="shipment-filter-fields">
      <label className="field">Поставщик<select aria-label="Поставщик груза" value={value.supplierId} onChange={e=>onChange({...value,supplierId:e.target.value})}><option value="">Все поставщики</option>{options.map(s=><option key={s.id} value={s.id}>{s.name}{s.deleted?' · удалён':s.archived?' · архив':''}</option>)}</select></label>
      <label className="field">Искать по дате<select aria-label="Тип даты груза" value={value.dateField} onChange={e=>onChange({...value,dateField:e.target.value as DateField})}><option value="ordered">Дата заказа</option><option value="expected">Ожидаемый приход</option><option value="arrived">Фактический приход</option></select></label>
      <label className="field">С даты<input aria-label="Грузы с даты" type="date" value={value.from} max={value.to||undefined} onChange={e=>onChange({...value,from:e.target.value})}/></label>
      <label className="field">По дату включительно<input aria-label="Грузы по дату" type="date" value={value.to} min={value.from||undefined} onChange={e=>onChange({...value,to:e.target.value})}/></label>
    </div>
    {invalid&&<p className="form-error" role="alert">Дата начала должна быть раньше даты окончания или совпадать с ней.</p>}
    {active&&<button className="btn quiet" onClick={onReset}>Сбросить фильтры</button>}
  </div>;
}
