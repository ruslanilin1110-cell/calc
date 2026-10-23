import {deliveryCalculationSchema,type DeliveryCalculation} from './ledger';

export function calculateDelivery(input:DeliveryCalculation,recordedShippingKzt=0){
  const config=deliveryCalculationSchema.parse(input);
  const weights=config.items.map(item=>item.weight*(item.weightUnit==='g'?0.001:1)*(item.weightMode==='unit'?item.quantity:1));
  const totalWeightKg=weights.reduce((a,b)=>a+b,0);
  const amount=config.mode==='perKg'?totalWeightKg*config.price:config.price;
  const totalKzt=config.mode==='recorded'?recordedShippingKzt:Math.round(amount*config.rateKzt);
  if(!Number.isSafeInteger(totalKzt)||totalKzt<0||totalKzt>1e14)throw Error('Проверьте стоимость доставки');
  const exact=weights.map(weight=>totalKzt*weight/totalWeightKg);
  const allocations=exact.map(Math.floor);
  const remaining=totalKzt-allocations.reduce((a,b)=>a+b,0);
  const order=exact.map((value,index)=>({index,remainder:value-allocations[index]})).sort((a,b)=>b.remainder-a.remainder||a.index-b.index);
  for(let i=0;i<remaining;i++)allocations[order[i%order.length].index]++;
  const items=config.items.map((item,index)=>{
    const deliveryKzt=allocations[index],goodsUnitKzt=item.goodsUnitPrice!==undefined?item.goodsUnitPrice*item.goodsRateKzt!:item.goodsUnitPriceKzt??null;
    const goodsKzt=goodsUnitKzt===null?null:Math.round(goodsUnitKzt*item.quantity);
    if(goodsKzt!==null&&(!Number.isSafeInteger(goodsKzt)||goodsKzt>1e14))throw Error('Проверьте цену и количество товара');
    const landedKzt=goodsKzt===null?null:goodsKzt+deliveryKzt;
    if(landedKzt!==null&&(!Number.isSafeInteger(landedKzt)||landedKzt>1e14))throw Error('Проверьте итоговую стоимость товара с доставкой');
    return {...item,totalWeightKg:weights[index],share:weights[index]/totalWeightKg,deliveryKzt,deliveryPerUnitKzt:deliveryKzt/item.quantity,goodsUnitKzt,goodsKzt,landedKzt,landedPerUnitKzt:landedKzt===null?null:landedKzt/item.quantity};
  });
  const complete=items.every(item=>item.goodsKzt!==null),goodsTotalKzt=complete?items.reduce((n,item)=>n+item.goodsKzt!,0):null,landedTotalKzt=goodsTotalKzt===null?null:goodsTotalKzt+totalKzt;
  if(landedTotalKzt!==null&&(!Number.isSafeInteger(landedTotalKzt)||landedTotalKzt>1e14))throw Error('Проверьте общую стоимость груза');
  return {totalWeightKg,totalKzt,amount,perKgKzt:totalKzt/totalWeightKg,items,goodsTotalKzt,landedTotalKzt};
}

// Live landed cost: recorded fees are allocated by goods value, shipping by weight.
export function calculateFullDeliveryCost(result:ReturnType<typeof calculateDelivery>,feesKzt=0){
  if(result.goodsTotalKzt===null)return null;
  if(!Number.isSafeInteger(feesKzt)||feesKzt<0||feesKzt>1e14)throw Error('Проверьте прочие расходы');
  const total=result.goodsTotalKzt;
  if(feesKzt>0&&total===0)throw Error('Для распределения прочих расходов укажите стоимость товаров');
  const exact=result.items.map(x=>total?feesKzt*x.goodsKzt!/total:0),fees=exact.map(Math.floor);
  const order=exact.map((v,i)=>({i,r:v-fees[i]})).sort((a,b)=>b.r-a.r||a.i-b.i);
  for(let i=0,left=feesKzt-fees.reduce((a,b)=>a+b,0);i<left;i++)fees[order[i%order.length].i]++;
  const totalKzt=total+result.totalKzt+feesKzt;
  if(!Number.isSafeInteger(totalKzt)||totalKzt>1e14)throw Error('Проверьте полную стоимость груза');
  return {goodsKzt:total,shippingKzt:result.totalKzt,feesKzt,totalKzt,items:result.items.map((x,i)=>({...x,feesKzt:fees[i],totalKzt:x.landedKzt!+fees[i],unitCostKzt:(x.landedKzt!+fees[i])/x.quantity}))};
}
